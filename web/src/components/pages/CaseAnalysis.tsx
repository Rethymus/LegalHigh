import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Icon } from '../icons'
import { PageHeader, SkeletonLines } from '../ui'
import { api, ApiError, type CaseAnalysisResult, type ClaimId } from '../../lib/api'

const CLAIMS: { id: ClaimId; label: string }[] = [
  { id: 'consumer_fraud', label: '消费欺诈·惩罚性赔偿请求权' },
  { id: 'wage_claim', label: '劳动报酬·支付请求权' },
  { id: 'breach_damage', label: '违约责任·赔偿请求权' },
  { id: 'loan_repayment', label: '民间借贷·返还借款请求权' },
]

export default function CaseAnalysis() {
  const state = useLocation().state as { claimId?: ClaimId; caseText?: string } | null
  const [claimId, setClaimId] = useState<ClaimId | ''>(state?.claimId ?? '')
  const [caseText, setCaseText] = useState(state?.caseText ?? '')
  const [result, setResult] = useState<CaseAnalysisResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    if (!claimId || caseText.trim().length < 30) { setError('请明确选择一个请求权方向，并提供至少 30 个字的本人事实记录。'); return }
    setBusy(true); setError(null); setResult(null)
    try { setResult(await api.caseAnalyze(caseText.trim(), claimId)) }
    catch (e) { setError(e instanceof ApiError ? e.message : String(e)) }
    finally { setBusy(false) }
  }

  return <div className="page" style={{ maxWidth: 1040 }}>
    <PageHeader title="请求权要件检查" sub="仅在你明确选择方向后，用关键词检查本人提供的事实文本；未命中表示‘文本中未见线索’，不表示权利不成立，也不作案件定性或结果预测。" actions={<Link to="/needs" className="btn btn-ghost btn-sm"><Icon name="arrowL" size={13} />返回事实梳理</Link>} />
    <div className="banner banner-warn mb-16"><Icon name="alert" size={15} /><span className="banner-tx">本页无状态、不保存案情。候选方向不是案由；正式行动前须由法律援助机构或受委托的专业律师结合完整证据独立复核。</span></div>
    <div className="card card-pad">
      <label className="fld"><span className="fld-l">由本人明确选择请求权方向 *</span><select className="sel" value={claimId} onChange={(e) => setClaimId(e.target.value as ClaimId | '')}><option value="">请选择；系统不会默认套用借贷模型</option>{CLAIMS.map((claim) => <option key={claim.id} value={claim.id}>{claim.label}</option>)}</select></label>
      <label className="fld mt-12"><span className="fld-l">本人确认的事实文本 *</span><textarea className="ta" style={{ minHeight: 190 }} value={caseText} onChange={(e) => setCaseText(e.target.value)} placeholder="从起因、经过、当前结果中整理本人能够确认的事实；不确定处写‘待确认’。" /></label>
      <div className="row mt-12"><span className="tiny">至少 30 字 · 不上传附件 · 不调用远程模型</span><span className="spacer" /><button className="btn btn-primary" disabled={busy || !claimId || caseText.trim().length < 30} onClick={() => void run()}><Icon name="search" size={13} />{busy ? '检查中…' : '运行要件检查'}</button></div>
      {error && <div className="banner banner-danger mt-12"><Icon name="alert" size={14} /><span className="banner-tx">{error}</span></div>}
    </div>
    {busy && <div className="card card-pad mt-16"><SkeletonLines n={6} /></div>}
    {result && <section className="sec"><div className="sec-h"><span className="sec-t">{result.claim.claim.name}</span><span className="tiny">{result.claim.summary.overall}</span></div>
      {result.claim.elements.map((element) => <div className="card card-pad mb-12" key={element.id}><div className="row-wrap"><span className={'bdg ' + (element.status === 'supported' ? 'bdg-green' : 'bdg-orange')}>{element.status === 'supported' ? '文本中发现线索' : '文本中未见线索'}</span><b>{element.title}</b></div>{element.evidence_spans.map((span, index) => <blockquote className="risk-quote" key={`${span.start}-${index}`}>“{span.excerpt}”</blockquote>)}<div className="row-wrap mt-8">{element.citations.map((citation) => <Link className="chip" key={`${citation.law_id}-${citation.article_no}`} to={`/laws/${citation.law_id}?art=${citation.article_no}`}>《{citation.law_title}》{citation.article_label} · {citation.status} · 施行 {citation.effective_date}</Link>)}</div></div>)}
      <div className="banner banner-info"><Icon name="info" size={14} /><span className="banner-tx">{result.claim.disclaimer}</span></div>
    </section>}
  </div>
}
