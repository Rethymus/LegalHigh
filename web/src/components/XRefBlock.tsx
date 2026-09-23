import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

/* 法内交叉引用（R308）：从语料文本自动提取的「本法第X条」内部引用，
   渲染为可点击链接帮助公民导航相关条文。数据出自语料文本正则提取
   + 目标存在性验证，零编造。懒加载：xrefs.json 仅在首次挂载时获取。 */

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
  const refs = (xrefs[lawId] ?? []).filter((x) => x.from === articleKey)
  if (!refs.length) return null

  return (
    <div className="card mb-12" style={{ padding: 14 }}>
      <div className="tiny bold mb-8">本文引用以下条文</div>
      <div className="chips">
        {refs.map((x) => (
          <Link key={x.to} className="chip" to={`/laws/${lawId}?art=${x.to}`} style={{ color: 'var(--accent-text)' }}>
            第{x.to}条
          </Link>
        ))}
      </div>
      <div className="tiny muted mt-4">交叉引用从条文文本自动提取并验证目标存在。</div>
    </div>
  )
}
