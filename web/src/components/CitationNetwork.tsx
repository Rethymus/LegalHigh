import { useEffect, useRef, useState } from 'react'

/* 引用网络力导向图（R304）：法律节点按被引案例数定大小，共被引关系连边。
   物理引擎复用 d3-force（ISC），SVG 一次绘制（结算后 innerHTML），悬停高亮。
   懒加载：d3-force ~2.5KB gzip，随本组件动态导入。 */

interface NetLaw {
  law_id: string
  title: string
  case_count: number
  citation_count: number
  articles: { no: number; sub: string | null; case_ids: string[] }[]
}

interface NetNode {
  id: string; title: string; r: number; x: number; y: number; case_count: number
}
interface NetLink { source: string; target: string; weight: number }

export function buildCoCitation(laws: NetLaw[]): { nodes: NetNode[]; links: NetLink[] } {
  const caseLaws = new Map<string, Set<string>>()
  for (const law of laws) {
    const ids = new Set<string>()
    for (const a of law.articles) for (const cid of a.case_ids) ids.add(cid)
    for (const cid of ids) {
      if (!caseLaws.has(cid)) caseLaws.set(cid, new Set())
      caseLaws.get(cid)!.add(law.law_id)
    }
  }
  const pairW = new Map<string, number>()
  for (const [, ls] of caseLaws) {
    const arr = [...ls]
    for (let i = 0; i < arr.length; i++)
      for (let j = i + 1; j < arr.length; j++) {
        const key = arr[i] < arr[j] ? `${arr[i]}|${arr[j]}` : `${arr[j]}|${arr[i]}`
        pairW.set(key, (pairW.get(key) ?? 0) + 1)
      }
  }
  const maxCc = Math.max(1, ...laws.map((l) => l.case_count))
  const nodes: NetNode[] = laws.map((l) => ({
    id: l.law_id, title: l.title,
    r: 6 + 14 * Math.sqrt(l.case_count / maxCc),
    x: 0, y: 0, case_count: l.case_count,
  }))
  const links: NetLink[] = []
  for (const [key, w] of pairW) {
    const [a, b] = key.split('|')
    links.push({ source: a, target: b, weight: w })
  }
  return { nodes, links }
}

export default function CitationNetwork({ laws, onPick }: { laws: NetLaw[]; onPick?: (lawId: string) => void }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    const svg = svgRef.current
    if (!svg || laws.length < 2) return
    let disposed = false
    const W = 900
    const H = 480

    const { nodes, links } = buildCoCitation(laws)

    // 初始坐标：圆周分散
    nodes.forEach((n, i) => {
      const angle = (i / Math.max(1, nodes.length)) * 2 * Math.PI
      n.x = W / 2 + W * 0.32 * Math.cos(angle)
      n.y = H / 2 + H * 0.32 * Math.sin(angle)
    })

    ;(async () => {
      try {
        const mod = await import('d3-force')
        if (disposed) return
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const modAny = mod as any
        const sim = modAny
          .forceSimulation(nodes)
          .force('link', modAny.forceLink(links).id(function(d: { id: string }) { return d.id }).distance(250).strength(0.06))
          .force('charge', modAny.forceManyBody().strength(-1200))
          .force('center', modAny.forceCenter(W / 2, H / 2))
          .force('collide', modAny.forceCollide(function(n: { r: number }) { return n.r + 6 }))
          .stop()
        sim.tick(350)
        if (disposed) return

        // 归一化节点坐标到画布
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
        for (const n of nodes) {
          if (n.x < minX) minX = n.x
          if (n.x > maxX) maxX = n.x
          if (n.y < minY) minY = n.y
          if (n.y > maxY) maxY = n.y
        }
        const pad = 55
        const sw = Math.max(1, maxX - minX)
        const sh = Math.max(1, maxY - minY)
        const sc = Math.min((W - 2 * pad) / sw, (H - 2 * pad) / sh)
        const ox = (W - sw * sc) / 2 - minX * sc
        const oy = (H - sh * sc) / 2 - minY * sc
        for (const n of nodes) { n.x = n.x * sc + ox; n.y = n.y * sc + oy }

        // 构建 SVG innerHTML：先节点圆（底层）→ 再连线（上层，确保可见）→ 最后标签
        const parts: string[] = []
        for (const n of nodes) {
          parts.push(`<circle cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="${n.r.toFixed(1)}" fill="#0069d9" fill-opacity="0.8" stroke="#fff" stroke-width="1"/>`)
        }
        for (const lk of links) {
          const sa = typeof lk.source === 'object' ? (lk.source as unknown as { x: number; y: number }) : nodes.find((n) => n.id === lk.source)
          const tb = typeof lk.target === 'object' ? (lk.target as unknown as { x: number; y: number }) : nodes.find((n) => n.id === lk.target)
          if (!sa || !tb) continue
          parts.push(`<line x1="${sa.x.toFixed(1)}" y1="${sa.y.toFixed(1)}" x2="${tb.x.toFixed(1)}" y2="${tb.y.toFixed(1)}" stroke="#999" stroke-width="${Math.min(3, 1 + lk.weight * 0.3)}" stroke-opacity="0.6"/>`)
        }
        for (const n of nodes) {
          const short = n.title.replace(/^中华人民共和国/, '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
          parts.push(`<text x="${n.x.toFixed(1)}" y="${(n.y + n.r + 4).toFixed(1)}" text-anchor="middle" font-size="9" fill="currentColor" style="pointer-events:none">${short}</text>`)
        }
        svg.setAttribute('viewBox', `0 0 ${W} ${H}`)
        svg.innerHTML = parts.join('')
      } catch (e) {
        if (!disposed) setErr(e instanceof Error ? e.message : String(e))
      }
    })()

    return () => { disposed = true }
  }, [laws, onPick])

  if (err) return <div className="tiny" style={{ color: 'var(--danger)' }}>网络图渲染失败：{err}</div>
  return (
    <div>
      <div className="tiny bold mb-8">引用网络（共被引）</div>
      <div className="tiny muted mb-8">
        节点大小 = 被引案例数 · 连线 = 两法共享同一被引案例 · 点击节点跳转法条页。
      </div>
      <svg ref={svgRef} style={{ width: '100%', height: 480 }} role="img" aria-label="引用网络图" />
    </div>
  )
}
