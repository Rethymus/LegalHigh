// FRAME 08 · Evidence Inspector —— 证据链核查（真实引擎驱动）
// 研究问题的依据链：Conclusion → Supported By → Statute（每条 references 均经 server citation_of 校验）
// 检索无命中 → 链路标红「缺少可靠依据」并停止（不继续生成）。Verify/Reject 标记仅存本机（诚实标注）。
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Icon } from '../icons'
import { EmptyState, PageHeader, SkeletonLines, useToast } from '../ui'
import { api, ApiError, type ResearchMemo } from '../../lib/api'

const LS_LIST = 'lh:research:list'
const LS_MARKS = 'lh:research:marks'

export default function EvidenceInspector() {
  const { rid } = useParams()
  const toast = useToast()
  const [memo, setMemo] = useState<ResearchMemo | null>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [marks, setMarks] = useState<Record<string, 'verified' | 'rejected'>>(() => { try { return JSON.parse(localStorage.getItem(LS_MARKS) ?? '{}') } catch { return {} } })

  const question = useMemo(() => {
    try { return (JSON.parse(localStorage.getItem(LS_LIST) ?? '[]') as { rid: string; question: string }[]).find((r) => r.rid === rid)?.question ?? null } catch { return null }
  }, [rid])

  useEffect(() => {
    let alive = true
    if (!question) { setBusy(false); return }
    api.researchMemo(question).then(
      (m) => alive && (setMemo(m), setBusy(false)),
      (e) => alive && (setError(e instanceof ApiError ? e.message : String(e)), setBusy(false)),
    )
    return () => { alive = false }
  }, [question])

  const mark = (key: string, v: 'verified' | 'rejected') => {
    setMarks((m) => { const next = { ...m, [key]: v }; localStorage.setItem(LS_MARKS, JSON.stringify(next)); return next })
    toast(v === 'verified' ? '已核验（标记仅存本机）' : '已驳回（标记仅存本机）', 'ok')
  }

  return (
    <div className="page">
      <PageHeader
        back={<Link to={rid ? `/research/${rid}` : '/research'} className="tiny row" style={{ gap: 4 }}><Icon name="arrowL" size={13} />返回研究</Link>}
        title="证据链核查 · Evidence Inspector"
        sub={memo ? `${memo.question} —— 每条依据均经 server citation 校验并携带版本/施行/来源字段。` : '每一条结论都必须可回溯到真实来源。'}
        actions={memo && <button className="btn btn-primary btn-sm" onClick={() => api.researchReport(memo.question).then(() => toast('核验报告 DOCX 已下载', 'ok')).catch(() => toast('导出失败', 'err'))}><Icon name="download" size={13} />导出核验报告</button>}
      />

      {busy && <div className="card card-pad"><SkeletonLines n={6} tall /></div>}
      {error && <div className="banner banner-danger mb-12"><Icon name="alert" size={15} /><span className="banner-tx">{error}</span></div>}
      {!busy && !question && (
        <div className="card"><EmptyState icon="search" title="未找到对应研究" desc="请从研究工作台发起研究后进入证据链核查。" action={<Link to="/research" className="btn btn-secondary">返回 AI 研究</Link>} /></div>
      )}

      {memo && (
        <div className="cols cols-2r" style={{ gridTemplateColumns: 'minmax(0,1fr) 300px' }}>
          <div>
            <div className="chain-lbl">Evidence Chain</div>
            {/* 链头：Conclusion */}
            <div className="chain-node">
              <span className="chain-dot" />
              <div className="evc" style={{ borderColor: 'rgba(10,132,255,.4)' }}>
                <div className="evc-h"><span className="ai-tag" style={{ height: 18, fontSize: 10 }}>AI</span><b style={{ fontSize: 12.5 }}>Conclusion · 研究结论待核</b></div>
                <div style={{ fontSize: 13, lineHeight: 1.8 }}>{memo.issue_frame.restate}</div>
                <div className="tiny mt-8">研究结论本身由研究者撰写（见研究画布「结论文稿」）；本页核查的是其下方的法源支撑链。</div>
              </div>
            </div>

            <div className="chain-lbl mt-16">Supported By · Statute（{memo.references.length}）</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {memo.references.map((r, i) => {
                const key = `${r.law_id}#${r.article_no}`
                const st = marks[key]
                return (
                  <div key={key} className="chain-node">
                    <span className="chain-dot" />
                    <div className="evc" style={st === 'rejected' ? { borderColor: 'var(--danger)' } : undefined}>
                      <div className="evc-h">
                        <span className="evc-id">EV-{String(i + 1).padStart(3, '0')}</span>
                        <b style={{ fontSize: 12.5 }}>《{r.law_title.replace(/^中华人民共和国/, '')}》{r.article_label}</b>
                        <span className="spacer" />
                        {st === 'verified' && <span className="bdg bdg-green">已核验</span>}
                        {st === 'rejected' && <span className="bdg bdg-red">已驳回</span>}
                      </div>
                      <div style={{ fontSize: 13, lineHeight: 1.8, marginBottom: 8 }}>{r.text}</div>
                      <div className="evc-kv">
                        <dt>文档位置</dt><dd>{memo.cards.find((c) => c.law_id === r.law_id && c.article_no === r.article_no)?.chapter ?? '—'}</dd>
                        <dt>时效性</dt><dd>{r.status} · {r.effective_date} 施行</dd>
                        <dt>法域</dt><dd>中国</dd>
                        <dt>来源</dt><dd><a href={r.source_url} target="_blank" rel="noreferrer" style={{ wordBreak: 'break-all' }}>{r.source_url.slice(0, 60)}…</a></dd>
                        <dt>Retrieved</dt><dd className="mono">本机检索 · {new Date().toISOString().slice(0, 16).replace('T', ' ')}</dd>
                      </div>
                      <div className="evc-acts">
                        <button className="btn btn-secondary btn-sm" onClick={() => mark(key, 'verified')}><Icon name="verify" size={12} />核验</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => mark(key, 'rejected')}><Icon name="reject" size={12} />驳回</button>
                        <Link className="btn btn-ghost btn-sm" to={`/laws/${r.law_id}?art=${r.article_no}`}><Icon name="external" size={12} />查看原文</Link>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {memo.gaps.length > 0 && (
              <div className="chain-node mt-16">
                <span className="chain-dot" style={{ borderColor: 'var(--danger)', background: 'var(--danger-soft)' }} />
                <div className="evc missing">
                  <div className="evc-h"><span className="bdg bdg-red"><Icon name="alert" size={11} />缺少可靠依据</span></div>
                  {memo.gaps.map((g) => <div key={g} style={{ fontSize: 13, lineHeight: 1.8 }}>{g}</div>)}
                  <div className="tiny mt-8">检索无命中即停止：本系统不生成无依据的结论。</div>
                </div>
              </div>
            )}

            <div className="banner banner-info mt-16"><Icon name="info" size={15} />
              <span className="banner-tx"><b>用户操作：</b>Verify / Reject 标记仅保存于本机浏览器（原型无账号体系）；来源、时效与原文链接均来自本地语料并可复核。</span>
            </div>
          </div>

          <aside style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="card card-pad">
              <div className="tiny bold mb-8">链路结构</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
                <span className="lrow"><span className="ai-tag" style={{ height: 18, fontSize: 10 }}>AI</span>Conclusion（研究者撰写）</span>
                <span className="tiny" style={{ paddingLeft: 26 }}>↓ Supported By</span>
                <span className="lrow"><span className="sg sg-law">Statute × {memo.references.length}</span></span>
                <span className="tiny" style={{ paddingLeft: 26 }}>↓ 检索方法</span>
                <span className="lrow"><span className="bdg bdg-purple">{memo.meta.method}</span></span>
              </div>
            </div>
            <div className="card card-pad">
              <div className="tiny bold mb-8">本页统计</div>
              <div className="row-wrap" style={{ gap: 8 }}>
                <span className="bdg bdg-green">已支持 {memo.references.length}</span>
                <span className="bdg bdg-red">缺少依据 {memo.gaps.length > 0 ? 1 : 0}</span>
                <span className="bdg bdg-blue">本机核验 {Object.values(marks).filter((v) => v === 'verified').length}</span>
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}
