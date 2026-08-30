// FRAME 17 · Matter Detail —— 案件管理详情
// Matter/案件管理（多案件聚合、任务、协作）为规划功能：原型不虚构案件聚合数据。
// 本页仅当 id 为真实 server 记录（rv_* 审查 / df_* 草稿）时展示对应真实详情，否则显示诚实规划态。
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Icon } from '../icons'
import { EmptyState, PageHeader, SkeletonLines } from '../ui'
import { api, ApiError, type Draft, type Review } from '../../lib/api'

export default function MatterDetail() {
  const { mid } = useParams()
  const [kind] = useState(() => (mid ?? '').slice(0, 3))
  const [review, setReview] = useState<Review | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    if (kind === 'rv_') {
      api.getReview(mid!).then((r) => alive && (setReview(r), setLoading(false)), (e) => alive && (setError(e instanceof ApiError ? e.message : String(e)), setLoading(false)))
    } else if (kind === 'df_') {
      api.getDraft(mid!).then((d) => alive && (setDraft(d), setLoading(false)), (e) => alive && (setError(e instanceof ApiError ? e.message : String(e)), setLoading(false)))
    } else {
      setLoading(false)
    }
    return () => { alive = false }
  }, [mid, kind])

  return (
    <div className="page" style={{ maxWidth: 920 }}>
      <PageHeader
        back={<Link to="/workspace" className="tiny row" style={{ gap: 4 }}><Icon name="arrowL" size={13} />律师工作台</Link>}
        title={review ? review.title : draft ? `文书草稿 · ${mid}` : 'Matter 案件聚合'}
        sub={review || draft ? '真实记录详情' : '多案件聚合管理为规划功能——原型不虚构案件数据。'}
      />

      {loading && <div className="card card-pad"><SkeletonLines n={5} tall /></div>}

      {error && <div className="banner banner-danger mb-12"><Icon name="alert" size={15} /><span className="banner-tx">{error}</span></div>}
      {!loading && (review || draft) && (
        <div className="card card-pad">
          {review && (
            <>
              <div className="row-wrap mb-12">
                <span className="bdg bdg-blue">合同审查</span>
                <span className="tiny mono">{review.id}</span>
                <span className="tiny">{review.created_at.slice(0, 16).replace('T', ' ')}</span>
              </div>
              <p className="muted">{review.result.disclaimer}</p>
              <div className="row-wrap mt-12">
                <span className="bdg bdg-red">高 {review.result.summary.high}</span>
                <span className="bdg bdg-orange">中 {review.result.summary.medium}</span>
                <span className="bdg bdg-green">低 {review.result.summary.low}</span>
                <span className="spacer" />
                <Link to={`/contracts/${review.id}`} className="btn btn-secondary btn-sm">进入审查工作台</Link>
              </div>
            </>
          )}
          {draft && (
            <>
              <div className="row-wrap mb-12">
                <span className="bdg bdg-blue">文书草稿</span>
                <span className="tiny mono">{draft.id}</span>
                <span className={'bdg ' + (draft.status === 'issued' ? 'bdg-green' : draft.status === 'verified' ? 'bdg-blue' : 'bdg-orange')}>
                  {draft.status === 'issued' ? '已签发' : draft.status === 'verified' ? '已核验' : '草稿'}
                </span>
              </div>
              <div className="row mt-12">
                <Link to={`/draft`} className="btn btn-secondary btn-sm">返回文书起草</Link>
                <a className="btn btn-ghost btn-sm" href={`/api/drafts/${draft.id}/docx`} target="_blank" rel="noreferrer"><Icon name="download" size={13} />下载 DOCX</a>
              </div>
            </>
          )}
        </div>
      )}

      {!loading && !review && !draft && (
        <div className="card">
          <EmptyState icon="briefcase" title="Matter 案件聚合 · 规划中"
            desc="多案件聚合管理（任务/时间线/团队/证据盒）列入 M7 开发计划。当前工作台已提供真实审查记录、文书草稿、研究与投诉工单视图——不虚构演示案件。"
            action={<Link to="/workspace" className="btn btn-secondary">返回工作台</Link>} />
        </div>
      )}
    </div>
  )
}
