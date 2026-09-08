// FRAME 12 · Document Drafting —— 文书起草（设计板视觉：模板库｜Word 式文档纸面｜智能建议）
// 数据链路全部真实：GET /api/drafts/templates（结构化模板）→ POST /api/drafts（模板引擎，禁自由生成）
//   → /api/reviews/analyze（合同草稿的结构化风险扫描）→ review/finalize 工作进度 → /docx
// 视觉与图示对齐：左＝模板库（搜索+分类+常用模板）；中＝文档纸面（工具栏+状态栏，生成后）；
// 右＝确定性校验辅助（风险提示[真实审查点]/相关法条[真实语料引用]）。
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon, type IconName } from '../icons'
import { PageHeader, useToast, EmptyState } from '../ui'
import { CitationChip } from '../domain'
import { api, ApiError, type Citation, type DocTemplate, type Draft, type DraftBlock, type Finding } from '../../lib/api'

const TEMPLATE_ICONS: Record<string, IconName> = {
  lawyer_letter: 'send', contract: 'docShield', civil_complaint: 'gavel',
  civil_answer: 'file', power_of_attorney: 'docpen', legal_opinion: 'book', preservation_application: 'docShield',
}
// 分类面板：以 server 模板清单为唯一来源（M7-T2 收官后 7 类全真实，无规划灰态）
const CATEGORY_NAMES: Record<string, string> = {
  lawyer_letter: '律师函', civil_complaint: '起诉状', civil_answer: '答辩状',
  contract: '合同', power_of_attorney: '授权委托书', legal_opinion: '法律研究备忘录',
  preservation_application: '财产保全',
}

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
  const [suggestTab, setSuggestTab] = useState<'risk' | 'law'>('risk')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pickerLaw, setPickerLaw] = useState('')
  const [libQuery, setLibQuery] = useState('')

  const tpl = templates.find((t) => t.template_id === tplId) ?? null

  useEffect(() => {
    api.draftTemplates().then(
      (d) => {
        setTemplates(d.templates)
        setPool(d.citation_laws.map((l) => ({ ...l, articles: [] })))  // A7：条文按需加载
        setTplId((cur) => cur ?? d.templates[0]?.template_id ?? null)
        setPickerLaw((cur) => cur || d.citation_laws[0]?.law_id || '')
      },
      (e) => setError(e instanceof ApiError ? e.message : String(e)),
    )
  }, [])

  // 引用池按需加载：picker 选中某部法律时才取其条文（缓存不重复拉取）
  useEffect(() => {
    if (!pickerLaw) return
    if (pool.find((p) => p.law_id === pickerLaw)?.articles.length) return
    let alive = true
    api.draftCitationPool(pickerLaw).then(
      (d) => alive && setPool((cur) => cur.map((p) => (p.law_id === d.law_id ? { ...p, articles: d.articles } : p))),
      () => { /* 引用池加载失败不阻塞起草主流程 */ },
    )
    return () => { alive = false }
  }, [pickerLaw, pool])

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
      toast('草稿已生成；请逐项复核事实、引用与格式后再确认定稿', 'ok')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e))
    } finally { setBusy(false) }
  }

  const gate = async (action: 'review' | 'finalize') => {
    if (!draft) return
    setBusy(true)
    try {
      const res = action === 'review'
        ? await api.reviewDraft(draft.id)
        : await api.finalizeDraft(draft.id)
      setDraft({ ...draft, status: res.to as Draft['status'] })
      toast(action === 'review' ? `已记录 ${res.actor} 完成人工复核` : `已由 ${res.actor} 确认定稿；平台未核验其身份或资格`, 'ok')
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
        sub="结构化模板引擎（非自由生成）：版式由模板决定，引用来自本地语料。平台不核验律师身份、不签发文书；专业使用者在线下独立复核并负责。"
        actions={
          <>
            {draft && <span className={'bdg ' + (draft.status === 'finalized' ? 'bdg-green' : draft.status === 'reviewed' ? 'bdg-blue' : 'bdg-orange')} style={{ height: 32, fontSize: 13 }}>
              {draft.status === 'finalized' ? '使用者已确认定稿' : draft.status === 'reviewed' ? '已复核 · 待定稿' : '工具草稿 · 待复核'}
            </span>}
            <Link to="/draft/validation" className="btn btn-ghost"><Icon name="shieldCheck" size={14} />校验</Link>
            {draft && <button className="btn btn-ghost" onClick={() => api.draftDocxDownload(draft.id, draft.template_id).catch((e) => toast(e instanceof Error ? e.message : String(e), 'err'))}><Icon name="download" size={14} />下载{draft.status !== 'finalized' ? '（草稿标识）' : ''}</button>}
            {draft && (
              draft.status === 'draft'
                ? <button className="btn btn-secondary" disabled={busy} title="记录本机使用者已逐项复核；不代表平台认证" onClick={() => gate('review')}><Icon name="verify" size={14} />{tpl?.gate.review_label ?? '完成内容复核'}</button>
                : draft.status === 'reviewed'
                  ? <button className="btn btn-secondary" disabled={busy} title="确认已核对事实、引用与格式并自行承担使用责任" onClick={() => gate('finalize')}><Icon name="stamp" size={14} />{tpl?.gate.finalize_label ?? '使用者确认定稿'}</button>
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
            {templates.map((t) => {
              const on = tplId === t.template_id
              return (
                <button key={t.template_id} className={'doc-type' + (on ? ' is-on' : '')}
                  disabled={libQuery.trim() ? !filteredTemplates.some((x) => x.template_id === t.template_id) : false}
                  onClick={() => setTplId(t.template_id)}>
                  <span className="dt-ic"><Icon name={TEMPLATE_ICONS[t.template_id] ?? 'file'} size={14} /></span>{CATEGORY_NAMES[t.template_id] ?? t.name}
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
          <div className="panel-f tiny">全部文书由 server 结构化模板引擎生成（引用自带版本快照）；新文书类型按需求逐步模板化。</div>
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
                  {draft.status !== 'finalized' && (
                    <div className="gate"><b>人工复核：</b>本预览仍是工具草稿。LegalHigh 不核验身份或资格，也不代表任何律所签发。</div>
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

        {/* RIGHT · 确定性辅助：规则命中与草稿实际引用。 */}
        <aside className="panel" style={{ maxHeight: 'calc(100vh - 300px)' }}>
          <div className="panel-h"><Icon name="shieldCheck" size={14} />校验辅助</div>
          <div style={{ padding: '0 14px' }}>
            <div className="tabs">
              {([['risk', '规则提示'], ['law', '实际引用']] as const).map(([k, label]) => (
                <button key={k} className={'tab' + (suggestTab === k ? ' is-on' : '')} onClick={() => setSuggestTab(k)}>{label}</button>
              ))}
            </div>
          </div>
          <div className="panel-b">
            {!draft && <EmptyState icon="shieldCheck" title="生成草稿后开始校验" desc="规则提示来自费用、账户与责任审查点扫描；法条列表只显示草稿实际绑定的本地语料条文。" />}
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
                <EmptyState icon="info" title="该文书类型不适用合同规则扫描" desc="费用、账户与责任审查点只用于合同类文本。其他文书仍须由使用者逐项核对事实、管辖、请求、期限与引用后定稿。" />
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
                      <div className="tiny mt-8">{c.effective_date ? `${c.effective_date} 施行` : '生效日期待官方核对'} · 本地证据快照；具体来源见法条详情</div>
                      <Link to={`/laws/${c.law_id}?art=${c.article_no}`} className="tiny row mt-8" style={{ gap: 3, color: 'var(--accent-text)' }}>查看详情 <Icon name="chevR" size={11} /></Link>
                    </div>
                  ))}
                  <div className="tiny mt-12">引用绑定当前语料快照；使用前仍应打开详情页，对照来源与效力字段。</div>
                </>
              ) : <EmptyState icon="link" title="本文书未引用法条" desc="如律师函场景未选择法律依据，此处不虚构引用。" />
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
