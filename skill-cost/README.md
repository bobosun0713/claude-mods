# skill-cost

English | [繁體中文](./README.zh-TW.md)

Tracks Claude Code token usage and cost by skill and model, for the current session, each project directory, and your entire history.

> Command output and the summary line are in Traditional Chinese by default. Run `/skill-cost lang en` to switch to English.

## Installation

```
/plugin install skill-cost --marketplace bobosun0713/claude-mods
```

### Requirements

- `python3`: parses past transcripts (`scripts/scan.py`). Without it you can still see the current session's cost, but history reports show a scan failure.
- Network access (optional): refreshes model prices from the official Claude documentation. Offline, the mod uses cached or bundled prices.

## Usage

| Command | Description |
| --- | --- |
| `/skill-cost` | Current session (actual cost) and history for the current project directory |
| `/skill-cost all` | Totals across your entire history, plus a cost ranking of project directories |
| `/skill-cost scan` | Refresh official prices, rescan transcripts, and show your entire history |
| `/skill-cost prices` | Model prices in use and where each comes from |
| `/skill-cost reset` | Reset the current session's statistics |
| `/skill-cost hide` | Hide the summary line above the prompt |
| `/skill-cost show` | Show the summary line above the prompt |
| `/skill-cost lang [en\|zh]` | Switch reports and the summary line between English and Traditional Chinese; with no argument, toggles. The choice is kept across sessions |

### Summary line

A line above the prompt shows the current session's cost, how many skills and models it used, and the current project directory's total cost (marked `≈` when part of it is estimated):

```
本次 US$9.23 · 1 種 skill · 1 種模型 · 此資料夾歷來 ≈US$327.66 · /skill-cost 看明細
```

### Reports

Each scope has two tables.

**Skill table**

| Column | Description |
| --- | --- |
| Skill | Skill name. `(no skill)` is calls made with no skill loaded, `(subagent)` is subagent calls, and `(before load)` is cost incurred before the mod loaded (shown as `（無 skill）`, `（subagent）` and `（載入前）` in Chinese) |
| 金額(USD) | Cost in US dollars |
| 占比 | Share of the scope's total cost |
| 次數 | Number of model calls |
| 輸入 / 輸出 | Uncached input tokens and output tokens |
| 快取讀 / 快取寫 | Prompt cache read and write tokens |

**Model table**

Lists each model's cost, call count, output tokens, and cache read tokens, plus the skills it was called under and how many times (for example `git-commit×5`).

Tables adapt to the terminal width: when space is short, lower-priority columns are hidden and long values wrap.

## How costs are calculated

### Current session (actual cost)

Taken from Claude Code's session cost ledger, the same source as `/cost`. After each model call, the increase in cost is attributed to the active skill.

### History

History parses the transcripts (JSONL) under `~/.claude/projects/` and determines each session's cost in this order:

1. **Actual cost**: at the end of each turn, the mod saves the session's actual cost (the same source as `/cost`). Every session after you install the mod uses its actual cost; the split across skills and models follows the estimated proportions.
2. **Estimated cost**: sessions from before you installed the mod are estimated from model prices (see below):
   - Input, output, and cache read tokens are priced at each model's rates
   - Cache writes are priced at the 5-minute or 1-hour rate according to their TTL
   - Fast mode calls are priced at the official fast mode rates
   - Current prices are always used; after a price change, estimated sessions are recalculated at the new prices

Report headings show how many sessions in each scope are actual and how many are estimated, for example `52 個 session，3 個實際、49 個估算` (52 sessions: 3 actual, 49 estimated).

Other rules:

- A response split across several transcript lines is counted once, by message ID
- Subagent costs count toward the project directory of the session that started them

Estimates exclude discounts, Batch pricing, and data residency surcharges. Models missing from the price list still have their tokens counted, but their estimated cost is 0 and the report notes them.

When `CLAUDE_CONFIG_DIR` is set, the mod reads `$CLAUDE_CONFIG_DIR/projects/` instead.

### Skill attribution

Once a skill loads (through the Skill tool or a slash command), every model call until the user's next message counts toward that skill. If several skills load in one turn, later costs go to the last one loaded.

## Model prices

Estimates use prices from the first of these sources that has them (US dollars per million tokens):

| Priority | Source | Location |
| --- | --- | --- |
| 1 | Custom prices | `~/.claude/skill-cost/prices.json` |
| 2 | Official prices | The [Claude pricing page](https://platform.claude.com/docs/en/about-claude/pricing) (read from its [Markdown version](https://platform.claude.com/docs/en/about-claude/pricing.md)), cached in `~/.claude/skill-cost/online-prices.json` |
| 3 | Bundled prices | [`scripts/prices.json`](./scripts/prices.json), synced monthly from the official pricing page by this repository's GitHub Actions |

Run `/skill-cost prices` to see the price, source, and last official update for each model.

### Official prices

- Parses the "Model pricing" and "Fast mode pricing" tables on the official pricing page, including cache read, cache write, and fast mode rates.
- When a Claude Haiku 5.5 prompt (including cache reads and writes) exceeds 100,000 tokens, the official long-prompt rates apply.
- Refreshed automatically at most once a day; `/skill-cost scan` forces a refresh.
- If the page can't be reached, or parsing returns something unexpected (for example after a page redesign), the previous cache is kept. Without a cache, bundled prices are used and the report notes the failed update.
- A model ID must match a price list name exactly, or add only a date (such as `-20251001`) or a suffix like `[1m]`. Models that don't match are listed as unpriced rather than priced like a similar model.

### Price format

Bundled prices, the official price cache, and custom prices share one format. Every value is a price (US dollars per million tokens); nothing is derived from multipliers:

```json
{
  "models": {
    "claude-opus-5-5": {
      "input": 4.0, "output": 20.0, "cacheRead": 0.2, "cacheWrite5m": 5.0, "cacheWrite1h": 8.0,
      "fastInput": 8.0, "fastOutput": 40.0
    }
  }
}
```

| Field | Description |
| --- | --- |
| `input` / `output` | Input and output rates (required) |
| `cacheRead` | Cache read rate |
| `cacheWrite5m` / `cacheWrite1h` | 5-minute and 1-hour cache write rates |
| `fastInput` / `fastOutput` | Fast mode input and output rates. Fast mode cache rates are scaled by `fastInput ÷ input`, because the official pricing applies cache multipliers on top of fast mode rates |
| `above100k` | Rates for prompts over 100,000 tokens, with the same fields (currently Claude Haiku 5.5 only) |

If a call uses a token type whose price is missing (for example a fast mode call with no `fastInput`), the call is listed as unpriced instead of being charged at a guessed rate.

### Custom prices

Create `~/.claude/skill-cost/prices.json` (or `$CLAUDE_CONFIG_DIR/skill-cost/prices.json` when `CLAUDE_CONFIG_DIR` is set) and list only the models you want to add or correct, for example a new model that isn't listed yet:

```json
{
  "models": {
    "claude-example-6": { "input": 3.0, "output": 15.0, "cacheRead": 0.3 }
  }
}
```

- Models listed in the custom file override official and bundled prices.
- Run `/skill-cost scan` after editing to apply the change.

## Limitations

- History covers only transcripts still kept on this machine.
- Actual costs are saved only on the machine where the mod is installed; the same transcripts on another machine are estimated.
- In Claude Code environments managed by an organization, the `skill.prompt` event isn't delivered to plugins you install yourself, so the current session's cost all counts toward `(no skill)`. History is unaffected.
- History scan results are cached for 60 seconds, so repeated queries in that window don't rescan; use `/skill-cost scan` to update immediately.
- After `/skill-cost lang`, the command's description in the `/` menu changes from the next session. Error details passed through from `scripts/scan.py` (such as a failed price parse) stay in Chinese.

## Files

| Path | Description |
| --- | --- |
| `hooks/register.tsx` | Hooks module: cost tracking, saving actual costs, commands, summary line |
| `scripts/scan.py` | Transcript parsing and cost calculation |
| `scripts/prices.json` | Bundled prices (fallback when official prices are unavailable) |
| `scripts/update_prices.py` | Updates bundled prices from the official pricing page (used by GitHub Actions; can also be run by hand) |
| `scripts/test_scan.py` | Unit tests for price parsing and pricing (`python3 -m unittest discover -s skill-cost/scripts`) |
| `types/index.d.ts` | `$.state` type declarations |
| `tests/` | Unit tests and summary line rendering tests |
