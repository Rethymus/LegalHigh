// FRAME 05 · Case Search —— 案例专业检索（规格 §10）
// 案例数据来自 server /api/cases，只展示逐件核实并能回到原始来源的记录。
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../icons'
import { EmptyState, PageHeader, SkeletonLines, Tabs } from '../ui'
import { CitationChip, SourceBadge } from '../domain'
import { api, ApiError, type CaseRecord } from '../../lib/api'

const TAB_DEFS = [
  { key: 'all', label: '全部来源' },
  { key: '指导性案例', label: '指导案例' },
  { key: '外国判例', label: '域外判例（比较研究）' },
]

const TIER_LABEL: Record<string, string> = {
  指导性案例: '类案顺位①',
  典型案例: '类案顺位②',
  参考案例: '类案顺位③',
}

function CaseRow({ c }: { c: CaseRecord }) {
  const tier = TIER_LABEL[c.level]
  return (
    <article className="res-card">
      <div className="res-h">
        <div style={{ minWidth: 0 }}>
          <Link to={`/cases/${c.id}`} className="res-t">{c.name}</Link>
          <div className="res-meta" style={{ marginBottom: 4 }}>
            <span><b>{c.no}</b></span>
            <span>法院/机关：<b>{c.court}</b></span>
            <span><b>{c.date}</b></span>
            <span>案由：<b>{c.cause}</b></span>
          </div>
        </div>
        <span className="spacer" />
        {tier && <span className="bdg bdg-blue" title="检索顺位依据 法发〔2020〕24号《类案检索指导意见》第四条">{tier}</span>}
        <SourceBadge kind={c.kind} grade={c.grade} />
        {!c.verified && <span className="bdg bdg-red">记录异常：未核实</span>}
      </div>
      <div className="row-wrap mb-8" style={{ gap: 6 }}>
        {c.focus.map((f) => <span key={f} className="bdg bdg-gray">焦点：{f}</span>)}
      </div>
      <p className="res-snip clamp2">{c.summary}</p>
      <div className="res-acts">
        {(c.statutes ?? []).map((s) => <Link key={s.no} className="res-act" to={`/laws/${s.law_id}?art=${s.no}`}><Icon name="link" size={12} />{s.label}</Link>)}
        {(c.research_refs ?? []).map((s) => <CitationChip key={`r${s.no}`} label={s.label} to={`/laws/${s.law_id}?art=${s.no}`} />)}
        <a className="res-act" href={c.source_url} target="_blank" rel="noreferrer"><Icon name="external" size={12} />{c.source_title}</a>
        <span className="spacer" />
        <Link className="res-act" to={`/cases/${c.id}`}><Icon name="external" size={12} />查看详情</Link>
      </div>
    </article>
  )
}

export default function CaseSearch() {
  const [tab, setTab] = useState('all')
  const [kw, setKw] = useState('')
  const [q, setQ] = useState('')
  const [cases, setCases] = useState<CaseRecord[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // 检索下推 server（C7：/api/cases?q=&level= 与法条检索同一「单一引擎」口径）
  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    const level = tab === '指导性案例' || tab === '外国判例' ? tab : undefined
    api.listCases(q.trim(), level).then(
      (d) => alive && (setCases(d.cases.filter((c) => c.verified && !c.sample)), setLoading(false)),
      (e) => alive && (setError(e instanceof ApiError ? e.message : String(e)), setLoading(false)),
    )
    return () => { alive = false }
  }, [q, tab])

  const hits = cases

  return (
    <div className="page">
      <PageHeader
        title="案例检索"
        sub="以关键词检索已核实的公开案例；关键词可包含案号、案由、法院或争议焦点。结构化多字段筛选尚未实现，不展示假筛选控件。"
        actions={<Link to="/search" className="btn btn-ghost"><Icon name="lawSearch" size={14} />转法条检索</Link>}
      />

      <div className="card card-pad">
        <form className="row mb-8" style={{ gap: 10 }} onSubmit={(e) => { e.preventDefault(); setQ(kw) }}>
          <div className="searchbar" style={{ flex: 1 }}>
            <Icon name="search" size={16} className="muted" />
            <input className="inp" placeholder="按关键词、案由或争议焦点检索案例…" value={kw} onChange={(e) => setKw(e.target.value)} />
            <button className="btn btn-primary">检索案例</button>
          </div>
        </form>
        <div className="tiny">示例：指导案例24号、机动车交通事故、格式条款、最高人民法院。多词按服务端案例关键词规则匹配。</div>
      </div>

      <div className="card mt-16">
        <div style={{ padding: '0 16px' }}>
          <Tabs tabs={TAB_DEFS} active={tab} onChange={setTab} right={<span className="tiny">{hits.length} 件当前结果</span>} />
        </div>
        <div className="card-b">
          {error && <div className="banner banner-danger mb-12"><Icon name="alert" size={15} />{error}</div>}
          {loading && <div className="card-pad"><SkeletonLines n={4} tall /></div>}
          {!loading && hits.map((c) => <CaseRow key={c.id} c={c} />)}
          {!loading && hits.length === 0 && (
            tab === 'all'
              ? <EmptyState icon="search" title="未找到匹配案例" desc="请更换关键词或清空检索词后重试。未核实记录不会展示。" />
              : <EmptyState icon="search" title="该筛选下暂无案例" desc="切换来源层级或清除关键词。" />
          )}
        </div>
      </div>
    </div>
  )
}
