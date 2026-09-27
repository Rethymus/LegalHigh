// 窄屏溢出扫描门（R338；移动端产品形态主线的长期守门人）：
//   ① 横向溢出：documentElement.scrollWidth 超出视口 >2px = 违规（列出最宽祸首元素）
//   ② 页头拥挤：.ph-actions 可见操作件 ≥4 = 违规（窄屏应折叠为 ActionSheet，R335-R336 口径）
//   ③ 自检：视口实宽必须 =390（防 Emulation 失效造成的全绿假象——R17 工具时序教训口径）
// 用法：node scripts/qa_narrow.mjs [--base http://localhost:5173] [--strict] [--out 路径]
// 依赖：dev server 已启动（vite + 后端）。--strict 任一违规退出码 1（run_qa 第九门）。
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
const OUT = arg('out', resolve(__dirname, '../../docs/qa-evidence/qa-narrow-report.json'))
const CHROME = arg('chrome', 'C:/Program Files/Google/Chrome/Application/chrome.exe')
let PORT = Number(arg('cdp-port', '0'))

// 核心路由集（与 qa_shots 同源口径的子集：静态内容页 + 全功能页 + 深链样本）
const ROUTES = [
  { name: 'dashboard', path: '/', identity: { selector: '.hero-t' } },
  { name: 'needs', path: '/needs', audience: 'public', identity: { selector: '.ph-t' } },
  { name: 'search-home', path: '/search', identity: { selector: '.ph-t' } },
  { name: 'search-results', path: '/search/results?q=' + encodeURIComponent('试用期'), identity: { selector: '.ph-t' } },
  { name: 'laws-browse', path: '/laws', identity: { selector: '.ph-t' } },
  { name: 'law-detail', path: '/laws/civl-2020?art=25', identity: { selector: '.ph-t' } },
  { name: 'law-detail-null-chapter', path: '/laws/blood-donation-1998?art=1', identity: { selector: '.ph-t' } },
  { name: 'law-versions-pred', path: '/laws/psm-2025?art=1&tab=version', identity: { selector: '.ph-t' } },
  { name: 'case-search', path: '/cases', identity: { selector: '.ph-t' } },
  { name: 'case-detail', path: '/cases/guidance-24', identity: { selector: '.case-t' } },
  { name: 'case-detail-migrated', path: '/cases/guidance-01', identity: { selector: '.case-t' } },
  { name: 'case-analysis', path: '/case-analysis', identity: { selector: '.ph-t' } },
  { name: 'research', path: '/research', identity: { selector: '.ph-t' } },
  { name: 'contract-library', path: '/contracts', identity: { selector: '.ph-t' } },
  { name: 'contract-review', path: '/contracts/new', identity: { selector: '.ph-t' } },
  { name: 'compare', path: '/compare', identity: { selector: '.ph-t' } },
  { name: 'draft', path: '/draft', identity: { selector: '.ph-t' } },
  { name: 'draft-validation', path: '/draft/validation', identity: { selector: '.ph-t' } },
  { name: 'comparative', path: '/comparative', identity: { selector: '.ph-t' } },
  { name: 'learning', path: '/learning', audience: 'student', identity: { selector: '.ph-t' } },
  { name: 'workspace', path: '/workspace', identity: { selector: '.ph-t' } },
  { name: 'collections', path: '/collections', identity: { selector: '.ph-t' } },
  { name: 'data-sources', path: '/data-sources', identity: { selector: '.ph-t' } },
  { name: 'audit', path: '/audit', identity: { selector: '.ph-t' } },
  { name: 'settings', path: '/settings', identity: { selector: '.ph-t' } },
  { name: 'guide', path: '/guide', identity: { selector: '.ph-t' } },
  { name: 'terms', path: '/terms', identity: { selector: '.ph-t' } },
  { name: 'quality', path: '/quality', identity: { selector: '.ph-t' } },
  { name: 'process', path: '/process', identity: { selector: '.ph-t' } },
]

const MAX_OVERFLOW_PX = 2
const MAX_HEADER_ACTIONS = 3

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

// 单页审计：视口自检 + 横向溢出（含祸首元素）+ 页头操作件计数，一次求值完成
const AUDIT_EXPR = `(() => {
  const out = { viewportW: document.documentElement.clientWidth, overflowX: 0, culprit: null, headerActions: [] }
  const vw = out.viewportW
  out.overflowX = document.documentElement.scrollWidth - vw
  if (out.overflowX > ${MAX_OVERFLOW_PX}) {
    let widestW = 0
    for (const el of document.querySelectorAll('body *')) {
      const w = el.scrollWidth
      if (w > widestW && w > vw + ${MAX_OVERFLOW_PX}) {
        widestW = w
        out.culprit = { tag: el.tagName.toLowerCase(), cls: String(el.className || '').slice(0, 60), sw: w }
      }
    }
  }
  const visible = (el) => { const s = getComputedStyle(el); if (s.display === 'none' || s.visibility === 'hidden') return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 }
  for (const el of document.querySelectorAll('.ph-actions button, .ph-actions a')) {
    if (!visible(el)) continue
    out.headerActions.push((el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 14))
  }
  return out
})()`

async function main() {
  const report = []
  const chromeProfile = mkdtempSync(join(tmpdir(), 'legalhigh-narrow-'))
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
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
      const audience = route.audience === 'public' ? 'public' : route.audience === 'student' ? 'student' : 'professional'
      await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
        source: `try {
          localStorage.setItem('lh:audience:v3', JSON.stringify({mode:${JSON.stringify(audience)}}));
        } catch (e) {}`,
      })
      const entry = { name: route.name, path: route.path, violations: [] }
      try {
        await cdp.send('Page.navigate', { url: BASE + route.path })
        await sleep(2400)
        const identityReady = await (async () => {
          const spec = JSON.stringify(route.identity)
          for (let i = 0; i < 12; i++) {
            const ok = await cdp.send('Runtime.evaluate', { expression: `!!document.querySelector(${spec.selector ? JSON.stringify(route.identity.selector) : '"body"'})`, returnByValue: true })
            if (ok.result?.value) return true
            await sleep(400)
          }
          return false
        })()
        if (!identityReady) entry.violations.push('identity-not-found（页面未渲染出锚点元素——探针无法确认在正确页面上）')
        const audit = await cdp.send('Runtime.evaluate', { expression: AUDIT_EXPR, returnByValue: true })
        const r = audit.result?.value ?? {}
        entry.viewportW = r.viewportW
        entry.overflowX = r.overflowX
        entry.culprit = r.culprit ?? null
        entry.headerActions = r.headerActions ?? []
        if (r.viewportW !== 390) entry.violations.push(`viewport self-check failed: ${r.viewportW} != 390（仿真未生效，本路由结果不可信）`)
        if (r.overflowX > MAX_OVERFLOW_PX) entry.violations.push(`horizontal overflow +${r.overflowX}px（祸首 ${(r.culprit?.tag ?? '?')}.${r.culprit?.cls ?? ''} sw=${r.culprit?.sw}）`)
        if ((r.headerActions?.length ?? 0) > MAX_HEADER_ACTIONS) entry.violations.push(`header crowded: ${r.headerActions.length} 个操作件（窄屏应折叠，见 [${r.headerActions.join(' | ')}]）`)
      } catch (e) {
        entry.violations.push(`probe error: ${String(e.message || e).slice(0, 160)}`)
      }
      try { ws.close() } catch { /* 单页连接清理 */ }
      report.push(entry)
      console.log(`${entry.violations.length ? '✗' : '✓'} ${route.name}${entry.violations.length ? ' — ' + entry.violations.join('；') : ''}`)
    }
  } finally {
    chrome.kill()
    await sleep(250)
    try { rmSync(chromeProfile, { recursive: true, force: true }) } catch { /* 交给系统临时目录回收 */ }
  }

  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), viewport: '390x844', routes: report }, null, 2))

  const failed = report.filter((r) => r.violations.length)
  console.log(`\nqa_narrow：${report.length - failed.length}/${report.length} 路由通过（390px 溢出≤${MAX_OVERFLOW_PX}px + 页头≤${MAX_HEADER_ACTIONS}件 + 视口自检）`)
  if (STRICT && failed.length) process.exit(1)
}

main().catch((e) => { console.error('qa_narrow 运行失败：', e.message || e); process.exit(1) })
