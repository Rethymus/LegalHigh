// 可访问性行为探针（计划 v5 S2-T3；WCAG 2.2 AA 子集，2026-09-13）：
//   ① 2.5.8 最小目标尺寸：交互元素 < 24×24 CSS px（行内文本链接按 inline 例外豁免）
//   ② 2.4.11 焦点不被遮挡（Minimum）：可聚焦元素 scrollIntoView(start)+focus 后
//      完全落入悬浮层（.tb）矩形内 = 整体被遮
// 用法：node scripts/qa_a11y.mjs [--base http://localhost:5173] [--strict] [--out 路径]
// 依赖：dev server 已启动（vite + 后端）。--strict 任一违规退出码 1（run_qa 第七门）。
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const arg = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d }
const BASE = arg('base', 'http://localhost:5173')
const STRICT = args.includes('--strict')
const CHROME = arg('chrome', 'C:/Program Files/Google/Chrome/Application/chrome.exe')
let PORT = Number(arg('cdp-port', '0'))

const ROUTES = [
  { name: 'dashboard', path: '/', identity: { selector: '.hero-t', text: '让法律更有温度' } },
  { name: 'search-home', path: '/search', identity: { selector: '.ph-t', text: '法律检索' } },
  { name: 'search-results', path: '/search/results?q=' + encodeURIComponent('试用期'), identity: { selector: 'input[aria-label="修改检索词"]' } },
  { name: 'law-detail', path: '/laws/civl-2020?art=25', identity: { selector: '.ph-t', text: '《民法典》第二十五条' } },
  { name: 'needs', path: '/needs', audience: 'public', identity: { selector: '.ph-t', text: '事实与证据梳理' } },
  { name: 'case-analysis', path: '/case-analysis', identity: { selector: '.ph-t', text: '请求权要件检查' } },
  { name: 'contract-review', path: '/contracts/new', identity: { selector: '.ph-t', text: '新合同审查' } },
  { name: 'learning', path: '/learning', audience: 'student', identity: { selector: '.ph-t', text: '学习中心' } },
  { name: 'workspace', path: '/workspace', identity: { selector: '.ph-t', text: '专业工具工作台' } },
  { name: 'settings', path: '/settings', identity: { selector: '.ph-t', text: '设置' } },
  { name: 'guide', path: '/guide', identity: { selector: '.ph-t', text: '使用指南' } },
  { name: 'terms', path: '/terms', identity: { selector: '.ph-t', text: '术语卡' } },
  { name: 'quality', path: '/quality', identity: { selector: '.ph-t', text: '质量透明度' } },
]

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

class Cdp {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map()
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data)
      if (m.id && this.pending.has(m.id)) { const { resolve, reject } = this.pending.get(m.id); this.pending.delete(m.id)
        if (m.error) reject(new Error(m.error.message)); else resolve(m.result) }
    }) }
  send(method, params = {}) { const id = ++this.id
    return new Promise((res, rej) => { this.pending.set(id, { resolve: res, reject: rej })
      this.ws.send(JSON.stringify({ id, method, params })) }) }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function getJson(path, method = 'GET') {
  return (await fetch(`http://127.0.0.1:${PORT}${path}`, { method })).json()
}

// 单页审计：目标尺寸 + 焦点遮挡，全部在页面内一次求值完成
const AUDIT_EXPR = `(() => {
  const out = { smallTargets: [], obscuredFocus: [], occluders: [] }
  const visible = (el) => {
    const s = getComputedStyle(el)
    if (s.display === 'none' || s.visibility === 'hidden') return false
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0
  }
  const occluderEls = [...document.querySelectorAll('.tb')].filter(visible)
  out.occluders = occluderEls.map((el) => { const r = el.getBoundingClientRect()
    return { top: +r.top.toFixed(1), bottom: +r.bottom.toFixed(1), left: +r.left.toFixed(1), right: +r.right.toFixed(1) } })

  // ① 2.5.8 目标尺寸（行内文本链接走 inline 例外豁免）
  const interactive = [...document.querySelectorAll('button, a[href], input, select, [role="tab"], [role="switch"], [role="button"]')]
  for (const el of interactive) {
    if (!visible(el)) continue
    const s = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    const inlineTextLink = el.tagName === 'A' && s.display.includes('inline') && el.closest('p, li, td, .banner-tx, .tiny, .set-d, .hero-sub')
    if (inlineTextLink) continue
    if (r.width < 24 || r.height < 24) {
      out.smallTargets.push({
        tag: el.tagName.toLowerCase(),
        cls: String(el.className || '').slice(0, 50),
        w: +r.width.toFixed(1), h: +r.height.toFixed(1),
        label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 16),
      })
    }
  }

  // ② 2.4.11 焦点不被遮挡（Minimum = 不得被完全遮住）
  const focusables = [...document.querySelectorAll('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(visible)
  for (const el of focusables) {
    el.scrollIntoView({ block: 'start', inline: 'nearest' })
    el.focus({ preventScroll: true })
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) continue
    const fullyHidden = !occluderEls.some((o) => o.contains(el)) && occluderEls.some((o) => {
      const b = o.getBoundingClientRect()
      return r.top >= b.top - 2 && r.bottom <= b.bottom + 2 && r.left >= b.left - 2 && r.right <= b.right + 2
    })
    if (fullyHidden) {
      out.obscuredFocus.push({
        tag: el.tagName.toLowerCase(),
        cls: String(el.className || '').slice(0, 50),
        label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 16),
        top: +r.top.toFixed(1), bottom: +r.bottom.toFixed(1),
      })
    }
  }
  window.scrollTo(0, 0)
  return out
})()`

async function main() {
  const report = []
  const chromeProfile = mkdtempSync(join(tmpdir(), 'legalhigh-a11y-'))
  if (PORT === 0) PORT = await allocateLoopbackPort()
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`, '--no-first-run', '--no-default-browser-check',
    '--user-data-dir=' + chromeProfile, '--disable-gpu', 'about:blank',
  ], { stdio: 'ignore' })
  try {
    let targets
    for (let i = 0; i < 30; i++) { await sleep(500); try { targets = await getJson('/json'); if (targets.length) break } catch { /* retry */ } }
    if (!targets) throw new Error('Chrome 未启动')

    for (const route of ROUTES) {
      const t = await getJson(`/json/new?${encodeURIComponent('about:blank')}`, 'PUT')
      const ws = new globalThis.WebSocket(t.webSocketDebuggerUrl)
      await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })
      const cdp = new Cdp(ws)
      await cdp.send('Page.enable'); await cdp.send('Runtime.enable')
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
      await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
        source: `try {
          localStorage.setItem('le-tone-override', 'light');
          localStorage.setItem('lh:audience:v3', JSON.stringify({mode:${JSON.stringify(route.audience ?? 'professional')}}));
          ${process.env.LH_ADMIN_TOKEN ? `sessionStorage.setItem('lh:admin-token:v1', ${JSON.stringify(process.env.LH_ADMIN_TOKEN)});` : ''}
        } catch {}`,
      })
      await cdp.send('Page.navigate', { url: BASE + route.path })
      for (let i = 0; i < 40; i++) {
        await sleep(400)
        try {
          const r = await cdp.send('Runtime.evaluate', { expression: `document.readyState === 'complete' && (document.querySelector('#root')?.textContent || '').length > 40`, returnByValue: true })
          if (r.result?.value) break
        } catch { /* retry */ }
      }
      await sleep(800)
      let idOk = { result: { value: false } }
      for (let i = 0; i < 4 && !idOk.result?.value; i++) {
        const textCheck = route.identity.text ? ` && el.textContent.includes(${JSON.stringify(route.identity.text)})` : ''
        idOk = await cdp.send('Runtime.evaluate', {
          expression: `(() => { const el = document.querySelector(${JSON.stringify(route.identity.selector)}); return !!el${textCheck} })()`,
          returnByValue: true,
        })
        if (!idOk.result?.value) await sleep(900)
      }
      if (!idOk.result?.value) { console.error(`FAIL ${route.name}: 页面身份断言失败`); report.push({ route: route.name, error: 'identity failed' }); ws.close(); continue }

      const res = await cdp.send('Runtime.evaluate', { expression: AUDIT_EXPR, returnByValue: true })
      const v = res.result?.value ?? { smallTargets: [], obscuredFocus: [], occluders: [] }
      const entry = { route: route.name, smallTargets: v.smallTargets, obscuredFocus: v.obscuredFocus }
      const ok = !v.smallTargets.length && !v.obscuredFocus.length
      console.log(`${ok ? 'PASS' : 'FAIL'} ${route.name}: 小目标 ${v.smallTargets.length}，遮挡焦点 ${v.obscuredFocus.length}`)
      if (!ok) {
        for (const s of v.smallTargets.slice(0, 8)) console.log(`   [目标<24px] <${s.tag} class="${s.cls}"> ${s.w}x${s.h} "${s.label}"`)
        for (const s of v.obscuredFocus.slice(0, 5)) console.log(`   [焦点被遮] <${s.tag} class="${s.cls}"> "${s.label}" @${s.top}-${s.bottom}`)
      }
      report.push(entry)
      ws.close()
      await getJson(`/json/close/${t.id}`).catch(() => {})
    }
    const out = resolve(__dirname, arg('out', '../../docs/qa-evidence/qa-a11y-report.json'))
    mkdirSync(resolve(out, '..'), { recursive: true })
    writeFileSync(out, JSON.stringify(report, null, 2))
    const bad = report.filter((r) => (r.smallTargets?.length || r.obscuredFocus?.length || r.error))
    console.log(`\n完成：${report.length} 路由，${bad.length} 路由存在问题（${out}）`)
    if (STRICT && bad.length) process.exitCode = 1
  } finally {
    chrome.kill()
    await sleep(300)
    try { rmSync(chromeProfile, { recursive: true, force: true }) } catch { /* 系统临时目录回收 */ }
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
