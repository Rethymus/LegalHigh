// 法律领域一级组件：来源徽章、AI 内容块、证据快照条文、引用与证据卡
// 视觉规则：AI 内容永不伪装证据；证据快照不可被 AI 改写；
// Citation 为一级组件；无证据支持的结论标红「缺少可靠依据」。
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from './icons'
import { findArticle, findLaw, useLaws, type Law, type LawArticle, type SourceKind } from '../data/model'
import { useCopy } from './ui'

/* ---------- 来源徽章（统一可信视觉语言） ---------- */
const KIND_LABEL: Record<SourceKind, { cls: string; label: string }> = {
  law: { cls: 'sg-law', label: '法规依据' },
  case: { cls: 'sg-case', label: '司法案例' },
  academic: { cls: 'sg-academic', label: '学术资料' },
  foreign: { cls: 'sg-foreign', label: '域外资料' },
  ai: { cls: 'sg-ai', label: 'AI 内容' },
}
/** AI drafting mark (S6-T2, labeling-measures Article 4): rendered only when the
 * structured drafted_by field is 'ai' — the author string never drives the badge,
 * and a missing field degrades honestly to no badge. */
export function AIContentBadge({ draftedBy }: { draftedBy?: 'ai' | 'human' }) {
  if (draftedBy !== 'ai') return null
  return (
    <span className="bdg bdg-gray" title="本内容由 AI 起草、经具名审核人核验后发布；生成环节使用已备案大模型">AI 起草</span>
  )
}

export function SourceBadge({ kind, grade }: { kind: SourceKind; grade?: '强' | '中' | '弱' }) {
  const k = KIND_LABEL[kind]
  return (
    <span className={'sg ' + k.cls}>{k.label}{grade && <i>【{grade}】</i>}</span>
  )
}

/* ---------- AI 内容块 ---------- */
export function AIBlock({ label, children, acts, note }: {
  label: string; children: ReactNode; acts?: ReactNode; note?: string
}) {
  return (
    <section className="ai-block">
      <header className="ai-block-h">
        <span className="ai-tag"><Icon name="sparkle" size={11} strokeWidth={2} />AI</span>
        <b style={{ fontSize: 12.5 }}>{label}</b>
        <span className="spacer" />
        {acts}
      </header>
      <div className="ai-block-b">{children}</div>
      <AIWarning />
      <div className="ai-note">
        <Icon name="info" size={12} />
        {note ?? 'AI 生成内容，供研究参考；不构成法律意见，请以官方文本与专业人士判断为准。'}
      </div>
    </section>
  )
}

/* ---------- AI 内容醒目免责声明（独立组件，可在任何 AI 内容面复用） ---------- */
export function AIWarning({ compact }: { compact?: boolean }) {
  if (compact) {
    return (
      <div style={{
        padding: '8px 12px', borderRadius: 8, marginTop: 8,
        background: 'var(--warn-soft, rgba(255,159,10,0.12))',
        border: '1px solid rgba(255,159,10,0.3)',
        fontSize: 12, lineHeight: 1.7, color: 'var(--tx)',
      }}>
        <b>⚠ AI 生成内容，可能犯错，请核查重要信息。</b>
        {' '}本系统仅提供法律科普，不能替代执业律师；请打开引用来源核验。如有错误或侵权，请使用“设置 → 隐私”中的投诉与纠错通道。
      </div>
    )
  }
  return (
    <div style={{
      padding: '14px 16px', borderRadius: 10, margin: '12px 0',
      background: 'var(--warn-soft, rgba(255,159,10,0.12))',
      border: '1px solid rgba(255,159,10,0.35)',
      fontSize: 13, lineHeight: 1.8, color: 'var(--tx)',
    }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>
        ⚠ AI 生成内容 · 可能犯错 · 请核查重要信息
      </div>
      <div style={{ color: 'var(--tx-2)', fontSize: 12.5 }}>
        本系统仅提供法律科普与信息检索，<b>不能替代执业律师</b>。
        输出内容不构成法律意见，请打开引用来源并对照官方现行文本。
        具体个案可咨询执业律师或访问<a href="https://www.12348.gov.cn/" target="_blank" rel="noreferrer">中国法律服务网</a>（司法部公共法律服务平台；2026-09-01 查阅；证据等级【强】）。
      </div>
      <div style={{ color: 'var(--tx-3)', fontSize: 11.5, marginTop: 6 }}>
        如发现内容存在错误或侵权，请通过「设置 → 隐私 → 投诉与纠错通道」联系我们，我们将及时删改。
      </div>
    </div>
  )
}

/* ---------- 证据快照条文（禁止 AI 改写或冒充官方现行版本） ---------- */
export function OfficialArticle({ law, article, dense }: { law: Law; article: LawArticle; dense?: boolean }) {
  return (
    <blockquote className="ot" style={dense ? { padding: '13px 16px' } : undefined}>
      <div className="ot-h">
        <span className="ot-tag">证据快照原文</span>
        <span className="tiny">{law.title} · {article.label}</span>
        <span className="ot-src"><Icon name="shieldCheck" size={12} />本地来源快照 · 正式使用前以官方现行文本复核</span>
      </div>
      <div className="ot-tx">
        <span className="art-no">{article.label}</span>
        {article.text}
      </div>
      <div className="ot-meta">
        <span>发布机关：<b>{law.organ}</b></span>
        <span>公布：<b>{law.promulgationDate}</b></span>
        <span>施行：<b>{law.effectiveDate || '待官方核对'}</b></span>
        <span>时效状态：<b>{law.status}</b></span>
      </div>
    </blockquote>
  )
}

/* 法条引用块（通过语料解析，找不到时显式降级，不手写法条） */
export function ArticleRef({ lawId, no }: { lawId: string; no: number }) {
  const { data } = useLaws()
  const law = findLaw(data, lawId)
  const article = findArticle(law, no)
  if (!law || !article) {
    return <span className="tiny">第{no}条未在当前本地语料中，不能显示未核实文本。</span>
  }
  return <OfficialArticle law={law} article={article} dense />
}

/* ---------- Citation 一级组件 ---------- */
export function CitationChip({ n, label, to }: { n?: number; label: string; to?: string }) {
  const body = (<>{typeof n === 'number' && <span className="cit-n">{n}</span>}{label}</>)
  return to ? <Link className="cit" to={to}>{body}</Link> : <span className="cit">{body}</span>
}

export function CitationCard({ n, title, quote, meta, lawId, articleNo, caseId }: {
  n: number; title: string; quote?: string; meta?: string[]
  lawId?: string; articleNo?: number; caseId?: string
}) {
  const copy = useCopy()
  const to = lawId && articleNo ? `/laws/${lawId}?art=${articleNo}` : caseId ? `/cases/${caseId}` : undefined
  return (
    <div className="cit-card">
      <div className="cit-card-h">
        <span className="cit-n">{n}</span>
        <span className="cit-card-src">{title}</span>
      </div>
      {quote && <div className="cit-card-q">{quote}</div>}
      {meta && <div className="cit-card-m">{meta.map((m) => <span key={m}>{m}</span>)}</div>}
      <div className="cit-card-acts">
        {to && <Link to={to} className="row" style={{ color: 'var(--accent-text)', fontSize: 11.5 }}><Icon name="external" size={12} />查看原文</Link>}
        <button type="button" className="row" style={{ color: 'var(--tx-2)', fontSize: 11.5 }} onClick={() => copy(`[${n}] ${title}${articleNo ? ` 第${articleNo}条` : ''}${quote ? `：「${quote}」` : ''}`)}>
          <Icon name="copy" size={12} />复制引用
        </button>
      </div>
    </div>
  )
}

/* ---------- 域外资料免责横幅 ---------- */
export function ForeignDisclaimer({ compact }: { compact?: boolean }) {
  return (
    <div className={compact ? 'banner banner-warn' : 'jur-banner'}>
      <Icon name="alert" size={compact ? 15 : 17} />
      <span>域外法律与案例仅作为比较研究资料，不构成中国司法裁判依据。</span>
    </div>
  )
}
