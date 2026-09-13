// CHANGELOG 校验（粉饰清单-5）：顶部版本段格式 + 证据链接存在性。
// 用法：node scripts/check_changelog.mjs（可入 pre-commit / run_qa；失败退出码 1）
// 口径：①首个 `## v…` 段必须带 ISO 日期；②段内 markdown 链接/图片的仓库相对路径必须存在。
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const text = readFileSync(resolve(root, 'CHANGELOG.md'), 'utf-8')
const fails = []

const header = /^##\s+(v[^\s—]+)\s+—\s+(\d{4}-\d{2}-\d{2})/m.exec(text)
if (!header) fails.push('顶部版本段缺失或格式不符（应为 `## vX.Y.Z — YYYY-MM-DD`）')

const headEnd = text.indexOf('\n## ', header ? header.index + 1 : 0)
const section = headEnd > 0 ? text.slice(header.index, headEnd) : text
const refs = [...section.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1])
for (const ref of refs) {
  if (/^https?:/.test(ref)) continue
  const path = ref.split('#')[0]
  if (path && !existsSync(resolve(root, path))) fails.push(`证据链接不存在：${ref}`)
}

if (fails.length) {
  console.error('check_changelog 失败：')
  for (const f of fails) console.error(' - ' + f)
  process.exit(1)
}
console.log(`check_changelog：${header?.[1] ?? '?'}（${header?.[2] ?? '?'}）段内 ${refs.length} 个链接全部有效`)
