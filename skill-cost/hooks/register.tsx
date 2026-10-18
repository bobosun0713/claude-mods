import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, TurnUsage } from 'claude-code'

import type { CostRow, FolderRecord, History, Ledger, ModelRow, ModelRows, OnlineStatus, Rows } from '../types'

const NO_SKILL = '（無 skill）'
const BEFORE = '（載入前）'
const UNKNOWN_MODEL = '（未知模型）'
const HELP = [
  '其他用法：',
  '  /skill-cost all     全部使用紀錄（所有資料夾合併，含各資料夾排行）',
  '  /skill-cost scan    更新官方價格並重新掃描，顯示全部使用紀錄',
  '  /skill-cost prices  目前採用的模型價格與來源',
  '  /skill-cost reset   本次 session 歸零',
  '  /skill-cost hide    隱藏提示列（show 顯示）',
].join('\n')

// 距上次掃描超過這麼久，開面板時重新掃描
const RESCAN_MS = 60_000
const EMPTY: Ledger = { lastUsd: null, rows: {}, models: {} }

const ledger = atom({ plugin: 'skill-cost', key: 'ledger' } as const, EMPTY)
const isHidden = atom({ plugin: 'skill-cost', key: 'isHidden' } as const, false)
const history = atom({ plugin: 'skill-cost', key: 'history' } as const, null as History | null)
const isScanning = atom({ plugin: 'skill-cost', key: 'isScanning' } as const, false)

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

/** 表格內的金額：表頭已標 USD */
const usd = (n: number) => `$${n.toFixed(n < 1 ? 3 : 2)}`

/** 表格外的金額：沒有表頭，註明美金 */
const usdLabel = (n: number) => `US${usd(n)}`

const tokens = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`)

const percent = (part: number, sum: number) => (sum > 0 ? `${Math.round((part / sum) * 100)}%` : '')

/** 終端機顯示寬度：中日韓與全形字元佔兩格 */
const width = (text: string) => [...text].reduce((sum, ch) => sum + ((ch.codePointAt(0) ?? 0) >= 0x2e80 ? 2 : 1), 0)

export const padEnd = (text: string, size: number) => text + ' '.repeat(Math.max(0, size - width(text)))

const padStart = (text: string, size: number) => ' '.repeat(Math.max(0, size - width(text))) + text

const byCost = <T extends CostRow>(rows: Record<string, T>) => Object.entries(rows).sort(([, a], [, b]) => b.usd - a.usd)

const skillCount = (rows: Rows) => Object.keys(rows).filter(name => name !== NO_SKILL && name !== BEFORE).length

const total = (rows: Rows) => Object.values(rows).reduce((sum, row) => sum + row.usd, 0)

/** 一次模型呼叫的用量；金額取 session 累計值的差額 */
export const stepRow = (state: Ledger, sessionUsd: number, usage: TurnUsage | null): CostRow => {
  const base = state.lastUsd ?? sessionUsd
  // 累計值變小代表 /clear 重新計算，從新的基準開始
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

/** 把一次模型呼叫的花費記到 skill 與模型名下 */
export const charge = (state: Ledger, skill: string, model: string, sessionUsd: number, usage: TurnUsage | null): Ledger => {
  const step = stepRow(state, sessionUsd, usage)

  return {
    lastUsd: sessionUsd,
    rows: { ...state.rows, [skill]: addRow(state.rows[skill], step) },
    models: addModel(state.models, model, skill, step),
  }
}

/** 把 session 總花費中沒被記到的部分（mod 載入前）補成一列 */
export const withGap = (state: Ledger, sessionUsd: number): Ledger => {
  const gap = sessionUsd - total(state.rows)

  if (gap < 0.0005) {
    return state
  }

  return { ...state, rows: { ...state.rows, [BEFORE]: addRow(state.rows[BEFORE], { ...blankRow(), usd: gap }) } }
}

// ── 表格 ────────────────────────────────────────────────

/**
 * `keep`：數字越小越先隱藏，0 永不隱藏；`isFlex`：分到剩下的寬度，太長換行
 */
type Column = { title: string; width: number; isRight?: boolean; keep?: number; isFlex?: boolean }

type Table = { columns: Column[]; rows: string[][] }

const GAP = 2

const SKILL_COLUMNS: Column[] = [
  { title: 'Skill', width: 14, isFlex: true, keep: 0 },
  { title: '金額(USD)', width: 10, isRight: true, keep: 0 },
  { title: '占比', width: 4, isRight: true, keep: 4 },
  { title: '次數', width: 4, isRight: true, keep: 5 },
  { title: '輸入', width: 6, isRight: true, keep: 1 },
  { title: '輸出', width: 6, isRight: true, keep: 6 },
  { title: '快取讀', width: 6, isRight: true, keep: 3 },
  { title: '快取寫', width: 6, isRight: true, keep: 2 },
]

const MODEL_COLUMNS: Column[] = [
  { title: '模型', width: 16, keep: 0 },
  { title: '金額(USD)', width: 10, isRight: true, keep: 0 },
  { title: '占比', width: 4, isRight: true, keep: 3 },
  { title: '次數', width: 4, isRight: true, keep: 4 },
  { title: '輸出', width: 6, isRight: true, keep: 2 },
  { title: '快取讀', width: 6, isRight: true, keep: 1 },
  { title: '在哪些 skill 下呼叫', width: 16, isFlex: true, keep: 0 },
]

const FOLDER_COLUMNS: Column[] = [
  { title: '金額(USD)', width: 10, isRight: true, keep: 0 },
  { title: 'Skill', width: 5, isRight: true, keep: 2 },
  { title: '模型', width: 4, isRight: true, keep: 1 },
  { title: 'Session', width: 7, isRight: true, keep: 3 },
  { title: '資料夾', width: 16, isFlex: true, keep: 0 },
]

const spanOf = (columns: Column[]) => columns.reduce((sum, column) => sum + column.width, 0) + GAP * Math.max(0, columns.length - 1)

/** 依可用寬度隱藏次要欄位，彈性欄位分到剩下的寬度 */
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

  return { columns, rows: table.rows.map(cells => picked.map(one => cells[one.index] ?? '')) }
}

export const skillTable = (rows: Rows): Table => {
  const sum = total(rows)

  return {
    columns: SKILL_COLUMNS,
    rows: byCost(rows).map(([name, row]) => [
      name,
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

const skillsOf = (row: ModelRow) =>
  Object.entries(row.skills)
    .sort(([, a], [, b]) => b - a)
    .map(([name, count]) => `${name}×${count}`)
    .join(', ')

export const modelTable = (models: ModelRows): Table => {
  const sum = Object.values(models).reduce((acc, row) => acc + row.usd, 0)

  return {
    columns: MODEL_COLUMNS,
    rows: byCost(models).map(([name, row]) => [
      name,
      usd(row.usd),
      percent(row.usd, sum),
      String(row.steps),
      tokens(row.output),
      tokens(row.cacheRead),
      skillsOf(row),
    ]),
  }
}

const folderTable = (records: FolderRecord[]): Table => ({
  columns: FOLDER_COLUMNS,
  rows: records.map(one => [
    usd(total(one.rows)),
    String(skillCount(one.rows)),
    String(Object.keys(one.models ?? {}).length),
    String(one.sessions),
    one.folder,
  ]),
})

/** 依顯示寬度切成多段，給換行的欄位用；優先在「, 」與「/」後斷行 */
export const chunk = (text: string, size: number): string[] => {
  const parts: string[] = []
  let line = ''

  const push = (word: string) => {
    if (line && width(line + word) > size) {
      parts.push(line.trimEnd())
      line = ''
    }

    // 單一段本身就超過寬度時，逐字切
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

/** 把表格排成一行一行的文字：先依寬度取捨欄位，太長的欄位換行 */
export const tableLines = (table: Table, room: number): TableLine[] => {
  const { columns, rows } = fit(table, room)

  if (rows.length === 0) {
    return [{ kind: 'empty', text: '（尚無紀錄）' }]
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

/** 純文字表格，給指令輸出用 */
export const tableText = (table: Table, room = 110) =>
  tableLines(table, room)
    .map(line => `  ${line.text}`)
    .join('\n')

const summary = (rows: Rows, models: ModelRows) =>
  `${usdLabel(total(rows))} · ${skillCount(rows)} 種 skill · ${Object.keys(models).length} 種模型`

/** 說明幾個 session 是實際費用、幾個是估算 */
export const basis = (sessions: number, actual: number) =>
  actual >= sessions ? `${sessions} 個 session，皆為實際費用` : actual > 0 ? `${sessions} 個 session，${actual} 個實際、${sessions - actual} 個估算` : `${sessions} 個 session，估算`

const historyNote = (data: History | null) => {
  if (!data) {
    return '（掃描對話紀錄中…）'
  }

  if (data.error) {
    return `（掃描失敗：${data.error}）`
  }

  const notes = [
    ...(data.unpriced.length ? [`${data.unpriced.join(', ')} 無牌價，金額未計`] : []),
    ...(data.online?.error ? ['官方價格更新失敗，沿用先前價格'] : []),
  ]

  return notes.length ? `（${notes.join('；')}）` : ''
}

export const report = (session: Ledger, folder: string, data: History | null) => {
  const record = data?.folders.find(one => one.folder === folder)

  return [
    `本次 session（實際金額）：${summary(session.rows, session.models ?? {})}`,
    tableText(skillTable(session.rows)),
    '',
    tableText(modelTable(session.models ?? {})),
    '',
    `此資料夾歷來（${basis(record?.sessions ?? 0, record?.actualSessions ?? 0)}）${folder}：${summary(record?.rows ?? {}, record?.models ?? {})} ${historyNote(data)}`,
    tableText(skillTable(record?.rows ?? {})),
    '',
    tableText(modelTable(record?.models ?? {})),
  ].join('\n')
}

/** 把所有資料夾的 skill 與模型用量合併成一份 */
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

export const folderReport = (data: History | null) => {
  if (!data || data.folders.length === 0) {
    return `還沒有任何資料夾的紀錄。${historyNote(data)}`
  }

  const all = mergeFolders(data.folders)

  return [
    `全部使用紀錄（${data.folders.length} 個資料夾，${basis(all.sessions, all.actualSessions)}）：${summary(all.rows, all.models)} ${historyNote(data)}`,
    tableText(skillTable(all.rows)),
    '',
    tableText(modelTable(all.models)),
    '',
    '各資料夾：',
    tableText(folderTable(data.folders)),
  ].join('\n')
}

// ── 價格 ────────────────────────────────────────────────

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

const PRICE_COLUMNS: Column[] = [
  { title: '模型', width: 18, isFlex: true, keep: 0 },
  { title: '來源', width: 4, keep: 5 },
  { title: '輸入', width: 6, isRight: true, keep: 0 },
  { title: '輸出', width: 6, isRight: true, keep: 0 },
  { title: '快取讀', width: 6, isRight: true, keep: 4 },
  { title: '寫 5m', width: 6, isRight: true, keep: 3 },
  { title: '寫 1h', width: 6, isRight: true, keep: 2 },
  { title: 'Fast 入/出', width: 10, isRight: true, keep: 1 },
]

const rate = (n: number | undefined) => (n === undefined ? '—' : `${n}`)

export const priceReport = (models: Record<string, PriceRow>, online: OnlineStatus | undefined, now: number) => {
  const fetched = online?.fetchedAt
    ? `官方價格更新於 ${Math.max(0, Math.round((now / 1000 - online.fetchedAt) / 3600))} 小時前`
    : '尚未取得官方價格'
  const failed = online?.error ? `；最近一次更新失敗：${online.error}` : ''

  return [
    `目前採用的價格（USD / 百萬 token）。${fetched}${failed}`,
    '優先順序：自訂 > 官方 > 內建；自訂檔位於 ~/.claude/skill-cost/prices.json',
    tableText({
      columns: PRICE_COLUMNS,
      rows: Object.entries(models).map(([name, row]) => [
        name,
        row.source,
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

const listPrices = async ($: EngineInterface) => {
  const config = await configDir($)
  const { exitCode, stdout, stderr } = await $.process.run(
    ['python3', '-I', `${$.plugin.root}/scripts/scan.py`, '--prices', `${$.plugin.root}/scripts/prices.json`, `${config}/skill-cost`],
    { timeoutMs: 60_000 },
  )

  if (exitCode !== 0) {
    return `無法讀取價格：${stderr.trim().split('\n').pop() ?? `exit ${exitCode}`}`
  }

  const { models, online } = JSON.parse(stdout) as { models: Record<string, PriceRow>; online?: OnlineStatus }

  return priceReport(models, online, await $.clock.now())
}

// ── 掃描對話紀錄 ────────────────────────────────────────

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

// ── 各 session 的實際費用 ──────────────────────────────

const ACTUALS_KEY = 'actuals'

/** session id → 實際費用（USD），跨 session 保存 */
const loadActuals = async ($: EngineInterface) => ((await $.store.get(ACTUALS_KEY)) ?? {}) as Record<string, number>

// 依序寫入，避免同時的寫入互相覆蓋
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

/** 用附帶的 scripts/scan.py 讀 ~/.claude/projects，結果存進 history */
const scan = async ($: EngineInterface, isRefresh = false) => {
  if (await read($, isScanning)) {
    return
  }

  await update($, isScanning, () => true)

  try {
    const config = await configDir($)
    // 目前 session 的費用尚未在 turn.complete 存下時，以即時值補上
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
  // 目前歸屬的 skill：使用者送出新訊息時清空，skill 被載入時切換
  let current = NO_SKILL

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'skill-cost',
      description: '依 skill 與模型列出花費（all 全部紀錄、scan 重新掃描、prices 價格表、reset 歸零本次、hide/show 提示列）',
      argumentHint: '[all | scan | prices | reset | hide | show]',
    })

    // 啟動時在背景掃描一次，不擋住 session
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

    if (arg === 'reset') {
      const { cost } = await $.session.usage()
      await update($, ledger, () => ({ lastUsd: cost?.usd ?? 0, rows: {}, models: {} }))

      return { text: '本次 session 已歸零。' }
    }

    if (arg === 'prices') {
      return { text: await listPrices($) }
    }

    if (arg === 'scan') {
      // 一併強制更新官方價格
      await scan($, true)

      return { text: folderReport(await read($, history)) }
    }

    if (arg === 'hide' || arg === 'show') {
      await update($, isHidden, () => arg === 'hide')

      return { text: arg === 'hide' ? '已隱藏提示列。' : '已顯示提示列。' }
    }

    if (arg === 'all') {
      await scanIfStale($)

      return { text: folderReport(await read($, history)) }
    }

    await scanIfStale($)

    const { cost } = await $.session.usage()

    return { text: `${report(withGap(await read($, ledger), cost?.usd ?? 0), folder, await read($, history))}\n\n${HELP}` }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, isHidden))) {
      return next(e)
    }

    const { cost } = await $.session.usage()
    const session = withGap(await read($, ledger), cost?.usd ?? 0)
    const folder = await $.session.cwd()
    const record = (await read($, history))?.folders.find(one => one.folder === folder)
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box>
        <Text dimColor>
          本次 {summary(session.rows, session.models ?? {})} · 此資料夾歷來 ≈{usdLabel(total(record?.rows ?? {}))} · /skill-cost 看明細
        </Text>
      </Box>
    )
  })
}
