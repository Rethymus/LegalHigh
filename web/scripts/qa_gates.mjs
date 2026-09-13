// 数据纪律 grep 门（计划 v3 §1.2 第四项 gate 的自动化）：
// 1) 派生数字禁止硬编码：源码中不得出现过期语料规模字面量，
//    允许带历史标注的行（曾硬编码/首批/历史流水/回归测试注释）。
// 2) 产品源码不得重新引入内置虚构合同、旧 c-* 记录路由或浏览器伪 API。
// 3) 旧品牌与静态人物身份不得回流产品源码。
// 用法：node scripts/qa_gates.mjs（任何一项失败退出码 1，供 run_qa.cmd / CI 使用）
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const fail = []
let checks = 0

// ---- gate 1：过期语料数硬编码 ----
const STALE = /1,647|1647|1,953|1953|7 部|8 部/
const HISTORY_MARK = /曾硬编码|首批|历史|回归|曾因|· 本地语料/  // 「· 本地语料」= CORPUS_DYNAMICS 带日期历史流水条目的来源署名
function* walk(dir, exts) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) yield* walk(p, exts)
    else if (exts.some((e) => name.endsWith(e))) yield p
  }
}
const staleHits = []
for (const base of [resolve(root, 'server/app'), resolve(root, 'web/src')]) {
  for (const f of walk(base, ['.py', '.ts', '.tsx'])) {
    readFileSync(f, 'utf-8').split('\n').forEach((line, i) => {
      if (STALE.test(line) && !HISTORY_MARK.test(line)) staleHits.push(`${f}:${i + 1}: ${line.trim().slice(0, 80)}`)
    })
  }
}
checks++
if (staleHits.length) fail.push(`[派生数字] 发现未标注的语料规模硬编码（应实时派生或历史流水口径）：\n  ` + staleHits.join('\n  '))
else console.log('✓ gate1 派生数字：无未标注硬编码')

// ---- gate 2：生产前端不得内置虚构业务记录或 mock API ----
const productSource = [...walk(resolve(root, 'web/src'), ['.ts', '.tsx'])]
  .map((file) => `${file}\n${readFileSync(file, 'utf-8')}`).join('\n')
const forbiddenProductPatterns = [
  ['SAMPLE_CONTRACTS', /SAMPLE_CONTRACTS/],
  ['内置合同 c-* 路由', /\/contracts\/c-\d+/],
  ['浏览器 demo API', /demo-api|installDemoApi|DemoApi/],
  ['预填合同版本常量', /const\s+SAMPLE_[AB]\b/],
]
const forbiddenFiles = [
  'web/src/demo/demo-api.ts',
  'web/public/data/cases.json',
  'web/public/data/evals.json',
].filter((path) => existsSync(resolve(root, path)))
checks++
const forbiddenHits = forbiddenProductPatterns.filter(([, pattern]) => pattern.test(productSource)).map(([label]) => label)
if (forbiddenHits.length || forbiddenFiles.length) {
  fail.push(`[真值边界] 产品源码重新出现虚构业务数据或 mock 层：${[...forbiddenHits, ...forbiddenFiles].join('、')}`)
} else console.log('✓ gate2 真值边界：无内置虚构合同、旧 c-* 路由或浏览器 mock API')

// ---- gate 3：旧品牌/静态人物身份不得回流 ----
const identityHits = [
  ['LawEdge AI', /LawEdge\s+AI/i],
  ['Alex Wang', /Alex\s+Wang/i],
].filter(([, pattern]) => pattern.test(productSource)).map(([label]) => label)
checks++
if (identityHits.length) fail.push(`[身份与品牌] 发现旧品牌或虚构人物：${identityHits.join('、')}`)
else console.log('✓ gate3 身份与品牌：无旧品牌或虚构人物')

// ---- gate 4：受众分层与匿名残留不得回归 ----
const audienceSource = readFileSync(resolve(root, 'web/src/lib/audience.ts'), 'utf-8')
const shellSource = readFileSync(resolve(root, 'web/src/components/AppShell.tsx'), 'utf-8')
const navSource = readFileSync(resolve(root, 'web/src/data/model.ts'), 'utf-8')
const audienceFailures = []
if (/未署名/.test(productSource)) audienceFailures.push('产品源码仍显示“未署名”')
if (!/return null/.test(audienceSource) || !/lh:audience:v3/.test(audienceSource)) audienceFailures.push('首次使用没有明确的未选择状态')
for (const route of ['contracts', 'draft', 'workspace', 'audit']) {
  if (!new RegExp(`/${route}[^\\n]+audiences: \\['professional'\\]`).test(navSource)) audienceFailures.push(`${route} 未限定专业视图导航`)
}
if (!/canAudienceAccess\(pathname, audience\)/.test(shellSource)) audienceFailures.push('直达路由未接受众访问判定')
if (/design-system|DesignSystem|设计系统规范|Motion Lab/.test(productSource)) audienceFailures.push('产品源码仍暴露设计规范页面或展台')
if (!/return false\s*\n?}/.test(audienceSource)) audienceFailures.push('未知路由没有默认拒绝')
if (/useLaws|inventory\?\?[^\n]*corpus|corpus\?\?[^\n]*inventory/.test(shellSource)) audienceFailures.push('数据储备仍可能以静态语料冒充实时库存')
checks++
if (audienceFailures.length) fail.push(`[受众分层] ${audienceFailures.join('；')}`)
else console.log('✓ gate4 受众分层：首次自选、专业入口与直达路由均受控')

// ---- gate 5：动效与材质纪律（计划 v4 §3，2026-09-06）----
// 1) transition/animation 不得出现 Token 外的裸时长（剔除 var(--…) 后仍含 ms/s 字面量 → 失败；
//    恒定循环动画以行内注释「恒定循环」豁免）
// 2) 散装焦点环 `0 0 0 3px rgba(…)` 只允许出现在 --ring 定义行
// 3) backdrop-filter 的 blur() 实参必须来自 --blur-* Token
const cssFile = resolve(root, 'web/src/styles/global.css')
const cssLines = readFileSync(cssFile, 'utf-8').split('\n')
const motionBad = [], ringBad = [], blurBad = [], materialLiteralBad = [], materialAlphaBad = [], saturationBad = [], hoverMotionBad = []
cssLines.forEach((line, i) => {
  const at = `${cssFile}:${i + 1}`
  const noVar = line.replace(/var\(--[^)]*\)/g, '')
  if (/(transition|animation)\s*:/.test(noVar) && /\b\d+(\.\d+)?(ms|s)\b/.test(noVar) && !noVar.includes('恒定循环')) {
    motionBad.push(`${at}: ${line.trim().slice(0, 90)}`)
  }
  if (/0 0 0 3px rgba\(/.test(line) && !line.includes('--ring')) {
    ringBad.push(`${at}: ${line.trim().slice(0, 90)}`)
  }
  if (/backdrop-filter[^;]*blur\(\s*[\d.]/.test(line) && !line.trim().startsWith('@supports')) {
    blurBad.push(`${at}: ${line.trim().slice(0, 90)}`)
  }
  if (/\.m-(thin|regular|thick|chrome|float|refract)\b/.test(line) && /--m-(blur|a):\s*[\d.]/.test(line)) {
    materialLiteralBad.push(`${at}: ${line.trim().slice(0, 110)}`)
  }
  if (/rgba\(var\(--mat-tint\),\s*[\d.]/.test(line)) {
    materialAlphaBad.push(`${at}: ${line.trim().slice(0, 110)}`)
  }
  if (/saturate\(\s*[\d.]/.test(line)) saturationBad.push(`${at}: ${line.trim().slice(0, 110)}`)
  if (/:hover/.test(line) && /transform:\s*translate/.test(line)) hoverMotionBad.push(`${at}: ${line.trim().slice(0, 110)}`)
})
checks++
const gate4Fails = []
if (motionBad.length) gate4Fails.push(`裸时长（应使用 --dur-*/--t-* Token，循环动画加「恒定循环」注释）：\n  ` + motionBad.join('\n  '))
if (ringBad.length) gate4Fails.push(`散装焦点环（统一 var(--ring)/var(--ring-soft)）：\n  ` + ringBad.join('\n  '))
if (blurBad.length) gate4Fails.push(`blur 未走 Token（统一 --blur-chrome/panel/card/float/desk/veil）：\n  ` + blurBad.join('\n  '))
if (materialLiteralBad.length) gate4Fails.push(`材质档复制裸参数（--m-blur/--m-a 必须引用全局 Token）：\n  ` + materialLiteralBad.join('\n  '))
if (materialAlphaBad.length) gate4Fails.push(`组件材质透明度未走 Token（rgba(var(--mat-tint), …) 必须引用 --mat-*-a）：\n  ` + materialAlphaBad.join('\n  '))
if (saturationBad.length) gate4Fails.push(`材质饱和度未走 Token：\n  ` + saturationBad.join('\n  '))
if (hoverMotionBad.length) gate4Fails.push(`hover 使用位移（红线：悬停只改背景/描边/阴影）：\n  ` + hoverMotionBad.join('\n  '))
if (gate4Fails.length) fail.push(`[动效与材质纪律] ${gate4Fails.join('\n')}`)
else console.log('✓ gate5 动效与材质纪律：时长/焦点环/blur 全部走 Token')

// ---- gate 6：性能预算（计划 v5 S2-T6，2026-09-13 标定）----
// 首屏 JS（index-*.js gzip）与全部 JS/CSS gzip、语料 laws.json 体积设硬预算；
// 超预算 = 构建产物失控，必须先讨论（语料有意的批量扩张走预算修订，而不是放宽静默）。
// 基线：入口 86KB gz / 全 JS ~138KB gz / CSS 13KB gz / laws.json 948KB。
const distDir = resolve(root, 'web/dist')
if (!existsSync(distDir)) {
  // pages 工作流在 vite build 之前跑本门（纪律门先行），此时无 dist 可预算——
  // 跳过并在 qa 工作流（Gate 2 build 之后必跑）强制执行；本地也建议 build 后跑全门。
  checks++
  console.log('SKIP gate6 性能预算：web/dist 不存在（预算在含 build 的 qa 工作流强制执行）')
} else {
  const jsFiles = [], cssFiles = []
  for (const name of readdirSync(resolve(distDir, 'assets'))) {
    const f = resolve(distDir, 'assets', name)
    if (name.endsWith('.js')) jsFiles.push({ name, buf: readFileSync(f) })
    if (name.endsWith('.css')) cssFiles.push({ name, buf: readFileSync(f) })
  }
  const gz = (b) => gzipSync(b).length
  const entryJs = jsFiles.filter((f) => f.name.startsWith('index-'))
  const entryGz = entryJs.reduce((s, f) => s + gz(f.buf), 0)
  const allJsGz = jsFiles.reduce((s, f) => s + gz(f.buf), 0)
  const allCssGz = cssFiles.reduce((s, f) => s + gz(f.buf), 0)
  const lawsPath = resolve(distDir, 'data/laws.json')
  const lawsBytes = existsSync(lawsPath) ? statSync(lawsPath).size : 0
  const BUDGET = { entryJsGz: 120 * 1024, allJsGz: 200 * 1024, allCssGz: 25 * 1024, lawsJson: 1.5 * 1024 * 1024 }
  const over = []
  if (entryGz > BUDGET.entryJsGz) over.push(`入口 JS gzip ${(entryGz / 1024).toFixed(0)}KB > 预算 120KB`)
  if (allJsGz > BUDGET.allJsGz) over.push(`全部 JS gzip ${(allJsGz / 1024).toFixed(0)}KB > 预算 200KB`)
  if (allCssGz > BUDGET.allCssGz) over.push(`全部 CSS gzip ${(allCssGz / 1024).toFixed(0)}KB > 预算 25KB`)
  if (!lawsBytes) over.push('dist/data/laws.json 缺失（语料导出链路断裂）')
  else if (lawsBytes > BUDGET.lawsJson) over.push(`laws.json ${(lawsBytes / 1048576).toFixed(2)}MB > 预算 1.5MB`)
  checks++
  if (over.length) fail.push(`[性能预算] ${over.join('；')}`)
  else console.log(`OK gate6 性能预算：入口 JS ${(entryGz / 1024).toFixed(0)}KB gz / 全 JS ${(allJsGz / 1024).toFixed(0)}KB gz / CSS ${(allCssGz / 1024).toFixed(0)}KB gz / laws.json ${(lawsBytes / 1024).toFixed(0)}KB`)
}

if (fail.length) {
  console.error(`\nqa_gates：${fail.length}/${checks} 项失败`)
  for (const f of fail) console.error('\n' + f)
  process.exit(1)
}
console.log(`\nqa_gates：${checks}/${checks} 项通过`)
