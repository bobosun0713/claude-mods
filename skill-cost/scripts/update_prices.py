"""Update the bundled price list scripts/prices.json from the official Claude pricing page.

Usage:
  python3 update_prices.py [--source <pricing page Markdown>] [--summary <output Markdown>]

  --source   read a local copy of the pricing page Markdown (for tests); downloads from the official docs when omitted
  --summary  write a summary of price changes to a file (used as the PR body)

The official pricing page decides the model list: added, changed and removed models are all reflected.
The file is not rewritten when nothing changed. If the page can't be parsed, exits with code 1 without rewriting.
"""

import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
# python3 -I leaves the script's directory off sys.path; add it to share scan.py's parsing logic
sys.path.insert(0, HERE)

from scan import ONLINE_URL, fetch_page, from_official  # noqa: E402

PRICES = os.path.join(HERE, "prices.json")
FIELDS = ("input", "output", "cacheRead", "cacheWrite5m", "cacheWrite1h", "fastInput", "fastOutput", "above100k")


def load_page(source):
    if source:
        with open(source, encoding="utf-8") as handle:
            return handle.read()
    return fetch_page(timeout=30)


def render(data):
    """One model per line so a diff shows only the models that changed"""
    lines = ["{"]
    lines.append(f'  "_comment": {json.dumps(data["_comment"], ensure_ascii=False)},')
    lines.append('  "models": {')
    names = sorted(data["models"])
    for index, name in enumerate(names):
        comma = "," if index < len(names) - 1 else ""
        lines.append(f"    {json.dumps(name)}: {json.dumps(data['models'][name])}{comma}")
    lines += ["  }", "}", ""]
    return "\n".join(lines)


def text(value):
    if isinstance(value, dict):
        return "{" + ", ".join(f"{key} {value[key]}" for key in FIELDS if key in value) + "}"
    return "—" if value is None else str(value)


def describe(name, old, new):
    if old is None:
        return f"| `{name}` | 新增 | {text(new)} |"
    if new is None:
        return f"| `{name}` | 移除 | {text(old)} |"
    changes = [f"{key} {text(old.get(key))} → {text(new.get(key))}" for key in FIELDS if old.get(key) != new.get(key)]
    return f"| `{name}` | 調整 | " + ", ".join(changes) + " |" if changes else None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source")
    parser.add_argument("--summary")
    args = parser.parse_args()

    with open(PRICES, encoding="utf-8") as handle:
        current = json.load(handle)

    try:
        latest = from_official(load_page(args.source))
    except (OSError, ValueError) as error:  # Connection failed or the page format changed
        print(f"價格頁無法解析：{error}", file=sys.stderr)
        sys.exit(1)

    old = current["models"]
    rows = [
        row
        for name in sorted(set(old) | set(latest))
        if (row := describe(name, old.get(name), latest.get(name)))
    ]
    models = latest

    if not rows:
        print("價格沒有變動。")
        return

    with open(PRICES, "w", encoding="utf-8") as handle:
        handle.write(render({"_comment": current["_comment"], "models": models}))

    summary = "\n".join(
        [
            f"依 [Claude 官方價格頁]({ONLINE_URL}) 更新 `skill-cost/scripts/prices.json`（美元 / 百萬 token）。",
            "",
            "| 模型 | 類型 | 變動 |",
            "| --- | --- | --- |",
            *rows,
            "",
        ]
    )
    print(summary)
    if args.summary:
        with open(args.summary, "w", encoding="utf-8") as handle:
            handle.write(summary)


if __name__ == "__main__":
    main()
