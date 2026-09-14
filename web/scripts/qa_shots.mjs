// 长周期查漏补缺工具：无头 Chrome CDP 巡检脚本
// 用法：node scripts/qa_shots.mjs [--base http://localhost:5173] [--out ../../docs/qa-evidence] [--only name1,name2] [--strict]
// --strict：任一路由存在 console 错误/页面异常/失败请求即退出码 1（CI 门）；默认仅报告。
// 产物：每路由 PNG 截图 + report.json（console 错误 / 失败请求 / 页面异常）
// 纪律：默认巡检只读。只有同时传入 --write-e2e --isolated-db 才执行创建式 E2E；
//       调用方必须把后端指向唯一临时 LH_DB_PATH，脚本不签发、不批注终态。
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
const OUT = resolve(__dirname, arg('out', '../../docs/qa-evidence'))
const ONLY = arg('only', '') ? arg('only', '').split(',') : null
const STRICT = args.includes('--strict')
const WRITE_E2E = args.includes('--write-e2e')
if (WRITE_E2E && !args.includes('--isolated-db')) {
  throw new Error('写入式 E2E 必须同时传入 --isolated-db，并确保后端使用唯一临时 LH_DB_PATH')
}
const CHROME = arg('chrome', 'C:/Program Files/Google/Chrome/Application/chrome.exe')
let PORT = Number(arg('cdp-port', '0'))
if (!Number.isInteger(PORT) || PORT < 0 || PORT > 65535) throw new Error('--cdp-port 必须是 0–65535 的整数')

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

// ---- 巡检路由表（与 App.tsx 一一对应；新增路由必须登记） ----
// steps: {t:'eval', expr} | {t:'wait', ms} | {t:'shot', name, fullPage?}
// identity: 页面身份断言。仅“有画面”不能证明路由正确；选择器和可选文本必须匹配。
const pageHeader = (text) => ({ selector: '.ph-t', text })
const dashboardIdentity = { selector: '.hero-t', text: '让法律更有温度' }
const searchResultsIdentity = { selector: 'input[aria-label="修改检索词"]' }
const needsIdentity = pageHeader('事实与证据梳理')
const lawDetailIdentity = pageHeader('《民法典》第二十五条')
const contractIdentity = pageHeader('新合同审查')
const ROUTES = [
  { name: '00-first-use-audience', path: '/', audience: 'none', fullPage: true, identity: { selector: '#audience-title', text: '选择适合你的使用视图' } },
  { name: '00b-first-use-select-public', path: '/', audience: 'none', fullPage: true, identity: dashboardIdentity, afterText: '事实与证据梳理', steps: [
    { t: 'eval', expr: `(() => { const b=[...document.querySelectorAll('.audience-card')].find(x=>x.textContent.includes('普通民众')); if(!b)return 'no-public-choice'; b.click(); return 'selected-public' })()` },
    { t: 'wait', ms: 500 },
    { t: 'eval', expr: `localStorage.getItem('lh:audience:v3')?.includes('public') ? 'preference-persisted' : 'failed-preference-persistence'` },
  ] },
  { name: '00c-corrupt-audience-recovers', path: '/', audience: 'corrupt', identity: { selector: '#audience-title', text: '选择适合你的使用视图' } },
  { name: '00d-first-use-audience-narrow', path: '/', audience: 'none', viewport: { width: 390, height: 844 }, fullPage: true, identity: { selector: '#audience-title', text: '选择适合你的使用视图' } },
  { name: '01-dashboard', path: '/', fullPage: true, identity: dashboardIdentity },
  { name: '02-dashboard-dark', path: '/', dark: true, identity: dashboardIdentity },
  { name: '03-needs', path: '/needs', fullPage: true, identity: needsIdentity },
  { name: '04-needs-run', path: '/needs', audience: 'public', fullPage: true, identity: needsIdentity, afterText: '可能涉及的问题方向', steps: [
    // 六步向导：填核心事件 → 连续下一步 → 形成求助准备单并检索
    { t: 'eval', expr: `(() => { const ta = document.querySelector('textarea.ta'); if (!ta) return 'no-textarea'; const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set; set.call(ta, '老板拖欠我三个月工资还不给离职证明'); ta.dispatchEvent(new Event('input', {bubbles:true})); return 'ok' })()` },
    { t: 'eval', expr: `(() => { const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('下一步')); if (!btn) return 'no-btn'; btn.click(); return 'clicked' })()` },
    { t: 'wait', ms: 250 },
    { t: 'eval', expr: `(() => { const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('下一步')); if (!btn) return 'no-btn'; btn.click(); return 'clicked' })()` },
    { t: 'wait', ms: 250 },
    { t: 'eval', expr: `(() => { const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('下一步')); if (!btn) return 'no-btn'; btn.click(); return 'clicked' })()` },
    { t: 'wait', ms: 250 },
    { t: 'eval', expr: `(() => { const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('下一步')); if (!btn) return 'no-btn'; btn.click(); return 'clicked' })()` },
    { t: 'wait', ms: 250 },
    { t: 'eval', expr: `(() => { const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('下一步')); if (!btn) return 'no-btn'; btn.click(); return 'clicked' })()` },
    { t: 'wait', ms: 250 },
    { t: 'eval', expr: `(() => { const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('形成求助准备单并检索')); if (!btn) return 'no-btn'; btn.click(); return 'clicked' })()` },
    { t: 'wait', ms: 2500 },
    { t: 'eval', expr: `(document.body.innerText||'').includes('证据约束研究') ? 'failed-public-research-link' : 'public-needs-ok'` },
  ] },
  { name: '04b-case-analysis-run', path: '/case-analysis', fullPage: true, identity: pageHeader('请求权要件检查'), afterText: '消费欺诈·惩罚性赔偿请求权', steps: [
    { t: 'eval', expr: `(() => {
      const select = document.querySelector('select.sel'); const ta = document.querySelector('textarea.ta');
      if (!select || !ta) return 'no-fields';
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, 'consumer_fraud');
      select.dispatchEvent(new Event('change', {bubbles:true}));
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, '我在网络商店购买商品，收到后发现宣传与实物不符，商家拒绝退货退款；我保存了订单、付款记录和双方聊天记录，具体损失金额仍待核对。');
      ta.dispatchEvent(new Event('input', {bubbles:true})); return 'ok';
    })()` },
    { t: 'wait', ms: 200 },
    { t: 'eval', expr: `(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('运行要件检查')); if(!b || b.disabled) return 'no-enabled-run'; b.click(); return 'clicked' })()` },
    { t: 'wait', ms: 2500 },
  ] },
  { name: '05-search-home', path: '/search', identity: pageHeader('法律检索') },
  { name: '06-search-results', path: '/search/results?q=' + encodeURIComponent('试用期 一年'), fullPage: true, identity: searchResultsIdentity },
  { name: '07-law-detail', path: '/laws/civl-2020?art=25', fullPage: true, identity: lawDetailIdentity },
  { name: '07b-law-detail-professional-evidence', path: '/laws/pipl-2021?art=13', fullPage: true, identity: pageHeader('《个人信息保护法》第十三条'), afterText: '校准正确率：暂无' },
  { name: '08-laws-browse', path: '/laws', identity: pageHeader('法规条文') },
  { name: '09-case-search', path: '/cases', fullPage: true, identity: pageHeader('案例检索') },
  { name: '10-case-detail-cn', path: '/cases/guidance-24', fullPage: true, identity: { selector: '.case-t', text: '荣宝英诉王阳' } },
  { name: '10b-case-detail-defense', path: '/cases/guidance-93', fullPage: true, identity: { selector: '.case-t', text: '于欢故意伤害案' } },
  { name: '10c-case-detail-labor', path: '/cases/guidance-18', fullPage: true, identity: { selector: '.case-t', text: '中兴通讯（杭州）' } },
  { name: '11-case-detail-foreign', path: '/cases/brown-v-board', fullPage: true, identity: { selector: '.case-t', text: '布朗诉教育委员会案' } },
  { name: '12-research', path: '/research', fullPage: true, identity: pageHeader('法律研究') },
  { name: '13-research-run', path: '/research?q=' + encodeURIComponent('网购到假货可以核对哪些现行法条'), fullPage: true, identity: { selector: '.ph-t' }, afterText: 'Research Question', steps: [
    { t: 'wait', ms: 3000 },
  ] },
  { name: '14-contracts', path: '/contracts', identity: pageHeader('合同审查') },
  { name: '15-contract-review', path: '/contracts/new', fullPage: true, identity: contractIdentity },
  ...(WRITE_E2E ? [{ name: '16-contract-review-run', path: '/contracts/new', fullPage: true, identity: { selector: '.ph-t' }, afterText: 'Risk Inspector', steps: [
    { t: 'eval', expr: `(() => {
      const title = document.querySelector('input[aria-label="合同名称"]');
      const body = document.querySelector('textarea[aria-label="合同文本"]');
      if (!title || !body) return 'no-contract-fields';
      const inputSet = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      const textSet = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      // 各自原型上的 setter 必须与元素标签匹配：混用（如用 input 的 setter 写 textarea）
      // 不会抛错但对 React 受控组件无效——曾使 write-E2E 静默空转（2026-09-05 R18 定位）。
      if (!(title instanceof HTMLInputElement) || !(body instanceof HTMLTextAreaElement)) return 'bad-element-types';
      inputSet.call(title, 'QA 隔离数据库合同审查');
      title.dispatchEvent(new Event('input', { bubbles: true }));
      textSet.call(body, '合同测试输入（仅写入本次唯一临时数据库）。第一条 服务费用由双方另行约定。第二条 任何情况下服务方赔偿责任不超过已收费用的百分之十。第三条 收款账户以书面通知为准。');
      body.dispatchEvent(new Event('input', { bubbles: true }));
      return title.value && body.value.length > 30 ? 'ok' : 'set-did-not-stick';
    })()` },
    { t: 'eval', expr: `(() => { const btn = [...document.querySelectorAll('button')].find(b => /发起规则审查/.test(b.textContent)); if (!btn) return 'no-btn'; btn.click(); return 'clicked' })()` },
    { t: 'wait', ms: 3000 },
  ] }] : []),
  { name: '17-compare', path: '/compare', identity: pageHeader('合同版本对比') },
  { name: '18-draft', path: '/draft', fullPage: true, identity: { selector: '.ph-t' } },
  { name: '19-draft-validation', path: '/draft/validation', fullPage: true, identity: pageHeader('交付前校验') },
  { name: '20-comparative', path: '/comparative', fullPage: true, identity: pageHeader('跨法域对比') },
  { name: '21-learning', path: '/learning', audience: 'student', fullPage: true, identity: pageHeader('学习中心') },
  { name: '22-workspace', path: '/workspace', fullPage: true, identity: pageHeader('专业工具工作台') },
  { name: '23-collections', path: '/collections', identity: pageHeader('我的收藏') },
  { name: '24-data-sources', path: '/data-sources', fullPage: true, identity: pageHeader('当前数据与证据来源') },
  { name: '25-audit', path: '/audit', fullPage: true, identity: pageHeader('历史记录与操作审计') },
  { name: '26-settings', path: '/settings', fullPage: true, identity: pageHeader('设置') },
  { name: '28-narrow-needs', path: '/needs', viewport: { width: 390, height: 844 }, fullPage: true, identity: needsIdentity },
  { name: '29-narrow-dashboard', path: '/', viewport: { width: 390, height: 844 }, identity: dashboardIdentity },
  { name: '30-narrow-nav-open', path: '/', viewport: { width: 390, height: 844 }, identity: dashboardIdentity, afterSelector: '.app.sb-mobile-open .sb', steps: [
    { t: 'eval', expr: `(() => { const b = document.querySelector('.tb-icon'); if (!b) return 'no-btn'; b.click(); return 'clicked' })()` },
    { t: 'wait', ms: 600 },
  ] },
  { name: '31-narrow-search-results', path: '/search/results?q=' + encodeURIComponent('试用期'), viewport: { width: 390, height: 844 }, fullPage: true, identity: searchResultsIdentity },
  { name: '32-narrow-law-detail', path: '/laws/civl-2020?art=25', viewport: { width: 390, height: 844 }, fullPage: true, identity: lawDetailIdentity },
  { name: '33-narrow-contract-review', path: '/contracts/new', viewport: { width: 390, height: 844 }, fullPage: true, identity: contractIdentity },
  // 暗色回归组（D7 后文本色/语义色调整的重点验证面）
  { name: '34-dark-search-results', path: '/search/results?q=' + encodeURIComponent('试用期'), dark: true, fullPage: true, identity: searchResultsIdentity },
  { name: '35-dark-law-detail', path: '/laws/civl-2020?art=25', dark: true, fullPage: true, identity: lawDetailIdentity },
  { name: '36-dark-contract-review', path: '/contracts/new', dark: true, fullPage: true, identity: contractIdentity },
  { name: '37-dark-audit', path: '/audit', dark: true, fullPage: true, identity: pageHeader('历史记录与操作审计') },
  { name: '38-public-dashboard', path: '/', audience: 'public', fullPage: true, identity: dashboardIdentity, afterText: '事实与证据梳理', steps: [
    { t: 'eval', expr: `(() => { const n=document.querySelector('.sb-nav')?.innerText||''; return n.includes('法律检索')&&n.includes('案例检索')&&!n.includes('合同审查')&&!n.includes('文书工具')&&!n.includes('专业工作台') ? 'public-nav-ok' : 'failed-public-nav' })()` },
  ] },
  { name: '39-public-draft-guard', path: '/draft', audience: 'public', identity: { selector: '.access-notice h1', text: '未在普通民众视图中开放' } },
  { name: '40-student-dashboard', path: '/', audience: 'student', fullPage: true, identity: dashboardIdentity, afterText: '学习中心', steps: [
    { t: 'eval', expr: `(() => { const n=document.querySelector('.sb-nav')?.innerText||''; return n.includes('学习中心')&&n.includes('法律检索')&&n.includes('案例检索')&&!n.includes('合同审查')&&!n.includes('文书工具') ? 'student-nav-ok' : 'failed-student-nav' })()` },
  ] },
  { name: '40b-public-settings', path: '/settings', audience: 'public', fullPage: true, identity: pageHeader('设置'), afterText: '内容与工具视图', forbidPaths: ['/api/ai/providers', '/api/session'], steps: [
    { t: 'eval', expr: `(() => { const sections=document.querySelector('.st-nav')?.innerText||''; const body=document.body.innerText||''; return !sections.includes('AI 模型')&&!body.includes('本机服务令牌')&&!body.includes('前往工作台') ? 'public-settings-ok' : 'failed-public-settings' })()` },
  ] },
  { name: '40c-public-law-detail', path: '/laws/civl-2020?art=25', audience: 'public', identity: lawDetailIdentity, steps: [
    { t: 'eval', expr: `(document.body.innerText||'').includes('基于本条研究') ? 'failed-public-law-research-link' : 'public-law-ok'` },
  ] },
  { name: '40d-public-case-detail', path: '/cases/guidance-24', audience: 'public', identity: { selector: '.case-t', text: '荣宝英诉王阳' }, steps: [
    { t: 'eval', expr: `(document.body.innerText||'').includes('基于本案研究') ? 'failed-public-case-research-link' : 'public-case-ok'` },
  ] },
  { name: '40e-public-collections', path: '/collections', audience: 'public', setupSource: `localStorage.setItem('lh:research:list', JSON.stringify([{rid:'r-local-check',question:'不应在公众视图显示的本机研究',ts:'2026-09-08T00:00:00Z'}]));`, identity: pageHeader('我的收藏'), steps: [
    { t: 'eval', expr: `(() => { const body=document.body.innerText||''; return !body.includes('不应在公众视图显示的本机研究')&&![...document.querySelectorAll('.lrow-t')].some(x=>x.textContent==='研究') ? 'public-collections-ok' : 'failed-public-collections' })()` },
  ] },
  { name: '45-law-versions', path: '/laws/cl-2023?art=287之一', identity: pageHeader('《刑法（2023修正）》第二百八十七条之一'), steps: [
    { t: 'eval', expr: `(() => { const btn=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('版本对比')); if(!btn) return 'no-version-tab'; btn.click(); return 'clicked' })()` },
    { t: 'wait', ms: 400 },
    { t: 'eval', expr: `(() => { const b=document.body.innerText||''; return b.includes('版本注册表') && b.includes('2021 第四次修正') && b.includes('现行有效') ? 'versions-ok' : 'versions-missing' })()` },
  ] },
  { name: '45b-law-versions-single', path: '/laws/pipl-2021?art=26', identity: pageHeader('《个人信息保护法》第二十六条'), steps: [
    { t: 'eval', expr: `(() => { const btn=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('版本对比')); if(!btn) return 'no-version-tab'; btn.click(); return 'clicked' })()` },
    { t: 'wait', ms: 400 },
    { t: 'eval', expr: `(() => { const b=document.body.innerText||''; return b.includes('暂无已采集历史版本') && !b.includes('待历史版本库建立') ? 'single-version-ok' : 'single-version-stale' })()` },
  ] },
  { name: '44-quality', path: '/quality', fullPage: true, identity: pageHeader('质量透明度'), afterText: '不是法律正确率', steps: [
    { t: 'eval', expr: `(() => { const stats=[...document.querySelectorAll('.stat')]; return stats.length >= 4 ? 'quality-stats-ok' : 'quality-stats-short:'+stats.length })()` },
  ] },
  { name: '43-terms', path: '/terms', fullPage: true, identity: pageHeader('术语卡'), afterText: '不是法律意见', steps: [
    { t: 'eval', expr: `(() => { const links=[...document.querySelectorAll('a')].filter(x=>x.getAttribute('href')?.includes('/laws/')); return links.length >= 50 ? 'term-refs-ok' : 'term-refs-short:'+links.length })()` },
  ] },
  { name: '42-guide', path: '/guide', fullPage: true, identity: pageHeader('使用指南'), afterText: '它不是律师事务所', steps: [
    { t: 'eval', expr: `(() => { const imgs=[...document.images].filter(i=>i.src.includes('/guide/')); return imgs.length >= 6 ? 'guide-media-ok' : 'guide-media-missing:'+imgs.length })()` },
  ] },
  { name: '41-settings-switch-professional', path: '/settings', audience: 'public', identity: pageHeader('设置'), steps: [
    { t: 'eval', expr: `(() => { const s=[...document.querySelectorAll('select')].find(x=>[...x.options].some(o=>o.value==='professional')); if(!s)return 'no-audience-select'; Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'professional'); s.dispatchEvent(new Event('change',{bubbles:true})); return 'changed-professional' })()` },
    { t: 'wait', ms: 400 },
    { t: 'eval', expr: `(() => { const n=document.querySelector('.sb-nav')?.innerText||''; return n.includes('合同审查')&&n.includes('文书工具')&&n.includes('专业工作台') ? 'switch-nav-ok' : 'failed-switch-nav' })()` },
  ] },
]

// ---- CDP 最小客户端 ----
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

async function main() {
  mkdirSync(OUT, { recursive: true })
  const chromeProfile = mkdtempSync(join(tmpdir(), 'legalhigh-qa-chrome-'))
  if (PORT === 0) PORT = await allocateLoopbackPort()
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`, '--no-first-run', '--no-default-browser-check',
    '--user-data-dir=' + chromeProfile, '--disable-gpu', 'about:blank',
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
      // 预热轮询：vite 冷启动按需转换可能远超固定等待；等到根节点真实渲染再开始巡检，
      // 避免首路由截图定格在样式半应用状态（2026-09-05 曾因此误报侧栏异常）。
      for (let i = 0; i < 40; i++) {
        await sleep(500)
        try {
          const r = await c0.send('Runtime.evaluate', { expression: `document.readyState === 'complete' && (document.querySelector('#root')?.textContent || '').length > 40`, returnByValue: true })
          if (r.result?.value) break
        } catch { /* tab gone: fall through */ }
      }
      ws0.close()
      await getJson(`/json/close/${t0.id}`).catch(() => {})
    }
    const report = []
    for (const route of ROUTES) {
      if (ONLY && !ONLY.includes(route.name)) continue
      const entry = { name: route.name, path: route.path, consoleErrors: [], consoleWarnings: [], pageErrors: [], failedRequests: [] }
      const t = await getJson(`/json/new?${encodeURIComponent('about:blank')}`, 'PUT')
      const ws = globalThis.WebSocket
        ? new globalThis.WebSocket(t.webSocketDebuggerUrl)
        : new (await import('node:ws')).default(t.webSocketDebuggerUrl)
      await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })
      const cdp = new Cdp(ws)
      const logs = []
      const responseUrls = []
      cdp.on((m) => {
        if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type))
          logs.push({ kind: m.params.type, text: m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 500) })
        if (m.method === 'Runtime.exceptionThrown')
          logs.push({ kind: 'pageError', text: (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text || '').slice(0, 500) })
        if (m.method === 'Log.entryAdded' && ['error', 'warning'].includes(m.params.entry.level))
          logs.push({ kind: m.params.entry.level === 'error' ? 'logError' : 'logWarn', text: `${m.params.entry.source}: ${m.params.entry.text}`.slice(0, 500) })
        if (m.method === 'Network.responseReceived') {
          responseUrls.push(m.params.response.url)
          if (m.params.response.status >= 400) logs.push({ kind: 'http', text: `${m.params.response.status} ${m.params.response.url}` })
        }
        if (m.method === 'Network.loadingFailed' && !m.params.canceled)
          logs.push({ kind: 'netFail', text: `${m.params.errorText} ${m.params.type}` })
      })
      await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Log.enable'); await cdp.send('Network.enable')
      const vp = route.viewport ?? { width: 1440, height: 900 }
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: vp.width < 700 })
      // 在目标文档脚本执行前设置外观；不再故意访问 robots.txt（线上没有该文件时会制造假 404）。
      // 本机管理令牌从环境变量读取（与已启动的后端同一值），注入 sessionStorage；
      // 未设置时敏感端点按设计返回 503，巡检会如实记录（这是诚实行为，不是工具缺陷）。
      await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
        source: `try { localStorage.setItem('le-tone-override', '${route.dark ? 'dark' : 'auto'}'); ${route.audience === 'none'
          ? `localStorage.removeItem('lh:audience:v3');`
          : route.audience === 'corrupt'
            ? `localStorage.setItem('lh:audience:v3', '{bad-json');`
            : `localStorage.setItem('lh:audience:v3', JSON.stringify({mode:${JSON.stringify(route.audience ?? 'professional')}}));`}${route.setupSource ?? ''}${
          process.env.LH_ADMIN_TOKEN ? ` sessionStorage.setItem('lh:admin-token:v1', ${JSON.stringify(process.env.LH_ADMIN_TOKEN)});` : ''
        } } catch {}`,
      })
      await cdp.send('Page.navigate', { url: BASE + route.path })
      await sleep(1600)
      let sn = 0
      for (const s of route.steps ?? []) {
        if (s.t === 'eval') {
          const r = await cdp.send('Runtime.evaluate', { expression: s.expr, returnByValue: true })
          const value = r.result?.value
          if (value !== undefined) entry[`step${++sn}`] = value
          if (typeof value === 'string' && /^(no-|error|failed)/i.test(value))
            entry.pageErrors.push(`interaction step failed: ${value}`)
        }
        if (s.t === 'wait') await sleep(s.ms)
      }
      await sleep(route.steps ? 400 : 900)

      // 全页截图：先把视口长高到内容高度再普通截图。两个坑（2026-09-05 定位）：
      // ① 不要用 captureBeyondViewport——该路径会以不同视口重排，把 flex 侧栏压窄；
      // ② .content 是内部滚动容器，document.scrollHeight 恒等于视口高，必须量
      //    .content 本身，否则所有「全页」截图实际只截到首屏。
      if (route.fullPage) {
        const h = await cdp.send('Runtime.evaluate', {
          expression: `(document.querySelector('.content')?.scrollHeight || document.documentElement.scrollHeight)`,
          returnByValue: true,
        })
        // 视口高 = 内容高 + 铬层补偿（tb 54 + margin/padding ≈ 66），另留安全余量
        const contentH = Math.max(900, Math.min((Number(h.result?.value) || 900) + 130, 20000))
        if (contentH > vp.height) {
          await cdp.send('Emulation.setDeviceMetricsOverride', { width: vp.width, height: contentH, deviceScaleFactor: 1, mobile: vp.width < 700 })
          await sleep(300)
        }
      }
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })

      // 页面身份 + URL + 标题 + 空白页/框架错误层。此前仅截图非空，曾把所有深链回落首页误判为通过。
      const identitySpec = JSON.stringify(route.identity ?? null)
      const afterSelector = JSON.stringify(route.afterSelector ?? null)
      const stateResult = await cdp.send('Runtime.evaluate', {
        expression: `(() => {
          const spec = ${identitySpec};
          const identity = spec ? document.querySelector(spec.selector) : null;
          const after = ${afterSelector};
          const root = document.querySelector('#root');
          return {
            href: location.href,
            title: document.title,
            rootTextLength: (root?.textContent || '').trim().length,
            identityFound: spec ? !!identity : true,
            identityText: identity?.textContent?.trim() || '',
            afterSelectorFound: after ? !!document.querySelector(after) : true,
            afterTextFound: ${JSON.stringify(route.afterText ?? null)} ? (document.body?.innerText || '').includes(${JSON.stringify(route.afterText ?? '')}) : true,
            hasFrameworkOverlay: !!document.querySelector('vite-error-overlay, nextjs-portal'),
          };
        })()`,
        returnByValue: true,
      })
      const state = stateResult.result?.value ?? {}
      entry.finalUrl = state.href ?? ''
      entry.title = state.title ?? ''
      const expectedPath = new URL(BASE + route.path).pathname
      let actualPath = ''
      try { actualPath = new URL(entry.finalUrl).pathname } catch { /* recorded below */ }
      if (actualPath !== expectedPath) entry.pageErrors.push(`page URL mismatch: expected ${expectedPath}, got ${actualPath || entry.finalUrl}`)
      if (!/LegalHigh/i.test(entry.title)) entry.pageErrors.push(`page title mismatch: ${entry.title || '(empty)'}`)
      if (!state.rootTextLength) entry.pageErrors.push('blank page: #root has no meaningful text')
      if (state.hasFrameworkOverlay) entry.pageErrors.push('framework error overlay is visible')
      if (!state.identityFound) entry.pageErrors.push(`page identity selector missing: ${route.identity?.selector}`)
      if (route.identity?.text && !String(state.identityText).includes(route.identity.text))
        entry.pageErrors.push(`page identity mismatch: expected "${route.identity.text}", got "${state.identityText}"`)
      for (const path of route.forbidPaths ?? []) {
        if (responseUrls.some((url) => url.includes(path))) entry.pageErrors.push(`forbidden request observed: ${path}`)
      }
      if (!state.afterSelectorFound) entry.pageErrors.push(`post-interaction selector missing: ${route.afterSelector}`)
      if (!state.afterTextFound) entry.pageErrors.push(`post-interaction text missing: ${route.afterText}`)

      for (const l of logs) {
        if (l.kind === 'error' || l.kind === 'logError') entry.consoleErrors.push(l.text)
        else if (l.kind === 'pageError') entry.pageErrors.push(l.text)
        else if (l.kind === 'http' || l.kind === 'netFail') entry.failedRequests.push(l.text)
        else entry.consoleWarnings.push(l.text)
      }
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
    await sleep(300)
    try { rmSync(chromeProfile, { recursive: true, force: true }) } catch { /* Chrome 仍在释放文件句柄时由系统临时目录回收 */ }
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
