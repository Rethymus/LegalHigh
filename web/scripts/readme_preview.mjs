// README 视觉验证工具：本地渲染 GitHub 风格页面 → 无头 Chrome 实测居中对称性 → 全页截图。
// 用法：node scripts/readme_preview.mjs [--out ../../docs/qa-evidence/readme-visual]
// 断言：每个图片组（同 <p>/<div> 内的全部 <img>）与 H1 的水平中心，必须与正文容器中心对齐（误差 ≤3px）。
// 依据：GitHub 表格 CSS（display:block; width:max-content）会使 markdown 表格收缩靠左——
//       因此图片一律用 <p align="center"> + 百分比 <img>，本工具钉住这一纪律。
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const arg = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d }
const OUT = resolve(__dirname, arg('out', '../../docs/qa-evidence/readme-visual'))
const CHROME = arg('chrome', 'C:/Program Files/Google/Chrome/Application/chrome.exe')
const FILES = ['README.md', 'README.zh-CN.md', 'README.en.md']
const TOL = 3 // px

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/github-markdown-css@5.8.1/github-markdown-light.css">
<script src="https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js"></script>
<style>
  body { margin: 0; background: #fff; }
  .markdown-body { box-sizing: border-box; max-width: 980px; margin: 0 auto; padding: 32px 32px 64px; }
  img { max-width: 100%; }
</style></head><body>
<article class="markdown-body" id="doc"></article>
<script>
  window.renderDone = false
  const f = new URLSearchParams(location.search).get('f')
  fetch(f).then(r => r.text()).then(md => {
    document.getElementById('doc').innerHTML = marked.parse(md)
    return Promise.all([...document.images].map(i => i.decode().catch(() => {})))
  }).then(() => { window.renderDone = true })
</script></body></html>`

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

async function main() {
  mkdirSync(OUT, { recursive: true })
  const root = resolve(__dirname, '../..')
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    if (url.pathname === '/__preview.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(PAGE); return
    }
    const rel = decodeURIComponent(url.pathname).slice(1)
    try {
      const data = await readFile(join(root, rel))
      const ext = rel.endsWith('.css') ? 'text/css' : rel.endsWith('.js') ? 'text/javascript' : rel.endsWith('.gif') ? 'image/gif' : rel.endsWith('.svg') ? 'image/svg+xml' : rel.endsWith('.html') ? 'text/html' : rel.endsWith('.json') ? 'application/json' : 'image/png'
      res.writeHead(200, { 'content-type': `${ext}${ext.startsWith('image') ? '' : '; charset=utf-8'}` })
      res.end(data)
    } catch { res.writeHead(404); res.end() }
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const httpPort = server.address().port

  const chromeProfile = mkdtempSync(join(tmpdir(), 'legalhigh-preview-'))
  const cdpPort = 9700 + Math.floor(Math.random() * 200)
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${cdpPort}`, '--no-first-run', '--no-default-browser-check', '--user-data-dir=' + chromeProfile, '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
  let failed = false
  try {
    let targets
    for (let i = 0; i < 30; i++) { await sleep(500); try { targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json`)).json(); if (targets.length) break } catch { /* retry */ } }
    if (!targets) throw new Error('Chrome 未启动')

    for (const f of FILES) {
      const t = await (await fetch(`http://127.0.0.1:${cdpPort}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' })).json()
      const ws = new globalThis.WebSocket(t.webSocketDebuggerUrl)
      await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })
      const cdp = new Cdp(ws)
      await cdp.send('Page.enable'); await cdp.send('Runtime.enable')
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
      await cdp.send('Page.navigate', { url: `http://127.0.0.1:${httpPort}/__preview.html?f=${encodeURIComponent(f)}` })
      for (let i = 0; i < 90; i++) { await sleep(500); try { const r = await cdp.send('Runtime.evaluate', { expression: 'window.renderDone === true', returnByValue: true }); if (r.result?.value) break } catch { /* retry */ } }

      const diag = await cdp.send('Runtime.evaluate', {
        expression: `({ done: window.renderDone, html: document.getElementById('doc').innerHTML.length, marked: typeof marked, imgs: document.images.length, title: document.title })`,
        returnByValue: true,
      })
      console.log(`  diag ${f}: ${JSON.stringify(diag.result?.value)}`)
      const d = diag.result?.value ?? {}
      if (!d.done || d.imgs === 0 || d.marked === 'undefined') {
        console.error(`FAIL  ${f}: 页面未正常渲染（${JSON.stringify(d)}）`); failed = true
        ws.close(); await fetch(`http://127.0.0.1:${cdpPort}/json/close/${t.id}`).catch(() => {})
        continue
      }

      const metrics = await cdp.send('Runtime.evaluate', {
        expression: `(() => {
          const doc = document.getElementById('doc')
          const box = doc.getBoundingClientRect()
          const cx = box.left + box.width / 2
          const groups = []
          for (const el of doc.querySelectorAll('p, div')) {
            const imgs = [...el.querySelectorAll(':scope > img')]
            if (!imgs.length) continue
            const r0 = imgs[0].getBoundingClientRect(), r1 = imgs[imgs.length - 1].getBoundingClientRect()
            const gL = Math.min(...imgs.map(i => i.getBoundingClientRect().left))
            const gR = Math.max(...imgs.map(i => i.getBoundingClientRect().right))
            groups.push({ n: imgs.length, centerOffset: +(((gL + gR) / 2) - cx).toFixed(1), width: +((gR - gL) / box.width * 100).toFixed(1) })
          }
          const h1 = doc.querySelector('h1')
          const h1r = h1 ? h1.getBoundingClientRect() : null
          return { file: ${JSON.stringify(f)}, containerCenter: +cx.toFixed(1), h1Center: h1r ? +((h1r.left + h1r.width / 2)).toFixed(1) : null, groups, imgCount: doc.querySelectorAll('img').length }
        })()`,
        returnByValue: true,
      })
      const m = metrics.result?.value
      const h1Off = m.h1Center != null ? Math.abs(m.h1Center - m.containerCenter) : null
      const bad = m.groups.filter((g) => Math.abs(g.centerOffset) > TOL)
      const h1Bad = h1Off != null && h1Off > TOL
      const verdict = !bad.length && !h1Bad ? 'PASS' : 'FAIL'
      if (verdict === 'FAIL') failed = true
      console.log(`${verdict}  ${m.file}: imgs=${m.imgCount}, ${m.groups.length} 组, h1 偏移=${h1Off}px` + (bad.length ? `, 超差组=${JSON.stringify(bad)}` : ''))

      const h = await cdp.send('Runtime.evaluate', { expression: 'document.body.scrollHeight', returnByValue: true })
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: Math.min(Number(h.result?.value) || 900, 16000), deviceScaleFactor: 1, mobile: false })
      await sleep(400)
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
      writeFileSync(resolve(OUT, f.replace('.md', '') + '.png'), Buffer.from(shot.data, 'base64'))
      ws.close()
      await fetch(`http://127.0.0.1:${cdpPort}/json/close/${t.id}`).catch(() => {})
    }
    console.log(failed ? '\n视觉验证失败（存在超差元素）' : '\n视觉验证全部通过：所有图片组与标题均与正文中心对齐')
    if (failed) process.exitCode = 1
  } finally {
    chrome.kill(); await sleep(300)
    try { rmSync(chromeProfile, { recursive: true, force: true }) } catch { /* 系统临时目录回收 */ }
    server.close()
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
