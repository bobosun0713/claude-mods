"""Read Claude Code transcripts and total tokens and cost by folder, skill and model.

Usage:
  python3 scan.py <projects dir> <bundled prices> <data dir> [--refresh]
    stdin (optional): { "<session id>": actual cost in USD, ... }
  python3 scan.py --prices <bundled prices> <data dir> [--refresh]
    List the prices in use and their sources

Data dir (usually ~/.claude/skill-cost/):
  prices.json          the user's custom prices, highest priority
  online-prices.json   cache of official prices (generated)

Price priority: custom > official (Claude docs, refreshed at most once a day) > bundled

Cost source:
  - A session with an actual cost (the /cost amount recorded by the mod) uses that amount;
    the split across skills and models follows the estimated proportions
  - Other sessions are estimated from current model prices

Writes JSON to stdout:
  {
    "folders": { cwd: { rows, models, sessions, actualSessions, lastAt } },
    "unpriced": [model, ...],
    "online": { fetchedAt, error?, source? }
  }
"""

import json
import os
import re
import sys
import time
import urllib.request

# Language-neutral names; the mod translates them for display (hooks/register.tsx)
NO_SKILL = "(no skill)"
SUBAGENT = "(subagent)"

SKILL_DIR = re.compile(r"Base directory for this skill: (\S+)")

ONLINE_URL = "https://platform.claude.com/docs/en/about-claude/pricing.md"
# Fewer parsed models than this means the page format changed; keep the previous prices
MIN_MODELS = 5
# The docs site blocks Python's default User-Agent (403), so send an explicit one
USER_AGENT = "skill-cost/0.1 (+https://github.com/bobosun0713/claude-mods)"
# Prompts longer than this (cache reads and writes included) use long-prompt rates on models such as Claude Haiku 5.5
LONG_PROMPT = 100_000
ONLINE_TTL = 24 * 60 * 60


# ── Prices ──────────────────────────────────────────────


def read_json(path):
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    temp = f"{path}.tmp"
    with open(temp, "w", encoding="utf-8") as handle:
        json.dump(data, handle, ensure_ascii=False, indent=2)
    os.replace(temp, path)


MONEY = re.compile(r"\$([\d.]+)")
# Price fields every model must have
PRICE_FIELDS = ("input", "output", "cacheRead", "cacheWrite5m", "cacheWrite1h")
COLUMNS = {
    "base input tokens": "input",
    "5m cache writes": "cacheWrite5m",
    "1h cache writes": "cacheWrite1h",
    "cache hits and refreshes": "cacheRead",
    "output tokens": "output",
}


def model_id(label):
    """「Claude Opus 5.5 ([limited availability](...))」→ claude-opus-5-5"""
    name = re.sub(r"<[^>]+>", "", label).split("(")[0].strip()
    return "-".join(name.lower().replace(".", " ").split())


def fetch_page(timeout=20):
    request = urllib.request.Request(ONLINE_URL, headers={"User-Agent": USER_AGENT, "Accept": "text/markdown"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read().decode("utf-8")


def cells(line):
    return [cell.strip() for cell in line.strip().strip("|").split("|")]


def table(markdown, heading):
    """Rows of the first table under a heading (such as "## Model pricing"), without the separator row"""
    if heading not in markdown:
        return []
    level = heading.split(" ", 1)[0]
    section = markdown.split(heading, 1)[1].split(f"\n{level} ", 1)[0]
    lines = []
    for line in section.splitlines():
        if line.strip().startswith("|"):
            lines.append(line)
        elif lines:
            break
    return [line for index, line in enumerate(lines) if index != 1]


def from_fast(markdown, models):
    """Parse the "### Fast mode pricing" table into each model's fastInput / fastOutput"""
    lines = table(markdown, "### Fast mode pricing")
    if len(lines) < 2:
        raise ValueError("找不到 Fast mode pricing 表格")

    for line in lines[1:]:
        label, *prices = cells(line)
        found = [MONEY.search(cell) for cell in prices[:2]]
        if not all(found):
            continue
        # One row may list several models, such as "Claude Opus 5 / Claude Opus 4.8"
        for part in label.split("/"):
            name = model_id(part)
            if name in models:
                models[name]["fastInput"] = float(found[0].group(1))
                models[name]["fastOutput"] = float(found[1].group(1))


def from_official(markdown):
    """Parse the Model pricing and Fast mode pricing tables of the official pricing page, in USD per million tokens"""
    lines = table(markdown, "## Model pricing")
    if len(lines) < 2:
        raise ValueError("找不到 Model pricing 表格")

    header = [COLUMNS.get(cell.lower()) for cell in cells(lines[0])]
    if not {"input", "output"} <= set(header):
        raise ValueError(f"表頭格式不符：{cells(lines[0])}")

    models = {}
    for line in lines[1:]:
        row = cells(line)
        label = row[0]
        price = {}
        for key, cell in zip(header[1:], row[1:]):
            found = MONEY.search(cell)
            if key and found:
                price[key] = float(found.group(1))
        if not label.startswith("Claude") or "input" not in price or "output" not in price:
            continue

        name = model_id(label)
        if "over 100,000 tokens" in label:
            models.setdefault(name, {})["above100k"] = price
        else:
            models[name] = {**price, **models.get(name, {})}

    if len(models) < MIN_MODELS:
        raise ValueError(f"只解析到 {len(models)} 個模型")
    missing = [name for name, price in models.items() if not set(PRICE_FIELDS) <= set(price)]
    if missing:
        raise ValueError(f"價格欄位不完整：{', '.join(missing)}")

    from_fast(markdown, models)
    return models


def latest(entry):
    """Backward compatibility with the old format: if it is a list of prices, take the last one"""
    entry = entry[-1] if isinstance(entry, list) else entry
    return {key: value for key, value in entry.items() if key != "from"}


def update_online(data_dir, force):
    """Refresh the official price cache at most once a day; on failure keep the previous cache"""
    path = os.path.join(data_dir, "online-prices.json")
    cache = read_json(path) if os.path.isfile(path) else {"fetchedAt": 0, "models": {}}

    if not force and time.time() - cache.get("fetchedAt", 0) < ONLINE_TTL:
        return cache

    try:
        models = from_official(fetch_page())
    except Exception as error:  # Keep the cache when offline or the source is broken
        cache["error"] = f"{type(error).__name__}: {error}"
        return cache

    cache = {"fetchedAt": time.time(), "source": ONLINE_URL, "models": models}
    write_json(path, cache)
    return cache


def load_prices(builtin, data_dir, force=False):
    """Return (prices, source of each model, online cache status)"""
    prices = read_json(builtin)
    sources = {name: "bundled" for name in prices["models"]}

    online = update_online(data_dir, force)
    for name, entry in online.get("models", {}).items():
        prices["models"][name] = entry
        sources[name] = "official"

    override = os.path.join(data_dir, "prices.json")
    if os.path.isfile(override):
        custom = read_json(override)
        # Models listed in the custom file override official and bundled prices
        for name, entry in custom.get("models", {}).items():
            prices["models"][name] = entry
            sources[name] = "custom"

    prices["models"] = {name: latest(entry) for name, entry in prices["models"].items()}

    status = {key: online[key] for key in ("fetchedAt", "error", "source") if key in online}
    return prices, sources, status


def price_of(prices, model):
    """Find a price by model ID: an exact match, or one followed only by a date or a suffix such as [1m]"""
    for key in sorted(prices["models"], key=len, reverse=True):
        if re.fullmatch(re.escape(key) + r"(-\d{8})?(\[[^\]]*\])?", model):
            return prices["models"][key]
    return None


def cost_of(prices, model, usage):
    """Cost of one call from prices; None when a needed price is missing (listed as unpriced)"""
    price = price_of(prices, model)
    if price is None:
        return None
    prompt = sum(
        usage.get(key) or 0
        for key in ("input_tokens", "cache_read_input_tokens", "cache_creation_input_tokens")
    )
    if prompt > LONG_PROMPT and "above100k" in price:
        price = {**price, **price["above100k"]}

    # Fast mode: the official table lists fast input / output rates; cache rates scale by the same ratio
    if usage.get("speed") == "fast":
        if "fastInput" not in price or "fastOutput" not in price:
            return None
        input_scale = price["fastInput"] / price["input"]
        price = {
            "input": price["fastInput"],
            "output": price["fastOutput"],
            **{key: price[key] * input_scale for key in ("cacheRead", "cacheWrite5m", "cacheWrite1h") if key in price},
        }

    split = usage.get("cache_creation") or {}
    write_1h = split.get("ephemeral_1h_input_tokens", 0) or 0
    write_5m = split.get("ephemeral_5m_input_tokens")
    if write_5m is None:
        write_5m = max(0, (usage.get("cache_creation_input_tokens") or 0) - write_1h)
    counts = {
        "input": usage.get("input_tokens") or 0,
        "output": usage.get("output_tokens") or 0,
        "cacheRead": usage.get("cache_read_input_tokens") or 0,
        "cacheWrite5m": write_5m,
        "cacheWrite1h": write_1h,
    }
    if any(count and key not in price for key, count in counts.items()):
        return None
    return sum(count * price.get(key, 0) for key, count in counts.items()) / 1_000_000


# ── Transcripts ────────────────────────────────────────


def is_prompt(entry):
    """A message the user sent (not a tool result or a skill expansion)"""
    if entry.get("isMeta"):
        return False
    content = entry.get("message", {}).get("content")
    if isinstance(content, str):
        return True
    if isinstance(content, list):
        return not any(isinstance(b, dict) and b.get("type") == "tool_result" for b in content)
    return False


def text_of(entry):
    content = entry.get("message", {}).get("content")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(b.get("text", "") for b in content if isinstance(b, dict))
    return ""


def read_calls(path, is_subagent):
    """Return (folder, last time, [(model, usage, skill), ...])"""
    current = SUBAGENT if is_subagent else NO_SKILL
    # One response is split across several lines with the same usage: dedupe by message.id, keeping the last line
    calls = {}
    order = []
    folder = None
    last_at = ""

    with open(path, encoding="utf-8", errors="replace") as handle:
        for line in handle:
            try:
                entry = json.loads(line)
            except ValueError:
                continue

            folder = folder or entry.get("cwd")
            last_at = entry.get("timestamp") or last_at
            kind = entry.get("type")

            if kind == "user" and not is_subagent:
                if is_prompt(entry):
                    current = NO_SKILL
                else:
                    found = SKILL_DIR.search(text_of(entry))
                    if found and current == NO_SKILL:
                        current = os.path.basename(found.group(1).rstrip("/"))

            if kind != "assistant":
                continue

            message = entry.get("message") or {}
            model = message.get("model") or ""
            usage = message.get("usage")

            for block in message.get("content") or []:
                if isinstance(block, dict) and block.get("type") == "tool_use" and block.get("name") == "Skill":
                    skill = (block.get("input") or {}).get("skill")
                    if skill and not is_subagent:
                        current = skill

            if not usage or model.startswith("<"):
                continue

            key = message.get("id") or entry.get("requestId") or entry.get("uuid")
            if key not in calls:
                order.append(key)
            # The skill is the one active when the response is first seen
            skill = calls[key][2] if key in calls else current
            calls[key] = (model, usage, skill)

    return folder, last_at, [calls[key] for key in order]


# ── Totals ──────────────────────────────────────────────


def blank():
    return {"usd": 0.0, "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0, "steps": 0}


def add(row, usd, usage):
    row["usd"] += usd
    row["input"] += usage.get("input_tokens") or 0
    row["output"] += usage.get("output_tokens") or 0
    row["cacheRead"] += usage.get("cache_read_input_tokens") or 0
    row["cacheWrite"] += usage.get("cache_creation_input_tokens") or 0
    row["steps"] += 1


def add_session(folders, folder, last_at, priced, actual):
    """priced: [(model, usage, skill, estimated cost)]; actual is the actual cost or None"""
    estimated = sum(usd for _, _, _, usd in priced)
    # With an actual cost, scale proportionally, keeping the split across skills and models
    is_actual = actual is not None and estimated > 0
    factor = actual / estimated if is_actual else 1.0

    record = folders.setdefault(
        folder, {"rows": {}, "models": {}, "sessions": 0, "actualSessions": 0, "lastAt": ""}
    )
    record["sessions"] += 1
    record["actualSessions"] += 1 if is_actual else 0
    record["lastAt"] = max(record["lastAt"], last_at)

    for model, usage, skill, usd in priced:
        usd *= factor
        add(record["rows"].setdefault(skill, blank()), usd, usage)
        row = record["models"].setdefault(model, dict(blank(), skills={}))
        add(row, usd, usage)
        row["skills"][skill] = row["skills"].get(skill, 0) + 1


def list_prices(prices, sources, status):
    models = {
        name: {"source": sources.get(name, "bundled"), **price}
        for name, price in sorted(prices["models"].items())
        if name.startswith("claude-")
    }
    json.dump({"models": models, "online": status}, sys.stdout, ensure_ascii=False)


def main():
    args = [arg for arg in sys.argv[1:] if arg != "--refresh"]
    force = "--refresh" in sys.argv

    if args and args[0] == "--prices":
        list_prices(*load_prices(args[1], args[2], force))
        return

    root, builtin, data_dir = args[0], args[1], args[2]
    prices, _, status = load_prices(builtin, data_dir, force)
    actuals = {}
    if not sys.stdin.isatty():
        text = sys.stdin.read().strip()
        if text:
            actuals = json.loads(text)

    folders = {}
    unpriced = set()

    def priced(calls):
        result = []
        for model, usage, skill in calls:
            usd = cost_of(prices, model, usage)
            if usd is None:
                unpriced.add(model)
                usd = 0.0
            result.append((model, usage, skill, usd))
        return result

    for project in sorted(os.listdir(root)):
        base = os.path.join(root, project)
        if not os.path.isdir(base):
            continue

        for name in sorted(os.listdir(base)):
            if not name.endswith(".jsonl"):
                continue
            session = name[: -len(".jsonl")]
            folder, last_at, calls = read_calls(os.path.join(base, name), False)

            # Subagents may run in a subdirectory; count them toward their session's folder and actual cost
            agents = os.path.join(base, session, "subagents")
            if os.path.isdir(agents):
                for agent in sorted(os.listdir(agents)):
                    if agent.endswith(".jsonl"):
                        calls += read_calls(os.path.join(agents, agent), True)[2]

            if folder and calls:
                add_session(folders, folder, last_at, priced(calls), actuals.get(session))

    json.dump(
        {"folders": folders, "unpriced": sorted(unpriced), "online": status},
        sys.stdout,
        ensure_ascii=False,
    )


if __name__ == "__main__":
    main()
