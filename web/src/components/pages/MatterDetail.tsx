// 真实服务端记录的轻量详情入口（rv_* 审查 / df_* 草稿）。
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Icon } from '../icons'
import { EmptyState, PageHeader, SkeletonLines, useToast } from '../ui'
import { api, ApiError, type Draft, type Review } from '../../lib/api'

export default function MatterDetail() {
  const { mid } = useParams()
  const kind = (mid ?? '').slice(0, 3)
  const [review, setReview] = useState<Review | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()
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
        back={<Link to="/workspace" className="tiny row" style={{ gap: 4 }}><Icon name="arrowL" size={13} />专业工具工作台</Link>}
        title={review ? review.title : draft ? `文书草稿 · ${mid}` : '记录详情'}
        sub={review || draft ? '服务端真实记录' : '根据记录 ID 读取合同审查或文书草稿。'}
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
                <span className={'bdg ' + (draft.status === 'finalized' ? 'bdg-green' : draft.status === 'reviewed' ? 'bdg-blue' : 'bdg-orange')}>
                  {draft.status === 'finalized' ? '使用者已定稿' : draft.status === 'reviewed' ? '已复核' : '草稿'}
                </span>
              </div>
              <div className="row mt-12">
                <Link to={`/draft/validation?draft=${draft.id}`} className="btn btn-secondary btn-sm">查看交付前校验</Link>
                <button className="btn btn-ghost btn-sm" onClick={() => api.draftDocxDownload(draft.id, draft.template_id).catch((e) => toast(e instanceof Error ? e.message : String(e), 'err'))}><Icon name="download" size={13} />下载 DOCX</button>
              </div>
            </>
          )}
        </div>
      )}

      {!loading && !error && !review && !draft && (
        <div className="card">
          <EmptyState icon="briefcase" title="未找到对应记录"
            desc="该地址不是有效的合同审查或文书草稿记录 ID，或记录已被删除。"
            action={<Link to="/workspace" className="btn btn-secondary">返回工作台</Link>} />
        </div>
      )}
    </div>
  )
}
