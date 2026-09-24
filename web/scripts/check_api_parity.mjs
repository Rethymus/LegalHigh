// 前后端 API 端点一致性检查（R70 教训固化：接线遗漏曾被前端静默容错掩盖三轮）。
// 正向（前端 req() 调用 → 后端 @app 路由）缺失即退出码 1（真实接线 bug）；
// 反向（后端路由无前端消费）仅提示（公开只读端点/下载端点等合法存在）。
// 用法：node scripts/check_api_parity.mjs（纯静态解析，无服务依赖）
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const mainPy = readFileSync(resolve(root, 'server/app/main.py'), 'utf-8')
const apiTs = readFileSync(resolve(root, 'web/src/lib/api.ts'), 'utf-8')

// 后端：@app.get("/api/...") 路由（{param} 参数段以 {name} 记录）
const backend = new Set()
for (const m of mainPy.matchAll(/@app\.(get|post|patch|delete|put)\("([^"]+)"/g)) {
  backend.add(m[2])
}

// 前端：req<...>(`/...`) 或 req<...>('/...') 的路径（${...} 插值段以 ${ 记录）
// 注意：/data/ 开头的是静态数据文件（vite public/），不是后端 API 路由，跳过
const frontend = new Set()
for (const m of apiTs.matchAll(/req<[\s\S]*?>\(\s*([`'"])(\/[^`'"]+)\1/g)) {
  if (m[2].startsWith('/data/')) continue // 静态数据文件（xrefs.json 等），非 API
  frontend.add(('/api' + m[2]).split('?')[0])
}

// 归一：剥离参数段后比对静态段序列；参数段（前端 ${..} / 后端 {..}）位置必须一致
const segs = (p) => p.replace('/api/', '').split('/').map((s) =>
  s.startsWith('${') ? '{param}' : s.startsWith('{') ? '{param}' : s)

const fails = []
for (const fp of [...frontend].sort()) {
  const f = segs(fp)
  const hit = [...backend].some((bp) => {
    const b = segs(bp)
    return b.length === f.length && b.every((s, i) => s === '{param}' || s === f[i])
  })
  if (!hit) fails.push(`前端调用 ${fp} 在后端无对应路由`)
}
for (const msg of fails) console.error('✗ ' + msg)

const orphanHint = [...backend].filter((bp) => {
  const b = segs(bp)
  return ![...frontend].some((fp) => {
    const f = segs(fp)
    return f.length === b.length && f.every((s, i) => s === '{param}' || b[i] === '{param}' || s === b[i])
  })
}).length
console.log(`check_api_parity：前端 ${frontend.size} 个调用全部可在后端路由中解析；后端 ${backend.size} 条路由中 ${orphanHint} 条无直接前端消费（公开只读/下载端点等，informational）`)
if (fails.length) process.exit(1)
