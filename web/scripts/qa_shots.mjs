// 长周期查漏补缺工具：无头 Chrome CDP 巡检脚本
// 用法：node scripts/qa_shots.mjs [--base http://localhost:5173] [--out ../../docs/qa-evidence] [--only name1,name2] [--strict]
// --strict：任一路由存在 console 错误/页面异常/失败请求即退出码 1（CI 门）；默认仅报告。
// 产物：每路由 PNG 截图 + report.json（console 错误 / 失败请求 / 页面异常）
// 纪律：本脚本只读页面与执行显式注入的交互步骤，不修改任何业务数据；
//       交互步骤（steps）只允许触发「创建/查询」类演示操作，不签发、不批注终态。
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const arg = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d }
const BASE = arg('base', 'http://localhost:5173')
const OUT = resolve(__dirname, arg('out', '../../docs/qa-evidence'))
const ONLY = arg('only', '') ? arg('only', '').split(',') : null
const STRICT = args.includes('--strict')
const CHROME = arg('chrome', 'C:/Program Files/Google/Chrome/Application/chrome.exe')
const PORT = 9337

// ---- 巡检路由表（与 App.tsx 一一对应；新增路由必须登记） ----
// steps: {t:'eval', expr} | {t:'wait', ms} | {t:'shot', name, fullPage?}
const ROUTES = [
  { name: '01-dashboard', path: '/', fullPage: true },
  { name: '02-dashboard-dark', path: '/', dark: true },
  { name: '03-needs', path: '/needs', fullPage: true },
  { name: '04-needs-run', path: '/needs', fullPage: true, steps: [
    { t: 'eval', expr: `(() => { const ta = document.querySelector('textarea'); if (!ta) return 'no-textarea'; const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set; set.call(ta, '老板拖欠我三个月工资还不给离职证明'); ta.dispatchEvent(new Event('input', {bubbles:true})); return 'ok' })()` },
    { t: 'eval', expr: `(() => { const btn = [...document.querySelectorAll('button')].find(b => /解析|开始/.test(b.textContent)); if (!btn) return 'no-btn'; btn.click(); return 'clicked' })()` },
    { t: 'wait', ms: 2500 },
  ] },
  { name: '05-search-home', path: '/search' },
  { name: '06-search-results', path: '/search/results?q=' + encodeURIComponent('试用期 一年'), fullPage: true },
  { name: '07-law-detail', path: '/laws/civl-2020?art=25', fullPage: true },
  { name: '08-laws-browse', path: '/laws' },
  { name: '09-case-search', path: '/cases', fullPage: true },
  { name: '10-case-detail-cn', path: '/cases/guidance-24', fullPage: true },
  { name: '11-case-detail-foreign', path: '/cases/brown-v-board', fullPage: true },
  { name: '12-research', path: '/research', fullPage: true },
  { name: '13-research-run', path: '/research', fullPage: true, steps: [
    { t: 'eval', expr: `(() => { const inp = document.querySelector('.searchbar input, input.inp, textarea'); if (!inp) return 'no-input'; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set ?? Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set; set.call(inp, '网购到假货可以要求什么赔偿'); inp.dispatchEvent(new Event('input', {bubbles:true})); return 'ok' })()` },
    { t: 'eval', expr: `(() => { const btn = [...document.querySelectorAll('button')].find(b => /开始研究|生成|研究/.test(b.textContent)); if (!btn) return 'no-btn'; btn.click(); return 'clicked:' + btn.textContent.trim().slice(0,12) })()` },
    { t: 'wait', ms: 3000 },
  ] },
  { name: '14-contracts', path: '/contracts' },
  { name: '15-contract-review', path: '/contracts/c-1', fullPage: true },
  { name: '16-contract-review-run', path: '/contracts/c-1', fullPage: true, resetFav: true, steps: [
    { t: 'eval', expr: `(() => { const btn = [...document.querySelectorAll('button')].find(b => /发起 AI 审查/.test(b.textContent)); if (!btn) return 'no-btn'; btn.click(); return 'clicked' })()` },
    { t: 'wait', ms: 3000 },
  ] },
  { name: '17-compare', path: '/compare' },
  { name: '18-draft', path: '/draft', fullPage: true },
  { name: '19-draft-validation', path: '/draft/validation', fullPage: true },
  { name: '20-comparative', path: '/comparative', fullPage: true },
  { name: '21-learning', path: '/learning', fullPage: true },
  { name: '22-workspace', path: '/workspace', fullPage: true },
  { name: '23-collections', path: '/collections' },
  { name: '24-data-sources', path: '/data-sources', fullPage: true },
  { name: '25-audit', path: '/audit', fullPage: true },
  { name: '26-settings', path: '/settings', fullPage: true },
  { name: '27-design-system', path: '/design-system', fullPage: true },
  { name: '28-narrow-needs', path: '/needs', viewport: { width: 390, height: 844 }, fullPage: true },
  { name: '29-narrow-dashboard', path: '/', viewport: { width: 390, height: 844 } },
  { name: '30-narrow-nav-open', path: '/', viewport: { width: 390, height: 844 }, steps: [
    { t: 'eval', expr: `(() => { const b = document.querySelector('.tb-icon'); if (!b) return 'no-btn'; b.click(); return 'clicked' })()` },
    { t: 'wait', ms: 600 },
  ] },
  { name: '31-narrow-search-results', path: '/search/results?q=' + encodeURIComponent('试用期'), viewport: { width: 390, height: 844 }, fullPage: true },
  { name: '32-narrow-law-detail', path: '/laws/civl-2020?art=25', viewport: { width: 390, height: 844 }, fullPage: true },
  { name: '33-narrow-contract-review', path: '/contracts/c-1', viewport: { width: 390, height: 844 }, fullPage: true },
  // 暗色回归组（D7 后文本色/语义色调整的重点验证面）
  { name: '34-dark-search-results', path: '/search/results?q=' + encodeURIComponent('试用期'), dark: true, fullPage: true },
  { name: '35-dark-law-detail', path: '/laws/civl-2020?art=25', dark: true, fullPage: true },
  { name: '36-dark-contract-review', path: '/contracts/c-1', dark: true, fullPage: true },
  { name: '37-dark-audit', path: '/audit', dark: true, fullPage: true },
]

// ---- CDP 最小客户端 ----
class Cdp {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.handlers = []
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data)
      if (m.id && this.pending.has(m.id)) { const { resolve, reject } = this.pending.get(m.id); this.pending.delete(m.id)
        m.error ? reject(new Error(m.error.message)) : resolve(m.result) }
      else if (m.method) this.handlers.forEach((h) => h(m))
    }) }
  send(method, params = {}) { const id = ++this.id
    return new Promise((res, rej) => { this.pending.set(id, { resolve: res, reject: rej })
      this.ws.send(JSON.stringify({ id, method, params })) }) }
  on(h) { this.handlers.push(h) }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function getJson(path, method = 'GET') {
  const r = await fetch(`http://127.0.0.1:${PORT}${path}`, { method })
  return r.json()
}

async function main() {
  mkdirSync(OUT, { recursive: true })
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`, '--no-first-run', '--no-default-browser-check',
    '--user-data-dir=' + resolve(OUT, '.chrome-profile'), '--disable-gpu', 'about:blank',
  ], { stdio: 'ignore' })
  try {
    let targets
    for (let i = 0; i < 30; i++) { await sleep(500); try { targets = await getJson('/json'); if (targets.length) break } catch { /* retry */ } }
    if (!targets) throw new Error('Chrome 未启动：remote-debugging 连接失败')
    // 预热：首访触发 vite 依赖预转换，避免首个路由截图时空白
    {
      const t0 = await getJson(`/json/new?${encodeURIComponent('about:blank')}`, 'PUT')
      const ws0 = new globalThis.WebSocket(t0.webSocketDebuggerUrl)
      await new Promise((res) => ws0.addEventListener('open', res))
      const c0 = new Cdp(ws0)
      await c0.send('Page.enable')
      await c0.send('Page.navigate', { url: BASE + '/' })
      await sleep(4000)
      ws0.close()
      await getJson(`/json/close/${t0.id}`).catch(() => {})
    }
    const report = []
    for (const route of ROUTES) {
      if (ONLY && !ONLY.includes(route.name)) continue
      const entry = { name: route.name, path: route.path, consoleErrors: [], consoleWarnings: [], pageErrors: [], failedRequests: [] }
      const t = await getJson(`/json/new?${encodeURIComponent('about:blank')}`, 'PUT')
      const { WebSocket } = await import('node:ws').catch(() => ({}))
      const ws = globalThis.WebSocket
        ? new globalThis.WebSocket(t.webSocketDebuggerUrl)
        : new (await import('node:ws')).default(t.webSocketDebuggerUrl)
      await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })
      const cdp = new Cdp(ws)
      const logs = []
      cdp.on((m) => {
        if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type))
          logs.push({ kind: m.params.type, text: m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 500) })
        if (m.method === 'Runtime.exceptionThrown')
          logs.push({ kind: 'pageError', text: (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text || '').slice(0, 500) })
        if (m.method === 'Log.entryAdded' && ['error', 'warning'].includes(m.params.entry.level))
          logs.push({ kind: m.params.entry.level === 'error' ? 'logError' : 'logWarn', text: `${m.params.entry.source}: ${m.params.entry.text}`.slice(0, 500) })
        if (m.method === 'Network.responseReceived' && m.params.response.status >= 400)
          logs.push({ kind: 'http', text: `${m.params.response.status} ${m.params.response.url}` })
        if (m.method === 'Network.loadingFailed' && !m.params.canceled)
          logs.push({ kind: 'netFail', text: `${m.params.errorText} ${m.params.type}` })
      })
      await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Log.enable'); await cdp.send('Network.enable')
      const vp = route.viewport ?? { width: 1440, height: 900 }
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: vp.width < 700 })
      // 每路由显式重置外观覆盖（localStorage 同源共享，防止上一路由的 dark 泄漏到本路由）
      await cdp.send('Page.navigate', { url: BASE + '/robots.txt' })
      await sleep(400)
      await cdp.send('Runtime.evaluate', { expression: `localStorage.setItem('le-tone-override', '${route.dark ? 'dark' : 'auto'}')` })
      await cdp.send('Page.navigate', { url: BASE + route.path })
      await sleep(1600)
      let sn = 0
      for (const s of route.steps ?? []) {
        if (s.t === 'eval') { const r = await cdp.send('Runtime.evaluate', { expression: s.expr, returnByValue: true }); if (r.result?.value) entry[`step${++sn}`] = r.result.value }
        if (s.t === 'wait') await sleep(s.ms)
      }
      await sleep(route.steps ? 400 : 900)
      for (const l of logs) {
        if (l.kind === 'error' || l.kind === 'logError') entry.consoleErrors.push(l.text)
        else if (l.kind === 'pageError') entry.pageErrors.push(l.text)
        else if (l.kind === 'http' || l.kind === 'netFail') entry.failedRequests.push(l.text)
        else entry.consoleWarnings.push(l.text)
      }
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: !!route.fullPage })
      writeFileSync(resolve(OUT, `${route.name}.png`), Buffer.from(shot.data, 'base64'))
      report.push(entry)
      ws.close()
      await getJson(`/json/close/${t.id}`).catch(() => {})
      console.log(`✓ ${route.name}${entry.consoleErrors.length || entry.pageErrors.length || entry.failedRequests.length ? '  ⚠ ' + [...entry.consoleErrors, ...entry.pageErrors, ...entry.failedRequests].length + ' 问题' : ''}`)
    }
    for (const r of report) delete r._sn
    writeFileSync(resolve(OUT, 'report.json'), JSON.stringify(report, null, 2))
    const bad = report.filter((r) => r.consoleErrors.length || r.pageErrors.length || r.failedRequests.length)
    if (STRICT && bad.length) { console.error('STRICT 门失败：存在 console 错误/页面异常/失败请求'); process.exitCode = 1 }
    console.log(`\n完成：${report.length} 路由，${bad.length} 个路由存在问题（详见 ${resolve(OUT, 'report.json')}）`)
  } finally {
    chrome.kill()
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
