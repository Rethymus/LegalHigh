// 数据纪律 grep 门（计划 v3 §1.2 第四项 gate 的自动化）：
// 1) 派生数字禁止硬编码：源码中不得出现过期语料规模字面量（「7 部」「1,647」），
//    允许带历史标注的行（曾硬编码/首批/历史流水/回归测试注释）。
// 2) 演示合同标注纪律：model.ts CONTRACTS 每一条 name 必须带「示例」。
// 用法：node scripts/qa_gates.mjs（任何一项失败退出码 1，供 run_qa.cmd / CI 使用）
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const fail = []
let checks = 0

// ---- gate 1：过期语料数硬编码 ----
const STALE = /1,647|1647|7 部/
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

// ---- gate 2：演示合同「示例」标注 ----
const modelSrc = readFileSync(resolve(root, 'web/src/data/model.ts'), 'utf-8')
const contractNames = [...modelSrc.matchAll(/id: 'c-\d+', name: '([^']+)'/g)].map((m) => m[1])
checks++
if (contractNames.length === 0) fail.push('[演示标注] 未在 model.ts 找到 CONTRACTS 条目（结构变化？请同步本门）')
else if (!contractNames.every((n) => n.includes('示例'))) fail.push('[演示标注] 合同名缺少「示例」标记：' + contractNames.filter((n) => !n.includes('示例')).join('、'))
else console.log(`✓ gate2 演示标注：${contractNames.length} 份合同均带「示例」`)

if (fail.length) {
  console.error(`\nqa_gates：${fail.length}/${checks} 项失败`)
  for (const f of fail) console.error('\n' + f)
  process.exit(1)
}
console.log(`\nqa_gates：${checks}/${checks} 项通过`)
