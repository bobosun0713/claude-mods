import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, TurnUsage } from 'claude-code'

import type { CostRow, FolderRecord, History, Lang, Ledger, ModelRow, ModelRows, OnlineStatus, Rows } from '../types'

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
    ].join('\n'),
    description: '依 skill 與模型列出花費（all 全部紀錄、scan 重新掃描、prices 價格表、reset 歸零本次、hide/show 提示列、lang 切換語言）',
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
    ].join('\n'),
    description: 'Cost by skill and model (all: entire history, scan: rescan, prices: price list, reset: reset session, hide/show: summary line, lang: switch language)',
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

// The language setting is kept across sessions
const LANG_KEY = 'lang'

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

/**
 * `keep`: lower numbers are hidden first, 0 is never hidden; `isFlex`: takes the remaining width and wraps long text
 */
type Column = { title: string; width: number; isRight?: boolean; keep?: number; isFlex?: boolean }

type Table = { columns: Column[]; rows: string[][]; lang?: Lang }

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
  { title: COST, width: 10, isRight: true, keep: 0 },
  { title: SHARE, width: 4, isRight: true, keep: 4 },
  { title: CALLS, width: 4, isRight: true, keep: 5 },
  { title: INPUT, width: 6, isRight: true, keep: 1 },
  { title: OUTPUT, width: 6, isRight: true, keep: 6 },
  { title: CACHE_READ, width: 6, isRight: true, keep: 3 },
  { title: { zh: '快取寫', en: 'Cache W' }, width: 6, isRight: true, keep: 2 },
]

const MODEL_COLUMNS: LocalColumn[] = [
  { title: MODEL, width: 16, keep: 0 },
  { title: COST, width: 10, isRight: true, keep: 0 },
  { title: SHARE, width: 4, isRight: true, keep: 3 },
  { title: CALLS, width: 4, isRight: true, keep: 4 },
  { title: OUTPUT, width: 6, isRight: true, keep: 2 },
  { title: CACHE_READ, width: 6, isRight: true, keep: 1 },
  { title: { zh: '在哪些 skill 下呼叫', en: 'Called under skills' }, width: 16, isFlex: true, keep: 0 },
]

const FOLDER_COLUMNS: LocalColumn[] = [
  { title: COST, width: 10, isRight: true, keep: 0 },
  { title: { zh: 'Skill', en: 'Skills' }, width: 5, isRight: true, keep: 2 },
  { title: { zh: '模型', en: 'Models' }, width: 4, isRight: true, keep: 1 },
  { title: { zh: 'Session', en: 'Sessions' }, width: 7, isRight: true, keep: 3 },
  { title: { zh: '資料夾', en: 'Folder' }, width: 16, isFlex: true, keep: 0 },
]

const spanOf = (columns: Column[]) => columns.reduce((sum, column) => sum + column.width, 0) + GAP * Math.max(0, columns.length - 1)

/** Hide lower-priority columns to fit the available width; flex columns take what is left */
export const fit = (table: Table, room: number): Table => {
  let picked = table.columns.map((column, index) => ({ column, index }))

  while (spanOf(picked.map(one => one.column)) > room) {
    const droppable = picked.filter(one => (one.column.keep ?? 0) > 0)

    if (droppable.length === 0) {
      break
    }

    const drop = droppable.reduce((low, one) => ((one.column.keep ?? 0) < (low.column.keep ?? 0) ? one : low))
    picked = picked.filter(one => one !== drop)
  }

  const spare = Math.max(0, room - spanOf(picked.map(one => one.column)))
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

export const report = (session: Ledger, folder: string, data: History | null, lang: Lang = 'zh') => {
  const t = TEXT[lang]
  const record = data?.folders.find(one => one.folder === folder)

  return [
    t.session(summary(session.rows, session.models ?? {}, lang)),
    tableText(skillTable(session.rows, lang)),
    '',
    tableText(modelTable(session.models ?? {}, lang)),
    '',
    t.folder(
      basis(record?.sessions ?? 0, record?.actualSessions ?? 0, lang),
      folder,
      summary(record?.rows ?? {}, record?.models ?? {}, lang),
      historyNote(data, lang),
    ),
    tableText(skillTable(record?.rows ?? {}, lang)),
    '',
    tableText(modelTable(record?.models ?? {}, lang)),
  ].join('\n')
}
/** Merge the skill and model usage of every folder into one */
export const mergeFolders = (folders: FolderRecord[]) => {
  const rows: Rows = {}
  const models: ModelRows = {}

  for (const one of folders) {
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
    sessions: folders.reduce((sum, one) => sum + one.sessions, 0),
    actualSessions: folders.reduce((sum, one) => sum + (one.actualSessions ?? 0), 0),
  }
}

export const folderReport = (data: History | null, lang: Lang = 'zh') => {
  const t = TEXT[lang]

  if (!data || data.folders.length === 0) {
    return t.noFolders(historyNote(data, lang))
  }

  const all = mergeFolders(data.folders)

  return [
    t.all(data.folders.length, basis(all.sessions, all.actualSessions, lang), summary(all.rows, all.models, lang), historyNote(data, lang)),
    tableText(skillTable(all.rows, lang)),
    '',
    tableText(modelTable(all.models, lang)),
    '',
    t.byFolder,
    tableText(folderTable(data.folders, lang)),
  ].join('\n')
}

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

export const priceReport = (models: Record<string, PriceRow>, online: OnlineStatus | undefined, now: number, lang: Lang = 'zh') => {
  const t = TEXT[lang]
  const fetched = online?.fetchedAt ? t.fetched(Math.max(0, Math.round((now / 1000 - online.fetchedAt) / 3600))) : t.notFetched
  const failed = online?.error ? t.fetchFailed(online.error) : ''

  return [
    t.prices(`${fetched}${failed}`),
    t.priority,
    tableText({
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
  ].join('\n')
}

const listPrices = async ($: EngineInterface, lang: Lang) => {
  const config = await configDir($)
  const { exitCode, stdout, stderr } = await $.process.run(
    ['python3', '-I', `${$.plugin.root}/scripts/scan.py`, '--prices', `${$.plugin.root}/scripts/prices.json`, `${config}/skill-cost`],
    { timeoutMs: 60_000 },
  )

  if (exitCode !== 0) {
    return TEXT[lang].pricesFailed(stderr.trim().split('\n').pop() ?? `exit ${exitCode}`)
  }

  const { models, online } = JSON.parse(stdout) as { models: Record<string, PriceRow>; online?: OnlineStatus }

  return priceReport(models, online, await $.clock.now(), lang)
}

// ── Transcript scan ────────────────────────────────────────

type ScanOutput = {
  folders: Record<string, Omit<FolderRecord, 'folder'>>
  unpriced: string[]
  online?: OnlineStatus
}

export const toHistory = (output: ScanOutput, scannedAt: number): History => ({
  scannedAt,
  unpriced: output.unpriced,
  online: output.online,
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

    await $.command.register({
      name: 'skill-cost',
      description: TEXT[await read($, lang)].description,
      argumentHint: '[all | scan | prices | reset | hide | show | lang [en|zh]]',
    })

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

      return { text: TEXT[want].switched }
    }

    if (arg === 'reset') {
      const { cost } = await $.session.usage()
      await update($, ledger, () => ({ lastUsd: cost?.usd ?? 0, rows: {}, models: {} }))

      return { text: t.reset }
    }

    if (arg === 'prices') {
      return { text: await listPrices($, language) }
    }

    if (arg === 'scan') {
      // Also force a refresh of official prices
      await scan($, true)

      return { text: folderReport(await read($, history), language) }
    }

    if (arg === 'hide' || arg === 'show') {
      await update($, isHidden, () => arg === 'hide')

      return { text: arg === 'hide' ? t.hidden : t.shown }
    }

    if (arg === 'all') {
      await scanIfStale($)

      return { text: folderReport(await read($, history), language) }
    }

    await scanIfStale($)

    const { cost } = await $.session.usage()

    return { text: `${report(withGap(await read($, ledger), cost?.usd ?? 0), folder, await read($, history), language)}\n\n${t.help}` }
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
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box>
        <Text dimColor>
          {TEXT[language].band(summary(session.rows, session.models ?? {}, language), usdLabel(total(record?.rows ?? {})))}
        </Text>
      </Box>
    )
  })
}
