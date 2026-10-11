import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { loadTerms, type TermCard } from '../data/terms'

/* 搜索建议（R310）：用户输入时实时匹配术语卡（term/explain 词面），
   引导从口语表述（「别人打我我还手」）到法条词面（「正当防卫」）。
   零新依赖——纯 JS 子串匹配 215 条已验证术语卡。
   术语卡的 refs 指向语料内真实条文（R248 机器门钉住）。
   R508：术语数据为静态资产异步加载——模块加载即预热，用户开始输入前
   多半已就绪；未就绪时建议列表暂不出现（优雅降级，不阻塞输入）。 */

type TermT = TermCard

// 模块级预热：SearchHome 路由 chunk 加载时立即取数（不等首键输入）
void loadTerms().catch(() => { /* 失败静默——建议功能缺失不阻塞搜索本体 */ })

export default function SearchSuggest({ query, onPick }: { query: string; onPick?: (q: string) => void }) {
  const nav = useNavigate()
  const [activeIdx, setActiveIdx] = useState(-1)
  const listRef = useRef<HTMLDivElement>(null)
  const [terms, setTerms] = useState<TermT[] | null>(null)
  useEffect(() => {
    let alive = true
    loadTerms().then((d) => { if (alive) setTerms(d) }, () => { /* 保持无建议态 */ })
    return () => { alive = false }
  }, [])

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q.length < 1 || !terms) return []
    // R510 修复：原实现 term.includes(整句问话) 方向反了——口语长句永远不是短术语的
    // 子串，本组件宣称的「别人打我我还手→正当防卫」引导从未发生过（走查实录）。
    // 三层匹配：整词前缀（100）/ 整词包含（80）/ 问句与解释的 bigram 重合（60，
    // 口语词面桥接：问句任一连续二字段出现在解释里即得分，按重合数加权）。
    const qGrams = new Set(Array.from({ length: Math.max(0, q.length - 1) }, (_, i) => q.slice(i, i + 2)))
    const scored: { t: TermT; score: number }[] = []
    for (const t of terms) {
      const term = t.term.toLowerCase()
      const explain = t.explain.toLowerCase()
      let score = 0
      if (term.includes(q)) score = term.startsWith(q) ? 100 : 80
      if (score === 0 && qGrams.size > 0) {
        let overlap = 0
        for (const g of qGrams) if (explain.includes(g)) overlap += 1
        if (overlap >= 2) score = 40 + Math.min(overlap, 20) // ≥2 个二字重合才浮现，控噪
      }
      if (score > 0) scored.push({ t, score })
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, 6).map((x) => x.t)
  }, [query, terms])

  if (!suggestions.length) return null

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1)); e.preventDefault() }
    else if (e.key === 'ArrowUp') { setActiveIdx((i) => Math.max(i - 1, -1)); e.preventDefault() }
    else if (e.key === 'Enter' && activeIdx >= 0) {
      const s = suggestions[activeIdx]
      nav(`/laws/${s.refs[0].law_id}?art=${s.refs[0].art}`)
    }
  }

  return (
    <div
      ref={listRef}
      className="search-suggest"
      style={{
        position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
        background: 'var(--bg, #fff)', border: '1px solid var(--hairline, rgba(0,0,0,0.1))',
        borderRadius: '0 0 10px 10px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        maxHeight: 320, overflowY: 'auto',
      }}
      onKeyDown={handleKey}
    >
      <div className="tiny muted" style={{ padding: '6px 12px', borderBottom: '1px solid var(--hairline)' }}>
        术语卡建议（↓↑ 导航，Enter 跳转条文）
      </div>
      {suggestions.map((s, i) => (
        <button
          key={s.term}
          type="button"
          className={'search-suggest-item' + (i === activeIdx ? ' is-on' : '')}
          style={{
            display: 'flex', alignItems: 'flex-start', gap: 8, width: '100%',
            padding: '8px 12px', textAlign: 'left', cursor: 'pointer',
            background: i === activeIdx ? 'var(--bg-2, #f5f5f5)' : 'transparent',
            border: 'none', borderBottom: '1px solid var(--hairline)',
          }}
          onMouseEnter={() => setActiveIdx(i)}
          onClick={() => {
            const r = s.refs[0]
            nav(`/laws/${r.law_id}?art=${r.art}`)
            onPick?.(s.term)
          }}
        >
          <span className="bdg bdg-gray" style={{ fontSize: 10, flexShrink: 0, marginTop: 2 }}>{s.cat}</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span className="bold" style={{ fontSize: 13 }}>{s.term}</span>
            <span className="tiny muted" style={{ display: 'block', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {s.explain.slice(0, 60)}…
            </span>
          </span>
        </button>
      ))}
    </div>
  )
}
