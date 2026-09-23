import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

/* 法内交叉引用（R308/R312）：从语料文本自动提取的「本法第X条」内部引用。
   双向导航：出链（本文引用→其他条文）+ 入链（其他条文→引用本文）。
   数据出自语料文本正则提取 + 目标存在性验证，零编造。
   懒加载：xrefs.json 仅在首次挂载时获取（模块级缓存）。 */

type XRefEntry = { from: string; to: string; ctx: string }
type XRefData = Record<string, XRefEntry[]>

let cache: XRefData | null = null

export default function XRefBlock({ lawId = '', articleKey = '' }: { lawId?: string; articleKey?: string }) {
  const [xrefs, setXrefs] = useState<XRefData | null>(null)

  useEffect(() => {
    if (cache) { setXrefs(cache); return }
    fetch('/data/xrefs.json')
      .then((r) => r.json())
      .then((d) => { cache = d; setXrefs(d) })
      .catch(() => { setXrefs({}) })
  }, [])

  if (!xrefs) return null
  const all = xrefs[lawId] ?? []
  const outgoing = all.filter((x) => x.from === articleKey)
  const incoming = all.filter((x) => x.to === articleKey)
  if (!outgoing.length && !incoming.length) return null

  return (
    <div className="card mb-12" style={{ padding: 14 }}>
      {outgoing.length > 0 && (
        <>
          <div className="tiny bold mb-8">本文引用以下条文</div>
          <div className="chips mb-8">
            {outgoing.map((x) => (
              <Link key={`out-${x.to}`} className="chip" to={`/laws/${lawId}?art=${x.to}`} style={{ color: 'var(--accent-text)' }}>
                第{x.to}条
              </Link>
            ))}
          </div>
        </>
      )}
      {incoming.length > 0 && (
        <>
          <div className="tiny bold mb-8">以下条文引用本文</div>
          <div className="chips">
            {incoming.map((x) => (
              <Link key={`in-${x.from}`} className="chip" to={`/laws/${lawId}?art=${x.from}`} style={{ color: 'var(--ok, #1f7a35)' }}>
                第{x.from}条
              </Link>
            ))}
          </div>
        </>
      )}
      <div className="tiny muted mt-4">交叉引用从条文文本自动提取并验证目标存在（双向）。</div>
    </div>
  )
}
