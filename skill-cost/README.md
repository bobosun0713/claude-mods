# skill-cost

依 skill 與模型統計 Claude Code 的 token 用量及費用，涵蓋目前 session、各專案目錄與全部歷史紀錄。

## 安裝

```
/plugin install skill-cost --marketplace bobosun0713/claude-mods
```

### 系統需求

- `python3`：用於解析歷史對話紀錄（`scripts/scan.py`）。若未安裝，仍可查詢目前 session 的費用，歷史統計將顯示掃描失敗。
- 網路連線（選用）：用於從 Claude 官方文件更新模型價格。離線時使用快取或內建價格。

## 使用方式

| 指令 | 說明 |
| --- | --- |
| `/skill-cost` | 顯示目前 session（實際費用）與目前專案目錄的歷史統計 |
| `/skill-cost all` | 顯示全部歷史紀錄的彙總統計，以及各專案目錄的費用排行 |
| `/skill-cost scan` | 更新官方價格並重新掃描對話紀錄，顯示全部歷史紀錄 |
| `/skill-cost prices` | 顯示目前採用的模型價格及其來源 |
| `/skill-cost reset` | 重設目前 session 的統計 |
| `/skill-cost hide` | 隱藏輸入框上方的摘要列 |
| `/skill-cost show` | 顯示輸入框上方的摘要列 |

### 摘要列

輸入框上方常駐一行摘要，顯示目前 session 的費用、使用的 skill 與模型數量，以及目前專案目錄的累計費用（含估算部分時以 `≈` 標示）：

```
本次 US$9.23 · 1 種 skill · 1 種模型 · 此資料夾歷來 ≈US$327.66 · /skill-cost 看明細
```

### 統計報表

每個統計範圍皆包含兩張表：

**Skill 表**

| 欄位 | 說明 |
| --- | --- |
| Skill | skill 名稱；`（無 skill）` 為未載入任何 skill 時的呼叫，`（subagent）` 為子代理的呼叫，`（載入前）` 為 mod 載入前已產生的費用 |
| 金額(USD) | 費用（美元） |
| 占比 | 占該統計範圍總費用的比例 |
| 次數 | 模型呼叫次數 |
| 輸入 / 輸出 | 未快取的輸入 token 與輸出 token |
| 快取讀 / 快取寫 | prompt cache 讀取與寫入的 token |

**模型表**

列出各模型的費用、呼叫次數、輸出與快取讀取 token，並註明該模型於哪些 skill 下被呼叫及其次數（例如 `git-commit×5`）。

表格會依終端機寬度自動調整：寬度不足時依重要性隱藏次要欄位，過長的內容自動換行。

## 計算方式

### 目前 session（實際費用）

取自 Claude Code 的 session 費用紀錄（與 `/cost` 相同來源）。每次模型呼叫完成後，將費用增量歸入當下作用中的 skill。

### 歷史統計

歷史統計解析 `~/.claude/projects/` 下的對話紀錄（JSONL），並依下列優先順序決定每個 session 的費用：

1. **實際費用**：本 mod 會在每輪對話結束時保存該 session 的實際費用（與 `/cost` 相同來源）。安裝本 mod 後產生的 session 皆以實際費用計算，skill 與模型間的分配則沿用估算比例。
2. **估算費用**：安裝前的 session，依模型價格（見下節）估算：
   - 輸入、輸出、快取讀取 token 依各模型單價計價
   - 快取寫入依 TTL 分別以 5 分鐘 / 1 小時的單價計價
   - fast mode 呼叫以官方 fast mode 價格計價
   - 一律採用目前的模型價格；價格調整後，估算的 session 會依新價格重新計算

報表標題會註明各統計範圍中實際與估算的 session 數，例如 `52 個 session，3 個實際、49 個估算`。

其他處理規則：

- 同一回應被拆分為多筆紀錄時，以 message id 去重
- 子代理的費用歸入其所屬 session 的專案目錄

估算未計入折扣、Batch 價格與資料駐留（data residency）加價。未列於價目表的模型，其 token 仍會統計，但估算費用記為 0 並於報表中註明。

設定 `CLAUDE_CONFIG_DIR` 時，改為讀取 `$CLAUDE_CONFIG_DIR/projects/`。

### Skill 歸屬規則

skill 載入後（透過 Skill 工具或 slash command），至使用者送出下一則訊息前的所有模型呼叫皆歸入該 skill。若同一輪對話載入多個 skill，後續費用歸入最後載入者。

## 模型價格

估算所用的價格依下列優先順序決定（單位：美元 / 百萬 token）：

| 優先順序 | 來源 | 位置 |
| --- | --- | --- |
| 1 | 自訂價格 | `~/.claude/skill-cost/prices.json` |
| 2 | 官方價格 | [Claude 官方價格頁](https://platform.claude.com/docs/en/about-claude/pricing)（讀取其 [Markdown 版本](https://platform.claude.com/docs/en/about-claude/pricing.md)），快取於 `~/.claude/skill-cost/online-prices.json` |
| 3 | 內建價格 | [`scripts/prices.json`](./scripts/prices.json)，由 repository 的 GitHub Actions 每天依官方價格頁同步 |

執行 `/skill-cost prices` 可查看各模型目前採用的價格、來源與官方價格的更新時間。

### 官方價格

- 解析官方價格頁的「Model pricing」與「Fast mode pricing」表格，包含快取讀寫與 fast mode 價格。
- Claude Haiku 5.5 的 prompt（含快取讀寫）超過 100,000 token 時，採用官方列出的長 prompt 價格。
- 每天最多自動更新一次；`/skill-cost scan` 會強制更新。
- 頁面無法連線，或解析結果不符預期（例如頁面改版）時，沿用上次的快取；若無快取則使用內建價格，報表中會註明更新失敗。
- 模型 ID 須與價格表名稱完全相同，或僅多出日期（如 `-20251001`）與 `[1m]` 等後綴；無法對應的模型不會套用相近模型的價格，而是列為無牌價。

### 價格格式

內建、官方價格快取與自訂價格皆使用相同格式，所有數值皆為價格（美元 / 百萬 token），不使用倍率推算：

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

| 欄位 | 說明 |
| --- | --- |
| `input` / `output` | 輸入 / 輸出單價（必填） |
| `cacheRead` | 快取讀取單價 |
| `cacheWrite5m` / `cacheWrite1h` | 5 分鐘 / 1 小時快取寫入單價 |
| `fastInput` / `fastOutput` | fast mode 輸入 / 輸出單價；fast mode 的快取價格依 `fastInput ÷ input` 的比例換算（官方規定快取倍率疊加於 fast mode 價格之上） |
| `above100k` | prompt 超過 100,000 token 時的價格，欄位同上（目前僅 Claude Haiku 5.5） |

呼叫用到的 token 類型缺少對應價格時（例如 fast mode 呼叫但未列 `fastInput`），該次呼叫列為無牌價，不以推算價格計費。

### 自訂價格

建立 `~/.claude/skill-cost/prices.json`（設定 `CLAUDE_CONFIG_DIR` 時為 `$CLAUDE_CONFIG_DIR/skill-cost/prices.json`），僅需列出要新增或修正的模型，例如補上尚未收錄的新模型：

```json
{
  "models": {
    "claude-example-6": { "input": 3.0, "output": 15.0, "cacheRead": 0.3 }
  }
}
```

- 自訂檔中列出的模型會取代官方與內建價格。
- 修改後執行 `/skill-cost scan` 即可套用。

## 限制

- 歷史統計僅涵蓋本機仍保留的對話紀錄。
- 實際費用僅保存於安裝本 mod 的電腦；同一份對話紀錄在其他電腦上會以估算計算。
- 由組織管理的 Claude Code 環境中，`skill.prompt` 事件不會傳遞給自行安裝的 plugin，此時目前 session 的費用將全數歸入 `（無 skill）`；歷史統計不受影響。
- 歷史掃描結果會快取 60 秒，期間內重複查詢不會重新掃描；如需立即更新請使用 `/skill-cost scan`。

## 檔案說明

| 路徑 | 說明 |
| --- | --- |
| `hooks/register.tsx` | hooks module：費用記錄、實際費用保存、指令、摘要列 |
| `scripts/scan.py` | 對話紀錄解析與費用計算 |
| `scripts/prices.json` | 內建價格（官方價格無法取得時的備援） |
| `scripts/update_prices.py` | 依官方價格頁更新內建價格（供 GitHub Actions 使用，亦可手動執行） |
| `scripts/test_scan.py` | 價格解析與計價的單元測試（`python3 -m unittest discover -s skill-cost/scripts`） |
| `types/index.d.ts` | `$.state` 型別定義 |
| `tests/` | 單元測試與摘要列繪製測試 |
