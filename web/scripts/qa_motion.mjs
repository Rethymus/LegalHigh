// 产品动效行为探针：只验证真实产品页面和公共组件，不依赖或暴露设计规范页面。
// 用法：node scripts/qa_motion.mjs [--base http://localhost:5173] [--strict]
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const args = process.argv.slice(2)
const arg = (key, fallback) => { const i = args.indexOf(`--${key}`); return i >= 0 ? args[i + 1] : fallback }
const BASE = arg('base', 'http://localhost:5173')
const STRICT = args.includes('--strict')
const CHROME = arg('chrome', 'C:/Program Files/Google/Chrome/Application/chrome.exe')
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

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
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.handlers = []
    ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id); this.pending.delete(message.id)
        if (message.error) reject(new Error(message.error.message)); else resolve(message.result)
      } else if (message.method) this.handlers.forEach((handler) => handler(message))
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

async function evalAsync(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw new Error('页面异常: ' + (result.exceptionDetails.exception?.description || result.exceptionDetails.text).slice(0, 300))
  return result.result?.value
}

const results = []
const check = (name, ok, detail) => {
  results.push({ name, ok, detail })
  console.log(`${ok ? '✓' : '✗'} ${name} — ${detail}`)
}

async function waitFor(cdp, expression, attempts = 40) {
  for (let i = 0; i < attempts; i++) {
    const value = await evalAsync(cdp, expression).catch(() => false)
    if (value) return value
    await sleep(250)
  }
  return false
}

async function main() {
  const port = await allocateLoopbackPort()
  const chromeProfile = mkdtempSync(join(tmpdir(), 'legalhigh-motion-chrome-'))
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${port}`, '--no-first-run', '--no-default-browser-check',
    '--user-data-dir=' + chromeProfile, 'about:blank',
  ], { stdio: 'ignore' })
  try {
    const getJson = async (path, method = 'GET') => (await fetch(`http://127.0.0.1:${port}${path}`, { method })).json()
    let targets
    for (let i = 0; i < 30; i++) { await sleep(300); try { targets = await getJson('/json'); if (targets.length) break } catch { /* retry */ } }
    if (!targets) throw new Error('Chrome 未启动')
    const target = await getJson(`/json/new?${encodeURIComponent('about:blank')}`, 'PUT')
    const ws = new globalThis.WebSocket(target.webSocketDebuggerUrl)
    await new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject) })
    const cdp = new Cdp(ws)
    const runtimeErrors = []
    cdp.on((message) => {
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error')
        runtimeErrors.push(message.params.args.map((item) => item.value ?? item.description ?? '').join(' ').slice(0, 500))
      if (message.method === 'Runtime.exceptionThrown')
        runtimeErrors.push((message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text || '').slice(0, 500))
    })
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable')
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `localStorage.setItem('lh:audience:v3', JSON.stringify({mode:'professional'}))`,
    })

    // 已删除的设计规范路径必须进入产品兜底，不得以任何受众模式重新出现。
    await cdp.send('Page.navigate', { url: BASE + '/design-system' })
    const removed = await waitFor(cdp, `document.readyState === 'complete' && !document.querySelector('[class*="ds-"]') && !/Motion Lab|设计系统规范|材质标尺/.test(document.body.innerText) && (location.pathname === '/' || /未在.+视图中开放|页面不存在/.test(document.body.innerText))`)
    check('设计规范路由已移除', Boolean(removed), `最终路径=${await evalAsync(cdp, 'location.pathname')}`)

    await cdp.send('Page.navigate', { url: BASE + '/settings' })
    const ready = await waitFor(cdp, `document.readyState === 'complete' && !!document.querySelector('.st-layout')`)
    if (!ready) throw new Error('设置页未就绪')

    // 真实 TopBar 材质必须从主题 Token 取模糊与透明度。
    const material = await evalAsync(cdp, `(() => {
      const main=document.querySelector('.main'); const bar=document.querySelector('.tb')
      const read=()=>{ const m=getComputedStyle(main), b=getComputedStyle(bar); return {a:m.getPropertyValue('--mat-chrome-a').trim(), blur:m.getPropertyValue('--blur-chrome').trim(), filter:b.backdropFilter||b.webkitBackdropFilter} }
      main.classList.remove('tone-light'); main.classList.add('tone-dark'); const dark=read()
      main.classList.remove('tone-dark'); main.classList.add('tone-light'); const light=read()
      return {dark,light}
    })()`)
    check('产品 Chrome 材质浅深同源', material.dark.a !== material.light.a && material.dark.blur === material.light.blur
      && /blur\(/.test(material.dark.filter) && /blur\(/.test(material.light.filter),
    `blur=${material.dark.blur} · alpha dark ${material.dark.a}/light ${material.light.a}`)

    // 像素证据：固定条纹背景下开关 backdrop-filter，截图必须改变。
    const clip = await evalAsync(cdp, `(() => {
      const host=document.createElement('div'); host.id='lh-blur-probe'; host.style.cssText='position:fixed;left:20px;top:20px;width:240px;height:80px;z-index:2147483647;background:repeating-linear-gradient(90deg,#000 0 3px,#fff 3px 6px)'
      const pane=document.createElement('div'); pane.style.cssText='position:absolute;inset:0;background:rgba(255,255,255,.16);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)'; host.appendChild(pane); document.body.appendChild(host)
      const r=pane.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height,scale:1}
    })()`)
    const blurOn = await cdp.send('Page.captureScreenshot', { format: 'png', clip })
    await evalAsync(cdp, `document.querySelector('#lh-blur-probe>div').style.backdropFilter='none'; document.querySelector('#lh-blur-probe>div').style.webkitBackdropFilter='none'; 'off'`)
    await sleep(80)
    const blurOff = await cdp.send('Page.captureScreenshot', { format: 'png', clip })
    await evalAsync(cdp, `document.querySelector('#lh-blur-probe').remove(); 'removed'`)
    const onHash = createHash('sha256').update(blurOn.data, 'base64').digest('hex').slice(0, 12)
    const offHash = createHash('sha256').update(blurOff.data, 'base64').digest('hex').slice(0, 12)
    check('backdrop-filter 像素实证', onHash !== offHash, `${onHash} != ${offHash}`)

    // 真实键盘事件触发 :focus-visible，而不是程序化 focus。
    await evalAsync(cdp, `document.activeElement instanceof HTMLElement && document.activeElement.blur(); 'ready'`)
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 })
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 })
    const focus = await evalAsync(cdp, `(() => { const e=document.activeElement, s=getComputedStyle(e); return {visible:e.matches(':focus-visible'), shadow:s.boxShadow, tag:e.tagName} })()`)
    check('键盘焦点环真实可见', focus.visible && focus.shadow !== 'none', `${focus.tag} · ${focus.shadow}`)

    // 使用视图 select 是真实业务入口，用它触发真实 Toast 生命周期。
    await evalAsync(cdp, `(() => {
      document.documentElement.classList.add('tone-dark'); document.documentElement.classList.remove('tone-light')
      window.__toastTrace=[]; const host=document.querySelector('.toast-host')
      new MutationObserver(()=>{ const t=host.querySelector('.toast'); if(t)window.__toastTrace.push({cls:t.className,anim:getComputedStyle(t).animationName}) }).observe(host,{subtree:true,childList:true,attributes:true,attributeFilter:['class']})
      const s=[...document.querySelectorAll('select')].find(x=>[...x.options].some(o=>o.value==='student'))
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'student'); s.dispatchEvent(new Event('change',{bubbles:true})); return 'changed'
    })()`)
    const toastIn = await waitFor(cdp, `(() => { const t=document.querySelector('.toast-host .toast'); if(!t)return false; const s=getComputedStyle(t); return {anim:s.animationName,bg:s.backgroundColor,root:document.documentElement.classList.contains('tone-dark')} })()`)
    let toastGone = false
    for (let i = 0; i < 20; i++) { await sleep(200); if (await evalAsync(cdp, `!document.querySelector('.toast-host .toast')`)) { toastGone = true; break } }
    const toastTrace = await evalAsync(cdp, `window.__toastTrace||[]`)
    const sawOut = toastTrace.some((entry) => entry.cls.includes('is-out') && entry.anim === 'pop-out')
    check('Toast 入场、深色继承与退场卸载', Boolean(toastIn) && toastIn.anim === 'pop-in' && toastIn.root && sawOut && toastGone,
      `in=${toastIn?.anim ?? 'missing'} · dark=${toastIn?.root ?? false} · pop-out=${sawOut} · removed=${toastGone}`)

    // 切到外观区，验证真实 Segmented 与 Switch。
    await cdp.send('Page.navigate', { url: BASE + '/settings' })
    await waitFor(cdp, `document.readyState === 'complete' && !!document.querySelector('.st-layout')`)
    await evalAsync(cdp, `([...document.querySelectorAll('.st-nav button')].find(b=>b.textContent.includes('外观'))).click(); 'appearance'`)
    const appearanceReady = await waitFor(cdp, `!!document.querySelector('.seg-thumb') && !!document.querySelector('.sw')`)
    if (!appearanceReady) throw new Error('设置页外观分区未就绪')
    const segmented = await evalAsync(cdp, `(async()=>{ const sleep=m=>new Promise(r=>setTimeout(r,m)); const thumb=document.querySelector('.seg-thumb'); const target=[...document.querySelectorAll('.seg-btn')].find(b=>b.textContent.includes('深色') && b.getAttribute('aria-selected')!=='true') || [...document.querySelectorAll('.seg-btn')].find(b=>b.getAttribute('aria-selected')!=='true'); const x=()=>new DOMMatrixReadOnly(getComputedStyle(thumb).transform).m41; const before=x(); target.click(); await sleep(70); const mid=x(); await sleep(650); const after=x(); return {before,mid,after,timing:getComputedStyle(thumb).transitionTimingFunction,selected:target.getAttribute('aria-selected')} })()`)
    check('竹简槽弹簧位移', segmented.after > segmented.before && segmented.mid !== segmented.after && /linear\(|cubic-bezier\(/.test(segmented.timing),
      `before=${segmented.before.toFixed(1)} mid=${segmented.mid.toFixed(1)} after=${segmented.after.toFixed(1)} selected=${segmented.selected}`)

    const switchPoint = await evalAsync(cdp, `(() => { const e=document.querySelector('.sw'),r=e.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2} })()`)
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: switchPoint.x, y: switchPoint.y, button: 'left', clickCount: 1 })
    await sleep(35)
    const pressed = await evalAsync(cdp, `(() => { const s=getComputedStyle(document.querySelector('.sw'),'::after'); return {d:s.transitionDuration,t:s.transitionTimingFunction} })()`)
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: switchPoint.x, y: switchPoint.y, button: 'left', clickCount: 1 })
    await sleep(35)
    const released = await evalAsync(cdp, `(() => { const s=getComputedStyle(document.querySelector('.sw'),'::after'); return {d:s.transitionDuration,t:s.transitionTimingFunction} })()`)
    check('Switch 按压/释放双曲线', pressed.d === '0.08s' && released.d === '0.34s' && pressed.t !== released.t,
      `press ${pressed.d} · release ${released.d}`)

    // 级联规则用测试期注入的普通列表验证；无任何测试 UI 进入产品路由。
    const stagger = await evalAsync(cdp, `(async()=>{ const host=document.createElement('div'); host.className='stagger'; for(let i=0;i<6;i++){const e=document.createElement('span');e.style.setProperty('--si',i);e.textContent='x';host.appendChild(e)} document.body.appendChild(host); await new Promise(r=>setTimeout(r,70)); const a=[...host.children].map(e=>+getComputedStyle(e).opacity); await new Promise(r=>setTimeout(r,1200)); const done=[...host.children].every(e=>+getComputedStyle(e).opacity===1); host.remove(); return {a,done} })()`)
    check('列表级联规则', stagger.a[0] > stagger.a[5] && stagger.done, `70ms=${stagger.a.map(x=>x.toFixed(2)).join('/')}`)

    // TopBar 滚动海拔必须有严格中间值且可逆。
    await cdp.send('Page.navigate', { url: BASE + '/data-sources' })
    const scrollReady = await waitFor(cdp, `document.readyState === 'complete' && !!document.querySelector('.tb') && document.querySelector('.content').scrollHeight > document.querySelector('.content').clientHeight + 100`)
    if (!scrollReady) throw new Error('数据源长页面未就绪，无法验证滚动海拔')
    const scroll = await evalAsync(cdp, `(async()=>{ const sleep=m=>new Promise(r=>setTimeout(r,m)); const c=document.querySelector('.content'),b=document.querySelector('.tb'); const alpha=()=>{const p=getComputedStyle(b).borderColor.match(/[0-9.]+/g)?.map(Number)||[];return p.length===4?p[3]:1}; c.scrollTop=0;await sleep(120);const a0=alpha();c.scrollTop=48;await sleep(120);const am=alpha();c.scrollTop=96;await sleep(120);const a1=alpha();c.scrollTop=0;await sleep(120);const back=alpha();return {a0,am,a1,back} })()`)
    check('滚动海拔连续插值', scroll.a0 < scroll.am && scroll.am < scroll.a1 && scroll.back === scroll.a0,
      `${scroll.a0} -> ${scroll.am} -> ${scroll.a1} -> ${scroll.back}`)

    // Reduce Motion 系统通道：位移过渡必须移除。
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
    await cdp.send('Page.navigate', { url: BASE + '/settings' })
    await waitFor(cdp, `document.readyState === 'complete' && !!document.querySelector('.st-layout')`)
    await evalAsync(cdp, `([...document.querySelectorAll('.st-nav button')].find(b=>b.textContent.includes('外观'))).click(); 'appearance'`)
    await waitFor(cdp, `!!document.querySelector('.seg-thumb') && !!document.querySelector('.sw')`)
    const reduced = await evalAsync(cdp, `(() => ({seg:getComputedStyle(document.querySelector('.seg-thumb')).transitionProperty, sw:getComputedStyle(document.querySelector('.sw'),'::after').transitionProperty}))()`)
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: '' }] })
    check('Reduce Motion 移除位移过渡', !/transform/.test(reduced.seg) && !/transform/.test(reduced.sw), `seg=${reduced.seg} · switch=${reduced.sw}`)

    check('运行时控制台无错误', runtimeErrors.length === 0, runtimeErrors.length ? runtimeErrors.join(' | ') : '0 console/page exception')
  } finally {
    chrome.kill()
    await sleep(250)
    try { rmSync(chromeProfile, { recursive: true, force: true }) } catch { /* 交给系统临时目录回收 */ }
  }

  const failed = results.filter((result) => !result.ok)
  if (STRICT && failed.length) {
    console.error(`\nqa_motion：${failed.length}/${results.length} 项断言失败`)
    process.exit(1)
  }
  console.log(`\nqa_motion：${results.length - failed.length}/${results.length} 项断言通过${STRICT ? '（strict）' : ''}`)
}

main().catch((error) => { console.error('qa_motion 运行失败：', error.message); process.exit(1) })
