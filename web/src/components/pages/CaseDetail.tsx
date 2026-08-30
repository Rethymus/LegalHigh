// FRAME 06 · Case Detail —— Dark Elevated Workspace（规格 §11）
// 案例数据来自 server /api/cases/{id}（仅收录可公开查证案件；sample=true 为未核实占位，禁止引用）。
// 官方原文与 AI 内容视觉严格分离；域外判例全程免责横幅。
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Icon } from '../icons'
import { useToast } from '../ui'
import { EmptyState, SkeletonLines, Tabs } from '../ui'
import { AIBlock, CitationCard, CitationChip, ForeignDisclaimer, SourceBadge } from '../domain'
import { api, ApiError, isFav, toggleFav, type CaseRecord } from '../../lib/api'

const TABS = ['基本信息', '案件事实', '法律争议', '裁判理由', '判决结果', '影响与意义', '相关案例']

/* 类案检索顺位（法发〔2020〕24号第四条：①指导性案例 ②典型案例 ③高院参考性案例 ④上级/本院生效裁判）——
   数据取舍的官方标准，作为产品可见的秩序展示 */
const TIER: Record<string, { label: string; cls: string; note: string }> = {
  指导性案例: { label: '类案检索顺位 ①', cls: 'bdg-blue', note: '最高法指导性案例：依《关于统一法律适用加强类案检索的指导意见》（法发〔2020〕24号）列为第一检索顺位，可作裁判理由引述（不得作裁判依据）。' },
  典型案例: { label: '类案检索顺位 ②', cls: 'bdg-teal', note: '最高法典型案例：第二检索顺位，作裁判参考。' },
  参考案例: { label: '类案检索顺位 ③', cls: 'bdg-teal', note: '参考性案例：作裁判参考。' },
}

export default function CaseDetail() {
  const { caseId } = useParams()
  const [c, setC] = useState<CaseRecord | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('基本信息')
  const toast = useToast()
  const [faved, setFaved] = useState(() => (caseId ? isFav(`case:${caseId}`) : false))
  const fav = () => {
    if (!caseId) return
    const now = toggleFav({ key: `case:${caseId}`, type: '案例', title: c?.name ?? caseId, meta: `${c?.no ?? ''} · ${c?.court ?? ''}`, to: `/cases/${caseId}` })
    setFaved(now)
    toast(now ? '已收藏（仅存本机）' : '已取消收藏', 'ok')
  }

  useEffect(() => {
    let alive = true
    setLoading(true); setError(null); setC(null)
    if (!caseId) { setLoading(false); return }
    api.getCase(caseId).then(
      (d) => alive && (setC(d), setLoading(false)),
      (e) => alive && (setError(e instanceof ApiError ? e.message : String(e)), setLoading(false)),
    )
    return () => { alive = false }
  }, [caseId])

  if (loading) return <div className="case-wrap"><div className="card card-pad"><SkeletonLines n={7} tall /></div></div>
  if (error) return <div className="case-wrap"><div className="banner banner-danger"><Icon name="alert" size={15} />{error}</div>
    <div className="mt-12"><Link to="/cases" className="btn btn-secondary">返回案例检索</Link></div></div>
  if (!c) {
    return (
      <div className="case-wrap">
        <EmptyState icon="search" title="未找到该案件" desc="案例样本仅收录可公开查证案件。" action={<Link to="/cases" className="btn btn-secondary">返回案例检索</Link>} />
      </div>
    )
  }
  if (!c.verified) {
    return (
      <div className="case-wrap">
        <EmptyState icon="alert" title="该记录未通过来源核验" desc="示例占位记录不可查看全文；接入官方数据源并通过核验流程后解锁。" action={<Link to="/cases" className="btn btn-secondary">返回案例检索</Link>} />
      </div>
    )
  }

  const isForeign = c.kind === 'foreign'
  const tierBadge = TIER[c.level]

  return (
    <div className="case-wrap">
      {/* 头部（设计板视觉：返回行 + 标题 + 中英文名 + 标签 chips + 收藏/搜索） */}
      <div className="tiny row mb-8" style={{ gap: 6 }}>
        <Link to="/cases" className="row" style={{ gap: 4, color: 'var(--tx-2)' }}><Icon name="arrowL" size={13} />案例详情</Link>
        <span className="spacer" />
        <Link to="/cases" className="tb-icon" title="在案例检索中搜索"><Icon name="search" size={14} /></Link>
      </div>
      <div className="case-h">
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 className="case-t">{c.name}</h1>
          {c.name_en && <div className="case-s">{c.name_en}</div>}
          <div className="row-wrap mt-8" style={{ gap: 6 }}>
            {[c.jurisdiction, ...c.cause.split('/').map((x) => x.trim()), c.focus[0]?.slice(0, 12)].filter(Boolean).map((t) => (
              <span key={t} className="bdg bdg-gray">{t}</span>
            ))}
          </div>
          <div className="case-meta">
            <span className="m"><Icon name="gavel" size={12} /><b>{c.court}</b></span>
            <span className="m"><Icon name="calendar" size={12} />{c.date}</span>
            <span className="m"><Icon name="database" size={12} />{c.no}</span>
          </div>
          <div className="sgs mt-8">
            <SourceBadge kind={c.kind} grade={c.grade} />
            {tierBadge && (
              <span className={`bdg ${tierBadge.cls}`} title={tierBadge.note}>
                <Icon name="sort" size={11} />{tierBadge.label}
              </span>
            )}
            {isForeign && <ForeignDisclaimer compact />}
          </div>
          {tierBadge && <div className="tiny mt-8" style={{ lineHeight: 1.7 }}>{tierBadge.note}</div>}
        </div>
        <div className="row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8, minWidth: 150 }}>
          <button className="btn btn-secondary btn-sm" onClick={fav}><Icon name="star" size={13} />{faved ? '已收藏' : '加入收藏'}</button>
          <Link to="/research/r-format-terms" className="btn btn-ghost btn-sm"><Icon name="sparkle" size={13} />加入研究</Link>
          <button className="btn btn-ghost btn-sm" title="官方来源" onClick={() => toast(c.source_note)}><Icon name="shieldCheck" size={13} />官方来源</button>
        </div>
      </div>

      <div style={{ padding: '0 4px' }}>
        <Tabs tabs={TABS.map((t) => ({ key: t, label: t }))} active={tab} onChange={setTab} />
      </div>

      <div className="case-grid">
        {/* 正文：法院/官方原文 */}
        <section className="case-doc">
          <div className="card-h" style={{ background: 'var(--elevated)' }}>
            <span className="ot-tag">官方原文</span>
            <span className="tiny">{c.source_note}</span>
          </div>
          <div className="case-doc-b">
            {tab === '基本信息' && (
              <>
                <h4>案件标识</h4>
                <div className="kv-list" style={{ color: 'var(--tx)' }}>
                  <div className="kv"><dt>{c.no.startsWith('指导') ? '案例编号' : '案号'}</dt><dd>{c.no}</dd></div>
                  <div className="kv"><dt>法院/机关</dt><dd>{c.court}</dd></div>
                  <div className="kv"><dt>日期</dt><dd>{c.date}</dd></div>
                  <div className="kv"><dt>案由</dt><dd>{c.cause}</dd></div>
                  <div className="kv"><dt>法域</dt><dd>{c.jurisdiction}</dd></div>
                  <div className="kv"><dt>来源层级</dt><dd>{c.level}</dd></div>
                </div>
              </>
            )}
            {tab === '案件事实' && (
              <>
                <h4>经审理查明（摘要）</h4>
                <p>{c.facts}</p>
              </>
            )}
            {tab === '法律争议' && (
              <>
                <h4>争议焦点</h4>
                {c.focus.map((f) => <p key={f}>· {f}</p>)}
              </>
            )}
            {tab === '裁判理由' && (
              <>
                <h4>法院认为（要旨）</h4>
                {c.holding ? <p className="q">{c.holding}</p> : <p>（本样本未录入裁判理由全文，以官方发布文本为准。）</p>}
                <p>以上为裁判要旨摘录，完整说理以官方发布文本为准。</p>
              </>
            )}
            {tab === '判决结果' && (
              <>
                <h4>裁判结果</h4>
                <p>{c.summary}</p>
              </>
            )}
            {tab === '影响与意义' && (
              <>
                <h4>影响与意义（AI 研究性概述）</h4>
                <div className="ai-block" style={{ marginTop: 4 }}>
                  <div className="ai-block-h"><span className="ai-tag"><Icon name="sparkle" size={11} strokeWidth={2} />AI</span><b style={{ fontSize: 12.5 }}>AI 分析</b></div>
                  <div className="ai-block-b">
                    <ul>{c.impact.map((x) => <li key={x}>{x}</li>)}</ul>
                  </div>
                </div>
              </>
            )}
            {tab === '相关案例' && (
              <>
                <h4>关联案例</h4>
                <Link to="/cases" className="lrow" style={{ background: 'var(--elevated)' }}>
                  <Icon name="caseSearch" size={14} className="muted" />
                  <span className="lrow-t">在案例检索中按争议焦点查找关联样本</span>
                  <Icon name="chevR" size={12} className="muted" />
                </Link>
              </>
            )}
          </div>
        </section>

        {/* Case Intelligence Panel */}
        <aside className="case-intel">
          <section className="card">
            <div className="card-h"><b className="card-h-t">争议焦点</b></div>
            <div className="card-b" style={{ paddingTop: 10 }}>
              {c.focus.map((f) => <div key={f} className="mini-row" style={{ padding: '7px 0' }}><span className="mini-ic" style={{ width: 26, height: 26, minWidth: 26, borderRadius: 8 }}><Icon name="target" size={12} /></span><span style={{ fontSize: 12.5 }}>{f}</span></div>)}
            </div>
          </section>

          <section className="card">
            <div className="card-h"><b className="card-h-t">引用法律</b></div>
            <div className="card-b" style={{ paddingTop: 10 }}>
              {c.statutes.length > 0 ? (
                <div className="citations">
                  {c.statutes.map((s, i) => <CitationCard key={s.no} n={i + 1} title={s.label} lawId={s.law_id} articleNo={s.no} />)}
                </div>
              ) : (
                <div className="tiny" style={{ lineHeight: 1.8 }}>
                  {isForeign
                    ? '外国判例：引用其本国法源（见判决原文），不与中国法条建立直接引用关系。'
                    : '案件裁判依据所引法律未在本地语料（如《侵权责任法》《食品安全法》2009 版），待接入官方数据源后展示——不虚构引用。'}
                </div>
              )}
              {c.research_refs && c.research_refs.length > 0 && (
                <div className="mt-12">
                  <div className="tiny bold mb-8">研究性参照（非本案裁判依据）</div>
                  <div className="citations">
                    {c.research_refs.map((r) => <CitationChip key={r.no} label={r.label} to={`/laws/${r.law_id}?art=${r.no}`} />)}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* 比较研究卡（设计板「与中国相关案例对比」的合规形态：域外判例对照中国法源/方法论；不虚构中国案例） */}
          {isForeign ? (
            <section className="card">
              <div className="card-h"><b className="card-h-t">与中国法对照 · 比较研究</b><span className="spacer" /><SourceBadge kind="academic" /></div>
              <div className="card-b" style={{ paddingTop: 10 }}>
                {(c.research_refs ?? []).length > 0 && (
                  <div className="mb-12">
                    <div className="tiny bold mb-8">可对照的中国法源（本地语料）</div>
                    <div className="citations">
                      {c.research_refs!.map((r) => <CitationChip key={r.no} label={r.label} to={`/laws/${r.law_id}?art=${r.no}`} />)}
                    </div>
                  </div>
                )}
                <div className="tiny bold mb-8">对比分析（方法论框架）</div>
                <ol className="tiny" style={{ lineHeight: 2, paddingLeft: 4, display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <li>· 法律体系不同：判例法/制定法传统差异，法源效力结构不可直接移植。</li>
                  <li>· 社会与制度背景差异：议题的历史语境需还原后比较。</li>
                  <li>· 论证逻辑参照：说理结构可作研究性借鉴，结论不具拘束力。</li>
                </ol>
                <div className="tiny mt-12" style={{ color: 'var(--warn)' }}>域外判例仅作比较研究资料，不构成中国司法裁判依据。</div>
              </div>
            </section>
          ) : (
            <AIBlock label="AI 类案关联" note="AI 生成的研究性关联，仅供检索线索；非法院认定。">
              <ul>
                <li>同议题可通过案例检索按焦点关键词查找（如「违约金」「格式条款」）。</li>
              </ul>
            </AIBlock>
          )}
        </aside>
      </div>
    </div>
  )
}
