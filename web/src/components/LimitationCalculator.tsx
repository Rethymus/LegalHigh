import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from './icons'

/* 法条诉讼时效计算器（R336）：公民最常问的实际问题——「我还能告吗？」
   纯前端计算，依据语料民法典第 188 条（三年普通时效）+ 第 196 条（不适用情形）。
   零后端依赖、零 AI——完全确定性。 */

/** 不适用诉讼时效的请求权类型（民法典第 196 条） */
const EXEMPT_TYPES = [
  { id: 'stop_harm', label: '请求停止侵害、排除妨碍、消除危险' },
  { id: 'property', label: '不动产物权和登记的动产物权的权利人请求返还财产' },
  { id: 'support', label: '请求支付抚养费、赡养费或者扶养费' },
  { id: 'other', label: '依法不适用诉讼时效的其他请求权' },
]

function addThreeYears(date: Date): Date {
  const d = new Date(date)
  d.setFullYear(d.getFullYear() + 3)
  return d
}

function fmt(d: Date): string {
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
}

export default function LimitationCalculator() {
  const [knownDate, setKnownDate] = useState('')
  const [claimType, setClaimType] = useState<'general' | 'exempt'>('general')
  const [exemptId, setExemptId] = useState('stop_harm')

  const result = useMemo(() => {
    if (!knownDate) return null
    const start = new Date(knownDate + 'T00:00:00')
    if (isNaN(start.getTime())) return null
    const deadline = addThreeYears(start)
    const now = new Date()
    const expired = now > deadline
    const daysLeft = Math.ceil((deadline.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
    return { start, deadline, expired, daysLeft, claimType, exemptId }
  }, [knownDate, claimType, exemptId])

  return (
    <div className="card card-pad" style={{ maxWidth: 520 }}>
      <div className="row mb-12"><b><Icon name="clock" size={15} /> 诉讼时效计算器</b><span className="tiny muted">依据《民法典》第188条</span></div>
      <div className="tiny muted mb-12">输入您「知道或应当知道权利受到损害」的日期，计算三年诉讼时效截止日。仅供参考，具体请咨询律师。</div>

      <label className="fld mb-12">
        <span className="fld-l">权利受损/知晓日期</span>
        <input type="date" className="inp" value={knownDate} onChange={(e) => setKnownDate(e.target.value)} max={new Date().toISOString().slice(0, 10)} aria-label="权利受损日期" />
      </label>

      <div className="row-wrap mb-12" style={{ gap: 6 }}>
        <button type="button" className={'chip' + (claimType === 'general' ? ' is-on' : '')} onClick={() => setClaimType('general')}>普通请求权（三年时效）</button>
        <button type="button" className={'chip' + (claimType === 'exempt' ? ' is-on' : '')} onClick={() => setClaimType('exempt')}>不适用时效的请求权</button>
      </div>

      {claimType === 'exempt' && (
        <div className="mb-12">
          <div className="tiny bold mb-8">选择请求权类型（民法典第196条）：</div>
          {EXEMPT_TYPES.map((t) => (
            <label key={t.id} className="row mb-4" style={{ gap: 8, alignItems: 'flex-start' }}>
              <input type="radio" name="exempt" checked={exemptId === t.id} onChange={() => setExemptId(t.id)} style={{ marginTop: 3 }} />
              <span className="tiny">{t.label}</span>
            </label>
          ))}
        </div>
      )}

      {result && claimType === 'general' && (
        <div className={'banner ' + (result.expired ? 'banner-warn' : 'banner-ok')}>
          <Icon name={result.expired ? 'alert' : 'check'} size={15} />
          <div className="banner-tx">
            {result.expired ? (
              <>诉讼时效可能已届满（截止日 <b>{fmt(result.deadline)}</b>）。但存在中止/中断事由（如协商、起诉等）可重新起算——请咨询律师确认。</>
            ) : (
              <>诉讼时效截止日：<b>{fmt(result.deadline)}</b>（剩余约 <b>{result.daysLeft}</b> 天）。建议在截止前提起诉讼或采取其他权利保全措施。</>
            )}
            <div className="tiny mt-8">起算日：{fmt(result.start)} → 截止日：{fmt(result.deadline)} · 依据<Link to="/laws/civl-2020?art=188" className="bold" style={{ color: 'var(--accent-text)' }}>《民法典》第188条</Link></div>
          </div>
        </div>
      )}

      {result && claimType === 'exempt' && (
        <div className="banner banner-ok">
          <Icon name="check" size={15} />
          <div className="banner-tx">
            该类请求权<b>不适用诉讼时效</b>——随时可以主张。依据<Link to="/laws/civl-2020?art=196" className="bold" style={{ color: 'var(--accent-text)' }}>《民法典》第196条</Link>。
          </div>
        </div>
      )}

      <div className="tiny muted mt-12">本工具仅依据《民法典》第188条（三年普通时效）和第196条（不适用情形）做确定性计算。诉讼时效中止（最后六个月内不可抗力等）与中断（起诉/请求/承认）可改变时效状态——以上情况请咨询执业律师。拨打 12348 可获取免费法律援助。</div>
    </div>
  )
}
