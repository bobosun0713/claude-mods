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
  expect(await band.find({ type: 'Text', text: /此資料夾歷來 ≈US\$0\.400.*\/skill-cost 看明細/ })).toBeDefined()
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

  const band = await $.ui.mount({ plugin: 'skill-cost', surface: 'terminal', component: 'AbovePrompt', props: {} as never })
  expect(await band.find({ type: 'Text', text: /^This session .*\/skill-cost for details/ })).toBeDefined()
  await band.unmount()

  expect((await $.command.run({ command: 'skill-cost', args: 'lang zh' } as never)).text).toBe('已切換為中文。')
})
