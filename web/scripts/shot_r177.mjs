// R177 一次性视觉取证：/quality 检索评测卡新增 Recall@20 / nDCG@10（评审复核用）。
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const OUT = '../docs/qa-evidence'
const PORT = 9339
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
const evalJs = async (ws, n, expression) =>
  (await send(ws, ++n.n, 'Runtime.evaluate', { expression, returnByValue: true })).result.value

try {
  let targets
  for (let i = 0; i < 30; i++) { await sleep(500); try { targets = await getJson('/json'); if (targets.length) break } catch { /* retry */ } }
  if (!targets) throw new Error('Chrome 未启动')
  const ws = new globalThis.WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl)
  await new Promise((r) => ws.addEventListener('open', r))
  const n = { n: 0 }
  await send(ws, ++n.n, 'Page.enable')
  await send(ws, ++n.n, 'Runtime.enable')
  await send(ws, ++n.n, 'Page.navigate', { url: 'http://localhost:5173/' })
  await sleep(800)
  await evalJs(ws, n, `localStorage.setItem('lh:audience:v3', JSON.stringify({ mode: 'public' }))`)
  await send(ws, ++n.n, 'Page.navigate', { url: 'http://localhost:5173/quality' })
  for (let i = 0; i < 60; i++) { await sleep(500); if (await evalJs(ws, n, `document.body.innerText.includes('Recall@20')`)) break }
  await sleep(600)
  await evalJs(ws, n, `(() => { const h = [...document.querySelectorAll('.card-h-t')].find((e) => e.textContent.includes('检索评测')); const card = h.closest('section.card'); const sc = document.querySelector('.content'); sc.scrollTop = card.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - 150; return 'ok' })()`)
  await sleep(400)
  const s = await send(ws, ++n.n, 'Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(OUT, 'r177-quality-metrics.png'), Buffer.from(s.data, 'base64'))
  console.log('saved r177-quality-metrics.png')
} finally {
  chrome.kill()
}
