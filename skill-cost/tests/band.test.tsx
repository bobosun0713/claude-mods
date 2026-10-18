import { expect, mock, test } from 'claude-code/testing'

const row = { usd: 0.4, input: 10, output: 200, cacheRead: 5000, cacheWrite: 30, steps: 2 }

test('提示列顯示本次與此資料夾歷來的花費', async ($, on) => {
  // 讓背景掃描回傳一個資料夾
  // 讓背景掃描回傳一個資料夾，並記下傳入的實際費用
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
  // 已存的與目前 session 的實際費用都會傳給掃描腳本
  expect(JSON.parse(stdin)).toEqual({ old: 1.5, current: 0.4 })

  const band = await $.ui.mount({ plugin: 'skill-cost', surface: 'terminal', component: 'AbovePrompt', props: {} as never })
  expect(await band.find({ type: 'Text', text: /此資料夾歷來 ≈US\$0\.400.*\/skill-cost 看明細/ })).toBeDefined()
  await band.unmount()
})
