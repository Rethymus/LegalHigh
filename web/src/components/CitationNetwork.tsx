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
        // R472（legal-visualization 方法论吸收 + 假交互修复）：
        // ①度数语义着色——「颜色含义优先，同主体同色」：全部节点同属「被引法律」主体，
        //   按共被引连接度分三档，用主色深浅表达核心度（单色系语义渐变，非装饰，强调色不超3）；
        // ②图例标准件——SVG 内嵌右下角图例（节点大小/连线粗细/颜色分档语义）；
        // ③假交互修复——R304 声称「悬停高亮/点击跳转」但从未绑定事件（onPick 由
        //   DataSources 传入后无人消费）：circle 携带 data-id + 事件委托实现点击跳转与悬停提亮。
        const deg = new Map<string, number>()
        // forceLink 会把 source/target 突变为节点对象——此处两种形态都要认（度数在模拟后计算）
        const idOf = (v: unknown): string => (typeof v === 'object' && v !== null ? (v as { id: string }).id : String(v))
        for (const lk of links) {
          deg.set(idOf(lk.source), (deg.get(idOf(lk.source)) ?? 0) + 1)
          deg.set(idOf(lk.target), (deg.get(idOf(lk.target)) ?? 0) + 1)
        }
        const degs = [...deg.values()]
        const dMax = Math.max(1, ...degs)
        const dCut = [Math.max(1, Math.round(dMax * 0.33)), Math.max(2, Math.round(dMax * 0.66))]
        const fillFor = (id: string): string => {
          const d = deg.get(id) ?? 0
          if (d >= dCut[1]) return '#084c8f' // 高核心度（深）
          if (d >= dCut[0]) return '#0a6ad0' // 中（主色）
          return '#7ab3e8' // 低（浅）
        }
        const parts: string[] = []
        for (const n of nodes) {
          parts.push(`<circle data-law="${n.id}" cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="${n.r.toFixed(1)}" fill="${fillFor(n.id)}" fill-opacity="0.85" stroke="#fff" stroke-width="1" style="cursor:pointer"><title>${n.title.replace(/&/g, '&amp;').replace(/</g, '&lt;')}（共被引连接 ${deg.get(n.id) ?? 0}）</title></circle>`)
        }
        for (const lk of links) {
          const sa = typeof lk.source === 'object' ? (lk.source as unknown as { x: number; y: number }) : nodes.find((n) => n.id === lk.source)
          const tb = typeof lk.target === 'object' ? (lk.target as unknown as { x: number; y: number }) : nodes.find((n) => n.id === lk.target)
          if (!sa || !tb) continue
          parts.push(`<line x1="${sa.x.toFixed(1)}" y1="${sa.y.toFixed(1)}" x2="${tb.x.toFixed(1)}" y2="${tb.y.toFixed(1)}" stroke="#999" stroke-width="${Math.min(3, 1 + lk.weight * 0.3)}" stroke-opacity="0.6"/>`)
        }
        // R472 标签防叠（视觉验收抓出密集核心标签互叠）：贪心放置——大节点优先，
        // 标签默认在节点下方，与已放置标签碰撞时依次试上方/更下方/更上方，确定性无随机。
        const placed: { x1: number; y1: number; x2: number; y2: number }[] = []
        const byR = [...nodes].sort((a, b) => b.r - a.r || (a.id < b.id ? -1 : 1))
        const labelY = new Map<string, number>()
        const overlap = (x1: number, y1: number, x2: number, y2: number) =>
          placed.some((p) => x1 < p.x2 + 3 && x2 > p.x1 - 3 && y1 < p.y2 + 2 && y2 > p.y1 - 2)
        for (const n of byR) {
          const short = n.title.replace(/^中华人民共和国/, '')
          const w = Math.max(3, short.length) * 9.2
          const candidates = [n.y + n.r + 13, n.y - n.r - 6, n.y + n.r + 26, n.y - n.r - 19]
          let chosen = candidates[0]
          for (const cy of candidates) {
            const y1 = cy - 9, y2 = cy + 2
            if (!overlap(n.x - w / 2, y1, n.x + w / 2, y2)) { chosen = cy; break }
          }
          placed.push({ x1: n.x - w / 2, y1: chosen - 9, x2: n.x + w / 2, y2: chosen + 2 })
          labelY.set(n.id, chosen)
        }
        for (const n of nodes) {
          const short = n.title.replace(/^中华人民共和国/, '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
          const y = labelY.get(n.id) ?? n.y + n.r + 13
          parts.push(`<text x="${n.x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" font-size="9" fill="currentColor" style="pointer-events:none">${short}</text>`)
        }
        // 图例标准件（右下角内嵌）：节点大小 / 连线粗细 / 度数分档色
        parts.push(
          `<g id="cit-legend" style="pointer-events:none">` +
          `<rect x="${W - 250}" y="${H - 96}" width="238" height="86" rx="8" fill="rgba(127,127,127,0.08)" stroke="rgba(127,127,127,0.25)"/>` +
          `<text x="${W - 238}" y="${H - 78}" font-size="10" fill="currentColor" font-weight="600">图例</text>` +
          `<circle cx="${W - 228}" cy="${H - 62}" r="9" fill="#7ab3e8"/><text x="${W - 212}" y="${H - 58}" font-size="9.5" fill="currentColor">低连接度</text>` +
          `<circle cx="${W - 228}" cy="${H - 44}" r="9" fill="#0a6ad0"/><text x="${W - 212}" y="${H - 40}" font-size="9.5" fill="currentColor">中连接度</text>` +
          `<circle cx="${W - 228}" cy="${H - 26}" r="9" fill="#084c8f"/><text x="${W - 212}" y="${H - 22}" font-size="9.5" fill="currentColor">高连接度（共被引核心）</text>` +
          `<line x1="${W - 130}" y1="${H - 62}" x2="${W - 106}" y2="${H - 62}" stroke="#999" stroke-width="1" stroke-opacity="0.6"/><text x="${W - 100}" y="${H - 58}" font-size="9.5" fill="currentColor">连线细=弱共被引</text>` +
          `<line x1="${W - 130}" y1="${H - 44}" x2="${W - 106}" y2="${H - 44}" stroke="#999" stroke-width="3" stroke-opacity="0.6"/><text x="${W - 100}" y="${H - 40}" font-size="9.5" fill="currentColor">连线粗=强共被引</text>` +
          `<text x="${W - 100}" y="${H - 22}" font-size="9.5" fill="currentColor">节点大小=被引案例数</text>` +
          `</g>`)
        svg.setAttribute('viewBox', `0 0 ${W} ${H}`)
        svg.innerHTML = parts.join('')
        // 事件委托：点击节点 → onPick 跳转（假交互修复的核心接线）
        svg.onclick = (ev) => {
          const t = ev.target as SVGElement
          const lawId = t?.getAttribute?.('data-law')
          if (lawId && onPick) onPick(lawId)
        }
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
        节点大小 = 被引案例数 · 颜色深浅 = 共被引连接度 · 连线粗细 = 共被引强度 · 点击节点跳转法条页，悬停显示详情。
      </div>
      <svg ref={svgRef} style={{ width: '100%', height: 480 }} role="img" aria-label="引用网络图" />
    </div>
  )
}
