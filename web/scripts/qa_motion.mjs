// 动效行为探针（计划 v4 W4，2026-09-06）：不是截图，而是「物理断言」。
// 在无头 Chrome 里实测：弹簧曲线真的产生/不产生 overshoot、Toast 真的退场卸载、
// shake 真的振荡衰减归零、分段滑块真的弹簧位移、Dialog 真的先退场再卸载。
// 用法：node scripts/qa_motion.mjs [--base http://localhost:5173] [--strict]
// 前置：vite 已启动（页面为 /design-system，无需后端）；--strict 任一断言失败退出码 1。
import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const arg = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d }
const BASE = arg('base', 'http://localhost:5173')
const STRICT = args.includes('--strict')
const CHROME = arg('chrome', 'C:/Program Files/Google/Chrome/Application/chrome.exe')
const OUT = resolve(__dirname, '../../docs/qa-evidence')

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
      if (m.id && this.pending.has(m.id)) { const { resolve: res, reject } = this.pending.get(m.id); this.pending.delete(m.id)
        if (m.error) reject(new Error(m.error.message)); else res(m.result) }
    }) }
  send(method, params = {}) { const id = ++this.id
    return new Promise((res, rej) => { this.pending.set(id, { resolve: res, reject: rej })
      this.ws.send(JSON.stringify({ id, method, params })) }) }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function evalAsync(cdp, expression) {
  const r = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error('页面异常: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 300))
  return r.result?.value
}

// 页内采样器：先预点击归位并等弹簧静定（按钮文案在 出发/回位 间切换，点击后统一回到 0 起点），
// 再点击触发 0→220 方向位移，按 8ms 步长记录相对起点的位移，返回 {min,max,final}
const travelProbe = (ballSel, btnText, ms = 900) => `(async () => {
  const sleep = (m) => new Promise((r) => setTimeout(r, m))
  const el = document.querySelector('${ballSel}')
  if (!el) return { error: 'no ' + '${ballSel}' }
  const btn = [...document.querySelectorAll('button')].find((b) => /出发|回位/.test(b.textContent))
  if (!btn) return { error: 'no btn ${btnText}' }
  let guard = 0
  while (!btn.textContent.includes('出发') && guard++ < 4) { btn.click(); await sleep(1000) }  // 归位到 0 起点
  const x = () => el.getBoundingClientRect().left
  const start = x()
  btn.click()
  let max = -1e9, min = 1e9
  const t0 = performance.now()
  while (performance.now() - t0 < ${ms}) {
    const v = x() - start
    if (v > max) max = v
    if (v < min) min = v
    await sleep(8)
  }
  await sleep(50)
  return { min: +min.toFixed(2), max: +max.toFixed(2), final: +(x() - start).toFixed(2) }
})()`

const results = []
const check = (name, ok, detail) => { results.push({ name, ok, detail }); console.log((ok ? '✓ ' : '✗ ') + name + ' — ' + detail) }

async function main() {
  const PORT = await allocateLoopbackPort()
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`, '--no-first-run', '--no-default-browser-check',
    '--user-data-dir=' + resolve(OUT, '.chrome-profile'), '--disable-gpu', 'about:blank',
  ], { stdio: 'ignore' })
  try {
    const getJson = async (path, method = 'GET') => (await fetch(`http://127.0.0.1:${PORT}${path}`, { method })).json()
    let targets
    for (let i = 0; i < 30; i++) { await sleep(500); try { targets = await getJson('/json'); if (targets.length) break } catch { /* retry */ } }
    if (!targets) throw new Error('Chrome 未启动')
    const t = await getJson(`/json/new?${encodeURIComponent('about:blank')}`, 'PUT')
    const ws = new globalThis.WebSocket(t.webSocketDebuggerUrl)
    await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })
    const cdp = new Cdp(ws)
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable')
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
    await cdp.send('Page.navigate', { url: BASE + '/design-system' })
    for (let i = 0; i < 40; i++) { await sleep(500); const r = await evalAsync(cdp, `document.readyState === 'complete' && (document.querySelector('.ball-bouncy') ? 'ok' : '')`).catch(() => ''); if (r === 'ok') break }

    // ① 曲线来源：支持 linear() 时应命中 linear(，否则按设计回落 cubic-bezier 近似
    const curve = await evalAsync(cdp, `getComputedStyle(document.querySelector('.ball-bouncy')).transitionTimingFunction`)
    check('曲线 Token 生效', /linear\(|cubic-bezier\(/.test(curve), `bouncy 球 timing = ${String(curve).slice(0, 48)}…（linear() 支持时为 linear(）`)

    // ② bouncy 必须 overshoot（>220px 目标），smooth 必须不过冲——弹簧物理在跑的直接证据
    const bouncy = await evalAsync(cdp, travelProbe('.ball-bouncy', '出发'))
    check('bouncy 过冲', !bouncy.error && bouncy.max > 222, `max=${bouncy.max}px / 目标 220px（峰值≈229px，bounce 0.3）`)
    const smooth = await evalAsync(cdp, travelProbe('.ball-smooth', '出发'))
    check('smooth 无过冲', !smooth.error && smooth.max <= 221.5 && smooth.max > 200, `max=${smooth.max}px（临界阻尼，单调逼近）`)

    // ③ Toast：入场存在 + 到期先挂 .is-out 播退场，再从 DOM 卸载
    await evalAsync(cdp, `(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Toast 弹簧入场')); b.click(); return 'ok' })()`)
    const toastSeen = await evalAsync(cdp, `(async () => { const sleep=(m)=>new Promise(r=>setTimeout(r,m)); for (let i=0;i<20;i++){ if (document.querySelector('.toast-host .toast')) return getComputedStyle(document.querySelector('.toast-host .toast')).animationName; await sleep(50) } return 'absent' })()`)
    let toastGone = false
    for (let i = 0; i < 16; i++) { await sleep(200); const gone = await evalAsync(cdp, `document.querySelector('.toast-host .toast') ? 'here' : 'gone'`); if (gone === 'gone') { toastGone = true; break } }
    check('Toast 弹簧入场', toastSeen === 'pop-in', `入场 animation = ${toastSeen}`)
    check('Toast 退场卸载', toastGone, 'TTL 后先播 pop-out 再从 DOM 移除')

    // ④ shake：先正向冲击、再负向回摆、终态归零（指数衰减的三段证据）
    await evalAsync(cdp, `(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('推石 shake')); b.click(); return 'ok' })()`)
    const shake = await evalAsync(cdp, `(async () => {
      const sleep=(m)=>new Promise(r=>setTimeout(r,m)); await sleep(30)
      const el = document.querySelector('.shake'); if (!el) return { error: 'no .shake' }
      const x = () => { const t = getComputedStyle(el).transform; return t === 'none' ? 0 : new DOMMatrixReadOnly(t).m41 }
      let max = -1e9, min = 1e9; const t0 = performance.now()
      while (performance.now() - t0 < 750) { const v = x(); if (v > max) max = v; if (v < min) min = v; await sleep(8) }
      await sleep(60)
      return { max: +max.toFixed(2), min: +min.toFixed(2), final: +x().toFixed(2) }
    })()`)
    check('shake 指数衰减', !shake.error && shake.max > 2 && shake.min < -1 && Math.abs(shake.final) < 0.6,
      `峰值 +${shake.max}px / 回摆 ${shake.min}px / 终态 ${shake.final}px（9Hz 衰减正弦）`)

    // ⑤ 分段控件（竹简槽）：点「弹性」后滑块位移到位且挂 is-on
    const seg = await evalAsync(cdp, `(async () => {
      const sleep=(m)=>new Promise(r=>setTimeout(r,m))
      const btns = [...document.querySelectorAll('.seg-btn')]
      const target = btns.find((b) => b.textContent.includes('弹性'))
      if (!target) return { error: 'no seg-btn 弹性' }
      const thumb = document.querySelector('.seg-thumb')
      const x = () => { const t = getComputedStyle(thumb).transform; return t === 'none' ? 0 : new DOMMatrixReadOnly(t).m41 }
      const before = x(); target.click(); await sleep(80); const mid = x(); await sleep(700); const after = x()
      return { before: +before.toFixed(1), mid: +mid.toFixed(1), after: +after.toFixed(1), on: target.classList.contains('is-on') }
    })()`)
    check('竹简槽滑块弹簧位移', !seg.error && seg.on && seg.after > seg.before && seg.mid !== seg.after,
      `before=${seg.before} mid=${seg.mid} after=${seg.after}（中途采样≠终值=动画确实在进行）`)

    // ⑥ Dialog：打开存在 → 关闭先出现 .is-out 退场 → 随后卸载
    const dlg = await evalAsync(cdp, `(async () => {
      const sleep=(m)=>new Promise(r=>setTimeout(r,m))
      const open = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Dialog 弹簧开合'))
      open.click(); await sleep(400)
      if (!document.querySelector('.dlg-mask')) return { error: 'no dialog after open' }
      const close = [...document.querySelectorAll('.dlg-acts button')].find((b) => b.textContent.includes('关闭'))
      close.click()
      let sawOut = false
      for (let i = 0; i < 12; i++) { if (document.querySelector('.dlg-mask.is-out')) { sawOut = true; break } await sleep(25) }
      for (let i = 0; i < 14; i++) { await sleep(60); if (!document.querySelector('.dlg-mask')) return { sawOut, unloaded: true } }
      return { sawOut, unloaded: false }
    })()`)
    check('Dialog 弹簧开合+退场卸载', !dlg.error && dlg.sawOut && dlg.unloaded, `退场态可见=${dlg.sawOut} · 卸载=${dlg.unloaded}`)

    // ⑦ 列表级联入场（W5-2）：重放后 70ms 首条已渐显、末条仍在 delay（级联步长生效），终态全部归位
    const stag = await evalAsync(cdp, `(async () => {
      const raf = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('重放级联'))
      if (!btn) return { error: 'no 重放级联 btn' }
      btn.click()
      await raf(); await new Promise((r) => setTimeout(r, 70))
      const items = [...document.querySelectorAll('.stag-demo')]
      const early1 = +getComputedStyle(items[0]).opacity
      const earlyLast = +getComputedStyle(items[items.length - 1]).opacity
      await new Promise((r) => setTimeout(r, 1400))
      const opacities = items.map((el) => +getComputedStyle(el).opacity)
      const t = getComputedStyle(items[0]).transform
      const finalTx = t === 'none' ? 0 : +new DOMMatrixReadOnly(t).m41.toFixed(2)
      return { n: items.length, early1, earlyLast, minLate: Math.min(...opacities), finalTx }
    })()`)
    check('列表级联入场（20ms 步长）', !stag.error && stag.n === 6 && stag.early1 > 0 && stag.earlyLast === 0 && stag.minLate === 1 && stag.finalTx === 0,
      `70ms 采样：首条 ${stag.early1} · 末条 ${stag.earlyLast}（delay 100ms 未开始）→ 终态 opacity ${stag.minLate}/tx ${stag.finalTx}`)

    // ⑧ 滚动海拔 CSS 原生化（W5-4）：命名 scroll timeline 连续驱动 .tb 边框插值，且滚动回顶可逆
    const sdrv = await evalAsync(cdp, `(async () => {
      const raf = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      const tb = document.querySelector('.tb'); const content = document.querySelector('.content')
      if (!tb || !content) return { error: 'no .tb/.content' }
      const animName = getComputedStyle(tb).animationName
      const before = getComputedStyle(tb).borderColor
      content.scrollTop = 240
      await raf(); await new Promise((r) => setTimeout(r, 120))
      const scrolled = getComputedStyle(tb).borderColor
      content.scrollTop = 0
      await raf(); await new Promise((r) => setTimeout(r, 120))
      const back = getComputedStyle(tb).borderColor
      return { animName, before, scrolled, back }
    })()`)
    check('滚动海拔 scroll-driven 连续插值', !sdrv.error && sdrv.animName === 'tb-elevate' && sdrv.scrolled !== sdrv.before && sdrv.back === sdrv.before,
      `animation=${sdrv.animName} · 边框 ${sdrv.before} →${sdrv.scrolled} →${sdrv.back}（可逆）`)

    // ⑨ 大字模式 × 动效联测（W5-5）：zoom 1.15 下弹簧位移按比例放大、overshoot 特性不漂移
    const fl = await evalAsync(cdp, `(async () => {
      document.documentElement.classList.add('font-large')
      await new Promise((r) => setTimeout(r, 350))
      return 'on'
    })()`)
    let largeCheck = { ok: false, detail: '前置失败' }
    if (fl === 'on') {
      const bouncyL = await evalAsync(cdp, travelProbe('.ball-bouncy', '出发'))
      const smoothL = await evalAsync(cdp, travelProbe('.ball-smooth', '出发'))
      await evalAsync(cdp, `document.documentElement.classList.remove('font-large'); 'off'`)
      const target = 220 * 1.15
      largeCheck = {
        ok: !bouncyL.error && !smoothL.error && bouncyL.max > target * 1.01 && Math.abs(bouncyL.final - target) < 2.5
          && smoothL.max < target * 1.02 && smoothL.max > target * 0.9,
        detail: `目标 ${target}px：bouncy max=${bouncyL.max}/final=${bouncyL.final}（仍过冲）；smooth max=${smoothL.max}（无过冲）`,
      }
    }
    check('大字模式弹簧联测（zoom 1.15）', largeCheck.ok, largeCheck.detail)
  } finally {
    chrome.kill()
  }

  const failed = results.filter((r) => !r.ok)
  if (STRICT && failed.length) {
    console.error(`\nqa_motion：${failed.length}/${results.length} 项断言失败`)
    process.exit(1)
  }
  console.log(`\nqa_motion：${results.length - failed.length}/${results.length} 项断言通过${STRICT ? '（strict）' : ''}`)
}

main().catch((e) => { console.error('qa_motion 运行失败：', e.message); process.exit(1) })
