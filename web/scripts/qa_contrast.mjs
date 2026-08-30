// D7 · WCAG 2.1 对比度审计（学科透镜工具化）：解析 global.css 的 Light/Dark 语义 Token，
// 对正文/次级/弱化文本、语义色、accent、主按钮等关键前景/背景组合计算对比度。
// 口径：AA 正文 4.5:1；大字号（≥18.66px bold 或 24px）与 UI 组件 3:1。
// 用法：node scripts/qa_contrast.mjs [--strict]（--strict：正文级组合存在 AA 失败即退出码 1）
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const cssPath = resolve(dirname(fileURLToPath(import.meta.url)), '../src/styles/global.css')
const css = readFileSync(cssPath, 'utf-8')
const STRICT = process.argv.includes('--strict')

function parseBlock(selector) {
  // 按选择器匹配整个声明块；[^{}]* 无法跨越花括号，故匹配必然落在选择器所在的顶层块
  const re = new RegExp(`[^{}]*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`)
  const m = css.match(re)
  if (!m) throw new Error('token block not found: ' + selector)
  const vars = {}
  for (const v of m[1].matchAll(/--([\w-]+):\s*([^;]+);/g)) vars[v[1]] = v[2].trim()
  return vars
}
const base = parseBlock(':root')                       // raw palette（--blue 等；":root," 后非紧跟 { 不匹配）
const light = { ...base, ...parseBlock('.tone-light') }
const dark = { ...base, ...parseBlock('.tone-dark') }

const hex2rgb = (h) => {
  const s = h.replace('#', '')
  const v = s.length === 3 ? s.split('').map((c) => c + c) : [s.slice(0, 2), s.slice(2, 4), s.slice(4, 6)]
  return v.map((x) => parseInt(x, 16))
}
const parse = (raw, vars, backdrop) => {
  let v = raw.trim()
  if (v.startsWith('var(')) {
    // vars 的键不含前导双横线（正则捕获组），查引用时须剥掉「--」
    const name = v.slice(4, -1).replace(/^--/, '')
    v = vars[name]
  }
  if (v.startsWith('#')) return hex2rgb(v)
  const m = v.match(/rgba?\(([^)]+)\)/)
  if (m) {
    const [r, g, b, a = 1] = m[1].split(',').map((x) => parseFloat(x))
    if (a >= 1) return [r, g, b]
    // 半透明表面：合成到给定底色上（背景色只认纯色）
    const bd = backdrop ?? [255, 255, 255]
    return [r, g, b].map((c, i) => Math.round(c * a + bd[i] * (1 - a)))
  }
  throw new Error('unparseable color: ' + raw)
}
const lum = ([r, g, b]) => {
  const f = (c) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
const ratio = (a, b) => { const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x); return (l1 + 0.05) / (l2 + 0.05) }

// 组合矩阵：fg 变量、bg 变量、用途说明、适用口径（'text' 正文 4.5 / 'large-ui' 3.0）
const MATRIX = [
  ['tx', 'bg', '正文 / 基底', 'text'],
  ['tx', 'bg-2', '正文 / 次级底', 'text'],
  ['tx', 'surface-solid', '正文 / 卡片', 'text'],
  ['tx-2', 'bg', '次级文本 / 基底', 'text'],
  ['tx-2', 'surface-solid', '次级文本 / 卡片', 'text'],
  ['tx-3', 'bg', '弱化文本 / 基底', 'text'],
  ['tx-3', 'surface-solid', '弱化文本 / 卡片（tiny 元信息）', 'text'],
  ['accent-text', 'bg', 'accent 文本色（链接/强调；D7 后 --accent-text）', 'text'],
  ['accent-text', 'surface-solid', 'accent 文本色 / 卡片', 'text'],
  ['ok', 'bg', '成功色作文本', 'text'],
  ['warn', 'bg', '警示色作文本', 'text'],
  ['danger', 'bg', '危险色作文本', 'text'],
  ['accent', 'bg', 'accent 作图标/图形（UI 3:1）', 'large-ui'],
  ['accent', 'surface-solid', '主按钮白字 / accent 底（对照）', 'large-ui'],
]
const WHITE = [255, 255, 255]
let textFail = 0
const report = []
for (const [tone, vars] of [['Light', light], ['Dark', dark]]) {
  const bgRgb = parse(vars['bg'], vars)
  const cardRgb = parse(vars['surface-solid'], vars)
  for (const [fg, bg, use, level] of MATRIX) {
    const fgV = vars[fg]
    const bgV = vars[bg]
    const fgc = parse(fgV, vars, bgRgb)
    const bgc = bg === 'surface-solid' ? cardRgb : bgV === 'var(--blue)' ? fgc : parse(bgV, vars)
    const target = fg === 'accent' && use.includes('白字') ? ratio(WHITE, fgc) : ratio(fgc, bgc)
    const th = level === 'text' ? 4.5 : 3.0
    const pass = target >= th
    if (!pass && level === 'text') textFail++
    report.push({ tone, fg: use.includes('白字') ? '#fff on ' + fg : fg, bg, use, level,
      ratio: +target.toFixed(2), th, pass: target >= (level === 'text' ? 4.5 : 3.0) })
  }
}

const pad = (s, n) => String(s).padEnd(n)
console.log(pad('TONE', 6) + pad('FG', 22) + pad('BG', 16) + pad('RATIO', 7) + pad('TH', 6) + 'PASS')
for (const r of report)
  console.log(pad(r.tone, 6) + pad(r.fg, 22) + pad(r.bg, 16) + pad(r.ratio, 7) + pad(r.th, 6) + (r.pass ? '✓' : '✗ FAIL'))

const fails = report.filter((r) => !r.pass)
console.log(`\n共 ${report.length} 组合，${fails.length} 项未达标（其中正文级 ${textFail} 项）`)
console.log('策略（D7，2026-08-30 落地）：文本一律用 --accent-text（浅色 #0069d9）；--accent 仅用于填充/描边/图标（3:1 口径）；--tx-3/--ok 已深化到达标值。')
if (STRICT && textFail > 0) { console.error('STRICT：正文级 AA 失败'); process.exit(1) }
