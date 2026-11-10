import { expect, mock, test } from 'claude-code/testing'

const row = { usd: 0.4, input: 10, output: 200, cacheRead: 5000, cacheWrite: 30, steps: 2 }

test("summary line shows this session's cost and this folder's all-time cost", async ($, on) => {
  // Make the background scan return one folder, and record the actual costs passed in
  let stdin = ''
  on('process.run', (_, e) => {
    stdin = e.init?.stdin ?? ''

    return {
    value: {
      exitCode: 0,
      stderr: '',
      isStdoutTruncated: false,
      isStderrTruncated: false,
      stdout: JSON.stringify({
        unpriced: [],
        folders: { '/p': { rows: { 'git-commit': row }, models: { 'claude-opus-5-5': { ...row, skills: { 'git-commit': 2 } } }, sessions: 3, actualSessions: 2, lastAt: '' } },
      }),
    },
  }
  })
  on('env.get', () => ({ value: '/home/me' }))
  on('session.id', () => ({ value: 'current' }))
  mock.store(on, { actuals: { old: 1.5 } })
  mock.clock(on)
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [], cost: { usd: 0.4 } } }))
  on('session.cwd', () => ({ value: '/p' }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)

    return <Box />
  })

  const scanned = await $.command.run({ command: 'skill-cost', args: 'scan' } as never)
  expect(scanned.text).toContain('3 個 session，2 個實際、1 個估算')
  // Both saved actual costs and the current session's are passed to the scan script
  expect(JSON.parse(stdin)).toEqual({ old: 1.5, current: 0.4 })

  const band = await $.ui.mount({ plugin: 'skill-cost', surface: 'terminal', component: 'AbovePrompt', props: {} as never })
  // The summary table like the reports: a grid with a coloured header, this session and this folder as rows
  expect(await band.find({ type: 'Text', text: /^┌─+┬/ })).toBeDefined()
  expect((await band.findAll({ type: 'Text', text: /金額\(USD\)/ })).map(one => one.props.backgroundColor)).toContain('#1d4ed8')
  expect(await band.find({ type: 'Text', text: /^ 此資料夾歷來\s/ })).toBeDefined()
  expect(await band.find({ type: 'Text', text: /≈\$0\.400 $/ })).toBeDefined()
  expect(await band.find({ type: 'Text', text: /^ \/skill-cost 看明細$/ })).toBeDefined()
  await band.unmount()
})

test('lang command switches the language and saves it', async ($, on) => {
  on('process.run', () => ({ value: { exitCode: 0, stderr: '', stdout: JSON.stringify({ unpriced: [], folders: {} }), isStdoutTruncated: false, isStderrTruncated: false } }))
  on('env.get', () => ({ value: '/home/me' }))
  on('session.id', () => ({ value: 'current' }))
  // Record the language setting written, which the next session reads back
  const saved: Record<string, unknown> = {}
  on('store.set', (_, e) => {
    saved[e.key] = e.value

    return { value: undefined }
  })
  on('store.get', (_, e) => ({ value: saved[e.key] }))
  mock.clock(on)
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [], cost: { usd: 0.4 } } }))
  on('session.cwd', () => ({ value: '/p' }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)

    return <Box />
  })

  expect((await $.command.run({ command: 'skill-cost', args: 'lang' } as never)).text).toBe('Switched to English.')
  expect(saved['lang']).toBe('en')
  expect((await $.command.run({ command: 'skill-cost', args: 'reset' } as never)).text).toBe('This session has been reset.')
  expect((await $.command.run({ command: 'skill-cost', args: 'lang fr' } as never)).text).toContain('Unsupported language: fr')

  // The default theme draws this session's cost as a coloured chip and the rest dim
  const band = await $.ui.mount({ plugin: 'skill-cost', surface: 'terminal', component: 'AbovePrompt', props: {} as never })
  const heads = await band.findAll({ type: 'Text', text: /Cost\(USD\)/ })
  expect(heads.some(one => one.props.backgroundColor)).toBe(true)
  expect(await band.find({ type: 'Text', text: /^ This session\s/ })).toBeDefined()
  expect(await band.find({ type: 'Text', text: /\/skill-cost for details$/ })).toBeDefined()
  await band.unmount()

  expect((await $.command.run({ command: 'skill-cost', args: 'lang zh' } as never)).text).toBe('已切換為中文。')
})

const scanOf = (folders: Record<string, unknown>) => ({
  value: { exitCode: 0, stderr: '', stdout: JSON.stringify({ unpriced: [], folders }), isStdoutTruncated: false, isStderrTruncated: false },
})

test('theme command lists, switches and saves the colour theme', async ($, on) => {
  on('process.run', () => scanOf({}))
  on('env.get', () => ({ value: '/home/me' }))
  on('session.id', () => ({ value: 'current' }))
  const saved: Record<string, unknown> = {}
  on('store.set', (_, e) => {
    saved[e.key] = e.value

    return { value: undefined }
  })
  on('store.get', (_, e) => ({ value: saved[e.key] }))
  mock.clock(on)
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [], cost: { usd: 0.4 } } }))
  on('session.cwd', () => ({ value: '/p' }))

  const list = (await $.command.run({ command: 'skill-cost', args: 'theme' } as never)).text ?? ''
  expect(list).toContain('● blue（藍）')
  expect(list).toContain('○ green（綠）')
  expect(list).toContain('○ 純文字（原樣式）')

  expect((await $.command.run({ command: 'skill-cost', args: 'theme green' } as never)).text).toBe('已切換為「green（綠）」配色。')
  expect(saved['theme']).toBe('green')
  expect((await $.command.run({ command: 'skill-cost', args: 'theme rainbow' } as never)).text).toContain('沒有這個配色：rainbow')

  // The summary above the prompt is a grid by default; band moves on to one bordered row, then one line
  const table = await $.ui.mount({ plugin: 'skill-cost', surface: 'terminal', component: 'AbovePrompt', props: {} as never })
  expect(await table.find({ type: 'Text', text: /^├─+┼/ })).toBeDefined()
  await table.unmount()

  expect((await $.command.run({ command: 'skill-cost', args: 'band' } as never)).text).toBe('提示列改為單列框線。')
  expect(saved['band']).toBe('compact')
  const compact = await $.ui.mount({ plugin: 'skill-cost', surface: 'terminal', component: 'AbovePrompt', props: {} as never })
  expect((await compact.find({ type: 'Box' }))?.props.borderStyle).toBe('round')
  expect(await compact.find({ type: 'Text', text: '此資料夾歷來 ' })).toBeDefined()
  expect(await compact.find({ type: 'Text', text: /^\/skill-cost 看明細$/ })).toBeDefined()
  await compact.unmount()

  expect((await $.command.run({ command: 'skill-cost', args: 'band' } as never)).text).toBe('提示列改為單行。')
  expect(saved['band']).toBe('line')
  expect((await $.command.run({ command: 'skill-cost', args: 'band grid' } as never)).text).toContain('不支援的提示列樣式：grid')
  const single = await $.ui.mount({ plugin: 'skill-cost', surface: 'terminal', component: 'AbovePrompt', props: {} as never })
  expect((await single.find({ type: 'Box' }))?.props.borderStyle).toBeUndefined()
  expect(await single.find({ type: 'Text', text: /· \/skill-cost 看明細$/ })).toBeDefined()
  await single.unmount()

  // Plain keeps the original single dim line
  await $.command.run({ command: 'skill-cost', args: 'theme plain' } as never)
  const band = await $.ui.mount({ plugin: 'skill-cost', surface: 'terminal', component: 'AbovePrompt', props: {} as never })
  expect((await band.find({ type: 'Text', text: /^本次 .*\/skill-cost 看明細$/ }))?.props.dimColor).toBe(true)
  await band.unmount()
})

test('report rows draw as bordered tables with a coloured header', async ($, on) => {
  const row = { usd: 0.4, input: 10, output: 200, cacheRead: 5000, cacheWrite: 30, steps: 2 }
  on('process.run', () =>
    scanOf({ '/p': { rows: { 'git-commit': row }, models: { 'claude-sonnet-5-5': { ...row, skills: { 'git-commit': 2 } } }, sessions: 1, actualSessions: 1, lastAt: '' } }),
  )
  on('env.get', () => ({ value: '/home/me' }))
  on('session.id', () => ({ value: 'current' }))
  mock.store(on, {})
  mock.clock(on)
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [], cost: { usd: 0.4 } } }))
  on('session.cwd', () => ({ value: '/p' }))

  const text = (await $.command.run({ command: 'skill-cost', args: 'all' } as never)).text ?? ''
  // The text the model reads stays plain, and the model name is no longer split over two lines
  expect(text).not.toContain('┌')
  expect(text).toContain('claude-sonnet-5-5')

  const props = { command: 'skill-cost', args: 'all', text, isErrored: false }
  const drawn = await $.ui.mount({ plugin: 'skill-cost', surface: 'terminal', component: 'CommandOutput', props: props as never })
  expect(await drawn.find({ type: 'Text', text: /^┌─+┬/ })).toBeDefined()
  expect(await drawn.find({ type: 'Text', text: /claude-sonnet-5-5/ })).toBeDefined()
  const heads = await drawn.findAll({ type: 'Text', text: /^\s+金額\(USD\) $/ })
  expect(heads.map(one => one.props.backgroundColor)).toContain('#1d4ed8')
  await drawn.unmount()

  // Another command's row, or a row this session did not answer, keeps the engine's drawing
  const other = await $.ui.mount({ plugin: 'skill-cost', surface: 'terminal', component: 'CommandOutput', props: { ...props, text: 'old row' } as never })
  expect(await other.find({ type: 'Text', text: /^┌/ })).toBeUndefined()
  await other.unmount()
})
