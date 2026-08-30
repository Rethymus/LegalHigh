// FRAME 05 · Case Search —— 案例专业检索（规格 §10）
// 案例数据来自 server /api/cases（仅收录可公开查证案件；未接入的官方来源如实显示「规划接入」）。
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../icons'
import { EmptyState, PageHeader, SkeletonLines, Tabs } from '../ui'
import { CitationChip, SourceBadge } from '../domain'
import { api, ApiError, type CaseRecord } from '../../lib/api'

const FIELDS: { label: string; ph: string; wide?: boolean }[] = [
  { label: '案号 / 案例编号', ph: '如：指导案例24号' },
  { label: '案由', ph: '如：机动车交通事故责任纠纷' },
  { label: '法院', ph: '如：最高人民法院' },
  { label: '裁判日期', ph: '如：2014-01-26' },
  { label: '法院层级', ph: '指导案例 / 最高 / 高 / 中 / 基层' },
  { label: '地区', ph: '如：江苏' },
  { label: '当事人', ph: '当事人名称' },
  { label: '法律条文', ph: '如：民法典第1165条' },
  { label: '关键词', ph: '争议焦点关键词', wide: true },
]
const TAB_DEFS = [
  { key: 'all', label: '全部来源' },
  { key: '指导性案例', label: '指导案例' },
  { key: '外国判例', label: '域外判例（比较研究）' },
  { key: 'wenshu', label: '裁判文书' },
  { key: 'alk', label: '人民法院案例库' },
]

const TIER_LABEL: Record<string, string> = {
  指导性案例: '类案顺位①',
  典型案例: '类案顺位②',
  参考案例: '类案顺位③',
}

function CaseRow({ c }: { c: CaseRecord }) {
  const tier = TIER_LABEL[c.level]
  return (
    <article className="res-card" style={c.sample ? { borderStyle: 'dashed' } : undefined}>
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
        {!c.verified && <span className="bdg bdg-red">未核实</span>}
      </div>
      <div className="row-wrap mb-8" style={{ gap: 6 }}>
        {c.focus.map((f) => <span key={f} className="bdg bdg-gray">焦点：{f}</span>)}
      </div>
      <p className="res-snip clamp2">{c.summary}</p>
      <div className="res-acts">
        {(c.statutes ?? []).map((s) => <Link key={s.no} className="res-act" to={`/laws/${s.law_id}?art=${s.no}`}><Icon name="link" size={12} />{s.label}</Link>)}
        {(c.research_refs ?? []).map((s) => <CitationChip key={`r${s.no}`} label={s.label} to={`/laws/${s.law_id}?art=${s.no}`} />)}
        <span className="tiny">来源：{c.source_note}</span>
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

  useEffect(() => {
    let alive = true
    api.listCases().then(
      (d) => alive && (setCases(d.cases), setLoading(false)),
      (e) => alive && (setError(e instanceof ApiError ? e.message : String(e)), setLoading(false)),
    )
    return () => { alive = false }
  }, [])

  const hits = useMemo(() => {
    let list = cases
    if (q.trim()) {
      const query = q.trim().toLowerCase()
      list = list.filter((c) => (c.name + c.cause + c.summary + c.no + c.focus.join('')).toLowerCase().includes(query))
    }
    if (tab === '指导性案例' || tab === '外国判例') list = list.filter((c) => c.level === tab)
    if (tab === 'wenshu' || tab === 'alk') list = []
    return list
  }, [cases, q, tab])

  return (
    <div className="page">
      <PageHeader
        title="案例检索"
        sub="按案号、案由、法院、争议焦点检索公开案例样本。样本库仅收录可公开查证案件；裁判文书网与人民法院案例库为规划数据源。"
        actions={<Link to="/search" className="btn btn-ghost"><Icon name="lawSearch" size={14} />转法条检索</Link>}
      />

      <div className="card card-pad">
        <form className="row mb-8" style={{ gap: 10 }} onSubmit={(e) => { e.preventDefault(); setQ(kw) }}>
          <div className="searchbar" style={{ flex: 1 }}>
            <Icon name="search" size={16} className="muted" />
            <input className="inp" placeholder="按关键词、案由或争议焦点检索案例…" value={kw} onChange={(e) => setKw(e.target.value)} />
            <button className="btn btn-primary">检索案例</button>
          </div>
          <button type="button" className="btn btn-ghost"><Icon name="sliders" size={14} />高级</button>
        </form>
        <div className="adv-grid mt-12">
          {FIELDS.map((f) => (
            <label key={f.label} className="fld" style={f.wide ? { gridColumn: '1 / -1' } : undefined}>
              <span className="fld-l">{f.label}</span>
              <input className="inp" placeholder={f.ph} />
            </label>
          ))}
        </div>
      </div>

      <div className="card mt-16">
        <div style={{ padding: '0 16px' }}>
          <Tabs tabs={TAB_DEFS} active={tab} onChange={setTab} right={<span className="tiny">{hits.length} 件样本</span>} />
        </div>
        <div className="card-b">
          {error && <div className="banner banner-danger mb-12"><Icon name="alert" size={15} />{error}</div>}
          {loading && <div className="card-pad"><SkeletonLines n={4} tall /></div>}
          {!loading && hits.map((c) => <CaseRow key={c.id} c={c} />)}
          {!loading && hits.length === 0 && (
            tab === 'all'
              ? <EmptyState icon="search" title="未找到匹配案例" desc="更换关键词，或清除字段筛选后重试。" />
              : (tab === 'wenshu' || tab === 'alk')
                ? <EmptyState icon="database" title="该来源未接入" desc="人民法院案例库 / 裁判文书网为规划数据源；原型不虚构其内容。接入后此处展示对应来源的案例（文书入库前需二次脱敏）。" action={<Link className="btn btn-secondary" to="/data-sources">查看数据源规划</Link>} />
                : <EmptyState icon="search" title="该筛选下暂无样本" desc="切换来源层级或清除关键词。" />
          )}
        </div>
      </div>
    </div>
  )
}
