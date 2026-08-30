// FRAME 13 · Document Validation —— 交付前校验（规格 §20，真实 API 驱动）
// server GET /api/drafts/{did}/validation：程序化检查（必填要素/占位符/主体一致/日期一致/引用有效且可溯源/结构/签发 gate）
// 存在问题 → Need Review 且不可视为可交付；全部通过且已签发 → Ready
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Icon } from '../icons'
import { EmptyState, PageHeader, SkeletonLines, useToast, fmtTime } from '../ui'
import { api, ApiError, type DraftValidation } from '../../lib/api'

const TEMPLATE_NAMES: Record<string, string> = {
  lawyer_letter: '律师函', contract: '合同', civil_complaint: '民事起诉状',
}

export default function DraftValidation() {
  const [sp, setSp] = useSearchParams()
  const did = sp.get('draft')
  const toast = useToast()

  const [drafts, setDrafts] = useState<{ id: string; created_at: string; template_id: string; status: string }[]>([])
  const [v, setV] = useState<DraftValidation | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(!!did)

  useEffect(() => {
    api.listDrafts().then((d) => setDrafts(d.drafts), () => setDrafts([]))
  }, [v])

  useEffect(() => {
    if (!did) { setV(null); return }
    setLoading(true); setError(null)
    api.draftValidation(did).then(
      (d) => setV(d),
      (e) => setError(e instanceof ApiError ? e.message : String(e)),
    ).finally(() => setLoading(false))
  }, [did])

  const groups = v ? [...new Set(v.checks.map((c) => c.group))] : []

  return (
    <div className="page" style={{ maxWidth: 920 }}>
      <PageHeader
        back={<Link to="/draft" className="tiny row" style={{ gap: 4 }}><Icon name="arrowL" size={13} />返回文书起草</Link>}
        title="交付前校验 · Pre-delivery Validation"
        sub="生成文书后强制校验：要素完整性、法律引用（语料解析 + 现行有效）、格式规范与签发 gate。存在问题则状态为 Need Review。"
      />

      {/* 草稿选择 */}
      {!did && (
        <div className="card mb-16">
          <div className="card-h"><b className="card-h-t">选择要校验的草稿</b></div>
          <div className="card-b" style={{ paddingBlock: 8 }}>
            {drafts.map((d) => (
              <button key={d.id} className="lrow" style={{ width: '100%', textAlign: 'left', border: '1px solid var(--div-soft)', marginBottom: 7 }}
                onClick={() => setSp({ draft: d.id })}>
                <Icon name="file" size={15} className="muted" />
                <span className="lrow-t">{TEMPLATE_NAMES[d.template_id] ?? d.template_id} · {d.id}</span>
                <span className={'bdg ' + (d.status === 'issued' ? 'bdg-green' : d.status === 'verified' ? 'bdg-blue' : 'bdg-orange')}>
                  {d.status === 'issued' ? '已签发' : d.status === 'verified' ? '已核验' : '草稿'}
                </span>
                <span className="tiny mono">{fmtTime(d.created_at)}</span>
              </button>
            ))}
            {drafts.length === 0 && (
              <EmptyState icon="file" title="暂无草稿" desc="先在文书起草中生成草稿，再进入交付前校验。"
                action={<Link to="/draft" className="btn btn-secondary">去文书起草</Link>} />
            )}
          </div>
        </div>
      )}

      {error && <div className="banner banner-danger mb-12"><Icon name="alert" size={15} /><span className="banner-tx">{error}</span></div>}
      {loading && <div className="card card-pad"><SkeletonLines n={6} tall /></div>}

      {v && (
        <>
          <div className="row-wrap mb-16">
            {v.ready
              ? <span className="bdg bdg-green" style={{ height: 30, fontSize: 13 }}><Icon name="verify" size={13} />Ready · 可对外交付</span>
              : <span className="bdg bdg-red" style={{ height: 30, fontSize: 13 }}><Icon name="alert" size={13} />Need Review</span>}
            <span className="bdg bdg-gray">{TEMPLATE_NAMES[v.template_id] ?? v.template_id}</span>
            <span className="tiny mono">{v.draft_id}</span>
            <span className="spacer" />
            <button className="btn btn-ghost btn-sm" onClick={() => api.draftValidation(v.draft_id).then(setV).catch(() => toast('刷新失败', 'err'))}><Icon name="refresh" size={13} />重新校验</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setSp({})}>切换草稿</button>
          </div>

          <div className={v.ready ? 'banner banner-ok mb-16' : 'banner banner-danger mb-16'}>
            <Icon name={v.ready ? 'verify' : 'alert'} size={15} />
            <span className="banner-tx">
              {v.ready
                ? '全部程序化校验通过且已完成签发。注意：对外交付前请再次确认实体事实与授权范围。'
                : v.need_review
                  ? '存在未通过的校验项（见下方红项）。修正后重新校验。'
                  : '程序化校验全部通过，但文书尚未完成签发 gate（执业律师核验签发）——未签发不得对外发出。'}
            </span>
            <span className="spacer" />
            {v.status !== 'issued' && <Link to="/draft" className="btn btn-secondary btn-sm">返回起草页走签发流程</Link>}
          </div>

          {groups.map((g) => {
            const items = v.checks.filter((c) => c.group === g)
            const passed = items.filter((c) => c.pass).length
            return (
              <div className="card mb-16" key={g}>
                <div className="card-h"><b className="card-h-t">{g}</b><span className="spacer" /><span className="tiny">{passed}/{items.length} 通过</span></div>
                <div className="card-b" style={{ paddingBlock: 6 }}>
                  {items.map((c) => (
                    <div key={c.id} className="check-row">
                      <span className={'check-ic ' + (c.pass ? 'pass' : 'fail')}>
                        <Icon name={c.pass ? 'check' : 'x'} size={12} strokeWidth={2.4} />
                      </span>
                      <div style={{ flex: 1 }}>
                        <div className="check-t">{c.title}</div>
                        <div className="check-d" style={c.pass ? undefined : { color: 'var(--danger)' }}>{c.detail}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}

          <div className="banner banner-info"><Icon name="info" size={15} />
            <span className="banner-tx">{v.disclaimer} 校验 Gate 对应 ABA 512 与「AI 不得代替法官裁判」要求：高风险文书必须经人工核验签出。</span>
          </div>
        </>
      )}
    </div>
  )
}
