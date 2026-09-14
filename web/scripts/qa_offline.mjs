// PWA 只读离线探针（v6 S4-T1 验收）：对生产构建做真实断网验收。
// 覆盖：SW 注册（仅 PROD 生效）→ 预热路由 → CDP emulateNetworkConditions 断网 →
// 导航/法条/术语/质量页离线可用 → 恢复在线。写操作与 /api/ 依赖在线（决策 21-A 口径），
// 离线时页面自身诚实降级态由 qa_shots 的在线巡检覆盖，不在本探针重复。
// 用法：node scripts/qa_offline.mjs（先 npm run build；自起 vite preview，无需外部服务）
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(webRoot, 'dist')
const CHROME = process.env.LH_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

if (!existsSync(join(dist, 'index.html'))) {
  console.error('qa_offline：web/dist 不存在——先 npm run build（探针只验收生产构建，SW 在 dev 下不注册）。')
  process.exit(1)
}

const allocateLoopbackPort = () => new Promise((resolvePort, reject) => {
  const server = createServer()
  server.unref()
  server.once('error', reject)
  server.listen(0, '127.0.0.1', () => {
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : null
    server.close((error) => (error ? reject(error) : resolvePort(port)))
  })
})

class Cdp {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.handlers = [] }
  attach() {
    this.ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id)
        this.pending.delete(message.id)
        if (message.error) reject(new Error(message.error.message))
        else resolve(message.result)
      } else if (message.method) this.handlers.forEach((h) => h(message))
    })
  }
  send(method, params = {}) {
    const id = ++this.id
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }
  on(handler) { this.handlers.push(handler) }
}

const results = []
const check = (name, ok, detail) => {
  results.push({ name, ok })
  console.log(`${ok ? '✓' : '✗'} ${name} — ${detail}`)
}

async function main() {
  const port = await allocateLoopbackPort()
  const debugPort = await allocateLoopbackPort()
  const preview = spawn(process.execPath, [join(webRoot, 'node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: webRoot, stdio: 'ignore' })
  const chromeProfile = mkdtempSync(join(tmpdir(), 'legalhigh-offline-chrome-'))
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${debugPort}`, '--no-first-run', '--no-default-browser-check',
    '--user-data-dir=' + chromeProfile, 'about:blank',
  ], { stdio: 'ignore' })
  try {
    const base = `http://127.0.0.1:${port}`
    // preview 服务就绪后再启动导航（否则首屏检查会撞在服务器未监听上）
    let previewUp = false
    for (let i = 0; i < 40; i++) {
      try { const r = await fetch(base + '/manifest.webmanifest'); if (r.ok) { previewUp = true; break } } catch { /* retry */ }
      await sleep(250)
    }
    if (!previewUp) throw new Error('vite preview 未就绪')
    let targets
    for (let i = 0; i < 30; i++) { await sleep(300); try { targets = await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json(); if (targets.length) break } catch { /* retry */ } }
    if (!targets) throw new Error('Chrome 未启动')
    const target = await (await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' })).json()
    const ws = new globalThis.WebSocket(target.webSocketDebuggerUrl)
    await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })
    const cdp = new Cdp(ws)
    cdp.attach()
    const consoleErrors = []
    cdp.on((message) => {
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error')
        consoleErrors.push(message.params.args.map((i) => i.value ?? i.description ?? '').join(' ').slice(0, 300))
      if (message.method === 'Runtime.exceptionThrown')
        consoleErrors.push((message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text || '').slice(0, 300))
    })
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Network.enable')
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
    // 预设专业视图（与 qa_motion 同款注入）：未设受众时产品显示首次自选屏，.st-layout 不出现
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `localStorage.setItem('lh:audience:v3', JSON.stringify({mode:'professional'}))`,
    })

    const evalJs = async (expression) => {
      const result = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
      if (result.exceptionDetails) throw new Error('页面异常: ' + (result.exceptionDetails.exception?.description || result.exceptionDetails.text).slice(0, 300))
      return result.result?.value
    }
    const waitFor = async (expression, attempts = 40) => {
      for (let i = 0; i < attempts; i++) { const v = await evalJs(expression).catch(() => false); if (v) return v; await sleep(250) }
      return false
    }
    const nav = async (path) => { await cdp.send('Page.navigate', { url: base + path }) }

    // 1. 首屏在线就绪
    await nav('/')
    check('在线首屏就绪', await waitFor(`document.readyState === 'complete' && !!document.querySelector('.hero-t')`), '/')

    // 2. SW 注册并接管页面（PROD-only 生效的证明就在这里：探针跑的是 vite preview 生产构建）
    const swReady = await waitFor(`!!navigator.serviceWorker.controller`, 60)
    check('service worker 已注册并接管', swReady, 'navigator.serviceWorker.controller 非空')

    // 3. 预热只读路由（缓存 index.html / 哈希资产 / laws.json）
    for (const p of ['/terms', '/laws', '/quality']) {
      await nav(p)
      await waitFor(`document.readyState === 'complete' && !!document.querySelector('.st-layout')`)
      await sleep(400)
    }

    // 4. 断网
    await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 })

    // 5. 离线导航到术语卡：SPA 外壳 + 已缓存资产应完整渲染
    await nav('/terms')
    const termsOk = await waitFor(`document.readyState === 'complete' && (document.body.innerText||'').includes('诉讼时效')`)
    check('离线 /terms 可读', Boolean(termsOk), '断网后术语卡内容渲染')

    // 6. 离线法条浏览：laws.json 来自 SW 预缓存
    await nav('/laws')
    const lawsOk = await waitFor(`document.readyState === 'complete' && /民法典|刑法|劳动/.test(document.body.innerText||'')`)
    check('离线 /laws 法条数据可读', Boolean(lawsOk), '断网后 laws.json 来自预缓存')

    // 7. 离线质量页：外壳渲染（/api/evals 不可达时页面应显示诚实降级而非崩白）
    await nav('/quality')
    const qualityOk = await waitFor(`document.readyState === 'complete' && (document.body.innerText||'').includes('质量透明度')`)
    check('离线 /quality 外壳渲染（诚实降级）', Boolean(qualityOk), '断网后静态区块可读')

    // 8. 恢复在线
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
    await nav('/')
    const onlineAgain = await waitFor(`document.readyState === 'complete' && !!document.querySelector('.hero-t')`)
    check('恢复在线导航正常', Boolean(onlineAgain), '/')

    const errors = consoleErrors.filter((e) => !e.includes('Failed to load resource')) // 断网期间 /api 请求失败是预期态
    check('离线期间无页面异常', errors.length === 0, errors.length ? errors[0] : 'console/page 无异常')

    const failed = results.filter((r) => !r.ok)
    console.log(`\nqa_offline：${results.length - failed.length}/${results.length} 项通过`)
    process.exitCode = failed.length ? 1 : 0
  } finally {
    chrome.kill()
    preview.kill()
    await sleep(400) // Chrome 释放 profile 文件锁后再清理（Windows EBUSY 实录）
    try { rmSync(chromeProfile, { recursive: true, force: true }) } catch { /* 残留临时目录可容忍 */ }
  }
}

main().catch((e) => { console.error('qa_offline 失败：', e.message); process.exit(1) })
