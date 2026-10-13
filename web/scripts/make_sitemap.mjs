// sitemap.xml 生成（R576：兑现 R560 robots.txt 的 Sitemap 指针）。
// 静态说明站公开路由清单（HashRouter 的 #/ 形式）；排除带参路由/工作台/设置等
// 私有或个性化页面。用法：node scripts/make_sitemap.mjs（build 前手动或 CI 调用）。
import { writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const BASE = 'https://rethymus.github.io/LegalHigh'

// 公开静态路由（与 App.tsx 对齐；:lawId/:caseId 等带参路由不入 sitemap——
// 爬虫从 /laws、/cases 列表页自然发现）
const PUBLIC_ROUTES = [
  '/', '/needs', '/search', '/laws', '/cases', '/research',
  '/guide', '/terms', '/quiz', '/cases/compare', '/process',
  '/learning', '/data-sources', '/quality', '/collections',
]

const today = new Date().toISOString().slice(0, 10)
const urls = PUBLIC_ROUTES.map((r) => `  <url><loc>${BASE}/#${r === '/' ? '/' : r}</loc><lastmod>${today}</lastmod></loc></url>`)
  .map((x) => x.replace('</loc></url>', '</url>'))
  .join('\n')

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`
writeFileSync(resolve(root, 'web/public/sitemap.xml'), xml)
console.log(`sitemap.xml 已生成：${PUBLIC_ROUTES.length} 个公开路由`)
