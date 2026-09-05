import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Icon } from '../icons'
import { EmptyState, PageHeader, SkeletonLines, useToast, ValidityBadge } from '../ui'
import { CitationChip, SourceBadge } from '../domain'
import { WARM_TIPS, lawDisplayTitle } from '../../data/model'
import { api, ApiError, type IntakePlanPayload, type NeedsParseResult } from '../../lib/api'

const STEPS = ['发生了什么', '时间经过', '相关人员', '已有材料', '诉求与疑问']
const lines = (value: string) => value.split('\n').map((x) => x.trim()).filter(Boolean)

export default function NeedsParse() {
  const toast = useToast()
  const [sp] = useSearchParams()
  const [step, setStep] = useState(0)
  const [summary, setSummary] = useState(sp.get('q') ?? '')
  const [timeline, setTimeline] = useState('')
  const [parties, setParties] = useState('')
  const [evidenceOwned, setEvidenceOwned] = useState('')
  const [evidenceMissing, setEvidenceMissing] = useState('')
  const [desiredOutcome, setDesiredOutcome] = useState('')
  const [questions, setQuestions] = useState('')
  const [result, setResult] = useState<NeedsParseResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const payload = (): IntakePlanPayload => ({
    summary: summary.trim(), timeline: lines(timeline), parties: lines(parties),
    evidence_owned: lines(evidenceOwned), evidence_missing: lines(evidenceMissing),
    desired_outcome: desiredOutcome.trim(), questions: lines(questions),
  })

  const finish = async () => {
    if (summary.trim().length < 4) { setStep(0); toast('请先用一句话说明发生了什么', 'err'); return }
    setBusy(true); setError(null)
    try { setResult(await api.needsPlan(payload())) }
    catch (e) { setError(e instanceof ApiError ? e.message : String(e)) }
    finally { setBusy(false) }
  }

  const field = () => {
    if (step === 0) return <label className="fld"><span className="fld-l">用自己的话说明核心事件 *</span><textarea className="ta" style={{ minHeight: 140 }} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="例如：公司从六月起没有发工资，我询问人事后仍未收到答复。只写你亲历或能够确认的事实；不确定的内容请明确写‘待确认’。" /><span className="tiny">不要填写身份证号、银行卡号、完整住址等不必要的敏感信息。</span></label>
    if (step === 1) return <label className="fld"><span className="fld-l">关键时间线（每行一项）</span><textarea className="ta" style={{ minHeight: 180 }} value={timeline} onChange={(e) => setTimeline(e.target.value)} placeholder={'2026年6月｜工资未到账\n2026年7月15日｜通过工作软件询问人事\n日期不确定｜收到解除通知（具体日期待确认）'} /><span className="tiny">没有准确日期时写“大约”或“待确认”，不要猜一个日期。</span></label>
    if (step === 2) return <label className="fld"><span className="fld-l">涉及的人或机构（每行一项）</span><textarea className="ta" style={{ minHeight: 180 }} value={parties} onChange={(e) => setParties(e.target.value)} placeholder={'本人｜劳动者/消费者/承租人\n对方公司｜用人单位\n某平台｜交易平台'} /><span className="tiny">写角色或简称即可。本步骤用于厘清关系，不进行身份调查。</span></label>
    if (step === 3) return <div className="form-grid"><label className="fld"><span className="fld-l">已经掌握的材料（每行一项）</span><textarea className="ta" style={{ minHeight: 170 }} value={evidenceOwned} onChange={(e) => setEvidenceOwned(e.target.value)} placeholder={'劳动合同原件\n银行工资流水\n与人事的原始聊天记录'} /></label><label className="fld"><span className="fld-l">尚未取得或需要确认的材料</span><textarea className="ta" style={{ minHeight: 170 }} value={evidenceMissing} onChange={(e) => setEvidenceMissing(e.target.value)} placeholder={'六月工资表\n解除通知送达日期\n公司主体名称'} /></label></div>
    return <div className="form-grid"><label className="fld"><span className="fld-l">希望解决什么</span><textarea className="ta" style={{ minHeight: 140 }} value={desiredOutcome} onChange={(e) => setDesiredOutcome(e.target.value)} placeholder="例如：了解追索工资前需要准备哪些材料，以及可以向什么机构求助。" /></label><label className="fld"><span className="fld-l">仍想弄清的问题（每行一项）</span><textarea className="ta" style={{ minHeight: 140 }} value={questions} onChange={(e) => setQuestions(e.target.value)} placeholder={'是否存在需要特别注意的期限？\n官方条文在哪里可以核对？'} /></label></div>
  }

  return <div className="page" style={{ maxWidth: 1040 }}>
    <PageHeader title="事实与证据梳理" sub="在咨询法律援助机构或专业律师之前，分步骤记录已经确认的事实、时间线、相关人员、材料和诉求；系统只据此检索来源，不替你补事实或判断输赢。" actions={<Link to="/search" className="btn btn-ghost btn-sm"><Icon name="lawSearch" size={13} />直接检索</Link>} />
    <div className="banner banner-info mb-16"><Icon name="shieldCheck" size={15} /><span className="banner-tx"><b>工作边界：</b>事实梳理和检索完全在本机以确定性规则执行，不向模型发送案情。可选 AI 只能在取得非空、可核验的法条依据后协助组织语言，不能新增事实、案例或结论。</span></div>
    <div className="card card-pad mb-16">
      <div className="row-wrap mb-16" style={{ gap: 6 }}>{STEPS.map((name, i) => <button key={name} className={'chip' + (step === i ? ' is-on' : '')} onClick={() => setStep(i)}><span className="mono">{i + 1}</span> {name}</button>)}</div>
      {field()}
      <div className="row mt-16"><button className="btn btn-ghost" disabled={step === 0 || busy} onClick={() => setStep((x) => x - 1)}><Icon name="arrowL" size={13} />上一步</button><span className="spacer" />{step < STEPS.length - 1 ? <button className="btn btn-primary" disabled={step === 0 && summary.trim().length < 4} onClick={() => setStep((x) => x + 1)}>下一步<Icon name="chevR" size={13} /></button> : <button className="btn btn-primary" disabled={busy || summary.trim().length < 4} onClick={() => void finish()}><Icon name="search" size={14} />{busy ? '正在整理…' : '形成求助准备单并检索'}</button>}</div>
      {error && <div className="banner banner-danger mt-12"><Icon name="alert" size={15} /><span className="banner-tx">{error}</span></div>}
    </div>
    {busy && <div className="card card-pad"><SkeletonLines n={7} tall /></div>}
    {result?.intake && <>
      <section className="sec"><div className="sec-h"><span className="sec-t">求助准备单</span><span className="tiny mono">{result.intake.method}</span></div><div className="cols cols-2">
        <div className="card card-pad"><b>已确认的事实摘要</b><p style={{ lineHeight: 1.8 }}>{result.intake.summary}</p><b>时间线</b>{result.intake.timeline.length ? <ol className="tiny" style={{ lineHeight: 2 }}>{result.intake.timeline.map((x) => <li key={x}>{x}</li>)}</ol> : <p className="tiny">尚未填写</p>}<b>相关人员/机构</b><div className="row-wrap mt-8">{result.intake.parties.map((x) => <span className="chip" key={x}>{x}</span>)}</div></div>
        <div className="card card-pad"><b>尚需补充</b>{result.intake.missing_questions.length ? <ul className="tiny" style={{ lineHeight: 2 }}>{result.intake.missing_questions.map((x) => <li key={x}>· {x}</li>)}</ul> : <div className="banner banner-ok mt-8"><Icon name="check" size={13} /><span className="banner-tx">五类信息均已填写；仍需自行核对真实性。</span></div>}<b className="mt-12" style={{ display: 'block' }}>证据材料清单</b>{result.intake.evidence_checklist.map((x) => <div className="lrow" key={`${x.state}-${x.item}`}><span className={'bdg ' + (x.state === '已掌握' ? 'bdg-green' : 'bdg-orange')}>{x.state}</span><span className="lrow-t">{x.item}</span><span className="tiny">{x.source}</span></div>)}</div>
      </div><div className="card card-pad mt-12"><b>下一步</b><ol className="tiny" style={{ lineHeight: 2 }}>{result.intake.next_steps.map((x) => <li key={x}>{x}</li>)}</ol></div></section>
      <section className="sec"><div className="sec-h"><span className="sec-t">可能相关的官方法律依据</span><span className="tiny">{result.articles.length} 条 · 不是案件定性</span></div>{result.articles_none && <div className="card"><EmptyState icon="search" title="库内未找到直接对应条文" desc="请补充事实或使用精确检索；系统不会为填满页面而生成依据。" /></div>}{result.articles.map((a) => <div key={`${a.law_id}-${a.article_no}`} className="ot mb-12"><div className="ot-h"><span className="ot-tag">证据快照原文</span><b>《{lawDisplayTitle(a.law_title, a.status).replace(/^中华人民共和国/, '')}》{a.article_label}</b><ValidityBadge v={a.status} /><span className="ot-src">相关度 {a.score}</span></div><div style={{ fontSize: 14, lineHeight: 2 }}>{a.text}</div><div className="ot-meta"><span>施行：<b>{a.effective_date}</b></span><span className="spacer" /><a href={a.official_entry} target="_blank" rel="noreferrer" className="res-act"><Icon name="external" size={12} />官方核对入口</a><a href={a.snapshot_url} target="_blank" rel="noreferrer" className="res-act"><Icon name="file" size={12} />证据快照</a><CitationChip label="条文本页" to={`/laws/${a.law_id}?art=${a.article_no}`} /></div></div>)}</section>
      {result.cases.length > 0 && <section className="sec"><div className="sec-h"><span className="sec-t">可核验公开案例</span><span className="tiny">仅作类案学习和咨询准备</span></div>{result.cases.map((c) => <div key={c.id} className="res-card"><div className="res-h"><div><Link to={`/cases/${c.id}`} className="res-t">{c.name}</Link><div className="res-meta"><span>{c.no}</span><span>{c.court} · {c.date}</span></div></div><span className="spacer" /><SourceBadge kind={c.kind} grade={c.grade} /></div><p className="res-snip clamp2">{c.summary}</p><div className="res-acts"><span className="tiny">来源核验于 {c.source_accessed_at}</span>{c.official_entries.map((e) => <a className="res-act" key={e.url} href={e.url} target="_blank" rel="noreferrer"><Icon name="external" size={12} />{e.name}</a>)}</div></div>)}</section>}
      <div className="banner-warm mb-16"><Icon name="bulb" size={15} /><span className="banner-tx">{result.disclaimer}<div className="mt-8">· {WARM_TIPS.aid} <a href={WARM_TIPS.aidSourceUrl} target="_blank" rel="noreferrer">司法部来源</a>（{WARM_TIPS.aidSourceCheckedAt}；【{WARM_TIPS.aidSourceGrade}】）。</div><div>· 需要语言整理时，可进入 <Link to={`/research?q=${encodeURIComponent(result.input)}`}>证据约束研究</Link>；远程模型默认关闭，启用前会明确提示数据外发边界。</div></span></div>
    </>}
  </div>
}
