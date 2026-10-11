// gate8 · 对外声明面一致性（R524：R523「llms.txt 八工具」漂移的制度化）。
// 单一真源 = server/mcp_server.py 的 TOOLS 清单；扫描全部对外声明面：
//   README×3 / llms.txt / SKILL.md
// 核查三口径：
//   A. 每个工具名必须在每个声明面出现（新工具漏同步即失败——R503 实录）；
//   B. 声明面不得出现旧计数词（「六工具/七工具/八工具」…凡 ≠ 当前工具数的「N工具」）；
//   C. README 无日期的现态语料主张（「跨 N 部受控语料（M 条」/「当前构建产物为 N 部、M 条」）
//      必须与 manifest 一致——语料扩张未同步 README 即失败（R514 纪律的机器化）。
// 用法：node scripts/check_declared_surface.mjs（由 qa_gates gate8 调用；也可独立跑）
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const fail = []

// ---- 单一真源：TOOLS 工具名 ----
const mcpSrc = readFileSync(resolve(root, 'server/mcp_server.py'), 'utf-8')
const toolsBlock = mcpSrc.slice(mcpSrc.indexOf('TOOLS = ['), mcpSrc.indexOf(']\n', mcpSrc.indexOf('TOOLS = [')))
const toolNames = [...toolsBlock.matchAll(/"name":\s*"(\w+)"/g)].map((m) => m[1])
if (toolNames.length < 5) fail.push(`mcp_server.py TOOLS 解析异常：仅得 ${toolNames.length} 个工具名`)

// ---- A+B：五声明面 ----
const surfaces = [
  'README.md',
  'README.zh-CN.md',
  'README.en.md',
  'web/public/llms.txt',
  'skills/legalhigh/SKILL.md',
]
for (const f of surfaces) {
  let text
  try {
    text = readFileSync(resolve(root, f), 'utf-8')
  } catch {
    fail.push(`${f}: 文件缺失（声明面断裂）`)
    continue
  }
  const missing = toolNames.filter((t) => !text.includes(t))
  if (missing.length) fail.push(`${f}: 缺工具声明 ${missing.join(', ')}（新工具漏同步——R503/R523 教训）`)
  // 旧计数词：中文「N工具」且 N ≠ 当前数（汉字数字）
  const cn = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十']
  const wrongCn = cn.filter((c, i) => i > 0 && i !== toolNames.length && new RegExp(c + '工具').test(text))
  if (wrongCn.length) fail.push(`${f}: 出现旧工具计数「${wrongCn.map((c) => c + '工具').join('、')}」（当前应为 ${toolNames.length} 个）`)
}

// ---- C：README 现态语料主张 vs manifest ----
const manifest = JSON.parse(readFileSync(resolve(root, 'server/data/laws/manifest.json'), 'utf-8'))
const lawsCount = manifest.laws.length
const articlesCount = manifest.laws.reduce((s, x) => s + x.article_count, 0)
const zh = readFileSync(resolve(root, 'README.zh-CN.md'), 'utf-8')
const hub = readFileSync(resolve(root, 'README.md'), 'utf-8')

const hubM = hub.match(/跨 (\d+) 部受控语料（([\d,]+) 条条文条目）/)
if (!hubM) fail.push('README.md: 找不到「跨 N 部受控语料（M 条条文条目）」现态主张')
else if (+hubM[1] !== lawsCount || +hubM[2].replace(/,/g, '') !== articlesCount)
  fail.push(`README.md: 语料主张 ${hubM[1]} 部/${hubM[2]} 条 ≠ manifest ${lawsCount} 部/${articlesCount} 条（扩张后请同步）`)

const zhM = zh.match(/当前构建产物为 (\d+) 部、([\d,]+) 条文条目/)
if (!zhM) fail.push('README.zh-CN.md: 找不到「当前构建产物为 N 部、M 条文条目」现态主张')
else if (+zhM[1] !== lawsCount || +zhM[2].replace(/,/g, '') !== articlesCount)
  fail.push(`README.zh-CN.md: 构建主张 ${zhM[1]} 部/${zhM[2]} 条 ≠ manifest ${lawsCount} 部/${articlesCount} 条（扩张后请同步）`)

if (fail.length) {
  console.error('check_declared_surface：声明面漂移 ' + fail.length + ' 项')
  for (const f of fail) console.error('  ✗ ' + f)
  process.exit(1)
}
console.log(`OK 声明面一致：${toolNames.length} 工具 × ${surfaces.length} 面全在；README 语料主张 = manifest ${lawsCount} 部/${articlesCount} 条`)
