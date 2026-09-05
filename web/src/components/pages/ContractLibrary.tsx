// FRAME 09 · Contract Library —— 合同中心（只展示真实审查记录）
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../icons'
import { EmptyState, PageHeader, SkeletonLines, fmtTime } from '../ui'
import { api, ApiError } from '../../lib/api'

interface ReviewSummary {
  id: string
  created_at: string
  title: string
  high: number
  medium: number
  low: number
  findings: number
}

function riskSummary(r: ReviewSummary) {
  if (r.high > 0) return <span className="bdg bdg-red">高 {r.high}</span>
  if (r.medium > 0) return <span className="bdg bdg-orange">中 {r.medium}</span>
  if (r.low > 0) return <span className="bdg bdg-green">低 {r.low}</span>
  return <span className="bdg bdg-gray">未检出规则风险</span>
}

export default function ContractLibrary() {
  const [q, setQ] = useState('')
  const [reviews, setReviews] = useState<ReviewSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    api.listReviews().then(
      (d) => { if (alive) { setReviews(d.reviews); setError(null) } },
      (e) => { if (alive) setError(e instanceof ApiError ? e.message : String(e)) },
    ).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const list = useMemo(() => {
    const term = q.trim().toLowerCase()
    return term ? reviews.filter((r) => `${r.title} ${r.id}`.toLowerCase().includes(term)) : reviews
  }, [q, reviews])

  return (
    <div className="page">
      <PageHeader
        title="合同审查"
        sub="合同文本提交本地规则引擎，结果、批注与操作时间均取自服务端；项目不内置虚构合同、客户或预设审查结论。"
        actions={
          <>
            <Link to="/contracts/new" className="btn btn-primary"><Icon name="plus" size={14} />粘贴合同文本</Link>
            <Link to="/compare" className="btn btn-secondary"><Icon name="compare" size={14} />版本对比</Link>
          </>
        }
      />

      <section className="card mb-16">
        <div className="card-h">
          <b className="card-h-t">本机审查记录</b>
          <span className="spacer" />
          <div className="searchbar" style={{ width: 280 }}>
            <Icon name="search" size={14} className="muted" />
            <input className="inp" placeholder="按名称或记录 ID 搜索…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        {error && <div className="banner banner-danger" style={{ margin: 16 }}><Icon name="alert" size={14} /><span className="banner-tx">审查服务不可用：{error}</span></div>}
        {loading && <div className="card-pad"><SkeletonLines n={4} /></div>}
        {!loading && !error && list.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl">
              <thead><tr><th>合同名称</th><th>规则发现</th><th>最高风险</th><th>创建时间</th><th>记录 ID</th><th /></tr></thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id}>
                    <td><Link to={`/contracts/${r.id}`} className="row" style={{ fontWeight: 600, color: 'var(--tx)' }}><Icon name="docShield" size={15} className="muted" />{r.title}</Link></td>
                    <td>{r.findings} 项</td>
                    <td>{riskSummary(r)}</td>
                    <td className="tiny">{fmtTime(r.created_at)}</td>
                    <td className="mono tiny">{r.id}</td>
                    <td><Link to={`/contracts/${r.id}`} className="res-act"><Icon name="external" size={12} />打开</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && !error && list.length === 0 && (
          <EmptyState icon="file" title={reviews.length ? '没有匹配的审查记录' : '尚无审查记录'} desc={reviews.length ? '请更换名称或记录 ID。' : '粘贴合同文本后，真实审查结果会出现在这里。'} action={!reviews.length ? <Link to="/contracts/new" className="btn btn-primary">开始审查</Link> : undefined} />
        )}
      </section>

    </div>
  )
}
