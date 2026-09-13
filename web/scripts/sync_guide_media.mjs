// 使用指南媒体同步（粉饰清单①，S2 2026-09-13）：docs/readme（readme_media.mjs 唯一来源）
// → web/public/guide/，供 /guide 路由复用同一批经视觉核验的产品媒体。
// 用法：node scripts/sync_guide_media.mjs（复制而非手工重制——媒体纪律⑫）
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(__dirname, '../../docs/readme')
const DST = resolve(__dirname, '../public/guide')
mkdirSync(DST, { recursive: true })

// 与 Guide.tsx 引用一一对应；新增指南配图必须先入 readme 媒体池再登记到这里
const FILES = [
  'gif-search.gif',
  'gif-needs.gif',
  'gif-case-analysis.gif',
  'gif-contract.gif',
  'gif-theme.gif',
  'needs.png',
  'law-evidence.png',
  'contract-review.png',
  'workspace.png',
]

for (const f of FILES) copyFileSync(resolve(SRC, f), resolve(DST, f))
console.log(`synced ${FILES.length} media files -> public/guide/`)
