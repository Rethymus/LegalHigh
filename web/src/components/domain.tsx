// 法律领域一级组件：来源徽章、AI 内容块、官方原文块、引用、证据卡、风险卡
// 视觉规则（规格 §42–§45）：AI 内容永不伪装官方内容；官方原文不可被 AI 改写；
// Citation 为一级组件；无证据支持的结论标红「缺少可靠依据」。
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from './icons'
import { findArticle, findLaw, useLaws, type ContractRisk, type Law, type LawArticle, type SourceKind } from '../data/model'
import { useCopy } from './ui'
import { useToast } from './ui'

/* ---------- 证据卡视图模型（研究页通用结构） ---------- */
export interface EvidenceCardT {
  id: string; conclusion: string; rule?: string
  sources?: { kind: SourceKind; title: string; quote?: string; position?: string; lawId?: string; articleNo?: number; caseId?: string; url?: string; date: string; jurisdiction: string; validity: string; confidence: number; note?: string }[]
  missing?: { text: string; reason: string }
}

/* ---------- 来源徽章（统一可信视觉语言） ---------- */
const KIND_LABEL: Record<SourceKind, { cls: string; label: string }> = {
  law: { cls: 'sg-law', label: '官方法源' },
  case: { cls: 'sg-case', label: '司法案例' },
  academic: { cls: 'sg-academic', label: '学术资料' },
  foreign: { cls: 'sg-foreign', label: '域外资料' },
  ai: { cls: 'sg-ai', label: 'AI 内容' },
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
        {' '}本系统仅提供法律科普，不能替代执业律师。如有侵权请联系开发者删改。
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
        输出内容不构成法律意见，请以官方发布文本为准。
        具体个案请咨询执业律师或拨打 12348 公共法律服务热线。
      </div>
      <div style={{ color: 'var(--tx-3)', fontSize: 11.5, marginTop: 6 }}>
        如发现内容存在错误或侵权，请通过「设置 → 隐私 → 投诉与纠错通道」联系我们，我们将及时删改。
      </div>
    </div>
  )
}

/* ---------- 官方原文块（法条原文，禁止 AI 改写） ---------- */
export function OfficialArticle({ law, article, dense }: { law: Law; article: LawArticle; dense?: boolean }) {
  return (
    <blockquote className="ot" style={dense ? { padding: '13px 16px' } : undefined}>
      <div className="ot-h">
        <span className="ot-tag">官方原文</span>
        <span className="tiny">{law.title} · {article.label}</span>
        <span className="ot-src"><Icon name="shieldCheck" size={12} />证据快照语料 · 建议以 flk.npc.gov.cn 复核</span>
      </div>
      <div className="ot-tx">
        <span className="art-no">{article.label}</span>
        {article.text}
      </div>
      <div className="ot-meta">
        <span>发布机关：<b>{law.organ}</b></span>
        <span>公布：<b>{law.promulgationDate}</b></span>
        <span>施行：<b>{law.effectiveDate || '待核（flk 对照 · M5）'}</b></span>
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
    return <span className="tiny">第{no}条未在本地语料中 · 待接入官方数据源核验</span>
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

/* ---------- 证据卡（Evidence Inspector） ---------- */
export function EvidenceView({ ev, onAction }: {
  ev: EvidenceCardT
  onAction?: (action: 'verify' | 'reject' | 'replace' | 'add', evId: string) => void
}) {
  const toast = useToast()
  if (ev.missing) {
    return (
      <div className="evc missing">
        <div className="evc-h">
          <span className="evc-id">{ev.id}</span>
          <span className="bdg bdg-red"><Icon name="alert" size={11} />缺少可靠依据</span>
          <span className="spacer" />
          <span className="tiny">{ev.rule}</span>
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.8 }}><b>待支持结论：</b>{ev.conclusion}</div>
        <div className="risk-quote" style={{ borderColor: 'var(--danger)' }}>{ev.missing.reason}</div>
        <div className="evc-acts">
          <button className="btn btn-ghost btn-sm" onClick={() => onAction?.('add', ev.id)}><Icon name="plus" size={12} />补充来源</button>
          <button className="btn btn-ghost btn-sm" onClick={() => { toast('已阻止该结论进入生成流程', 'ok'); onAction?.('reject', ev.id) }}><Icon name="reject" size={12} />改写结论</button>
        </div>
      </div>
    )
  }
  return (
    <div className="evc">
      <div className="evc-h">
        <span className="evc-id">{ev.id}</span>
        <span className="tiny bold">{ev.rule}</span>
        <span className="spacer" />
        <span className="bdg bdg-green" title="原型演示值：正式版由检索器校准输出">置信 {ev.sources?.[0]?.confidence ?? '—'}%</span>
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.8, marginBottom: 10 }}><b>结论：</b>{ev.conclusion}</div>
      {(ev.sources ?? []).map((s, i) => (
        <div key={i} className="risk-quote" style={{ borderColor: 'var(--accent)' }}>
          <div className="row-wrap mb-8">
            <SourceBadge kind={s.kind} />
            <b style={{ fontSize: 12 }}>{s.title}</b>
          </div>
          {s.quote && <div style={{ fontSize: 12, color: 'var(--tx-2)', lineHeight: 1.75 }}>「{s.quote}」</div>}
          <div className="evc-kv">
            {s.position && (<><dt>文档位置</dt><dd>{s.position}</dd></>)}
            <dt>发布/施行</dt><dd>{s.date}</dd>
            <dt>法域</dt><dd>{s.jurisdiction}</dd>
            <dt>时效性</dt><dd>{s.validity}</dd>
          </div>
        </div>
      ))}
      <div className="evc-acts">
        <button className="btn btn-secondary btn-sm" onClick={() => { toast(`已核验 ${ev.id}`, 'ok'); onAction?.('verify', ev.id) }}><Icon name="verify" size={12} />核验</button>
        <button className="btn btn-ghost btn-sm" onClick={() => onAction?.('reject', ev.id)}><Icon name="reject" size={12} />驳回</button>
        <button className="btn btn-ghost btn-sm" onClick={() => onAction?.('replace', ev.id)}><Icon name="refresh" size={12} />替换</button>
        <button className="btn btn-ghost btn-sm" onClick={() => onAction?.('add', ev.id)}><Icon name="plus" size={12} />补充来源</button>
      </div>
    </div>
  )
}

/* ---------- 风险卡（合同审查） ---------- */
const RISK_LABEL = { high: '高风险', mid: '中风险', low: '低风险' } as const
export function RiskBadge({ level }: { level: ContractRisk['level'] }) {
  const cls = level === 'high' ? 'bdg-red' : level === 'mid' ? 'bdg-orange' : 'bdg-green'
  return <span className={'bdg ' + cls}>{RISK_LABEL[level]}</span>
}

export function RiskCardView({ risk, active, onActivate }: { risk: ContractRisk; active?: boolean; onActivate?: () => void }) {
  const toast = useToast()
  return (
    <article
      className={'risk-card r-' + risk.level}
      style={active ? { boxShadow: '0 0 0 2px var(--accent)' } : undefined}
      onMouseEnter={onActivate}
    >
      <div className="risk-h">
        <RiskBadge level={risk.level} />
        <b style={{ fontSize: 13 }}>{risk.type}</b>
        <span className="spacer" />
        <span className="tiny">{risk.status}</span>
      </div>
      <div className="risk-quote">「{risk.quote}」</div>
      <dl className="risk-kv">
        <dt>法律依据</dt>
        <dd>
          {risk.basis.length > 0
            ? risk.basis.map((b) => <CitationChip key={b.no} label={b.label} to={`/laws/${b.lawId}?art=${b.no}`} />)
            : <span className="tiny">该风险为对价/程序性提示，暂无直接法条支撑——不虚构引用，请结合个案与专业人士判断。</span>}
        </dd>
        <dt>风险说明</dt>
        <dd>{risk.explain}</dd>
        <dt>建议修改</dt>
        <dd>
          <div className="risk-suggest">{risk.suggest}</div>
        </dd>
        {risk.cases.length > 0 && (<><dt>相关案例</dt><dd className="tiny">{risk.cases.join('；')}</dd></>)}
        <dt>Reviewer</dt>
        <dd className="tiny">{risk.reviewer} · {risk.time}</dd>
      </dl>
      <div className="risk-acts">
        <button className="btn btn-primary btn-sm" onClick={() => toast('建议文本已插入修订（Track Changes）', 'ok')}><Icon name="edit" size={12} />插入建议</button>
        <button className="btn btn-ghost btn-sm" onClick={() => toast('已添加批注')}><Icon name="note" size={12} />添加批注</button>
        <button className="btn btn-ghost btn-sm" onClick={() => toast('已忽略该风险', 'ok')}><Icon name="x" size={12} />忽略</button>
        <button className="btn btn-secondary btn-sm" onClick={() => toast('已标记完成', 'ok')}><Icon name="verify" size={12} />标记完成</button>
      </div>
    </article>
  )
}

/* ---------- 高亮正文渲染：把条款里的风险段标记出来 ---------- */
export function RiskSpan({ text, riskId, level, active, onClick }: {
  text: string; riskId: string; level: 'high' | 'mid' | 'low'; active?: boolean; onClick?: () => void
}) {
  return (
    <span
      className={'hl-risk r-' + level + (active ? ' is-active' : '')}
      data-risk={riskId}
      onClick={onClick}
      role="button"
      title={`AI 检出风险：${riskId}（点击在右侧查看）`}
    >
      {text}
      <span className="comment-anchor" aria-hidden>!</span>
    </span>
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
