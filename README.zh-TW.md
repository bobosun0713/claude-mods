# claude-mods

[English](./README.md) | 繁體中文

Claude Code 擴充模組（mod）集合。每個 mod 皆為獨立的 Claude Code plugin，透過 hooks module 擴充 Claude Code 的介面與行為。

本 repository 同時是一個 plugin marketplace，可依需求個別安裝其中的 mod。

## Mods

| 名稱 | 說明 | 版本 |
| --- | --- | --- |
| [skill-cost](./skill-cost/README.zh-TW.md) | 依 skill 與模型統計 token 用量及費用 | 0.1.0 |

各 mod 的功能、指令與限制，請參閱其目錄下的 `README.zh-TW.md`。

## 安裝

於 Claude Code 輸入框執行：

```
/plugin install <mod-name> --marketplace bobosun0713/claude-mods
```

首次安裝時會提示 `Add marketplace?`，輸入 `y` 確認，並選擇安裝範圍（建議使用預設的 user scope，使所有 session 皆會載入）。

也可執行 `/plugin`，從清單中選擇要安裝的 mod。

## 更新與移除

```
claude plugin update <mod-name>      # 更新至 repository 最新版本
claude plugin uninstall <mod-name>   # 移除
```

更新後於進行中的 session 執行 `/reload-plugins` 以套用變更。

## 自動化

| Workflow | 排程 | 內容 |
| --- | --- | --- |
| [Update model prices](./.github/workflows/update-prices.yml) | 每月 1 日 01:00 UTC，亦可手動執行 | 依 Claude 官方價格頁更新 `skill-cost/scripts/prices.json`，有變動時開立 PR |

使用前須於 repository 的 **Settings → Actions → General → Workflow permissions** 勾選 **Allow GitHub Actions to create and approve pull requests**。

## 目錄結構

```
claude-mods/
├── .github/workflows/        # GitHub Actions
├── .claude-plugin/
│   └── marketplace.json      # marketplace 定義，列出所有 mod
└── <mod-name>/
    ├── .claude-plugin/
    │   └── plugin.json       # plugin manifest（名稱、版本、說明）
    ├── hooks/
    │   ├── hooks.json        # 指定 hooks module 進入點
    │   └── register.tsx      # hooks module
    ├── types/                # $.state 型別定義
    ├── tests/                # claude plugin test 測試
    ├── README.md             # 英文說明
    └── README.zh-TW.md       # 中文說明
```

## 開發

| 指令 | 用途 |
| --- | --- |
| `claude --plugin-dir ./<mod-name>` | 以開發模式載入 mod，檔案儲存後自動重新載入 |
| `claude plugin validate ./<mod-name>` | 驗證 manifest 與 hooks module |
| `claude plugin validate .` | 驗證 marketplace 定義 |
| `claude plugin test ./<mod-name>` | 執行 mod 測試 |
| `python3 -m unittest discover -s skill-cost/scripts` | 執行 skill-cost 價格解析測試 |

mod 不需要 `package.json`、打包工具或建置步驟，Claude Code 會直接載入 `.ts` 與 `.tsx` 檔案。

`.claude-plugin/types/` 由 Claude Code 於載入 mod 時自動產生，不納入版本控制。首次以 `--plugin-dir` 載入後即可使用 `tsc -p ./<mod-name>` 進行型別檢查。

### 新增 mod

1. 建立 `<mod-name>/` 目錄，包含 `.claude-plugin/plugin.json`、`hooks/`、`README.md`（英文）與 `README.zh-TW.md`（中文）。
2. 於 `.claude-plugin/marketplace.json` 的 `plugins` 陣列新增一筆：
   ```json
   { "name": "<mod-name>", "source": "./<mod-name>", "description": "<說明>" }
   ```
3. 更新 `README.md` 與 `README.zh-TW.md` 的 Mods 列表。

### 發佈新版本

調整 mod 後，請同步提高其 `plugin.json` 的 `version`（遵循 Semantic Versioning），再推送至 repository。
