// README 链接完整性核验（R564：R563 人工核验的制度化，qa_gates gate9 调用）。
// 两类链接两种核法：
//   ①仓库文件链接（相对路径）→ 必须真实存在（存在性）；
//   ②应用路由链接（裸 /xxx 形式）→ 禁止——必须写完整部署域名
//     （https://rethymus.github.io/LegalHigh/#/xxx，R530 域名纪律 + R563 实录：
//      「/quality」裸路径在仓库根解析与 Pages 子路径下都不可达）。
// 用法：node scripts/check_readme_links.mjs（由 qa_gates gate9 调用；也可独立跑）
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const DOCS = ['README.md', 'README.zh-CN.md', 'README.en.md']
const fail = []
let checked = 0

for (const doc of DOCS) {
  const p = resolve(root, doc)
  if (!existsSync(p)) { fail.push(`${doc}: 文件缺失`); continue }
  const s = readFileSync(p, 'utf-8')
  const base = dirname(p)
  for (const m of s.matchAll(/\[[^\]]+\]\(([^)\s]+)\)/g)) {
    const url = m[1].trim()
    if (!url || url.startsWith(('http')) || url.startsWith('#') || url.startsWith('mailto:')) continue
    checked++
    // ②裸应用路由：以 / 开头（不含 //）= 站内路由，必须带部署域名
    if (url.startsWith('/') && !url.startsWith('//')) {
      fail.push(`${doc}: 裸应用路由链接「${url}」——必须写完整部署域名（https://rethymus.github.io/LegalHigh/#${url}）`)
      continue
    }
    // ①仓库文件链接：相对文档目录解析存在性
    const path = url.split('#')[0].split('?')[0]
    if (!path) continue
    const full = normalize(resolve(base, path))
    if (!existsSync(full)) fail.push(`${doc}: 相对链接「${url}」指向不存在的文件`)
  }
}

if (fail.length) {
  console.error('check_readme_links：链接失效 ' + fail.length + ' 项')
  for (const f of fail) console.error('  ✗ ' + f)
  process.exit(1)
}
console.log(`OK README 链接：${checked} 处相对链接全在位，零裸应用路由`)
