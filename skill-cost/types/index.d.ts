export type CostRow = {
  usd: number
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  steps: number
}

/** skill 名稱 → 用量；未在 skill 內的呼叫記在「（無 skill）」 */
export type Rows = Record<string, CostRow>

/** 模型的用量，另記在哪些 skill 下被呼叫（skill → 呼叫次數） */
export type ModelRow = CostRow & { skills: Record<string, number> }

/** 模型 id → 用量 */
export type ModelRows = Record<string, ModelRow>

export type Ledger = {
  /** 上次結算時 session 的累計金額；null 表示尚未建立基準 */
  lastUsd: number | null
  rows: Rows
  /** 舊版紀錄沒有這欄 */
  models?: ModelRows
}

/** 一個資料夾從對話紀錄算出的累計（含所有 session） */
export type FolderRecord = {
  folder: string
  rows: Rows
  models?: ModelRows
  sessions: number
  /** 其中以實際費用計算的 session 數，其餘為估算 */
  actualSessions: number
  /** 最後一筆紀錄的時間（ISO） */
  lastAt: string
}

/** 掃描 ~/.claude/projects 的結果 */
export type History = {
  scannedAt: number
  folders: FolderRecord[]
  /** 沒有牌價、金額記為 0 的模型 */
  unpriced: string[]
  /** 掃描失敗時的原因 */
  error?: string
  /** 官方價格的更新狀態 */
  online?: OnlineStatus
}

export type OnlineStatus = {
  /** 上次成功抓取的時間（秒） */
  fetchedAt?: number
  /** 最近一次抓取失敗的原因；失敗時沿用快取或內建價格 */
  error?: string
}

declare module 'claude-code' {
  interface PluginState {
    'skill-cost': { ledger: Ledger; isHidden: boolean; history: History | null; isScanning: boolean }
  }
}
