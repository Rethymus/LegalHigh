// 一次性视觉验收辅助：对 /data-sources 的「来源登记册」卡片做分区视口截图
// （judge 复核用——整页截图纵横比过大导致文本不可辨读；qa_shots 全页照常）。
// 只读：不写任何数据。用法：node scripts/shot_sections.mjs
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const OUT = '../docs/qa-evidence'
const PORT = 9333
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const getJson = async (path) => (await fetch(`http://127.0.0.1:${PORT}${path}`)).json()

const profile = mkdtempSync(join(tmpdir(), 'lh-shot-'))
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=' + profile, '--disable-gpu', '--window-size=1440,900', 'about:blank',
], { stdio: 'ignore' })

const send = (ws, id, method, params = {}) => new Promise((resolve, reject) => {
  const onMsg = (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id !== id) return
    ws.removeEventListener('message', onMsg)
    if (m.error) reject(new Error(method + ': ' + JSON.stringify(m.error)))
    else resolve(m.result)
  }
  ws.addEventListener('message', onMsg)
  ws.send(JSON.stringify({ id, method, params }))
})

try {
  let targets
  for (let i = 0; i < 30; i++) { await sleep(500); try { targets = await getJson('/json'); if (targets.length) break } catch { /* retry */ } }
  if (!targets) throw new Error('Chrome 未启动')
  const page = targets.find((t) => t.type === 'page')
  const ws = new globalThis.WebSocket(page.webSocketDebuggerUrl)
  await new Promise((r) => ws.addEventListener('open', r))
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data)
    if (m.method === 'Runtime.exceptionThrown') console.log('EXC:', JSON.stringify(m.params.exceptionDetails).slice(0, 300))
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') console.log('ERR:', JSON.stringify(m.params.args).slice(0, 200))
  })
  let id = 0
  await send(ws, ++id, 'Page.enable')
  await send(ws, ++id, 'Runtime.enable')
  // 与 qa_shots 同款：先以 about:blank 源预置视图偏好，避免首次使用选择页
  await send(ws, ++id, 'Page.navigate', { url: 'http://localhost:5173/' })
  await sleep(800)
  await send(ws, ++id, 'Runtime.evaluate', { expression: `localStorage.setItem('lh:audience:v3', JSON.stringify({ mode: 'public' }))` })
  await send(ws, ++id, 'Page.navigate', { url: 'http://localhost:5173/data-sources' })
  // 等登记册卡片出现（vite 冷 transform 可能慢）
  let found = false
  for (let i = 0; i < 60; i++) {
    await sleep(500)
    const r = await send(ws, ++id, 'Runtime.evaluate', { expression: `(document.title || '') + '|' + document.readyState + '|root:' + (document.getElementById('root')?.innerHTML.length ?? -1) + '|' + [...document.querySelectorAll('.card-h-t')].map((e) => e.textContent.slice(0, 12)).join(',')`, returnByValue: true })
    if (i % 5 === 0) console.log('poll', i, String(r.result.value).slice(0, 90))
    if (String(r.result.value).includes('来源登记册')) { found = true; break }
  }
  if (!found) throw new Error('来源登记册卡片未渲染')
  await sleep(1200) // 字体/骨架安定
  // 卡片顶部对齐视口，拍 3 屏（14 行来源约两屏半）
  const rect = await send(ws, ++id, 'Runtime.evaluate', {
    expression: `(() => { const h = [...document.querySelectorAll('.card-h-t')].find((e) => e.textContent.includes('来源登记册')); const card = h.closest('section.card'); const sc = document.querySelector('.content'); const top = card.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop; return { top, height: card.getBoundingClientRect().height }; })()`,
    returnByValue: true,
  }).then((r) => r.result.value)
  for (let i = 0; i < 3; i++) {
    // .content 是内部滚动容器（window.scrollTo 无效——R17 已知坑），必须滚它
    await send(ws, ++id, 'Runtime.evaluate', { expression: `document.querySelector('.content').scrollTop = ${Math.max(0, rect.top - 8 + i * 860)}` })
    await sleep(400)
    const shot = await send(ws, ++id, 'Page.captureScreenshot', { format: 'png' })
    const file = join(OUT, `r164-registry-section${i + 1}.png`)
    writeFileSync(file, Buffer.from(shot.data, 'base64'))
    console.log('saved', file)
  }
  console.log('卡片高度:', Math.round(rect.height))
} finally {
  chrome.kill()
}
