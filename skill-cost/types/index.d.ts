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
  /** Subagents started this session, by type, counted as the Agent tool runs */
  agents?: Record<string, number>
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
  /** Instruction files loaded (CLAUDE.md, .claude/rules, memory), by path; missing in older scans */
  instructions?: Record<string, InstructionStat>
  /** Subagents started, by type; missing in older scans */
  agents?: Record<string, AgentStat>
}

/** kind: User, Project, Local, Managed, AutoMem, or Rule for .claude/rules files */
export type InstructionStat = { kind: string; loads: number; sessions: number }

export type AgentStat = { calls: number; sessions: number }

/** The current session's own instruction files and agents, from its transcript */
export type CurrentExtras = {
  instructions: Record<string, { kind: string; loads: number }>
  agents: Record<string, number>
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
  /** The current session's instruction files and agents */
  current?: CurrentExtras
}

export type OnlineStatus = {
  /** Time of the last successful fetch (seconds) */
  fetchedAt?: number
  /** Why the latest fetch failed; on failure, cached or bundled prices are used */
  error?: string
}

/** Colour theme of the bordered tables and the summary line; plain keeps the original text look */
export type ThemeName = 'plain' | 'blue' | 'green' | 'purple' | 'orange' | 'pink' | 'mono'

/** table: grid with a header row like the reports; compact: one bordered row; line: one line */
export type BandStyle = 'table' | 'compact' | 'line'

/** `keep`: lower numbers are hidden first, 0 is never hidden; `isFlex`: takes the remaining width and wraps long text */
export type TableColumn = {
  title: string
  width: number
  isRight?: boolean
  keep?: number
  isFlex?: boolean
  /** Drawn in the theme's accent colour */
  isAccent?: boolean
  /** A path: shortened in the middle (…) instead of wrapped */
  isPath?: boolean
}

export type TableData = { columns: TableColumn[]; rows: string[][]; lang?: Lang }

/** One piece of a report, kept so the output row can be drawn as coloured tables */
export type Block =
  | { kind: 'title'; text: string }
  | { kind: 'text'; text: string }
  | { kind: 'note'; text: string }
  | { kind: 'table'; table: TableData }
  | { kind: 'themes'; current: ThemeName; lang: Lang }

declare module 'claude-code' {
  interface PluginState {
    'skill-cost': {
      ledger: Ledger
      isHidden: boolean
      history: History | null
      isScanning: boolean
      lang: Lang
      theme: ThemeName
      /** How the summary above the prompt is laid out: a bordered table, or one line */
      band: BandStyle
      /** output text → the blocks it was made from (latest few reports) */
      views: Record<string, Block[]>
    }
  }
}
