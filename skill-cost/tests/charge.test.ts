import { describe, expect, test } from 'claude-code/testing'

import { basis, charge, priceReport, chunk, fit, folderReport, mergeFolders, toHistory, modelTable, padEnd, report, skillTable, tableText, withGap } from '../hooks/register'
import type { Ledger } from '../types'

const usage = { model: 'opus', input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 1000, cache_creation_input_tokens: 10 }

describe('charge', () => {
  test('依 session 累計金額的差額記到 skill 名下', async () => {
    let s: Ledger = { lastUsd: 1, rows: {} }
    s = charge(s, 'git-commit', 'opus', 1.5, usage)
    s = charge(s, 'git-commit', 'opus', 2, usage)
    s = charge(s, '（無 skill）', 'haiku', 2.25, null)

    expect(s.lastUsd).toBe(2.25)
    expect(s.rows['git-commit']?.usd).toBe(1)
    expect(s.rows['git-commit']?.steps).toBe(2)
    expect(s.rows['git-commit']?.output).toBe(100)
    expect(s.rows['（無 skill）']?.usd).toBe(0.25)
  })

  test('依模型記錄，並記下在哪些 skill 下呼叫', async () => {
    let s: Ledger = { lastUsd: 0, rows: {} }
    s = charge(s, 'git-commit', 'opus', 1, usage)
    s = charge(s, 'vue-best-practices', 'opus', 1.5, usage)
    s = charge(s, 'git-commit', 'opus', 2, usage)
    s = charge(s, 'git-commit', 'haiku', 2.1, usage)

    expect(Object.keys(s.models ?? {})).toEqual(['opus', 'haiku'])
    expect(s.models?.['opus']?.steps).toBe(3)
    expect(s.models?.['opus']?.skills).toEqual({ 'git-commit': 2, 'vue-best-practices': 1 })
    expect(modelTable(s.models ?? {}).rows[0]?.[6]).toBe('git-commit×2, vue-best-practices×1')
  })

  test('累計值變小（/clear）時以新值重算', async () => {
    const s = charge({ lastUsd: 5, rows: {} }, 'a', 'opus', 0.2, null)

    expect(s.rows['a']?.usd).toBe(0.2)
  })

  test('報表列出 skill 數、模型數與合計', async () => {
    const s = charge(charge({ lastUsd: 0, rows: {} }, 'a', 'opus', 0.5, usage), '（無 skill）', 'haiku', 0.75, usage)
    const text = report(s, '/p', {
      scannedAt: 0,
      unpriced: [],
      folders: [{ folder: '/p', rows: s.rows, models: s.models, sessions: 3, actualSessions: 1, lastAt: '' }],
    })

    expect(text).toContain('本次 session（實際金額）：US$0.750 · 1 種 skill · 2 種模型')
    expect(text).toContain('此資料夾歷來（3 個 session，1 個實際、2 個估算）/p：US$0.750 · 1 種 skill · 2 種模型')
  })
})

describe('withGap', () => {
  test('session 總額多出的部分記成（載入前）', async () => {
    const s = withGap(charge({ lastUsd: 2, rows: {} }, 'a', 'opus', 2.5, null), 3)

    expect(Math.round((s.rows['（載入前）']?.usd ?? 0) * 1000)).toBe(2500)
    expect(s.rows['a']?.usd).toBe(0.5)
  })
})

describe('顯示', () => {
  test('中文字以兩格寬補齊', async () => {
    expect(padEnd('（無 skill）', 14)).toBe('（無 skill）  ')
    expect(padEnd('abc', 5)).toBe('abc  ')
  })

  test('表格欄位對齊', async () => {
    const lines = tableText({
      columns: [{ title: '名稱', width: 6 }, { title: '金額', width: 6, isRight: true }],
      rows: [['中文', '$1.00']],
    }).split('\n')

    expect(lines).toEqual(['  名稱      金額', '  ──────────────', '  中文     $1.00'])
  })

  test('所有資料夾依金額列出', async () => {
    const row = { usd: 1.5, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, steps: 1 }
    const text = folderReport({
      scannedAt: 0,
      unpriced: ['opus'],
      folders: [
        { folder: '/a', rows: { 'git-commit': row }, models: { opus: { ...row, skills: {} } }, sessions: 2, actualSessions: 2, lastAt: '' },
        { folder: '/b', rows: { '（無 skill）': { ...row, usd: 0.5 } }, sessions: 1, actualSessions: 0, lastAt: '' },
      ],
    })

    expect(text).toContain('全部使用紀錄（2 個資料夾，3 個 session，2 個實際、1 個估算）：US$2.00 · 1 種 skill · 1 種模型')
    expect(text).toContain('各資料夾：')
    expect(text).toContain('opus 無牌價')
    expect(text).toContain('/a')
  })
})

describe('fit', () => {
  const s = charge({ lastUsd: 0, rows: {} }, 'git-commit', 'opus', 1, usage)

  test('寬度足夠時保留所有欄位，彈性欄位分到剩下的寬度', async () => {
    const table = fit(skillTable(s.rows), 200)

    expect(table.columns.length).toBe(8)
    expect(table.columns.reduce((sum, c) => sum + c.width, 0) + 2 * 7).toBe(200)
  })

  test('寬度不夠時先隱藏次要欄位，名稱與金額永遠保留', async () => {
    const table = fit(skillTable(s.rows), 40)

    expect(table.columns.map(c => c.title)).toEqual(['Skill', '金額(USD)', '次數', '輸出'])
    expect(table.rows[0]).toEqual(['git-commit', '$1.00', '1', '50'])
  })

  test('模型表窄時保留「在哪些 skill 下呼叫」', async () => {
    const table = fit(modelTable(s.models ?? {}), 50)

    expect(table.columns.map(c => c.title)).toContain('在哪些 skill 下呼叫')
    expect(table.columns.map(c => c.title)).not.toContain('快取讀')
  })
})

describe('chunk', () => {
  test('在逗號後換行，不切斷 skill 名稱', async () => {
    expect(chunk('（無 skill）×1, vue-best-practices×1', 20)).toEqual(['（無 skill）×1,', 'vue-best-practices×1'])
  })

  test('路徑在斜線後換行', async () => {
    expect(chunk('/Users/me/Documents/practice', 12)).toEqual(['/Users/me/', 'Documents/', 'practice'])
  })
})

describe('toHistory', () => {
  test('依金額排序並帶上資料夾路徑', async () => {
    const row = { usd: 1, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, steps: 1 }
    const h = toHistory(
      {
        unpriced: [],
        folders: {
          '/small': { rows: { a: row }, models: {}, sessions: 1, actualSessions: 0, lastAt: '' },
          '/big': { rows: { a: { ...row, usd: 9 } }, models: {}, sessions: 4, actualSessions: 4, lastAt: '' },
        },
      },
      5,
    )

    expect(h.folders.map(one => one.folder)).toEqual(['/big', '/small'])
    expect(h.scannedAt).toBe(5)
  })
})

describe('mergeFolders', () => {
  test('合併各資料夾的 skill 與模型', async () => {
    const row = { usd: 1, input: 1, output: 2, cacheRead: 3, cacheWrite: 4, steps: 1 }
    const all = mergeFolders([
      { folder: '/a', rows: { x: row }, models: { opus: { ...row, skills: { x: 1 } } }, sessions: 2, actualSessions: 0, lastAt: '' },
      { folder: '/b', rows: { x: row, y: row }, models: { opus: { ...row, skills: { x: 1, y: 1 } }, haiku: { ...row, skills: { y: 1 } } }, sessions: 1, actualSessions: 0, lastAt: '' },
    ])

    expect(all.sessions).toBe(3)
    expect(all.rows['x']?.usd).toBe(2)
    expect(all.rows['x']?.output).toBe(4)
    expect(all.models['opus']?.skills).toEqual({ x: 2, y: 1 })
    expect(Object.keys(all.models)).toEqual(['opus', 'haiku'])
  })
})

describe('basis', () => {
  test('標示實際與估算的 session 數', async () => {
    expect(basis(3, 3)).toBe('3 個 session，皆為實際費用')
    expect(basis(3, 1)).toBe('3 個 session，1 個實際、2 個估算')
    expect(basis(3, 0)).toBe('3 個 session，估算')
  })
})

describe('priceReport', () => {
  test('列出價格、來源與官方價格更新時間', async () => {
    const text = priceReport(
      {
        'claude-opus-5-5': { source: '官方', input: 4, output: 20, cacheRead: 0.2, cacheWrite5m: 5, cacheWrite1h: 8, fastInput: 8, fastOutput: 40 },
        'claude-sonnet-5-5': { source: '自訂', input: 2, output: 10, cacheRead: 0.2 },
      },
      { fetchedAt: 3600, error: 'URLError: offline' },
      3 * 3600 * 1000,
    )

    expect(text).toContain('官方價格更新於 2 小時前；最近一次更新失敗：URLError: offline')
    expect(text).toMatch(/claude-opus-5-5\s+官方\s+4\s+20\s+0\.2\s+5\s+8\s+8\/40/)
    expect(text).toMatch(/claude-sonnet-5-5\s+自訂\s+2\s+10\s+0\.2\s+—\s+—\s+—/)
  })
})
