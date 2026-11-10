import { atom, read, update } from 'claude-code'
import type { ElementTable, EngineInterface, Register, TurnUsage } from 'claude-code'

import type {
  AgentStat,
  BandStyle,
  Block,
  CurrentExtras,
  InstructionStat,
  CostRow,
  FolderRecord,
  History,
  Lang,
  Ledger,
  ModelRow,
  ModelRows,
  OnlineStatus,
  Rows,
  TableColumn,
  TableData,
  ThemeName,
} from '../types'

// Language-neutral names kept in data; shown through label(). NO_SKILL and SUBAGENT match scripts/scan.py
const NO_SKILL = '(no skill)'
const SUBAGENT = '(subagent)'
const BEFORE = '(before load)'
const UNKNOWN_MODEL = '(unknown model)'

// ── Language ────────────────────────────────────────────

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

const TEXT = {
  zh: {
    help: [
      '其他用法：',
      '  /skill-cost all     全部使用紀錄（所有資料夾合併，含各資料夾排行）',
      '  /skill-cost scan    更新官方價格並重新掃描，顯示全部使用紀錄',
      '  /skill-cost prices  目前採用的模型價格與來源',
      '  /skill-cost reset   本次 session 歸零',
      '  /skill-cost hide    隱藏提示列（show 顯示）',
      '  /skill-cost lang    切換中文 / English（lang en、lang zh 指定）',
      '  /skill-cost theme   選擇表格配色（theme blue、theme plain…）',
      '  /skill-cost band    提示列樣式：表格 / 單列框線 / 單行（band table、band compact、band line）',
    ].join('\n'),
    description: '依 skill 與模型列出花費（all 全部紀錄、scan 重新掃描、prices 價格表、reset 歸零本次、hide/show 提示列、lang 切換語言、theme 配色）',
    themes: (current: string, command: string) => `可選配色（目前：${current}），用 /${command} theme <名稱> 切換：`,
    themeSet: (name: string) => `已切換為「${name}」配色。`,
    badTheme: (arg: string) => `沒有這個配色：${arg}`,
    instructions: '載入的指令檔（CLAUDE.md、.claude/rules、記憶）：',
    agents: (calls: number) => `啟動的 agent（共 ${calls} 次）：`,
    bandSet: (style: string) =>
      style === 'table' ? '提示列改為表格（含表頭）。' : style === 'compact' ? '提示列改為單列框線。' : '提示列改為單行。',
    badBand: (arg: string) => `不支援的提示列樣式：${arg}（可用 table、compact、line）`,
    empty: '（尚無紀錄）',
    summary: (cost: string, skills: number, models: number) => `${cost} · ${skills} 種 skill · ${models} 種模型`,
    allActual: (sessions: number) => `${sessions} 個 session，皆為實際費用`,
    mixed: (sessions: number, actual: number) => `${sessions} 個 session，${actual} 個實際、${sessions - actual} 個估算`,
    estimated: (sessions: number) => `${sessions} 個 session，估算`,
    scanning: '（掃描對話紀錄中…）',
    scanFailed: (error: string) => `（掃描失敗：${error}）`,
    unpriced: (models: string) => `${models} 無牌價，金額未計`,
    onlineFailed: '官方價格更新失敗，沿用先前價格',
    notes: (notes: string[]) => `（${notes.join('；')}）`,
    session: (summary: string) => `本次 session（實際金額）：${summary}`,
    folder: (basis: string, folder: string, summary: string, note: string) => `此資料夾歷來（${basis}）${folder}：${summary} ${note}`,
    noFolders: (note: string) => `還沒有任何資料夾的紀錄。${note}`,
    all: (folders: number, basis: string, summary: string, note: string) => `全部使用紀錄（${folders} 個資料夾，${basis}）：${summary} ${note}`,
    byFolder: '各資料夾：',
    fetched: (hours: number) => `官方價格更新於 ${hours} 小時前`,
    notFetched: '尚未取得官方價格',
    fetchFailed: (error: string) => `；最近一次更新失敗：${error}`,
    prices: (fetched: string) => `目前採用的價格（USD / 百萬 token）。${fetched}`,
    priority: '優先順序：自訂 > 官方 > 內建；自訂檔位於 ~/.claude/skill-cost/prices.json',
    pricesFailed: (error: string) => `無法讀取價格：${error}`,
    reset: '本次 session 已歸零。',
    hidden: '已隱藏提示列。',
    shown: '已顯示提示列。',
    switched: '已切換為中文。',
    badLang: (arg: string) => `不支援的語言：${arg}（可用 zh、en）`,
    band: (summary: string, folder: string) => `本次 ${summary} · 此資料夾歷來 ≈${folder} · /skill-cost 看明細`,
  },
  en: {
    help: [
      'More commands:',
      '  /skill-cost all     Entire history (all folders combined, with a folder ranking)',
      '  /skill-cost scan    Refresh official prices, rescan, and show the entire history',
      '  /skill-cost prices  Model prices in use and their sources',
      '  /skill-cost reset   Reset this session',
      '  /skill-cost hide    Hide the summary line (show to show it)',
      '  /skill-cost lang    Switch between 中文 and English (lang en, lang zh to pick)',
      '  /skill-cost theme   Pick the table colours (theme blue, theme plain…)',
      '  /skill-cost band    Summary as a table, one bordered row or one line (band table, band compact, band line)',
    ].join('\n'),
    description: 'Cost by skill and model (all: entire history, scan: rescan, prices: price list, reset: reset session, hide/show: summary line, lang: switch language, theme: colours)',
    themes: (current: string, command: string) => `Colour themes (current: ${current}); pick one with /${command} theme <name>:`,
    themeSet: (name: string) => `Switched to the "${name}" theme.`,
    badTheme: (arg: string) => `No such theme: ${arg}`,
    instructions: 'Instruction files loaded (CLAUDE.md, .claude/rules, memory):',
    agents: (calls: number) => `Agents started (${plural(calls, 'call')}):`,
    bandSet: (style: string) =>
      style === 'table' ? 'Summary shown as a table with headers.' : style === 'compact' ? 'Summary shown as one bordered row.' : 'Summary shown on one line.',
    badBand: (arg: string) => `Unsupported summary layout: ${arg} (use table, compact or line)`,
    empty: '(no records yet)',
    summary: (cost: string, skills: number, models: number) => `${cost} · ${plural(skills, 'skill')} · ${plural(models, 'model')}`,
    allActual: (sessions: number) => `${plural(sessions, 'session')}, all actual`,
    mixed: (sessions: number, actual: number) => `${plural(sessions, 'session')}: ${actual} actual, ${sessions - actual} estimated`,
    estimated: (sessions: number) => `${plural(sessions, 'session')}, estimated`,
    scanning: '(scanning transcripts…)',
    scanFailed: (error: string) => `(scan failed: ${error})`,
    unpriced: (models: string) => `${models} unpriced, cost not counted`,
    onlineFailed: 'official price update failed, using previous prices',
    notes: (notes: string[]) => `(${notes.join('; ')})`,
    session: (summary: string) => `This session (actual cost): ${summary}`,
    folder: (basis: string, folder: string, summary: string, note: string) => `This folder, all time (${basis}) ${folder}: ${summary} ${note}`,
    noFolders: (note: string) => `No folder records yet. ${note}`,
    all: (folders: number, basis: string, summary: string, note: string) => `Entire history (${plural(folders, 'folder')}, ${basis}): ${summary} ${note}`,
    byFolder: 'By folder:',
    fetched: (hours: number) => `Official prices updated ${plural(hours, 'hour')} ago`,
    notFetched: 'Official prices not fetched yet',
    fetchFailed: (error: string) => `; last update failed: ${error}`,
    prices: (fetched: string) => `Prices in use (USD / million tokens). ${fetched}`,
    priority: 'Priority: custom > official > bundled; custom file at ~/.claude/skill-cost/prices.json',
    pricesFailed: (error: string) => `Could not read prices: ${error}`,
    reset: 'This session has been reset.',
    hidden: 'Summary line hidden.',
    shown: 'Summary line shown.',
    switched: 'Switched to English.',
    badLang: (arg: string) => `Unsupported language: ${arg} (use zh or en)`,
    band: (summary: string, folder: string) => `This session ${summary} · this folder all time ≈${folder} · /skill-cost for details`,
  },
} satisfies Record<Lang, unknown>

/** Display names of the special skill and model names and the price sources */
const NAMES: Record<string, Record<Lang, string>> = {
  [NO_SKILL]: { zh: '（無 skill）', en: '(no skill)' },
  [SUBAGENT]: { zh: '（subagent）', en: '(subagent)' },
  [BEFORE]: { zh: '（載入前）', en: '(before load)' },
  [UNKNOWN_MODEL]: { zh: '（未知模型）', en: '(unknown model)' },
  // Kinds of instruction files, as the transcript records them
  Rule: { zh: '規則', en: 'Rule' },
  User: { zh: '使用者', en: 'User' },
  Project: { zh: '專案', en: 'Project' },
  Local: { zh: '本機', en: 'Local' },
  Managed: { zh: '組織', en: 'Managed' },
  AutoMem: { zh: '自動記憶', en: 'Auto memory' },
  bundled: { zh: '內建', en: 'bundled' },
  official: { zh: '官方', en: 'official' },
  custom: { zh: '自訂', en: 'custom' },
}

const label = (name: string, lang: Lang) => NAMES[name]?.[lang] ?? name

export const isLang = (value: unknown): value is Lang => value === 'zh' || value === 'en'

// Rescan when a report is opened this long after the last scan
const RESCAN_MS = 60_000
const EMPTY: Ledger = { lastUsd: null, rows: {}, models: {} }

const ledger = atom({ plugin: 'skill-cost', key: 'ledger' } as const, EMPTY)
const isHidden = atom({ plugin: 'skill-cost', key: 'isHidden' } as const, false)
const history = atom({ plugin: 'skill-cost', key: 'history' } as const, null as History | null)
const isScanning = atom({ plugin: 'skill-cost', key: 'isScanning' } as const, false)
const lang = atom({ plugin: 'skill-cost', key: 'lang' } as const, 'zh' as Lang)
const theme = atom({ plugin: 'skill-cost', key: 'theme' } as const, 'blue' as ThemeName)
const views = atom({ plugin: 'skill-cost', key: 'views' } as const, {} as Record<string, Block[]>)
const bandStyle = atom({ plugin: 'skill-cost', key: 'band' } as const, 'table' as BandStyle)

// The language, theme and summary layout settings are kept across sessions
const LANG_KEY = 'lang'
const THEME_KEY = 'theme'
const BAND_KEY = 'band'

const BAND_STYLES: BandStyle[] = ['table', 'compact', 'line']

const isBandStyle = (value: unknown): value is BandStyle => BAND_STYLES.includes(value as BandStyle)

/** Labels of the summary table above the prompt */
const BAND_LABELS = {
  zh: { session: '本次', skills: 'Skill', models: '模型', folder: '此資料夾歷來', count: (n: number) => `${n} 種`, hint: (c: string) => `/${c} 看明細` },
  en: { session: 'This session', skills: 'Skills', models: 'Models', folder: 'This folder', count: (n: number) => `${n}`, hint: (c: string) => `/${c} for details` },
} satisfies Record<Lang, unknown>

// ── Themes ──────────────────────────────────────────────

/** headBg/headFg: header row; border: grid lines; accent: cost column and titles */
type Palette = { headBg: string; headFg: string; border: string; accent: string }

export const THEMES: Record<Exclude<ThemeName, 'plain'>, Palette & { name: Record<Lang, string> }> = {
  blue: { name: { zh: '藍', en: 'blue' }, headBg: '#1d4ed8', headFg: '#ffffff', border: '#60a5fa', accent: '#3b82f6' },
  green: { name: { zh: '綠', en: 'green' }, headBg: '#047857', headFg: '#ffffff', border: '#34d399', accent: '#10b981' },
  purple: { name: { zh: '紫', en: 'purple' }, headBg: '#6d28d9', headFg: '#ffffff', border: '#a78bfa', accent: '#8b5cf6' },
  orange: { name: { zh: '橘', en: 'orange' }, headBg: '#c2410c', headFg: '#ffffff', border: '#fb923c', accent: '#f97316' },
  pink: { name: { zh: '粉', en: 'pink' }, headBg: '#be185d', headFg: '#ffffff', border: '#f472b6', accent: '#ec4899' },
  mono: { name: { zh: '灰', en: 'grey' }, headBg: '#4b5563', headFg: '#ffffff', border: '#9ca3af', accent: '#9ca3af' },
}

const PLAIN_NAME: Record<Lang, string> = { zh: '純文字（原樣式）', en: 'plain text (original look)' }

export const isTheme = (value: unknown): value is ThemeName => value === 'plain' || (typeof value === 'string' && value in THEMES)

const themeName = (name: ThemeName, lang: Lang) =>
  name === 'plain' ? PLAIN_NAME[lang] : lang === 'en' ? THEMES[name].name.en : `${name}（${THEMES[name].name.zh}）`


// How many recent report outputs keep their blocks for drawing
const MAX_VIEWS = 20

const blankRow = (): CostRow => ({ usd: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, steps: 0 })

const addRow = (a: CostRow | undefined, b: CostRow): CostRow => {
  const base = a ?? blankRow()

  return {
    usd: base.usd + b.usd,
    input: base.input + b.input,
    output: base.output + b.output,
    cacheRead: base.cacheRead + b.cacheRead,
    cacheWrite: base.cacheWrite + b.cacheWrite,
    steps: base.steps + b.steps,
  }
}

const addModel = (models: ModelRows | undefined, model: string, skill: string, step: CostRow): ModelRows => {
  const row = models?.[model]
  const skills = row?.skills ?? {}

  return {
    ...models,
    [model]: { ...addRow(row, step), skills: { ...skills, [skill]: (skills[skill] ?? 0) + step.steps } },
  }
}

/** Amount inside a table: the header already says USD */
const usd = (n: number) => `$${n.toFixed(n < 1 ? 3 : 2)}`

/** Amount outside a table: no header, so mark it as US dollars */
const usdLabel = (n: number) => `US${usd(n)}`

const tokens = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`)

const percent = (part: number, sum: number) => (sum > 0 ? `${Math.round((part / sum) * 100)}%` : '')

/** Terminal display width: CJK and full-width characters take two cells */
const width = (text: string) => [...text].reduce((sum, ch) => sum + ((ch.codePointAt(0) ?? 0) >= 0x2e80 ? 2 : 1), 0)

export const padEnd = (text: string, size: number) => text + ' '.repeat(Math.max(0, size - width(text)))

const padStart = (text: string, size: number) => ' '.repeat(Math.max(0, size - width(text))) + text

const byCost = <T extends CostRow>(rows: Record<string, T>) => Object.entries(rows).sort(([, a], [, b]) => b.usd - a.usd)

const skillCount = (rows: Rows) => Object.keys(rows).filter(name => name !== NO_SKILL && name !== BEFORE).length

const total = (rows: Rows) => Object.values(rows).reduce((sum, row) => sum + row.usd, 0)

/** Usage of one model call; the cost is the change in the session's running total */
export const stepRow = (state: Ledger, sessionUsd: number, usage: TurnUsage | null): CostRow => {
  const base = state.lastUsd ?? sessionUsd
  // A smaller running total means /clear restarted the count, so start from the new baseline
  const delta = sessionUsd >= base ? sessionUsd - base : sessionUsd

  return {
    usd: delta,
    input: usage?.input_tokens ?? 0,
    output: usage?.output_tokens ?? 0,
    cacheRead: usage?.cache_read_input_tokens ?? 0,
    cacheWrite: usage?.cache_creation_input_tokens ?? 0,
    steps: 1,
  }
}

/** Charge one model call's cost to its skill and model */
export const charge = (state: Ledger, skill: string, model: string, sessionUsd: number, usage: TurnUsage | null): Ledger => {
  const step = stepRow(state, sessionUsd, usage)

  return {
    lastUsd: sessionUsd,
    rows: { ...state.rows, [skill]: addRow(state.rows[skill], step) },
    models: addModel(state.models, model, skill, step),
  }
}

/** Add a row for the part of the session's total cost not yet recorded (before the mod loaded) */
export const withGap = (state: Ledger, sessionUsd: number): Ledger => {
  const gap = sessionUsd - total(state.rows)

  if (gap < 0.0005) {
    return state
  }

  return { ...state, rows: { ...state.rows, [BEFORE]: addRow(state.rows[BEFORE], { ...blankRow(), usd: gap }) } }
}

// ── Tables ──────────────────────────────────────────────

type Column = TableColumn

type Table = TableData

/** Column title and width per language; the width always fits the title */
type LocalColumn = Omit<Column, 'title' | 'width'> & { title: Record<Lang, string>; width: number | Record<Lang, number> }

const columnsOf = (columns: LocalColumn[], lang: Lang): Column[] =>
  columns.map(column => {
    const size = typeof column.width === 'number' ? column.width : column.width[lang]

    return { ...column, title: column.title[lang], width: Math.max(size, width(column.title[lang])) }
  })

const GAP = 2

const COST = { zh: '金額(USD)', en: 'Cost(USD)' }
const SHARE = { zh: '占比', en: 'Share' }
const CALLS = { zh: '次數', en: 'Calls' }
const INPUT = { zh: '輸入', en: 'Input' }
const OUTPUT = { zh: '輸出', en: 'Output' }
const CACHE_READ = { zh: '快取讀', en: 'Cache R' }
const MODEL = { zh: '模型', en: 'Model' }

const SKILL_COLUMNS: LocalColumn[] = [
  { title: { zh: 'Skill', en: 'Skill' }, width: 14, isFlex: true, keep: 0 },
  { title: COST, width: 10, isRight: true, keep: 0, isAccent: true },
  { title: SHARE, width: 4, isRight: true, keep: 4 },
  { title: CALLS, width: 4, isRight: true, keep: 5 },
  { title: INPUT, width: 6, isRight: true, keep: 1 },
  { title: OUTPUT, width: 6, isRight: true, keep: 6 },
  { title: CACHE_READ, width: 6, isRight: true, keep: 3 },
  { title: { zh: '快取寫', en: 'Cache W' }, width: 6, isRight: true, keep: 2 },
]

const MODEL_COLUMNS: LocalColumn[] = [
  { title: MODEL, width: 16, keep: 0 },
  { title: COST, width: 10, isRight: true, keep: 0, isAccent: true },
  { title: SHARE, width: 4, isRight: true, keep: 3 },
  { title: CALLS, width: 4, isRight: true, keep: 4 },
  { title: OUTPUT, width: 6, isRight: true, keep: 2 },
  { title: CACHE_READ, width: 6, isRight: true, keep: 1 },
  { title: { zh: '在哪些 skill 下呼叫', en: 'Called under skills' }, width: 16, isFlex: true, keep: 0 },
]

const FOLDER_COLUMNS: LocalColumn[] = [
  { title: COST, width: 10, isRight: true, keep: 0, isAccent: true },
  { title: { zh: 'Skill', en: 'Skills' }, width: 5, isRight: true, keep: 2 },
  { title: { zh: '模型', en: 'Models' }, width: 4, isRight: true, keep: 1 },
  { title: { zh: 'Session', en: 'Sessions' }, width: 7, isRight: true, keep: 3 },
  { title: { zh: '資料夾', en: 'Folder' }, width: 16, isFlex: true, keep: 0, isPath: true },
]

const spanOf = (columns: Column[], gap = GAP) => columns.reduce((sum, column) => sum + column.width, 0) + gap * Math.max(0, columns.length - 1)

// A fixed column grows to its longest cell up to this width, so a name like claude-sonnet-5-5 stays on one line
const MAX_AUTO = 24

const contentWidth = (table: Table, index: number) => Math.max(0, ...table.rows.map(cells => width(cells[index] ?? '')))

/** Hide lower-priority columns to fit the available width; flex columns take what is left */
export const fit = (table: Table, room: number, gap = GAP): Table => {
  let picked = table.columns.map((column, index) => ({
    column: !column.isFlex
      ? { ...column, width: Math.max(column.width, Math.min(MAX_AUTO, contentWidth(table, index))) }
      : column.isPath
        ? // A path column asks for room to stay readable, so lower-priority columns go first
          { ...column, width: Math.max(column.width, Math.min(PATH_MIN, contentWidth(table, index))) }
        : column,
    index,
  }))

  while (spanOf(picked.map(one => one.column), gap) > room) {
    const droppable = picked.filter(one => (one.column.keep ?? 0) > 0)

    if (droppable.length === 0) {
      break
    }

    const drop = droppable.reduce((low, one) => ((one.column.keep ?? 0) < (low.column.keep ?? 0) ? one : low))
    picked = picked.filter(one => one !== drop)
  }

  const spare = Math.max(0, room - spanOf(picked.map(one => one.column), gap))
  const flexCount = picked.filter(one => one.column.isFlex).length
  const columns = picked.map(({ column }) =>
    column.isFlex && flexCount > 0 ? { ...column, width: column.width + Math.floor(spare / flexCount) } : column,
  )

  return { ...table, columns, rows: table.rows.map(cells => picked.map(one => cells[one.index] ?? '')) }
}

export const skillTable = (rows: Rows, lang: Lang = 'zh'): Table => {
  const sum = total(rows)

  return {
    lang,
    columns: columnsOf(SKILL_COLUMNS, lang),
    rows: byCost(rows).map(([name, row]) => [
      label(name, lang),
      usd(row.usd),
      percent(row.usd, sum),
      String(row.steps),
      tokens(row.input),
      tokens(row.output),
      tokens(row.cacheRead),
      tokens(row.cacheWrite),
    ]),
  }
}

const skillsOf = (row: ModelRow, lang: Lang) =>
  Object.entries(row.skills)
    .sort(([, a], [, b]) => b - a)
    .map(([name, count]) => `${label(name, lang)}×${count}`)
    .join(', ')

export const modelTable = (models: ModelRows, lang: Lang = 'zh'): Table => {
  const sum = Object.values(models).reduce((acc, row) => acc + row.usd, 0)

  return {
    lang,
    columns: columnsOf(MODEL_COLUMNS, lang),
    rows: byCost(models).map(([name, row]) => [
      label(name, lang),
      usd(row.usd),
      percent(row.usd, sum),
      String(row.steps),
      tokens(row.output),
      tokens(row.cacheRead),
      skillsOf(row, lang),
    ]),
  }
}

const folderTable = (records: FolderRecord[], lang: Lang): Table => ({
  lang,
  columns: columnsOf(FOLDER_COLUMNS, lang),
  rows: records.map(one => [
    usd(total(one.rows)),
    String(skillCount(one.rows)),
    String(Object.keys(one.models ?? {}).length),
    String(one.sessions),
    one.folder,
  ]),
})

const SESSIONS = { zh: 'Session 數', en: 'Sessions' }

const INSTRUCTION_COLUMNS: LocalColumn[] = [
  { title: { zh: '檔案', en: 'File' }, width: 20, isFlex: true, keep: 0, isPath: true },
  { title: { zh: '類型', en: 'Kind' }, width: { zh: 8, en: 11 }, keep: 2 },
  { title: { zh: '載入次數', en: 'Loads' }, width: 5, isRight: true, keep: 0, isAccent: true },
  { title: SESSIONS, width: 5, isRight: true, keep: 1 },
]

const AGENT_COLUMNS: LocalColumn[] = [
  { title: { zh: 'Agent 類型', en: 'Agent type' }, width: 20, isFlex: true, keep: 0 },
  { title: CALLS, width: 5, isRight: true, keep: 0, isAccent: true },
  { title: SESSIONS, width: 5, isRight: true, keep: 1 },
]

/** Rules first, then by load count */
const RULE_FIRST = (a: InstructionStat, b: InstructionStat) => Number(b.kind === 'Rule') - Number(a.kind === 'Rule') || b.loads - a.loads

/** Instruction files with how often each was loaded; `sessions` is left out for one session */
export const instructionTable = (files: Record<string, Omit<InstructionStat, 'sessions'> & { sessions?: number }>, lang: Lang = 'zh'): Table => {
  const hasSessions = Object.values(files).some(one => one.sessions !== undefined)
  const columns = columnsOf(INSTRUCTION_COLUMNS, lang)

  return {
    lang,
    columns: hasSessions ? columns : columns.slice(0, 3),
    rows: Object.entries(files)
      .sort(([, a], [, b]) => RULE_FIRST({ sessions: 0, ...a }, { sessions: 0, ...b }))
      .map(([path, one]) => [path, label(one.kind, lang), String(one.loads), ...(hasSessions ? [String(one.sessions ?? 0)] : [])]),
  }
}

/** Subagent types with their call counts; a plain number is one session's count */
export const agentTable = (agents: Record<string, AgentStat | number>, lang: Lang = 'zh'): Table => {
  const entries = Object.entries(agents).map(([name, one]) => [name, typeof one === 'number' ? { calls: one } : one] as const)
  const hasSessions = entries.some(([, one]) => 'sessions' in one)
  const columns = columnsOf(AGENT_COLUMNS, lang)

  return {
    lang,
    columns: hasSessions ? columns : columns.slice(0, 2),
    rows: entries
      .sort(([, a], [, b]) => b.calls - a.calls)
      .map(([name, one]) => [name, String(one.calls), ...('sessions' in one ? [String(one.sessions)] : [])]),
  }
}

const agentCalls = (agents: Record<string, AgentStat | number> | undefined) =>
  Object.values(agents ?? {}).reduce<number>((sum, one) => sum + (typeof one === 'number' ? one : one.calls), 0)

/** The instruction-file and agent sections of a report */
const extrasBlocks = (
  files: Record<string, Omit<InstructionStat, 'sessions'> & { sessions?: number }> | undefined,
  agents: Record<string, AgentStat | number> | undefined,
  lang: Lang,
): Block[] => [
  { kind: 'text', text: '' },
  { kind: 'title', text: TEXT[lang].instructions },
  { kind: 'table', table: instructionTable(files ?? {}, lang) },
  { kind: 'text', text: '' },
  { kind: 'title', text: TEXT[lang].agents(agentCalls(agents)) },
  { kind: 'table', table: agentTable(agents ?? {}, lang) },
]

/** Split text into pieces by display width for wrapping columns; prefer breaking after ", " and "/" */
export const chunk = (text: string, size: number): string[] => {
  const parts: string[] = []
  let line = ''

  const push = (word: string) => {
    if (line && width(line + word) > size) {
      parts.push(line.trimEnd())
      line = ''
    }

    // A single piece wider than the column is split character by character
    for (const ch of word) {
      if (width(line + ch) > size) {
        parts.push(line)
        line = ''
      }

      line += ch
    }
  }

  text.split(/(?<=, |\/)/).forEach(push)

  return [...parts, line]
}

/** A prefix of `text` no wider than `size` cells */
const takeStart = (text: string, size: number) => {
  let out = ''

  for (const ch of text) {
    if (width(out + ch) > size) {
      break
    }

    out += ch
  }

  return out
}

/** A suffix of `text` no wider than `size` cells */
const takeEnd = (text: string, size: number) => {
  let out = ''

  for (const ch of [...text].reverse()) {
    if (width(ch + out) > size) {
      break
    }

    out = ch + out
  }

  return out
}

/**
 * Shorten a path to `size` cells by cutting out its middle: a short head ending at a slash,
 * then as much of the end as fits, so the file name and the part that tells paths apart stay
 *   ~/.claude/projects/-Users-me-tw-ticker/memory/MEMORY.md → ~/.claude/…-tw-ticker/memory/MEMORY.md
 */
export const ellipsize = (text: string, size: number): string => {
  if (width(text) <= size) {
    return text
  }

  if (size <= 1) {
    return '…'
  }

  const room = size - 1 // the ellipsis takes one cell
  // The head takes at most a third of the room and ends at a slash (`~/`, `~/.claude/`, `/Users/me/`)
  const heads = [...text.matchAll(/\//g)].map(one => text.slice(0, (one.index ?? 0) + 1)).filter(one => one.length > 1)
  const head = [...heads].reverse().find(one => width(one) <= Math.floor(room / 3)) ?? ''
  const cut = takeEnd(text.slice(head.length), room - width(head))
  // A fragment this short before the next slash says nothing (…3350/); start at that slash instead
  const slash = cut.indexOf('/')
  const tail = slash > 0 && slash <= SNAP ? cut.slice(slash) : cut

  return `${head}…${tail}`
}

// A cut-off fragment at most this long is dropped back to the next slash
const SNAP = 8

/** The narrowest a path column should get before lower-priority columns are hidden */
const PATH_MIN = 36

export type TableLine = { kind: 'head' | 'rule' | 'row' | 'empty'; text: string; row?: number }

/** Lay a table out as lines of text: pick columns by width first, then wrap long cells */
export const tableLines = (table: Table, room: number): TableLine[] => {
  const { columns, rows } = fit(table, room)

  if (rows.length === 0) {
    return [{ kind: 'empty', text: TEXT[table.lang ?? 'zh'].empty }]
  }

  const cell = (text: string, column: Column) => (column.isRight ? padStart(text, column.width) : padEnd(text, column.width))
  const join = (cells: string[]) => cells.map((text, i) => cell(text, columns[i] ?? { title: '', width: 0 })).join(' '.repeat(GAP)).trimEnd()

  const body = rows.flatMap((cells, row) => {
    const pieces = cells.map((text, i) => {
      const column = columns[i]

      if (column?.isPath) {
        return [ellipsize(text, column.width)]
      }

      return column && !column.isRight ? chunk(text, column.width) : [text]
    })
    const height = Math.max(...pieces.map(one => one.length))

    return Array.from({ length: height }, (_, n): TableLine => ({
      kind: 'row',
      row,
      text: join(pieces.map(one => one[n] ?? '')),
    }))
  })

  return [
    { kind: 'head', text: join(columns.map(column => column.title)) },
    { kind: 'rule', text: columns.map(column => '─'.repeat(column.width)).join('─'.repeat(GAP)) },
    ...body,
  ]
}

/** Plain-text table for command output */
export const tableText = (table: Table, room = 110) =>
  tableLines(table, room)
    .map(line => `  ${line.text}`)
    .join('\n')

/** One run of a bordered line: `border` grid, `head`/`headBorder` header row, `cell`/`accent` body */
export type Segment = { text: string; role: 'border' | 'headBorder' | 'head' | 'cell' | 'accent' }

const GRID_GAP = 3 // " │ " between cells

/** Lay a table out as bordered lines: ┌─┬─┐ │ head │ ├─┼─┤ │ cell │ └─┴─┘ */
export const gridLines = (table: Table, room: number): Segment[][] | null => {
  // The two outer edges with their padding take four cells
  const { columns, rows } = fit(table, room - 4, GRID_GAP)

  if (rows.length === 0) {
    return null
  }

  const rule = (left: string, mid: string, right: string): Segment[] => [
    { role: 'border', text: left + columns.map(column => '─'.repeat(column.width + 2)).join(mid) + right },
  ]
  const cell = (text: string, column: Column) => (column.isRight ? padStart(text, column.width) : padEnd(text, column.width))

  const line = (cells: string[], isHead: boolean): Segment[] => [
    { role: isHead ? 'headBorder' : 'border', text: '│' },
    ...columns.flatMap((column, i): Segment[] => [
      { role: isHead ? 'head' : column.isAccent ? 'accent' : 'cell', text: ` ${cell(cells[i] ?? '', column)} ` },
      { role: isHead ? 'headBorder' : 'border', text: '│' },
    ]),
  ]

  const body = rows.flatMap(cells => {
    const pieces = cells.map((text, i) => {
      const column = columns[i]

      if (column?.isPath) {
        return [ellipsize(text, column.width)]
      }

      return column && !column.isRight ? chunk(text, column.width) : [text]
    })
    const height = Math.max(...pieces.map(one => one.length))

    return Array.from({ length: height }, (_, n) => line(pieces.map(one => one[n] ?? ''), false))
  })

  return [
    rule('┌', '┬', '┐'),
    line(
      columns.map(column => column.title),
      true,
    ),
    rule('├', '┼', '┤'),
    ...body,
    rule('└', '┴', '┘'),
  ]
}

/** The text a report's blocks print: what the model reads and what the plain theme shows */
export const blocksText = (blocks: Block[]) =>
  blocks
    .map(block => {
      switch (block.kind) {
        case 'table':
          return tableText(block.table)
        case 'themes':
          return (['plain', ...Object.keys(THEMES)] as ThemeName[])
            .map(name => `  ${name === block.current ? '●' : '○'} ${themeName(name, block.lang)}`)
            .join('\n')
        default:
          return block.text
      }
    })
    .join('\n')

const summary = (rows: Rows, models: ModelRows, lang: Lang = 'zh') =>
  TEXT[lang].summary(usdLabel(total(rows)), skillCount(rows), Object.keys(models).length)

/** Describe how many sessions use actual cost and how many are estimated */
export const basis = (sessions: number, actual: number, lang: Lang = 'zh') =>
  actual >= sessions ? TEXT[lang].allActual(sessions) : actual > 0 ? TEXT[lang].mixed(sessions, actual) : TEXT[lang].estimated(sessions)

const historyNote = (data: History | null, lang: Lang) => {
  const t = TEXT[lang]

  if (!data) {
    return t.scanning
  }

  if (data.error) {
    return t.scanFailed(data.error)
  }

  const notes = [
    ...(data.unpriced.length ? [t.unpriced(data.unpriced.join(', '))] : []),
    ...(data.online?.error ? [t.onlineFailed] : []),
  ]

  return notes.length ? t.notes(notes) : ''
}

const GAP_BLOCK: Block = { kind: 'text', text: '' }

const tableBlock = (table: Table): Block => ({ kind: 'table', table })

export const reportBlocks = (session: Ledger, folder: string, data: History | null, lang: Lang = 'zh'): Block[] => {
  const t = TEXT[lang]
  const record = data?.folders.find(one => one.folder === folder)

  return [
    { kind: 'title', text: t.session(summary(session.rows, session.models ?? {}, lang)) },
    tableBlock(skillTable(session.rows, lang)),
    GAP_BLOCK,
    tableBlock(modelTable(session.models ?? {}, lang)),
    ...extrasBlocks(data?.current?.instructions, session.agents, lang),
    GAP_BLOCK,
    {
      kind: 'title',
      text: t.folder(
        basis(record?.sessions ?? 0, record?.actualSessions ?? 0, lang),
        folder,
        summary(record?.rows ?? {}, record?.models ?? {}, lang),
        historyNote(data, lang),
      ),
    },
    tableBlock(skillTable(record?.rows ?? {}, lang)),
    GAP_BLOCK,
    tableBlock(modelTable(record?.models ?? {}, lang)),
    ...extrasBlocks(record?.instructions, record?.agents, lang),
  ]
}

export const report = (session: Ledger, folder: string, data: History | null, lang: Lang = 'zh') => blocksText(reportBlocks(session, folder, data, lang))
/** Merge the skill and model usage of every folder into one */
export const mergeFolders = (folders: FolderRecord[]) => {
  const rows: Rows = {}
  const models: ModelRows = {}
  const instructions: Record<string, InstructionStat> = {}
  const agents: Record<string, AgentStat> = {}

  for (const one of folders) {
    for (const [path, file] of Object.entries(one.instructions ?? {})) {
      const kept = instructions[path]
      instructions[path] = { kind: file.kind, loads: (kept?.loads ?? 0) + file.loads, sessions: (kept?.sessions ?? 0) + file.sessions }
    }

    for (const [name, agent] of Object.entries(one.agents ?? {})) {
      const kept = agents[name]
      agents[name] = { calls: (kept?.calls ?? 0) + agent.calls, sessions: (kept?.sessions ?? 0) + agent.sessions }
    }

    for (const [name, row] of Object.entries(one.rows)) {
      rows[name] = addRow(rows[name], row)
    }

    for (const [name, row] of Object.entries(one.models ?? {})) {
      const merged = models[name]
      const skills = { ...merged?.skills }

      for (const [skill, count] of Object.entries(row.skills)) {
        skills[skill] = (skills[skill] ?? 0) + count
      }

      models[name] = { ...addRow(merged, row), skills }
    }
  }

  return {
    rows,
    models,
    instructions,
    agents,
    sessions: folders.reduce((sum, one) => sum + one.sessions, 0),
    actualSessions: folders.reduce((sum, one) => sum + (one.actualSessions ?? 0), 0),
  }
}

export const folderBlocks = (data: History | null, lang: Lang = 'zh'): Block[] => {
  const t = TEXT[lang]

  if (!data || data.folders.length === 0) {
    return [{ kind: 'text', text: t.noFolders(historyNote(data, lang)) }]
  }

  const all = mergeFolders(data.folders)

  return [
    {
      kind: 'title',
      text: t.all(data.folders.length, basis(all.sessions, all.actualSessions, lang), summary(all.rows, all.models, lang), historyNote(data, lang)),
    },
    tableBlock(skillTable(all.rows, lang)),
    GAP_BLOCK,
    tableBlock(modelTable(all.models, lang)),
    ...extrasBlocks(all.instructions, all.agents, lang),
    GAP_BLOCK,
    { kind: 'title', text: t.byFolder },
    tableBlock(folderTable(data.folders, lang)),
  ]
}

export const folderReport = (data: History | null, lang: Lang = 'zh') => blocksText(folderBlocks(data, lang))

// ── Prices ──────────────────────────────────────────────

const configDir = async ($: EngineInterface) => (await $.env.get('CLAUDE_CONFIG_DIR')) ?? `${await $.env.get('HOME')}/.claude`

export type PriceRow = {
  source: string
  input: number
  output: number
  cacheRead?: number
  cacheWrite5m?: number
  cacheWrite1h?: number
  fastInput?: number
  fastOutput?: number
}

const PRICE_COLUMNS: LocalColumn[] = [
  { title: MODEL, width: 18, isFlex: true, keep: 0 },
  { title: { zh: '來源', en: 'Source' }, width: { zh: 4, en: 8 }, keep: 5 },
  { title: INPUT, width: 6, isRight: true, keep: 0 },
  { title: OUTPUT, width: 6, isRight: true, keep: 0 },
  { title: CACHE_READ, width: 6, isRight: true, keep: 4 },
  { title: { zh: '寫 5m', en: 'Write 5m' }, width: 6, isRight: true, keep: 3 },
  { title: { zh: '寫 1h', en: 'Write 1h' }, width: 6, isRight: true, keep: 2 },
  { title: { zh: 'Fast 入/出', en: 'Fast in/out' }, width: 10, isRight: true, keep: 1 },
]

const rate = (n: number | undefined) => (n === undefined ? '—' : `${n}`)

export const priceBlocks = (models: Record<string, PriceRow>, online: OnlineStatus | undefined, now: number, lang: Lang = 'zh'): Block[] => {
  const t = TEXT[lang]
  const fetched = online?.fetchedAt ? t.fetched(Math.max(0, Math.round((now / 1000 - online.fetchedAt) / 3600))) : t.notFetched
  const failed = online?.error ? t.fetchFailed(online.error) : ''

  return [
    { kind: 'title', text: t.prices(`${fetched}${failed}`) },
    { kind: 'note', text: t.priority },
    tableBlock({
      lang,
      columns: columnsOf(PRICE_COLUMNS, lang),
      rows: Object.entries(models).map(([name, row]) => [
        name,
        label(row.source, lang),
        rate(row.input),
        rate(row.output),
        rate(row.cacheRead),
        rate(row.cacheWrite5m),
        rate(row.cacheWrite1h),
        row.fastInput === undefined ? '—' : `${row.fastInput}/${rate(row.fastOutput)}`,
      ]),
    }),
  ]
}

export const priceReport = (models: Record<string, PriceRow>, online: OnlineStatus | undefined, now: number, lang: Lang = 'zh') =>
  blocksText(priceBlocks(models, online, now, lang))

const listPrices = async ($: EngineInterface, lang: Lang): Promise<Block[]> => {
  const config = await configDir($)
  const { exitCode, stdout, stderr } = await $.process.run(
    ['python3', '-I', `${$.plugin.root}/scripts/scan.py`, '--prices', `${$.plugin.root}/scripts/prices.json`, `${config}/skill-cost`],
    { timeoutMs: 60_000 },
  )

  if (exitCode !== 0) {
    return [{ kind: 'text', text: TEXT[lang].pricesFailed(stderr.trim().split('\n').pop() ?? `exit ${exitCode}`) }]
  }

  const { models, online } = JSON.parse(stdout) as { models: Record<string, PriceRow>; online?: OnlineStatus }

  return priceBlocks(models, online, await $.clock.now(), lang)
}

/** Answer a command with blocks: print their text, and keep them so the output row can be drawn in colour */
const answer = async ($: EngineInterface, blocks: Block[]) => {
  const text = blocksText(blocks)

  await update($, views, all => {
    const kept = Object.entries(all).filter(([key]) => key !== text)

    return Object.fromEntries([...kept.slice(-(MAX_VIEWS - 1)), [text, blocks]])
  })

  return { text }
}

// ── Drawing ─────────────────────────────────────────────

const paint = (role: Segment['role'], p: Palette) => {
  switch (role) {
    case 'head':
      return { color: p.headFg, backgroundColor: p.headBg, bold: true }
    case 'headBorder':
      return { color: p.border, backgroundColor: p.headBg }
    case 'border':
      return { color: p.border }
    case 'accent':
      return { color: p.accent, bold: true }
    default:
      return {}
  }
}

/**
 * Break a title into lines no wider than `size` cells: between its parts (before "（", after "：",
 * after " · ", so a separator never starts a line), and inside a part too long for a line after
 * "，" or "、", or anywhere as a last resort
 */
export const wrapTitle = (text: string, size: number): string[] => {
  const room = Math.max(10, size)
  const pieces = text
    .trim()
    .split(/(?=（)|(?<=：)|(?<= · )/)
    .flatMap(part => (width(part) <= room ? [part] : part.split(/(?<=，|、|, )/).flatMap(one => (width(one) <= room ? [one] : chunk(one, room)))))
  const lines: string[] = []
  let line = ''

  for (const piece of pieces) {
    if (line && width(line + piece.trimEnd()) > room) {
      lines.push(line.trimEnd())
      line = ''
    }

    line += line ? piece : piece.trimStart()
  }

  return [...lines, line.trimEnd()].filter(Boolean)
}

/** Draw a report's blocks: titles in the accent colour, tables bordered with a coloured header */
const drawBlocks = (ui: ElementTable, blocks: Block[], p: Palette, room: number, lang: Lang) => {
  const { Box, Text } = ui

  const lines = blocks.flatMap((block, b) => {
    switch (block.kind) {
      case 'title':
        // Wrapped here, to the drawing's width, so a resize redraws whole lines
        return wrapTitle(block.text, room + 2).map((line, n) => (
          <Text key={`${b}-${n}`} color={p.accent} bold>
            {line}
          </Text>
        ))
      case 'note':
        return [
          <Text key={`${b}`} dimColor>
            {block.text}
          </Text>,
        ]
      case 'text':
        return [<Text key={`${b}`}>{block.text || ' '}</Text>]
      case 'themes':
        return (['plain', ...Object.keys(THEMES)] as ThemeName[]).map(name => {
          const one = name === 'plain' ? null : THEMES[name]

          return (
            <Text key={`${b}-${name}`}>
              <Text>{`  ${name === block.current ? '●' : '○'} `}</Text>
              {one ? (
                <Text color={one.headFg} backgroundColor={one.headBg} bold>
                  {` ${themeName(name, lang)} `}
                </Text>
              ) : (
                <Text>{themeName(name, lang)}</Text>
              )}
              {one ? <Text color={one.border}>{' ┌─┬─┐ '}</Text> : null}
              {one ? <Text color={one.accent} bold>{'$1.23'}</Text> : null}
            </Text>
          )
        })
      case 'table': {
        const grid = gridLines(block.table, room)

        if (!grid) {
          return [<Text key={`${b}`} dimColor>{`  ${TEXT[block.table.lang ?? lang].empty}`}</Text>]
        }

        return drawGrid(ui, grid, p, `${b}`, '  ')
      }
    }
  })

  return <Box flexDirection="column">{lines}</Box>
}

/** Draw bordered lines from gridLines, each run painted by its role */
const drawGrid = (ui: ElementTable, grid: Segment[][], p: Palette, key: string, indent = '') => {
  const { Text } = ui

  return grid.map((segments, n) => (
    <Text key={`${key}-${n}`}>
      {indent ? <Text>{indent}</Text> : null}
      {segments.map((one, s) => (
        <Text key={`${s}`} {...paint(one.role, p)}>
          {one.text}
        </Text>
      ))}
    </Text>
  ))
}

const sumRows = (rows: Rows) => Object.values(rows).reduce<CostRow>((sum, row) => addRow(sum, row), blankRow())

const BAND_COLUMNS: LocalColumn[] = [
  { title: { zh: '範圍', en: 'Scope' }, width: 6, keep: 0 },
  { title: COST, width: 10, isRight: true, keep: 0, isAccent: true },
  { title: { zh: 'Skill', en: 'Skills' }, width: 5, isRight: true, keep: 4 },
  { title: MODEL, width: 4, isRight: true, keep: 3 },
  { title: { zh: 'Agent', en: 'Agents' }, width: 5, isRight: true, keep: 6 },
  { title: CALLS, width: 4, isRight: true, keep: 5 },
  { title: OUTPUT, width: 6, isRight: true, keep: 2 },
  { title: CACHE_READ, width: 6, isRight: true, keep: 1 },
]

/** The summary above the prompt as a table: this session, and this folder all time */
export const bandTable = (session: Ledger, record: FolderRecord | undefined, lang: Lang): Table => {
  const L = BAND_LABELS[lang]
  const line = (scope: string, cost: string, rows: Rows, models: ModelRows, agents: Record<string, AgentStat | number> | undefined) => {
    const sum = sumRows(rows)

    return [
      scope,
      cost,
      String(skillCount(rows)),
      String(Object.keys(models).length),
      String(agentCalls(agents)),
      String(sum.steps),
      tokens(sum.output),
      tokens(sum.cacheRead),
    ]
  }

  return {
    lang,
    columns: columnsOf(BAND_COLUMNS, lang),
    rows: [
      line(L.session, usd(total(session.rows)), session.rows, session.models ?? {}, session.agents),
      line(L.folder, `≈${usd(total(record?.rows ?? {}))}`, record?.rows ?? {}, record?.models ?? {}, record?.agents),
    ],
  }
}

// ── Transcript scan ────────────────────────────────────────

type ScanOutput = {
  folders: Record<string, Omit<FolderRecord, 'folder'>>
  unpriced: string[]
  online?: OnlineStatus
  current?: CurrentExtras
}

export const toHistory = (output: ScanOutput, scannedAt: number): History => ({
  scannedAt,
  unpriced: output.unpriced,
  online: output.online,
  ...(output.current ? { current: output.current } : {}),
  folders: Object.entries(output.folders)
    .map(([folder, record]) => ({ ...record, folder }))
    .sort((a, b) => total(b.rows) - total(a.rows)),
})

// ── Actual cost per session ──────────────────────────────

const ACTUALS_KEY = 'actuals'

/** session id → actual cost (USD), kept across sessions */
const loadActuals = async ($: EngineInterface) => ((await $.store.get(ACTUALS_KEY)) ?? {}) as Record<string, number>

// Write one at a time so concurrent writes don't overwrite each other
let saving: Promise<void> = Promise.resolve()

const saveActual = ($: EngineInterface, session: string, usd: number) => {
  saving = saving
    .then(async () => {
      const actuals = await loadActuals($)

      if (actuals[session] !== usd) {
        await $.store.set(ACTUALS_KEY, { ...actuals, [session]: usd })
      }
    })
    .catch(() => undefined)

  return saving
}

/** Read ~/.claude/projects with the bundled scripts/scan.py and store the result in history */
const scan = async ($: EngineInterface, isRefresh = false) => {
  if (await read($, isScanning)) {
    return
  }

  await update($, isScanning, () => true)

  try {
    const config = await configDir($)
    // Fill in the current session's live cost in case turn.complete hasn't saved it yet
    const { cost } = await $.session.usage()
    const actuals = { ...(await loadActuals($)), ...(cost ? { [await $.session.id()]: cost.usd } : {}) }
    const { exitCode, stdout, stderr } = await $.process.run(
      [
        'python3',
        '-I',
        `${$.plugin.root}/scripts/scan.py`,
        `${config}/projects`,
        `${$.plugin.root}/scripts/prices.json`,
        `${config}/skill-cost`,
        // Report this session's own instruction files on their own
        `--session=${await $.session.id()}`,
        ...(isRefresh ? ['--refresh'] : []),
      ],
      { timeoutMs: 120_000, stdin: JSON.stringify(actuals) },
    )
    const now = await $.clock.now()

    if (exitCode !== 0) {
      await update($, history, () => ({ scannedAt: now, folders: [], unpriced: [], error: stderr.trim().split('\n').pop() ?? `exit ${exitCode}` }))

      return
    }

    await update($, history, () => toHistory(JSON.parse(stdout) as ScanOutput, now))
  } catch (error) {
    const now = await $.clock.now()
    await update($, history, () => ({ scannedAt: now, folders: [], unpriced: [], error: String(error) }))
  } finally {
    await update($, isScanning, () => false)
  }
}

const scanIfStale = async ($: EngineInterface) => {
  const data = await read($, history)

  if (!data || (await $.clock.now()) - data.scannedAt > RESCAN_MS) {
    await scan($)
  }
}

export const register: Register = on => {
  // The skill costs are attributed to: cleared when the user sends a message, switched when a skill loads
  let current = NO_SKILL

  on('session.start', async ($, e, next) => {
    const saved = await $.store.get(LANG_KEY)

    if (isLang(saved)) {
      await update($, lang, () => saved)
    }

    const savedTheme = await $.store.get(THEME_KEY)

    if (isTheme(savedTheme)) {
      await update($, theme, () => savedTheme)
    }

    await $.command.register({
      name: 'skill-cost',
      description: TEXT[await read($, lang)].description,
      argumentHint: '[all | scan | prices | reset | hide | show | lang [en|zh] | theme [name] | band [table|compact|line]]',
    })

    const savedBand = await $.store.get(BAND_KEY)

    if (isBandStyle(savedBand)) {
      await update($, bandStyle, () => savedBand)
    }

    // Scan once in the background at startup without blocking the session
    void scan($)

    const state = await read($, ledger)

    if (state.lastUsd === null) {
      const { cost } = await $.session.usage()
      await update($, ledger, s => ({ ...s, lastUsd: cost?.usd ?? 0 }))
    }

    return next(e)
  })

  on('prompt.submit', ($, e, next) => {
    current = NO_SKILL

    return next(e)
  })

  on('skill.prompt', ($, e, next) => {
    current = e.skill

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const { cost } = await $.session.usage()

    if (cost) {
      await saveActual($, await $.session.id(), cost.usd)
    }

    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    const skill = current
    const model = result.usage?.model ?? (e.model || UNKNOWN_MODEL)
    const { cost } = await $.session.usage()

    if (cost) {
      await update($, ledger, state => charge(state, skill, model, cost.usd, result.usage))
    }

    return result
  })

  // Count each subagent as it starts, by type, so this session's report needs no rescan
  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    const type = e.subagent_type || 'general-purpose'
    await update($, ledger, state => ({ ...state, agents: { ...state.agents, [type]: (state.agents?.[type] ?? 0) + 1 } }))

    return next(e)
  })

  // The description registered at startup is fixed; follow the current language instead
  on('command.describe', { command: 'skill-cost' }, async ($, e, next) =>
    next({ ...e, description: TEXT[await read($, lang)].description }),
  )

  on('command.run', { command: 'skill-cost' }, async ($, e) => {
    const arg = e.args.trim()
    const folder = await $.session.cwd()
    const language = await read($, lang)
    const t = TEXT[language]

    if (arg === 'lang' || arg.startsWith('lang ')) {
      // With no language given, toggle between Chinese and English
      const want = arg.slice('lang'.length).trim().toLowerCase() || (language === 'zh' ? 'en' : 'zh')

      if (!isLang(want)) {
        return { text: t.badLang(want) }
      }

      await update($, lang, () => want)
      await $.store.set(LANG_KEY, want)
      // The typeahead caches the description; ask it to describe the command again
      $.ui.invalidate('command.describe')

      return { text: TEXT[want].switched }
    }

    if (arg === 'theme' || arg.startsWith('theme ')) {
      const want = arg.slice('theme'.length).trim().toLowerCase()

      if (!want) {
        return answer($, [
          { kind: 'title', text: t.themes(themeName(await read($, theme), language), 'skill-cost') },
          { kind: 'themes', current: await read($, theme), lang: language },
        ])
      }

      if (!isTheme(want)) {
        return { text: `${t.badTheme(want)}\n${blocksText([{ kind: 'themes', current: await read($, theme), lang: language }])}` }
      }

      await update($, theme, () => want)
      await $.store.set(THEME_KEY, want)

      return { text: t.themeSet(themeName(want, language)) }
    }

    if (arg === 'band' || arg.startsWith('band ')) {
      const current = await read($, bandStyle)
      // With no layout given, go to the next one: table → compact → line → table
      const want = arg.slice('band'.length).trim().toLowerCase() || (BAND_STYLES[(BAND_STYLES.indexOf(current) + 1) % BAND_STYLES.length] ?? 'table')

      if (!isBandStyle(want)) {
        return { text: t.badBand(want) }
      }

      await update($, bandStyle, () => want)
      await $.store.set(BAND_KEY, want)

      return { text: t.bandSet(want) }
    }

    if (arg === 'reset') {
      const { cost } = await $.session.usage()
      await update($, ledger, () => ({ lastUsd: cost?.usd ?? 0, rows: {}, models: {} }))

      return { text: t.reset }
    }

    if (arg === 'prices') {
      return answer($, await listPrices($, language))
    }

    if (arg === 'scan') {
      // Also force a refresh of official prices
      await scan($, true)

      return answer($, folderBlocks(await read($, history), language))
    }

    if (arg === 'hide' || arg === 'show') {
      await update($, isHidden, () => arg === 'hide')

      return { text: arg === 'hide' ? t.hidden : t.shown }
    }

    if (arg === 'all') {
      await scanIfStale($)

      return answer($, folderBlocks(await read($, history), language))
    }

    await scanIfStale($)

    const { cost } = await $.session.usage()

    return answer($, [
      ...reportBlocks(withGap(await read($, ledger), cost?.usd ?? 0), folder, await read($, history), language),
      GAP_BLOCK,
      { kind: 'note', text: t.help },
    ])
  })

  // Draw this command's report rows as bordered tables in the chosen theme; other rows keep their text
  on('ui.render', { component: 'CommandOutput' }, async ($, e, next) => {
    if (e.props.command !== 'skill-cost' || e.props.isErrored) {
      return next(e)
    }

    const name = await read($, theme)
    const kept = await read($, views)
    // The row may carry the plugin's name in front of the text the command answered
    const blocks = kept[e.props.text] ?? Object.entries(kept).find(([text]) => text && e.props.text.endsWith(text))?.[1]

    if (name === 'plain' || !blocks) {
      return next(e)
    }

    const room = Math.max(40, (e.viewport?.columns ?? 110) - 4)
    return drawBlocks($.ui.resolve(e), blocks, THEMES[name], room, await read($, lang))
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, isHidden))) {
      return next(e)
    }

    const { cost } = await $.session.usage()
    const session = withGap(await read($, ledger), cost?.usd ?? 0)
    const folder = await $.session.cwd()
    const record = (await read($, history))?.folders.find(one => one.folder === folder)
    const language = await read($, lang)
    const name = await read($, theme)
    const { Box, Text } = $.ui.resolve(e)
    const line = TEXT[language].band(summary(session.rows, session.models ?? {}, language), usdLabel(total(record?.rows ?? {})))

    if (name === 'plain') {
      return (
        <Box>
          <Text dimColor>{line}</Text>
        </Box>
      )
    }

    const p = THEMES[name]

    const style = await read($, bandStyle)

    if (style === 'table') {
      // A grid like the reports: a coloured header row, then this session and this folder all time
      const room = Math.max(40, (e.viewport?.columns ?? 110) - 2)
      const grid = gridLines(bandTable(session, record, language), room)

      return (
        <Box flexDirection="column">
          {grid ? drawGrid($.ui.resolve(e), grid, p, 'band') : null}
          <Text dimColor>{` ${BAND_LABELS[language].hint('skill-cost')}`}</Text>
        </Box>
      )
    }

    if (style === 'compact') {
      // A bordered row of cells with padding: this session's cost as a coloured chip, then label/value pairs
      const L = BAND_LABELS[language]
      const cells: [string, string][] = [
        [L.skills, L.count(skillCount(session.rows))],
        [L.models, L.count(Object.keys(session.models ?? {}).length)],
        [L.folder, `≈${usdLabel(total(record?.rows ?? {}))}`],
      ]
      const bar = (key: string) => (
        <Text key={key} color={p.border}>
          │
        </Text>
      )

      return (
        <Box borderStyle="round" borderColor={p.border} paddingX={1} flexDirection="row" flexWrap="wrap" columnGap={1}>
          <Text color={p.headFg} backgroundColor={p.headBg} bold>
            {` ${L.session} ${usdLabel(total(session.rows))} `}
          </Text>
          {cells.flatMap(([title, value], i) => [
            bar(`bar-${i}`),
            <Text key={`cell-${i}`}>
              <Text dimColor>{`${title} `}</Text>
              <Text color={p.accent} bold>
                {value}
              </Text>
            </Text>,
          ])}
          {bar('bar-hint')}
          <Text dimColor>{L.hint('skill-cost')}</Text>
        </Box>
      )
    }

    // One line: this session's cost as a coloured chip, the rest dim
    const cut = line.indexOf(' · ')
    const chip = cut < 0 ? line : line.slice(0, cut)
    const rest = cut < 0 ? '' : line.slice(cut)

    return (
      <Box>
        <Text>
          <Text color={p.headFg} backgroundColor={p.headBg} bold>
            {` ${chip} `}
          </Text>
          <Text dimColor>{rest}</Text>
        </Text>
      </Box>
    )
  })
}
