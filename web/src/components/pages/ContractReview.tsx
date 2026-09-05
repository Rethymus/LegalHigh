// FRAME 10 · Contract Review —— 三栏工作台（真实 API 驱动）
// server: POST /api/reviews（费用/账户/责任审查点引擎）→ 批注状态机（adopt/amend/reject/reopen）→ append-only 审计
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Icon } from '../icons'
import { EmptyState, PageHeader, useToast, fmtTime } from '../ui'
import { CitationChip } from '../domain'
import { api, ApiError, type Annotation, type AuditEntry, type Finding, type Review } from '../../lib/api'

const CATEGORY_LABEL: Record<string, string> = { fee: '费用', account: '账户', liability: '责任' }
const STATE_LABEL: Record<Annotation['state'], { label: string; cls: string }> = {
  pending: { label: '待复核', cls: 'bdg-orange' },
  adopted: { label: '已采纳', cls: 'bdg-green' },
  amended: { label: '已修改', cls: 'bdg-blue' },
  rejected: { label: '已驳回', cls: 'bdg-gray' },
}
const RISK_CLS: Record<string, string> = { high: 'r-high', medium: 'r-mid', low: 'r-low' }
const RISK_BDG: Record<string, string> = { high: 'bdg-red', medium: 'bdg-orange', low: 'bdg-green' }
const RISK_LABEL: Record<string, string> = { high: '高风险', medium: '中风险', low: '低风险' }

export default function ContractReview() {
  const { cid } = useParams()
  const validTarget = cid === 'new' || !!cid?.startsWith('rv_')
  const toast = useToast()

  const [rid, setRid] = useState<string | null>(() => cid?.startsWith('rv_') ? cid : null)
  const [review, setReview] = useState<Review | null>(null)
  const [audit, setAudit] = useState<AuditEntry[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [section, setSection] = useState<string | null>(null)
  const [activeFinding, setActiveFinding] = useState<string | null>(null)
  const [amending, setAmending] = useState<string | null>(null)
  const [amendText, setAmendText] = useState('')
  const returnFileRef = useRef<HTMLInputElement>(null)
  const [reviewTitle, setReviewTitle] = useState('')
  const [reviewText, setReviewText] = useState('')

  const load = useCallback(async (id: string) => {
    setBusy(true); setError(null)
    try {
      const r = await api.getReview(id)
      setReview(r)
      // 默认选中第一条「有风险」的条款，避免右栏显示「未检出风险」与目录徽章矛盾
      const firstWithFindings = r.result.findings.find((f) => f.clause_id)?.clause_id ?? r.result.clauses[0]?.id ?? null
      setSection((s) => s ?? firstWithFindings)
      try { setAudit((await api.reviewAudit(id)).entries.slice().reverse().slice(0, 8)) } catch { setAudit([]) }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e))
      if (e instanceof ApiError && e.status === 404) setRid(null)
    } finally { setBusy(false) }
  }, [])

  useEffect(() => { if (rid) void load(rid) }, [rid, load])

  const createReview = async () => {
    if (!reviewText.trim()) { toast('审查文本为空', 'err'); return }
    setBusy(true); setError(null)
    try {
      const created = await api.createReview(reviewText, reviewTitle.trim() || undefined)
      setRid(created.review_id)
      toast('规则审查完成：费用、账户与责任审查点已扫描', 'ok')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e))
    } finally { setBusy(false) }
  }

  const transition = async (findingId: string, action: 'adopt' | 'amend' | 'reject' | 'reopen', amended?: string) => {
    if (!rid) return
    setBusy(true)
    try {
      await api.transitionAnnotation(rid, findingId, action, amended)
      await load(rid)
      toast(`批注已${action === 'adopt' ? '采纳' : action === 'amend' ? '修改' : action === 'reject' ? '驳回' : '重开'}并写入审计`, 'ok')
    } catch (e) {
      toast(e instanceof ApiError ? e.message : String(e), 'err')
    } finally { setBusy(false); setAmending(null) }
  }

  const findingsByClause = useMemo(() => {
    const m = new Map<string, Finding[]>()
    for (const f of review?.result.findings ?? []) {
      if (!f.clause_id) continue
      if (!m.has(f.clause_id)) m.set(f.clause_id, [])
      m.get(f.clause_id)!.push(f)
    }
    return m
  }, [review])
  const annotationByFinding = useMemo(() => {
    const m = new Map<string, Annotation>()
    for (const a of review?.annotations ?? []) m.set(a.finding_id, a)
    return m
  }, [review])
  const shownFindings = useMemo(() => {
    const fs = review?.result.findings ?? []
    if (!section) return fs
    return fs.filter((f) => f.clause_id === section || f.clause_id === null)
  }, [review, section])

  if (!validTarget) {
    return (
      <div className="page">
        <EmptyState icon="file" title="未找到该合同" action={<Link to="/contracts" className="btn btn-secondary">返回合同中心</Link>} />
      </div>
    )
  }

  return (
    <div className="page" style={{ maxWidth: 'none' }}>
      <PageHeader
        back={<Link to="/contracts" className="tiny row" style={{ gap: 4 }}><Icon name="arrowL" size={13} />合同中心</Link>}
        title={review?.title ?? '新合同审查'}
        sub={review
          ? `审查引擎：${review.result.engine_meta.checkpoint_count} 个审查点 · ${review.result.engine_meta.clause_count} 条条款 · 批注 ${review.annotations.length} 条（全部操作已审计）`
          : '粘贴你有权处理的合同文本；发起后由本地费用、账户与责任规则引擎逐条扫描'}
        actions={
          <>
            {review && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => review && load(review.id)}><Icon name="refresh" size={13} />刷新</button>}
            {review && <button className="btn btn-secondary btn-sm" onClick={() => api.reviewDocxDownload(review.id).catch((e) => toast(e instanceof Error ? e.message : String(e), 'err'))}><Icon name="download" size={13} />下载修订稿（Word）</button>}
            {review && (
              <>
                <input ref={returnFileRef} type="file" accept=".docx" style={{ display: 'none' }}
                  onChange={async (e) => {
                    const f = e.target.files?.[0]
                    e.target.value = ''
                    if (!f || !review) return
                    try {
                      const r = await api.reviewDocxReturn(review.id, f)
                      toast(`回传完成：采纳 ${r.accepted_n} · 拒绝 ${r.rejected_n} · 未处理 ${r.pending}${r.skipped.length ? ` · 跳过 ${r.skipped.length}` : ''}`, r.skipped.length ? 'err' : 'ok')
                      if (review) load(review.id)
                    } catch (er) { toast(er instanceof ApiError ? er.message : String(er), 'err') }
                  }} />
                <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => returnFileRef.current?.click()} title="律师在 Word 中接受/拒绝修订后回传，批注状态机将同步"><Icon name="refresh" size={13} />回传修订稿</button>
              </>
            )}
            {!rid && <button className="btn btn-primary" disabled={busy} onClick={createReview}><Icon name="zap" size={14} />{busy ? '审查中…' : '发起规则审查'}</button>}
          </>
        }
      />

      {error && (
        <div className="banner banner-danger mb-12"><Icon name="alert" size={15} />
          <span className="banner-tx">{error}</span><span className="spacer" />
          <button className="btn btn-ghost btn-sm" onClick={() => rid ? load(rid) : createReview()}>重试</button>
        </div>
      )}

      {!rid && !error && (
        <div className="cols cols-2">
          <div className="card card-pad">
            <div className="row mb-8">
              <div className="tiny bold">合同名称与文本</div>
            </div>
            <input className="inp mb-12" aria-label="合同名称" placeholder="合同名称（可选；不填写时由正文标题派生）" value={reviewTitle} onChange={(e) => setReviewTitle(e.target.value)} />
            <textarea className="ta" aria-label="合同文本" placeholder="粘贴你有权处理的合同全文（至少 30 字）" style={{ minHeight: 400, fontSize: 12.5, lineHeight: 1.9 }} value={reviewText} onChange={(e) => setReviewText(e.target.value)} />
            <div className="tiny mt-8">提示：按「第X条」分段可让审查引擎定位条款；至少 30 字。文本会写入当前本机服务的 SQLite 审查记录；如配置远程模型，合同规则审查本身仍不调用该模型。</div>
          </div>
          <div className="card">
            <EmptyState icon="shield" title="输入合同开始审查" desc="发起后：① 条款切分 → ② 费用、账户与责任审查点扫描 → ③ 有法源的发现绑定语料条文 → ④ 批注留痕与审计。规则命中不是法律结论，仍须人工复核。" action={<button className="btn btn-primary" disabled={busy || reviewText.trim().length < 30} onClick={createReview}><Icon name="zap" size={14} />{busy ? '审查中…' : '发起规则审查'}</button>} />
          </div>
        </div>
      )}

      {review && (
        <div className="cols cols-3w">
          {/* LEFT · 条款目录 + 审计 */}
          <aside className="panel" style={{ maxHeight: 'calc(100vh - 300px)' }}>
            <div className="panel-h"><Icon name="filter" size={14} />条款目录<span className="spacer" /><span className="tiny">{review.result.clauses.length} 条</span></div>
            <div className="panel-b">
              {review.result.clauses.map((c) => {
                const fs = findingsByClause.get(c.id) ?? []
                return (
                  <button key={c.id} className={'lrow' + (section === c.id ? ' is-on' : '')} style={{ width: '100%', textAlign: 'left' }} onClick={() => setSection(c.id)}>
                    <Icon name="file" size={13} className="muted" />
                    <span className="lrow-t">{c.heading || c.label}</span>
                    {fs.length > 0 && <span className={`bdg ${RISK_BDG[fs[0].risk]}`}>{fs.length}</span>}
                  </button>
                )
              })}
            </div>
            <div className="panel-f">
              <div className="risk-stat" style={{ marginBottom: 10 }}>
                <div className="rs-box rs-high"><b>{review.result.summary.high}</b>高风险</div>
                <div className="rs-box rs-mid"><b>{review.result.summary.medium}</b>中风险</div>
                <div className="rs-box rs-low"><b>{review.result.summary.low}</b>低风险</div>
              </div>
              <div className="tiny bold mb-8">审计日志（最近 {audit.length}）</div>
              <div style={{ maxHeight: 150, overflowY: 'auto' }}>
                {audit.map((a, i) => (
                  <div key={i} className="tiny" style={{ padding: '3px 0', borderBottom: '1px dashed var(--div-soft)' }}>
                    <span className="mono">{fmtTime(a.created_at ?? a.ts, 't')}</span> · {String(a.actor ?? '')} · {String(a.action ?? '')}
                  </div>
                ))}
                {audit.length === 0 && <span className="tiny">暂无审计记录</span>}
              </div>
            </div>
          </aside>

          {/* CENTER · 条款正文 */}
          <section className="panel" style={{ minHeight: 520 }}>
            <div className="panel-h"><Icon name="eye" size={14} />合同正文<span className="spacer" /><span className="tiny">{review.title}</span></div>
            <div className="panel-b" style={{ background: 'var(--bg-2)', padding: 0 }}>
              <div className="doc-paper">
                {review.result.clauses.map((c) => {
                  const fs = findingsByClause.get(c.id) ?? []
                  const worst = fs.some((f) => f.risk === 'high') ? 'high' : fs.length ? 'mid' : undefined
                  return (
                    <section key={c.id} id={c.id} onClick={() => setSection(c.id)} style={{ cursor: 'pointer' }}>
                      {/* 未编号标题段 heading===text，避免同文重复渲染两次 */}
                      {c.heading && c.heading !== c.text && (
                        <h3 style={worst ? { borderLeft: `3px solid ${worst === 'high' ? 'var(--danger)' : 'var(--warn)'}`, paddingLeft: 8 } : undefined}>
                          {c.heading}
                          {fs.length > 0 && <span className={`bdg ${RISK_BDG[worst === 'high' ? 'high' : 'medium']}`} style={{ marginLeft: 8, verticalAlign: '2px' }}>{fs.length} 处风险</span>}
                        </h3>
                      )}
                      {/* 切条口径保留 heading 行在 text 首位，渲染时跳过避免标题重复出现 */}
                      <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 'inherit', lineHeight: 2.1, margin: 0, color: 'var(--tx)' }}>
                        {c.heading && c.text.startsWith(c.heading) ? c.text.slice(c.heading.length).replace(/^\n+/, '') : c.text}
                      </pre>
                    </section>
                  )
                })}
              </div>
            </div>
            <div className="doc-statusbar">
              <span>审查点 {review.result.engine_meta.checkpoint_count} 个</span>
              <span>费用 {review.result.summary.by_category.fee ?? 0} · 账户 {review.result.summary.by_category.account ?? 0} · 责任 {review.result.summary.by_category.liability ?? 0}</span>
              <span className="sp" />
              <span>{review.result.disclaimer}</span>
            </div>
          </section>

          {/* RIGHT · 风险检查器（真实 findings + 批注状态机） */}
          <aside className="panel" style={{ maxHeight: 'calc(100vh - 300px)' }}>
            <div className="panel-h"><Icon name="alert" size={14} />Risk Inspector<span className="spacer" /><span className="tiny">{shownFindings.length} 项</span></div>
            <div className="panel-b">
              {shownFindings.map((f) => {
                const anno = annotationByFinding.get(f.id)
                const state = anno?.state ?? 'pending'
                return (
                  <article
                    key={f.id}
                    className={'risk-card ' + RISK_CLS[f.risk]}
                    style={activeFinding === f.id ? { boxShadow: '0 0 0 2px var(--accent)' } : undefined}
                    onMouseEnter={() => setActiveFinding(f.id)}
                  >
                    <div className="risk-h">
                      <span className={`bdg ${RISK_BDG[f.risk]}`}>{RISK_LABEL[f.risk]}</span>
                      <b style={{ fontSize: 13 }}>{f.checkpoint_title}</b>
                      <span className="bdg bdg-gray">{CATEGORY_LABEL[f.category] ?? f.category}</span>
                      <span className="spacer" />
                      <span className={`bdg ${STATE_LABEL[state].cls}`}>{STATE_LABEL[state].label}</span>
                    </div>
                    {f.excerpt && <div className="risk-quote">「{f.excerpt.slice(0, 120)}{f.excerpt.length > 120 ? '…' : ''}」<span className="tiny"> —— {f.clause_heading || f.clause_label}</span></div>}
                    <dl className="risk-kv">
                      <dt>法律依据</dt>
                      <dd>
                        {f.citation
                          ? <CitationChip label={`《${f.citation.law_title.replace(/^中华人民共和国/, '')}》${f.citation.article_label}（${f.citation.status} · ${f.citation.effective_date} 施行）`} to={`/laws/${f.citation.law_id}?art=${f.citation.article_no}`} />
                          : <span className="tiny">实务建议（不引用法条）</span>}
                      </dd>
                      <dt>风险说明</dt>
                      <dd>{f.detail}</dd>
                      <dt>建议修改</dt>
                      <dd><div className="risk-suggest">{f.suggestion}</div></dd>
                      {anno?.amended_text && (<><dt>修改文本</dt><dd className="tiny">{anno.amended_text}</dd></>)}
                      {anno && anno.state !== 'pending' && (<><dt>复核记录</dt><dd className="tiny">{anno.actor} · {anno.updated_at}</dd></>)}
                    </dl>
                    {amending === f.id ? (
                      <div className="mt-8">
                        <textarea className="ta" style={{ minHeight: 70 }} placeholder="输入修改后的条款文本…" value={amendText} onChange={(e) => setAmendText(e.target.value)} />
                        <div className="row mt-8">
                          <button className="btn btn-primary btn-sm" disabled={busy || !amendText.trim()} onClick={() => transition(f.id, 'amend', amendText.trim())}>提交修改</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => setAmending(null)}>取消</button>
                        </div>
                      </div>
                    ) : (
                      <div className="risk-acts">
                        {state === 'pending' && (
                          <>
                            <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => transition(f.id, 'adopt')}><Icon name="verify" size={12} />采纳</button>
                            <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => { setAmending(f.id); setAmendText(f.suggestion) }}><Icon name="edit" size={12} />修改</button>
                            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => transition(f.id, 'reject')}><Icon name="reject" size={12} />驳回</button>
                          </>
                        )}
                        {state !== 'pending' && (
                          <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => transition(f.id, 'reopen')}><Icon name="refresh" size={12} />重新打开</button>
                        )}
                      </div>
                    )}
                  </article>
                )
              })}
              {shownFindings.length === 0 && (
                <EmptyState icon="verify" title="当前范围未检出风险" desc="切换条款或刷新审查。审查引擎不虚构风险：未命中审查点即不出条。" />
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}
