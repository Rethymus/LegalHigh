// FRAME 12 · Document Drafting —— 文书起草（设计板视觉：模板库｜Word 式文档纸面｜智能建议）
// 数据链路全部真实：GET /api/drafts/templates（结构化模板）→ POST /api/drafts（模板引擎，禁自由生成）
//   → /api/reviews/analyze（合同草稿的结构化风险扫描）→ verify/issue 状态机 → /docx（未签发带水印）
// 视觉与图示对齐：左＝模板库（搜索+分类+常用模板）；中＝文档纸面（工具栏+状态栏，生成后）；
// 右＝智能建议（风险提示[真实审查点]/相关法条[真实语料引用]/拓展建议[规划中，不虚构]）。
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon, type IconName } from '../icons'
import { PageHeader, useToast, EmptyState } from '../ui'
import { CitationChip } from '../domain'
import { api, ApiError, type Citation, type DocTemplate, type Draft, type DraftBlock, type Finding } from '../../lib/api'

const TEMPLATE_ICONS: Record<string, IconName> = { lawyer_letter: 'send', contract: 'docShield', civil_complaint: 'gavel' }
// 设计板左侧分类：前 3 类映射 server 真实模板；后 2 类为规划（灰态，不虚构模板）
const CATEGORIES: { name: string; tpl?: string }[] = [
  { name: '律师函', tpl: 'lawyer_letter' },
  { name: '诉讼模板', tpl: 'civil_complaint' },
  { name: '合同', tpl: 'contract' },
  { name: '法律意见书' },
  { name: '律师文书' },
]

function blocksText(content: Draft['content']): string {
  const parts: string[] = []
  for (const b of (content.blocks ?? content.sections ?? []) as DraftBlock[]) {
    if (b.text) parts.push(b.text)
    for (const l of b.lines ?? []) parts.push(l)
  }
  return parts.join('\n')
}

export default function Drafting() {
  const toast = useToast()
  const [templates, setTemplates] = useState<DocTemplate[]>([])
  const [pool, setPool] = useState<{ law_id: string; title: string; articles: { no: number; label: string; excerpt: string }[] }[]>([])
  const [tplId, setTplId] = useState<string | null>(null)
  const [values, setValues] = useState<Record<string, string | string[] | { law_id: string; article_no: number }[]>>({})
  const [draft, setDraft] = useState<Draft | null>(null)
  const [riskFindings, setRiskFindings] = useState<Finding[] | null>(null)
  const [suggestTab, setSuggestTab] = useState<'risk' | 'law' | 'ext'>('risk')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pickerLaw, setPickerLaw] = useState('')
  const [libQuery, setLibQuery] = useState('')

  const tpl = templates.find((t) => t.template_id === tplId) ?? null

  useEffect(() => {
    api.draftTemplates().then(
      (d) => {
        setTemplates(d.templates)
        setPool(d.citation_pool)
        setTplId((cur) => cur ?? d.templates[0]?.template_id ?? null)
      },
      (e) => setError(e instanceof ApiError ? e.message : String(e)),
    )
  }, [])

  useEffect(() => { setValues({}); setDraft(null); setRiskFindings(null); setError(null) }, [tplId])

  const getVal = (k: string) => values[k] ?? ''
  const setVal = (k: string, v: string | string[] | { law_id: string; article_no: number }[]) => setValues((s) => ({ ...s, [k]: v }))

  const missing = useMemo(() => {
    if (!tpl) return []
    return tpl.fields.filter((f) => {
      if (!f.required) return false
      const v = getVal(f.key)
      if (Array.isArray(v)) return v.length === 0
      return !String(v).trim()
    }).map((f) => f.label)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tpl, values])

  const buildFieldsPayload = (): Record<string, unknown> => {
    if (!tpl) return {}
    const out: Record<string, unknown> = {}
    for (const f of tpl.fields) {
      const v = getVal(f.key)
      if (f.type === 'textarea_list') out[f.key] = String(v) // 多行文本原样提交，server 按行切分
      else if (f.type === 'multi_select' || f.type === 'citation_picker') out[f.key] = Array.isArray(v) ? v : []
      else out[f.key] = String(v)
    }
    return out
  }

  const generate = async () => {
    if (!tpl) return
    if (missing.length > 0) { toast(`必填字段缺失：${missing.join('、')}`, 'err'); return }
    setBusy(true); setError(null)
    try {
      const created = await api.createDraft(tpl.template_id, buildFieldsPayload())
      const d = await api.getDraft(created.draft_id)
      setDraft(d)
      // 合同草稿 → 真实审查点引擎做结构化风险扫描（律师函/起诉状无此扫描，诚实显示）
      if (tpl.template_id === 'contract') {
        const text = blocksText(d.content)
        if (text.trim().length >= 30) {
          api.analyzeContractText(text, tpl.name).then(
            (r) => setRiskFindings(r.findings),
            () => setRiskFindings(null),
          )
        }
      } else {
        setRiskFindings(null)
      }
      toast('草稿已生成（draft 状态：须核验签发后方可对外）', 'ok')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e))
    } finally { setBusy(false) }
  }

  const gate = async (action: 'verify' | 'issue') => {
    if (!draft) return
    setBusy(true)
    try {
      const res = action === 'verify'
        ? await api.verifyDraft(draft.id, 'Alex Wang（演示账号）')
        : await api.issueDraft(draft.id, 'Alex Wang（演示账号）')
      setDraft({ ...draft, status: res.to as Draft['status'] })
      toast(action === 'verify' ? '已通过执业律师核验' : '已签发：文书状态 issued，可对外交付', 'ok')
    } catch (e) {
      toast(e instanceof ApiError ? e.message : String(e), 'err')
    } finally { setBusy(false) }
  }

  const addCitation = (key: string, lawId: string, articleNo: number) => {
    const cur = Array.isArray(values[key]) ? (values[key] as { law_id: string; article_no: number }[]) : []
    if (cur.some((c) => c.law_id === lawId && c.article_no === articleNo)) return
    setVal(key, [...cur, { law_id: lawId, article_no: articleNo }])
  }
  const citationLabel = (c: { law_id: string; article_no: number }): string => {
    const law = pool.find((p) => p.law_id === c.law_id)
    const art = law?.articles.find((a) => a.no === c.article_no)
    return `《${(law?.title ?? c.law_id).replace(/^中华人民共和国/, '')}》${art?.label ?? `第${c.article_no}条`}`
  }

  const renderBlock = (b: DraftBlock, i: number) => {
    if (b.type === 'title') return <h2 key={i} style={{ textAlign: 'center', fontSize: 18, letterSpacing: 3, marginBottom: 18 }}>{b.text}</h2>
    if (b.type === 'signature') return <div key={i} className="sig">{(b.lines ?? []).filter(Boolean).map((l, j) => <span key={j}>{l}</span>)}</div>
    return <p key={i} style={{ whiteSpace: 'pre-wrap' }}>{b.text ?? (b.lines ?? []).join('\n')}</p>
  }

  const docText = draft ? blocksText(draft.content) : ''
  const wordCount = docText.replace(/\s/g, '').length
  const pagesEst = Math.max(1, Math.ceil(wordCount / 900))

  const filteredTemplates = templates.filter((t) => !libQuery.trim() || t.name.toLowerCase().includes(libQuery.trim().toLowerCase()))
  const riskCounts = riskFindings ? {
    high: riskFindings.filter((f) => f.risk === 'high').length,
    mid: riskFindings.filter((f) => f.risk === 'medium').length,
  } : null

  return (
    <div className="page" style={{ maxWidth: 'none' }}>
      <PageHeader
        back={<Link to="/" className="tiny row" style={{ gap: 4 }}><Icon name="arrowL" size={13} />文书工具</Link>}
        title={tpl ? `${tpl.name}` : '文书起草'}
        sub="结构化模板引擎（非自由生成）：版式由模板决定，引用条文来自本地语料并带版本快照；律师函须执业律师核验签发后方可对外。"
        actions={
          <>
            {draft && <span className={'bdg ' + (draft.status === 'issued' ? 'bdg-green' : draft.status === 'verified' ? 'bdg-blue' : 'bdg-orange')} style={{ height: 32, fontSize: 13 }}>
              {draft.status === 'issued' ? '已签发 · 可交付' : draft.status === 'verified' ? '已核验 · 待签发' : '草稿 · 未核验'}
            </span>}
            <Link to="/draft/validation" className="btn btn-ghost"><Icon name="shieldCheck" size={14} />校验</Link>
            {draft && <a className="btn btn-ghost" href={api.draftDocxUrl(draft.id)} target="_blank" rel="noreferrer"><Icon name="download" size={14} />下载{draft.status !== 'issued' ? '（含水印）' : ''}</a>}
            {draft && (
              draft.status === 'draft'
                ? <button className="btn btn-secondary" disabled={busy} onClick={() => gate('verify')}><Icon name="verify" size={14} />{tpl?.gate.verify_label ?? '人工核验'}</button>
                : draft.status === 'verified'
                  ? <button className="btn btn-secondary" disabled={busy} onClick={() => gate('issue')}><Icon name="stamp" size={14} />{tpl?.gate.issue_label ?? '确认签发'}</button>
                  : null
            )}
            <button className="btn btn-primary" disabled={!tpl || busy} onClick={generate}><Icon name="zap" size={14} />生成</button>
          </>
        }
      />

      {error && <div className="banner banner-danger mb-12"><Icon name="alert" size={15} /><span className="banner-tx">{error}</span></div>}

      <div className="cols cols-3w">
        {/* LEFT · 模板库（设计板：搜索 + 分类 + 常用模板） */}
        <aside className="panel" style={{ maxHeight: 'calc(100vh - 300px)' }}>
          <div className="panel-h"><Icon name="book" size={14} />模板库<span className="spacer" /><span className="tiny">{templates.length} 个</span></div>
          <div className="panel-b">
            <div className="searchbar mb-12" style={{ padding: '4px 4px 4px 12px' }}>
              <Icon name="search" size={13} className="muted" />
              <input className="inp" style={{ height: 30, fontSize: 12.5 }} placeholder="搜索模板" value={libQuery} onChange={(e) => setLibQuery(e.target.value)} />
            </div>
            <div className="tiny bold mb-8" style={{ letterSpacing: 0.5 }}>分类</div>
            {CATEGORIES.map((cat) => {
              const t = cat.tpl ? templates.find((x) => x.template_id === cat.tpl) : undefined
              if (!cat.tpl) {
                return (
                  <div key={cat.name} className="doc-type" style={{ opacity: 0.5, cursor: 'not-allowed' }} title="该类别模板化排期 M7——原型不提供未模板化的文书">
                    <span className="dt-ic"><Icon name="file" size={14} /></span>{cat.name}
                    <span className="tiny" style={{ marginLeft: 'auto' }}>规划</span>
                  </div>
                )
              }
              if (!t) return null // 模板清单尚未加载完成
              const on = tplId === t.template_id
              return (
                <button key={cat.name} className={'doc-type' + (on ? ' is-on' : '')}
                  disabled={libQuery.trim() ? !filteredTemplates.some((x) => x.template_id === cat.tpl) : false}
                  onClick={() => setTplId(t.template_id)}>
                  <span className="dt-ic"><Icon name={TEMPLATE_ICONS[t.template_id] ?? 'file'} size={14} /></span>{cat.name}
                </button>
              )
            })}
            <div className="tiny bold mb-8 mt-16" style={{ letterSpacing: 0.5 }}>常用模板</div>
            {filteredTemplates.map((t) => (
              <button key={t.template_id} className={'lrow' + (tplId === t.template_id ? ' is-on' : '')} style={{ width: '100%', textAlign: 'left' }} onClick={() => setTplId(t.template_id)}>
                <Icon name={TEMPLATE_ICONS[t.template_id] ?? 'file'} size={13} className="muted" />
                <span className="lrow-t">{t.name}</span>
              </button>
            ))}
            {filteredTemplates.length === 0 && <div className="tiny">无匹配模板</div>}
          </div>
          <div className="panel-f tiny">其余文书类型模板化排期 M7——原型不提供未模板化的文书。</div>
        </aside>

        {/* CENTER · 生成前=结构化表单；生成后=Word 式文档纸面（工具栏+状态栏） */}
        <section className="panel" style={{ minHeight: 520 }}>
          {!draft ? (
            <>
              <div className="panel-h"><Icon name="edit" size={14} />结构化要素{tpl ? `（${tpl.name}）` : ''}</div>
              <div className="panel-b">
                {tpl && (
                  <>
                    <div className="banner banner-info mb-12" style={{ padding: '9px 13px' }}><Icon name="info" size={14} /><span className="banner-tx">{tpl.description}</span></div>
                    <div className="form-grid">
                      {tpl.fields.map((f) => {
                        const v = getVal(f.key)
                        const wide = f.type === 'textarea' || f.type === 'textarea_list' || f.type === 'citation_picker' || f.type === 'multi_select'
                        return (
                          <label key={f.key} className="fld" style={wide ? { gridColumn: '1 / -1' } : undefined}>
                            <span className="fld-l">{f.label}{f.required && <b style={{ color: 'var(--danger)' }}> *</b>}</span>
                            {f.type === 'textarea' && <textarea className="ta" placeholder={f.placeholder} value={String(v)} onChange={(e) => setVal(f.key, e.target.value)} />}
                            {f.type === 'textarea_list' && <textarea className="ta" placeholder={f.placeholder ?? '每行一条'} value={String(v)} onChange={(e) => setVal(f.key, e.target.value)} />}
                            {f.type === 'text' && <input className="inp" placeholder={f.placeholder} value={String(v)} onChange={(e) => setVal(f.key, e.target.value)} />}
                            {f.type === 'select' && (
                              <select className="sel" value={String(v)} onChange={(e) => setVal(f.key, e.target.value)}>
                                <option value="">请选择…</option>
                                {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                              </select>
                            )}
                            {f.type === 'multi_select' && (
                              <div className="chips">
                                {(f.options ?? []).map((o) => {
                                  const arr = Array.isArray(v) ? (v as string[]) : []
                                  const on = arr.includes(o)
                                  return (
                                    <button key={o} type="button" className={'chip' + (on ? ' is-on' : '')}
                                      onClick={() => setVal(f.key, on ? arr.filter((x) => x !== o) : [...arr, o])}>{o}</button>
                                  )
                                })}
                              </div>
                            )}
                            {f.type === 'citation_picker' && (
                              <div>
                                <div className="row mb-8" style={{ gap: 8 }}>
                                  <select className="sel" style={{ width: '45%' }} value={pickerLaw} onChange={(e) => setPickerLaw(e.target.value)}>
                                    <option value="">选择法律…</option>
                                    {pool.map((p) => <option key={p.law_id} value={p.law_id}>{p.title}</option>)}
                                  </select>
                                  <select className="sel" style={{ flex: 1 }} value="" disabled={!pickerLaw}
                                    onChange={(e) => { if (e.target.value && pickerLaw) addCitation(f.key, pickerLaw, Number(e.target.value)) }}>
                                    <option value="">选择条文…</option>
                                    {(pool.find((p) => p.law_id === pickerLaw)?.articles ?? []).map((a) => (
                                      <option key={a.no} value={a.no}>{a.label} · {a.excerpt.slice(0, 16)}…</option>
                                    ))}
                                  </select>
                                </div>
                                <div className="chips">
                                  {(Array.isArray(v) ? (v as { law_id: string; article_no: number }[]) : []).map((c) => (
                                    <span key={`${c.law_id}#${c.article_no}`} className="cit">
                                      {citationLabel(c)}
                                      <button onClick={() => setVal(f.key, (v as { law_id: string; article_no: number }[]).filter((x) => !(x.law_id === c.law_id && x.article_no === c.article_no)))} style={{ color: 'inherit' }}><Icon name="x" size={10} /></button>
                                    </span>
                                  ))}
                                  {(Array.isArray(v) ? (v as { law_id: string; article_no: number }[]) : []).length === 0 && <span className="tiny">{f.required ? '必选：从本地语料选择依据条文（不虚构）' : '可选'}</span>}
                                </div>
                              </div>
                            )}
                          </label>
                        )
                      })}
                    </div>
                    {missing.length > 0 && (
                      <div className="banner banner-warn mt-12" style={{ padding: '9px 13px' }}><Icon name="alert" size={14} />
                        <span className="banner-tx">Missing Information（{missing.length}）：{missing.join('、')}——必填项由模板引擎强制，不自动编造。</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="editor-toolbar">
                <select className="et-sel" defaultValue="正文 12" title="导出 Word 后可调整排版"><option>正文 12</option><option>标题 14</option></select>
                <span className="et-sep" />
                {['B', 'I', 'U', 'S'].map((x) => (
                  <button key={x} className={'et-btn' + (x === 'U' ? ' is-on' : '')} disabled
                    title="排版编辑在导出 Word 后进行（预览为只读渲染）"
                    style={{ fontWeight: 700, fontStyle: x === 'I' ? 'italic' : undefined, textDecoration: x === 'U' ? 'underline' : x === 'S' ? 'line-through' : undefined }}>{x}</button>
                ))}
                <span className="et-sep" />
                <button className="et-btn" disabled title="导出 Word 后可编辑">A</button>
                <button className="et-btn" disabled title="导出 Word 后可编辑"><Icon name="edit" size={12} /></button>
                <button className="et-btn" disabled title="导出 Word 后可编辑">≡</button>
                <span className="et-sep" />
                <button className="et-btn" onClick={() => { setDraft(null); setRiskFindings(null) }} title="返回修改结构化要素"><Icon name="arrowL" size={12} />修改要素</button>
              </div>
              <div className="panel-b" style={{ background: 'var(--bg-2)', padding: 0 }}>
                <div className="doc-paper">
                  {((draft.content.blocks ?? draft.content.sections ?? []) as DraftBlock[]).map(renderBlock)}
                  {draft.status !== 'issued' && (
                    <div className="gate"><b>签发 Gate：</b>本预览为草稿，未经执业律师核验签发不得对外发出。</div>
                  )}
                </div>
              </div>
              <div className="doc-statusbar">
                <span>字数：{wordCount.toLocaleString()}</span>
                <span>页数：约 {pagesEst} 页（估算）</span>
                <span>引用：{draft.citations.length} 条（本地语料）</span>
                <span className="sp" />
                <span className="mono">{draft.id}</span>
                <span>{draft.created_at.slice(0, 16).replace('T', ' ')}</span>
              </div>
            </>
          )}
        </section>

        {/* RIGHT · 智能建议（设计板：风险提示 / 相关法条 / 拓展建议——数据全部真实） */}
        <aside className="panel" style={{ maxHeight: 'calc(100vh - 300px)' }}>
          <div className="panel-h"><Icon name="sparkle" size={14} />智能建议<span className="spacer" />
            <span className="ai-tag" style={{ height: 18, fontSize: 10 }}>AI</span>
          </div>
          <div style={{ padding: '0 14px' }}>
            <div className="tabs">
              {([['risk', '风险提示'], ['law', '相关法条'], ['ext', '拓展建议']] as const).map(([k, label]) => (
                <button key={k} className={'tab' + (suggestTab === k ? ' is-on' : '')} onClick={() => setSuggestTab(k)}>{label}</button>
              ))}
            </div>
          </div>
          <div className="panel-b">
            {!draft && <EmptyState icon="sparkle" title="生成草稿后提供建议" desc="智能建议基于真实引擎：风险提示来自费用/账户/责任审查点扫描，相关法条来自草稿实际引用的本地语料条文。" />}
            {draft && suggestTab === 'risk' && (
              tpl?.template_id === 'contract' ? (
                riskFindings === null
                  ? <div className="card-pad"><SkeletonInline /></div>
                  : riskFindings.length > 0 ? (
                    <>
                      {riskCounts && (
                        <div className="risk-stat mb-12">
                          <div className="rs-box rs-high"><b>{riskCounts.high}</b>高风险</div>
                          <div className="rs-box rs-mid"><b>{riskCounts.mid}</b>中风险</div>
                          <div className="rs-box rs-low"><b>{riskFindings.length - riskCounts.high - riskCounts.mid}</b>低风险</div>
                        </div>
                      )}
                      {riskFindings.map((f) => (
                        <div key={f.id} className={'risk-card r-' + (f.risk === 'medium' ? 'mid' : f.risk)}>
                          <div className="risk-h">
                            <span className={'bdg ' + (f.risk === 'high' ? 'bdg-red' : f.risk === 'medium' ? 'bdg-orange' : 'bdg-green')}>
                              {f.risk === 'high' ? '高风险' : f.risk === 'medium' ? '中风险' : '低风险'}
                            </span>
                            <b style={{ fontSize: 12.5 }}>{f.checkpoint_title}</b>
                          </div>
                          <div className="risk-quote">「{f.excerpt.slice(0, 80)}{f.excerpt.length > 80 ? '…' : ''}」</div>
                          <div className="tiny" style={{ lineHeight: 1.7 }}>{f.detail}</div>
                          <div className="tiny mt-8" style={{ color: 'var(--ok)' }}>建议：{f.suggestion}</div>
                        </div>
                      ))}
                      <div className="tiny mt-8">完整批注工作流（采纳/修改/驳回+审计）见合同审查模块。</div>
                    </>
                  ) : <EmptyState icon="verify" title="未检出结构化风险" desc="审查点引擎未命中：不虚构风险。" />
              ) : (
                <EmptyState icon="info" title="该文书类型未接入风险扫描" desc="结构化风险扫描目前覆盖合同类文书（费用/账户/责任审查点）。律师函与诉讼文书的安全性由引用校验与签发 gate 保障。" />
              )
            )}
            {draft && suggestTab === 'law' && (
              draft.citations.length > 0 ? (
                <>
                  {draft.citations.map((c: Citation, i: number) => (
                    <div key={i} className="src-item">
                      <div className="src-item-t">
                        <CitationChip label={`《${c.law_title.replace(/^中华人民共和国/, '')}》${c.article_label}`} to={`/laws/${c.law_id}?art=${c.article_no}`} />
                        <span className="bdg bdg-green">{c.status}</span>
                      </div>
                      <div className="src-item-q">{c.text.slice(0, 60)}…</div>
                      <div className="tiny mt-8">{c.effective_date} 施行 · 来源：国家法律法规数据库对照（本地快照）</div>
                      <Link to={`/laws/${c.law_id}?art=${c.article_no}`} className="tiny row mt-8" style={{ gap: 3, color: 'var(--accent-text)' }}>查看详情 <Icon name="chevR" size={11} /></Link>
                    </div>
                  ))}
                  <div className="tiny mt-12">引用生成时即带版本快照；语料与 flk 的抽查比对（≥10%+字段全量，不爬取）列入 M6。</div>
                </>
              ) : <EmptyState icon="link" title="本文书未引用法条" desc="如律师函场景未选择法律依据，此处不虚构引用。" />
            )}
            {draft && suggestTab === 'ext' && (
              <EmptyState icon="bulb" title="拓展建议规划中" desc="关联条款补全、类案条款推荐等拓展建议将在 M6–M7 提供真实引擎支持；原型阶段不提供未经引擎验证的建议。" />
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}

function SkeletonInline() {
  return (
    <div aria-busy="true">
      {[92, 78, 85, 64].map((w, i) => (
        <div key={i} className="skl skl-t" style={{ width: `${w}%` }} />
      ))}
    </div>
  )
}
