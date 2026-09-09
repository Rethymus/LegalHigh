// README 媒体生成工具：静态截图（画廊用横幅视口图）+ 交互 GIF（轮询截帧 → PIL 组装）。
// 用法：node scripts/readme_media.mjs [--base http://localhost:5173] [--out ../../docs/readme]
//        [--only a,b,c] [--skip-shots] [--skip-gifs] [--keep-frames]
// 纪律：GIF 场景含写操作（合同审查落库），后端必须以唯一临时 LH_DB_PATH 启动，
//       与 qa_shots 的写入式 E2E 同一隔离要求。
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const arg = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d }
const BASE = arg('base', 'http://localhost:5173')
const OUT = resolve(__dirname, arg('out', '../../docs/readme'))
const ONLY = arg('only', '') ? arg('only', '').split(',') : null
const SKIP_SHOTS = args.includes('--skip-shots')
const SKIP_GIFS = args.includes('--skip-gifs')
const KEEP_FRAMES = args.includes('--keep-frames')
const CHROME = arg('chrome', 'C:/Program Files/Google/Chrome/Application/chrome.exe')
let PORT = Number(arg('cdp-port', '0'))
if (!Number.isInteger(PORT) || PORT < 0 || PORT > 65535) throw new Error('--cdp-port 必须是 0–65535 的整数')
const FRAME_MS = 250 // GIF 帧间隔；与 readme_gif_make.py 的 duration 保持一致

const allocateLoopbackPort = () => new Promise((resolvePort, reject) => {
  const server = createServer()
  server.unref()
  server.once('error', reject)
  server.listen(0, '127.0.0.1', () => {
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : null
    server.close((error) => error ? reject(error) : resolvePort(port))
  })
})

// ---- CDP 最小客户端（与 qa_shots.mjs 同构） ----
class Cdp {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.handlers = []
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data)
      if (m.id && this.pending.has(m.id)) { const { resolve, reject } = this.pending.get(m.id); this.pending.delete(m.id)
        if (m.error) reject(new Error(m.error.message)); else resolve(m.result) }
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

const pageHeader = (text) => ({ selector: '.ph-t', text })

// ---- 静态截图清单：画廊用横幅视口图（fullPage 高图在固定高度图廊里会缩成不可读条带，一律视口图） ----
const DESKTOP = { width: 1440, height: 900 }
const NARROW = { width: 390, height: 844 }
const SHOTS = [
  { name: 'hero-light', path: '/', vp: DESKTOP, identity: { selector: '.hero-t', text: '让法律更有温度' } },
  { name: 'hero-dark', path: '/', vp: DESKTOP, dark: true, identity: { selector: '.hero-t', text: '让法律更有温度' } },
  { name: 'search-home', path: '/search', identity: pageHeader('法律检索') },
  { name: 'search-results', path: '/search/results?q=' + encodeURIComponent('定金'), identity: { selector: 'input[aria-label="修改检索词"]' } },
  { name: 'law-detail', path: '/laws/civl-2020?art=25', identity: pageHeader('《民法典》第二十五条') },
  { name: 'law-evidence', path: '/laws/pipl-2021?art=13', identity: pageHeader('《个人信息保护法》第十三条') },
  { name: 'laws-browse', path: '/laws', identity: pageHeader('法规条文') },
  { name: 'case-search', path: '/cases', identity: pageHeader('案例检索') },
  { name: 'case-detail', path: '/cases/guidance-24', identity: { selector: '.case-t', text: '荣宝英诉王阳' } },
  { name: 'case-foreign', path: '/cases/brown-v-board', identity: { selector: '.case-t', text: '布朗诉教育委员会案' } },
  { name: 'needs', path: '/needs', audience: 'public', identity: pageHeader('事实与证据梳理') },
  { name: 'case-analysis', path: '/case-analysis', identity: pageHeader('请求权要件检查') },
  { name: 'research', path: '/research', identity: pageHeader('法律研究') },
  { name: 'contracts', path: '/contracts', identity: pageHeader('合同审查') },
  { name: 'contract-review', path: '/contracts/new', identity: pageHeader('新合同审查') },
  { name: 'draft', path: '/draft', identity: { selector: '.ph-t' } },
  { name: 'comparative', path: '/comparative', identity: pageHeader('跨法域对比') },
  { name: 'learning', path: '/learning', audience: 'student', identity: pageHeader('学习中心') },
  { name: 'workspace', path: '/workspace', identity: pageHeader('专业工具工作台') },
  { name: 'collections', path: '/collections', identity: pageHeader('我的收藏') },
  { name: 'data-sources', path: '/data-sources', identity: pageHeader('当前数据与证据来源') },
  { name: 'audit', path: '/audit', identity: pageHeader('历史记录与操作审计') },
  { name: 'settings', path: '/settings', identity: pageHeader('设置') },
  { name: 'dark-search-results', path: '/search/results?q=' + encodeURIComponent('定金'), dark: true, identity: { selector: 'input[aria-label="修改检索词"]' } },
  { name: 'dark-law-detail', path: '/laws/civl-2020?art=25', dark: true, identity: pageHeader('《民法典》第二十五条') },
  { name: 'dark-contract-review', path: '/contracts/new', dark: true, identity: pageHeader('新合同审查') },
  { name: 'dark-workspace', path: '/workspace', dark: true, identity: pageHeader('专业工具工作台') },
  { name: 'narrow-dashboard', path: '/', vp: NARROW, audience: 'public', identity: { selector: '.hero-t', text: '让法律更有温度' } },
  { name: 'narrow-search-results', path: '/search/results?q=' + encodeURIComponent('定金'), vp: NARROW, identity: { selector: 'input[aria-label="修改检索词"]' } },
  { name: 'narrow-law-detail', path: '/laws/civl-2020?art=25', vp: NARROW, identity: pageHeader('《民法典》第二十五条') },
  { name: 'narrow-needs', path: '/needs', vp: NARROW, audience: 'public', identity: pageHeader('事实与证据梳理') },
]

// React 受控组件写入：必须用元素自身原型上的 value setter，混用会静默失效（R18 教训）
const setVal = (proto, expr, value) => `(() => { const el = ${expr}; if (!el) return 'no-el'
  Object.getOwnPropertyDescriptor(${proto}.prototype, 'value').set.call(el, ${JSON.stringify(value)})
  el.dispatchEvent(new Event('input', { bubbles: true })); return 'ok' })()`
const clickBtn = (match) => `(() => { const b = [...document.querySelectorAll('button')].find(x => ${match}); if (!b) return 'no-btn'; b.click(); return 'ok' })()`

const GIF_VP = { width: 1280, height: 800 }
const GIFS = [
  {
    name: 'gif-search', path: '/search', audience: 'public', vp: GIF_VP, identity: pageHeader('法律检索'),
    steps: [
      { t: 'wait', ms: 900 },
      { t: 'type', expr: `document.querySelector('input[aria-label="检索词"]')`, proto: 'HTMLInputElement', text: '试用期最长可以约定多久', per: 1 },
      { t: 'wait', ms: 500 },
      { t: 'eval', expr: clickBtn(`x.textContent.trim() === '检索'`) },
      { t: 'wait', ms: 3200 },
    ],
  },
  {
    name: 'gif-needs', path: '/needs', audience: 'public', vp: GIF_VP, identity: pageHeader('事实与证据梳理'),
    steps: [
      { t: 'wait', ms: 900 },
      { t: 'type', expr: `document.querySelector('textarea.ta')`, proto: 'HTMLTextAreaElement', text: '老板拖欠我三个月工资，还不给开离职证明', per: 2 },
      { t: 'wait', ms: 400 },
      { t: 'eval', expr: clickBtn(`x.textContent.includes('下一步')`) }, { t: 'wait', ms: 550 },
      { t: 'eval', expr: clickBtn(`x.textContent.includes('下一步')`) }, { t: 'wait', ms: 550 },
      { t: 'eval', expr: clickBtn(`x.textContent.includes('下一步')`) }, { t: 'wait', ms: 550 },
      { t: 'eval', expr: clickBtn(`x.textContent.includes('下一步')`) }, { t: 'wait', ms: 550 },
      { t: 'eval', expr: clickBtn(`x.textContent.includes('下一步')`) }, { t: 'wait', ms: 550 },
      { t: 'eval', expr: clickBtn(`x.textContent.includes('形成求助准备单并检索')`) },
      { t: 'wait', ms: 3600 },
    ],
  },
  {
    name: 'gif-contract', path: '/contracts/new', vp: GIF_VP, identity: pageHeader('新合同审查'),
    steps: [
      { t: 'wait', ms: 900 },
      { t: 'type', expr: `document.querySelector('input[aria-label="合同名称"]')`, proto: 'HTMLInputElement', text: '设计服务合同（示例）', per: 2 },
      { t: 'type', expr: `document.querySelector('textarea[aria-label="合同文本"]')`, proto: 'HTMLTextAreaElement', text: '第一条 服务费用由双方另行约定。第二条 任何情况下服务方赔偿责任不超过已收费用的百分之十。第三条 收款账户以书面通知为准。', per: 9 },
      { t: 'wait', ms: 500 },
      { t: 'eval', expr: clickBtn(`/发起规则审查/.test(x.textContent)`) },
      { t: 'wait', ms: 3600 },
    ],
  },
  {
    name: 'gif-case-analysis', path: '/case-analysis', vp: GIF_VP, identity: pageHeader('请求权要件检查'),
    steps: [
      { t: 'wait', ms: 900 },
      { t: 'eval', expr: `(() => { const s = document.querySelector('select.sel'); if (!s) return 'no-select'
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, 'consumer_fraud')
        s.dispatchEvent(new Event('change', { bubbles: true })); return 'ok' })()` },
      { t: 'wait', ms: 400 },
      { t: 'type', expr: `document.querySelector('textarea.ta')`, proto: 'HTMLTextAreaElement', text: '网购商品与宣传不符，商家拒绝退货退款，已保存订单、付款和聊天记录', per: 4 },
      { t: 'wait', ms: 500 },
      { t: 'eval', expr: clickBtn(`x.textContent.includes('运行要件检查')`) },
      { t: 'wait', ms: 3600 },
    ],
  },
  {
    name: 'gif-theme', path: '/settings', vp: GIF_VP, identity: pageHeader('设置'),
    steps: [
      { t: 'wait', ms: 900 },
      { t: 'eval', expr: clickBtn(`x.closest('.st-nav') && x.textContent.trim() === '外观'`) },
      { t: 'wait', ms: 700 },
      { t: 'eval', expr: `(() => { const seg = document.querySelector('.seg[aria-label="整体明暗"]')
        const b = seg ? [...seg.querySelectorAll('.seg-btn')].find(x => x.textContent.trim() === '深色') : null
        if (!b) return 'no-tone-btn'; b.click(); return 'ok' })()` },
      { t: 'wait', ms: 2600 },
    ],
  },
]

async function newTab() {
  const t = await getJson(`/json/new?${encodeURIComponent('about:blank')}`, 'PUT')
  const ws = globalThis.WebSocket
    ? new globalThis.WebSocket(t.webSocketDebuggerUrl)
    : new (await import('node:ws')).default(t.webSocketDebuggerUrl)
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })
  return { t, ws, cdp: new Cdp(ws) }
}

async function closeTab(t, ws) {
  ws.close()
  await getJson(`/json/close/${t.id}`).catch(() => {})
}

async function prepare(cdp, route) {
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable')
  const vp = route.vp ?? DESKTOP
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: vp.width < 700 })
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `try { localStorage.setItem('le-tone-override', '${route.dark ? 'dark' : 'light'}');
      localStorage.setItem('lh:audience:v3', JSON.stringify({mode:${JSON.stringify(route.audience ?? 'professional')}}));${
      process.env.LH_ADMIN_TOKEN ? ` sessionStorage.setItem('lh:admin-token:v1', ${JSON.stringify(process.env.LH_ADMIN_TOKEN)});` : ''
    } } catch {}`,
  })
  await cdp.send('Page.navigate', { url: BASE + route.path })
  for (let i = 0; i < 40; i++) {
    await sleep(400)
    try {
      const r = await cdp.send('Runtime.evaluate', { expression: `document.readyState === 'complete' && (document.querySelector('#root')?.textContent || '').length > 40`, returnByValue: true })
      if (r.result?.value) break
    } catch { /* retry */ }
  }
  await sleep(900)
}

async function assertIdentity(cdp, route, label) {
  if (!route.identity) return true
  const r = await cdp.send('Runtime.evaluate', {
    expression: `(() => { const el = document.querySelector(${JSON.stringify(route.identity.selector)})
      return { found: !!el, text: el?.textContent?.trim() || '' } })()`,
    returnByValue: true,
  })
  const v = r.result?.value ?? {}
  if (!v.found || (route.identity.text && !v.text.includes(route.identity.text))) {
    console.error(`✗ ${label}: 身份断言失败 selector=${route.identity.selector} got="${v.text}"`)
    return false
  }
  return true
}

async function capture(cdp) {
  const s = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 78 })
  return s.data
}

async function runSteps(cdp, steps, pushFrame) {
  for (const s of steps) {
    if (s.t === 'wait') { const end = Date.now() + s.ms; while (Date.now() < end) { await pushFrame(); await sleep(FRAME_MS) } }
    else if (s.t === 'eval') {
      const r = await cdp.send('Runtime.evaluate', { expression: s.expr, returnByValue: true })
      if (typeof r.result?.value === 'string' && /^(no-|error|failed)/i.test(r.result.value)) console.warn(`  ⚠ step returned: ${r.result.value}`)
    }
    else if (s.t === 'type') {
      for (let i = s.per; i <= s.text.length; i += s.per) {
        await cdp.send('Runtime.evaluate', { expression: setVal(s.proto, s.expr, s.text.slice(0, i)), returnByValue: true })
        await pushFrame(); await sleep(FRAME_MS)
      }
    }
  }
}

async function main() {
  mkdirSync(OUT, { recursive: true })
  const chromeProfile = mkdtempSync(join(tmpdir(), 'legalhigh-readme-chrome-'))
  const framesRoot = mkdtempSync(join(tmpdir(), 'legalhigh-readme-frames-'))
  if (PORT === 0) PORT = await allocateLoopbackPort()
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`, '--no-first-run', '--no-default-browser-check',
    '--user-data-dir=' + chromeProfile, '--disable-gpu', 'about:blank',
  ], { stdio: 'ignore' })
  try {
    let targets
    for (let i = 0; i < 30; i++) { await sleep(500); try { targets = await getJson('/json'); if (targets.length) break } catch { /* retry */ } }
    if (!targets) throw new Error('Chrome 未启动：remote-debugging 连接失败')

    if (!SKIP_SHOTS) {
      for (const route of SHOTS) {
        if (ONLY && !ONLY.includes(route.name)) continue
        const { t, ws, cdp } = await newTab()
        try {
          await prepare(cdp, route)
          if (!await assertIdentity(cdp, route, route.name)) continue
          const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
          writeFileSync(resolve(OUT, `${route.name}.png`), Buffer.from(shot.data, 'base64'))
          console.log(`✓ shot ${route.name}`)
        } finally { await closeTab(t, ws) }
      }
    }

    if (!SKIP_GIFS) {
      const py = resolve(__dirname, '../../server/.venv/Scripts/python.exe')
      for (const route of GIFS) {
        if (ONLY && !ONLY.includes(route.name)) continue
        const { t, ws, cdp } = await newTab()
        try {
          await prepare(cdp, route)
          if (!await assertIdentity(cdp, route, route.name)) continue
          const framesDir = join(framesRoot, route.name)
          mkdirSync(framesDir, { recursive: true })
          let n = 0; let busy = false
          const pushFrame = async () => {
            if (busy) return; busy = true
            try { writeFileSync(join(framesDir, `${String(++n).padStart(4, '0')}.jpg`), Buffer.from(await capture(cdp), 'base64')) } finally { busy = false }
          }
          await pushFrame()
          await runSteps(cdp, route.steps, pushFrame)
          await pushFrame()
          const gif = route.name + '.gif'
          const assembled = spawn(py, [resolve(__dirname, 'readme_gif_make.py'), framesDir, resolve(OUT, gif), '880', String(FRAME_MS)], { stdio: 'inherit' })
          await new Promise((res, rej) => { assembled.once('exit', (code) => code === 0 ? res() : rej(new Error(`gif 组装失败 ${gif}`))) })
          console.log(`✓ gif ${gif}（${n} 帧）`)
        } finally { await closeTab(t, ws) }
      }
      if (!KEEP_FRAMES) rmSync(framesRoot, { recursive: true, force: true })
    }
    const files = readdirSync(OUT)
    console.log(`\n完成：${files.length} 个文件位于 ${OUT}`)
  } finally {
    chrome.kill()
    await sleep(300)
    try { rmSync(chromeProfile, { recursive: true, force: true }) } catch { /* 由系统临时目录回收 */ }
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
