/** Language of command output and the summary line */
export type Lang = 'zh' | 'en'

export type CostRow = {
  usd: number
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  steps: number
}

/** skill name → usage; calls made outside any skill are recorded under "(no skill)" */
export type Rows = Record<string, CostRow>

/** A model's usage, plus the skills it was called under (skill → call count) */
export type ModelRow = CostRow & { skills: Record<string, number> }

/** model id → usage */
export type ModelRows = Record<string, ModelRow>

export type Ledger = {
  /** The session's running total at the last charge; null means no baseline yet */
  lastUsd: number | null
  rows: Rows
  /** Missing in ledgers from older versions */
  models?: ModelRows
}

/** One folder's totals computed from transcripts (all sessions) */
export type FolderRecord = {
  folder: string
  rows: Rows
  models?: ModelRows
  sessions: number
  /** How many of those sessions use actual cost; the rest are estimated */
  actualSessions: number
  /** Time of the latest record (ISO) */
  lastAt: string
}

/** Result of scanning ~/.claude/projects */
export type History = {
  scannedAt: number
  folders: FolderRecord[]
  /** Models with no list price, counted at 0 */
  unpriced: string[]
  /** Why the scan failed, if it did */
  error?: string
  /** Update status of official prices */
  online?: OnlineStatus
}

export type OnlineStatus = {
  /** Time of the last successful fetch (seconds) */
  fetchedAt?: number
  /** Why the latest fetch failed; on failure, cached or bundled prices are used */
  error?: string
}

declare module 'claude-code' {
  interface PluginState {
    'skill-cost': { ledger: Ledger; isHidden: boolean; history: History | null; isScanning: boolean; lang: Lang }
  }
}
