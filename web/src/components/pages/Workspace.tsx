// FRAME 16 · Workspace —— 工作台总览（真实数据驱动）
// 左：本机研究列表（localStorage）+ 团队协作（规划中，诚实标注）
// 中：server 真实数据 —— 审查记录（/api/reviews）· 文书草稿（/api/drafts）· 投诉工单（/api/complaints）
// 右：最近审计（/api/audit）—— 协作/多用户为规划功能，不虚构成员。
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../icons'
import { Dialog, EmptyState, PageHeader, SkeletonLines, Tabs, fmtTime, useToast } from '../ui'
import { api, ApiError, loadIdentity, type AuditEntry } from '../../lib/api'

const LS_LIST = 'lh:research:list'

export default function Workspace() {
  const [tab, setTab] = useState('reviews')
  const toast = useToast()
  const [reviews, setReviews] = useState<{ id: string; created_at: string; title: string; high: number; medium: number; low: number; findings: number }[] | null>(null)
  const [drafts, setDrafts] = useState<{ id: string; created_at: string; template_id: string; status: string }[] | null>(null)
  const [complaints, setComplaints] = useState<{ id: string; created_at: string; subject: string; status: string }[] | null>(null)
  const [audit, setAudit] = useState<AuditEntry[] | null>(null)
  const [researchList, setResearchList] = useState<{ rid: string; question: string; ts: string }[]>([])
  const [explains, setExplains] = useState<{ law_id: string; no: number; text: string; author: string; date?: string; source_note?: string }[] | null>(null)
  const [reviewerName, setReviewerName] = useState(() => loadIdentity().name)
  const [reviewerLicense, setReviewerLicense] = useState('')
  const loadExplains = () => api.explainsQueue().then((d) => setExplains(d.queue), (e) => toast(e instanceof ApiError ? e.message : String(e), 'err'))
  const [pending, setPending] = useState<{ kind: 'review' | 'draft' | 'complaint'; id: string; label: string } | null>(null)
  const reload = () => {
    const fail = (e: unknown) => toast(e instanceof ApiError ? e.message : String(e), 'err')
    api.listReviews().then((d) => setReviews(d.reviews), fail)
    api.listDrafts().then((d) => setDrafts(d.drafts), fail)
    api.listComplaints().then((d) => setComplaints(d.complaints), fail)
    api.auditAll(10).then((d) => setAudit(d.entries), fail)
    if (tab === 'explains') api.explainsQueue().then((d) => setExplains(d.queue), fail)
  }
  const confirmDelete = () => {
    if (!pending) return
    const call = pending.kind === 'review' ? api.deleteReview(pending.id) : pending.kind === 'draft' ? api.deleteDraft(pending.id) : api.deleteComplaint(pending.id)
    call.then(
      () => { setPending(null); toast('已删除（删除动作已写入审计）', 'ok'); reload() },
      (e) => { setPending(null); toast(e instanceof ApiError ? e.message : String(e), 'err') },
    )
  }
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    const err = (e: unknown) => alive && setError(e instanceof ApiError ? e.message : String(e))
    api.listReviews().then((d) => alive && setReviews(d.reviews), err)
    api.listDrafts().then((d) => alive && setDrafts(d.drafts), err)
    api.listComplaints().then((d) => alive && setComplaints(d.complaints), err)
    api.auditAll(10).then((d) => alive && setAudit(d.entries), err)
    api.explainsQueue().then((d) => alive && setExplains(d.queue), () => { /* 审核队列加载失败不阻塞其他 Tab */ })
    try { setResearchList(JSON.parse(localStorage.getItem(LS_LIST) ?? '[]')) } catch { /* 本机记录 */ }
    return () => { alive = false }
  }, [])

  // 切到「解读审核」Tab 时刷新队列
  useEffect(() => { if (tab === 'explains') loadExplains() }, [tab])

  return (
    <div className="page" style={{ maxWidth: 'none' }}>
      <PageHeader
        title="律师工作台"
        sub="你的全部工作记录：审查、文书、研究、投诉——全部来自 server 真实数据与本机记录；协作与多用户为规划功能（原型不虚构成员）。"
        actions={<Link to="/contracts" className="btn btn-primary"><Icon name="shield" size={14} />发起合同审查</Link>}
      />

      <div className="cols cols-3">
        {/* 左：研究列表（本机） */}
        <aside className="panel" style={{ maxHeight: 'calc(100vh - 300px)' }}>
          <div className="panel-h"><Icon name="sparkle" size={14} />我的研究<span className="spacer" /><span className="tiny">{researchList.length}</span></div>
          <div className="panel-b">
            {researchList.length > 0 ? researchList.map((r) => (
              <Link key={r.rid} to={`/research/${r.rid}`} className="lrow">
                <Icon name="sparkle" size={14} className="muted" />
                <span className="lrow-t">{r.question}</span>
                <span className="tiny">{r.ts.slice(5, 10)}</span>
              </Link>
            )) : <EmptyState icon="search" title="暂无研究" desc="从首页搜索或 AI 研究发起。" action={<Link to="/research" className="btn btn-secondary btn-sm">去研究</Link>} />}
          </div>
          <div className="panel-f tiny">研究列表仅保存在本机浏览器。</div>
        </aside>

        {/* 中：真实记录（审查/文书/投诉） */}
        <section className="panel" style={{ minHeight: 460 }}>
          <div className="panel-h" style={{ padding: 0 }}>
            <div style={{ flex: 1, padding: '0 12px' }}>
              <Tabs
                tabs={[{ key: 'reviews', label: '审查记录' }, { key: 'drafts', label: '文书草稿' }, { key: 'complaints', label: '投诉工单' }, { key: 'explains', label: '解读审核' }]}
                active={tab} onChange={setTab}
              />
            </div>
          </div>
          <div className="panel-b">
            {error && <div className="banner banner-danger mb-12"><Icon name="alert" size={15} /><span className="banner-tx">{error}</span></div>}
            {tab === 'reviews' && (
              reviews === null ? <SkeletonLines n={4} tall /> :
                reviews.length ? reviews.map((r) => (
                  <Link key={r.id} to={`/contracts/${r.id}`} className="lrow" style={{ border: '1px solid var(--div-soft)', marginBottom: 7 }}>
                    <Icon name="docShield" size={15} className="muted" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="bold" style={{ fontSize: 13 }}>{r.title}</div>
                      <span className="lrow-sub">{r.findings} 项风险 · {fmtTime(r.created_at)}</span>
                    </div>
                    {r.high > 0 && <span className="bdg bdg-red">高 {r.high}</span>}
                    {r.medium > 0 && <span className="bdg bdg-orange">中 {r.medium}</span>}
                    {r.high + r.medium + r.low === 0 && <span className="bdg bdg-green">未检出</span>}
                    <button className="btn btn-ghost btn-sm" onClick={(e) => { e.preventDefault(); setPending({ kind: 'review', id: r.id, label: r.title }) }} title="删除（PIPL 删除通道，写入审计）"><Icon name="trash" size={13} /></button>
                    <Icon name="chevR" size={13} className="muted" />
                  </Link>
                )) : <EmptyState icon="shield" title="暂无审查记录" desc="发起一次合同审查后在此展示（真实落库）。" action={<Link className="btn btn-secondary btn-sm" to="/contracts/c-1">发起审查</Link>} />
            )}
            {tab === 'drafts' && (
              drafts === null ? <SkeletonLines n={4} tall /> :
                drafts.length ? drafts.map((d) => (
                  <Link key={d.id} to={`/draft/validation?draft=${d.id}`} className="lrow" style={{ border: '1px solid var(--div-soft)', marginBottom: 7 }}>
                    <Icon name="file" size={15} className="muted" />
                    <span className="lrow-t">{TEMPLATE_NAME(d.template_id)} · {d.id}</span>
                    <span className={'bdg ' + (d.status === 'issued' ? 'bdg-green' : d.status === 'verified' ? 'bdg-blue' : 'bdg-orange')}>
                      {d.status === 'issued' ? '已签发' : d.status === 'verified' ? '已核验' : '草稿'}
                    </span>
                    <button className="btn btn-ghost btn-sm" onClick={(e) => { e.preventDefault(); setPending({ kind: 'draft', id: d.id, label: TEMPLATE_NAME(d.template_id) + ' ' + d.id }) }} title="删除（PIPL 删除通道，写入审计）"><Icon name="trash" size={13} /></button>
                  </Link>
                )) : <EmptyState icon="file" title="暂无文书草稿" action={<Link className="btn btn-secondary btn-sm" to="/draft">去起草</Link>} />
            )}
            {tab === 'complaints' && (
              complaints === null ? <SkeletonLines n={3} tall /> :
                complaints.length ? complaints.map((c) => (
                  <div key={c.id} className="lrow" style={{ border: '1px solid var(--div-soft)', marginBottom: 7, cursor: 'default' }}>
                    <Icon name="send" size={14} className="muted" />
                    <span className="lrow-t">{c.subject}</span>
                    <span className="bdg bdg-orange">{c.status}</span>
                    <button className="btn btn-ghost btn-sm" onClick={() => setPending({ kind: 'complaint', id: c.id, label: c.subject })} title="删除（PIPL 删除通道，写入审计）"><Icon name="trash" size={13} /></button>
                  </div>
                )) : <EmptyState icon="send" title="暂无投诉工单" desc="设置 → Privacy 提交后在此展示（真实落库）。" />
            )}
            {tab === 'explains' && (
              explains === null ? <SkeletonLines n={4} tall /> :
                explains.length ? explains.map((e) => (
                  <div key={`${e.law_id}-${e.no}`} className="lrow" style={{ border: '1px solid var(--div-soft)', marginBottom: 10, cursor: 'default', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="row mb-8" style={{ gap: 6 }}>
                        <span className="bdg bdg-orange">待审核</span>
                        <Link to={`/laws/${e.law_id}?art=${e.no}`} className="tiny" style={{ color: 'var(--accent-text)' }}>《{e.law_id}》第{e.no}条</Link>
                      </div>
                      <div className="tiny" style={{ lineHeight: 1.8 }}>{e.text}</div>
                      <div className="tiny mt-8" style={{ color: 'var(--tx-3)' }}>起草：{e.author}{e.date ? ` · ${e.date}` : ''}{e.source_note ? ` · ${e.source_note}` : ''}</div>
                      <div className="row mt-8" style={{ gap: 6 }}>
                        <input className="inp" style={{ width: 150, height: 30 }} placeholder="审核人姓名" value={reviewerName} onChange={(ev) => setReviewerName(ev.target.value)} />
                        <input className="inp" style={{ width: 150, height: 30 }} placeholder="执业证号（可选）" value={reviewerLicense} onChange={(ev) => setReviewerLicense(ev.target.value)} />
                        <button className="btn btn-primary btn-sm" disabled={!reviewerName.trim()} title="AI 起草内容经运营方审核后展示（生成式AI办法§9）"
                          onClick={() =>
                          api.reviewExplain(e.law_id, e.no, 'approve', reviewerName.trim(), reviewerLicense.trim()).then(
                            () => { toast(`已审核通过：${e.law_id}#${e.no}（审核人：${reviewerName.trim()}）`, 'ok'); loadExplains() },
                            (er) => toast(er instanceof ApiError ? er.message : String(er), 'err'),
                          )}><Icon name="verify" size={12} />审核通过</button>
                        <Link to={`/laws/${e.law_id}?art=${e.no}`} className="btn btn-ghost btn-sm">对照原文</Link>
                      </div>
                    </div>
                  </div>
                )) : <EmptyState icon="verify" title="解读队列已清空" desc="全部 AI 起草解读均已人工审核。" />
            )}
          </div>
        </section>

        {/* 右：最近审计 */}
        <aside className="panel" style={{ maxHeight: 'calc(100vh - 300px)' }}>
          <div className="panel-h"><Icon name="history" size={14} />最近操作<span className="spacer" /><Link to="/audit" className="tiny">全部审计</Link></div>
          <div className="panel-b">
            {audit === null && <SkeletonLines n={5} />}
            {audit && audit.map((a, i) => (
              <div key={i} className="tiny" style={{ padding: '5px 0', borderBottom: '1px dashed var(--div-soft)', lineHeight: 1.7 }}>
                <span className="mono">{fmtTime(a.ts, 't')}</span> · {String(a.actor ?? '')}
                <br /><span className="muted">{String(a.entity_type ?? '')} · {String(a.action ?? '')}</span>
              </div>
            ))}
            {audit?.length === 0 && <span className="tiny">暂无操作记录</span>}
          </div>
          <div className="panel-f tiny">团队协作与多用户为规划功能（M7+）——原型不虚构成员。</div>
        </aside>
      </div>

      <Dialog
        open={!!pending}
        title="确认删除（PIPL 删除通道）"
        actions={
          <>
            <button className="btn btn-ghost btn-sm" onClick={() => setPending(null)}>取消</button>
            <button className="btn btn-danger btn-sm" onClick={confirmDelete}>确认删除</button>
          </>
        }
      >
        将删除「{pending?.label}」，删除动作本身会写入 append-only 审计（可追溯、不可篡改）。
      </Dialog>
    </div>
  )
}

function TEMPLATE_NAME(id: string): string {
  return ({ lawyer_letter: '律师函', contract: '合同', civil_complaint: '民事起诉状', civil_answer: '民事答辩状', power_of_attorney: '授权委托书', legal_opinion: '法律意见书', preservation_application: '财产保全申请书' } as Record<string, string>)[id] ?? id
}
