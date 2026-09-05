// 数据纪律 grep 门（计划 v3 §1.2 第四项 gate 的自动化）：
// 1) 派生数字禁止硬编码：源码中不得出现过期语料规模字面量，
//    允许带历史标注的行（曾硬编码/首批/历史流水/回归测试注释）。
// 2) 产品源码不得重新引入内置虚构合同、旧 c-* 记录路由或浏览器伪 API。
// 3) 旧品牌与静态人物身份不得回流产品源码。
// 用法：node scripts/qa_gates.mjs（任何一项失败退出码 1，供 run_qa.cmd / CI 使用）
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
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

if (fail.length) {
  console.error(`\nqa_gates：${fail.length}/${checks} 项失败`)
  for (const f of fail) console.error('\n' + f)
  process.exit(1)
}
console.log(`\nqa_gates：${checks}/${checks} 项通过`)
