// FRAME 05 · Case Search —— 案例专业检索（规格 §10）
// 案例数据来自 server /api/cases，只展示逐件核实并能回到原始来源的记录。
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../icons'
import { EmptyState, PageHeader, Segmented, SkeletonLines, Tabs } from '../ui'
import { CitationChip, SourceBadge } from '../domain'
import { api, ApiError, type CaseRecord } from '../../lib/api'

/* 谱系导航（v6 S4-T4）：按案由关键词派生的法域分组，全部由已加载案例实时计算，
   不硬编码件数与分组。外国判例（jurisdiction 非「中国」）单列为比较研究对象。 */
const DOMAIN_RULES: { key: string; label: string; match: (c: CaseRecord) => boolean }[] = [
  { key: 'labor', label: '劳动 · 就业', match: (c) => /劳动合同|劳动争议|竞业限制|平等就业|年终奖|解除劳动合同/.test(c.cause + c.name) },
  { key: 'criminal', label: '刑事', match: (c) => /盗窃|诈骗|故意伤害|正当防卫|罪/.test(c.cause + c.name) },
  { key: 'admin', label: '行政', match: (c) => /行政/.test(c.cause + c.name) },
  { key: 'tort', label: '侵权 · 交通事故 · 人格权', match: (c) => /交通事故|名誉|荣誉|人身损害/.test(c.cause + c.name) },
  { key: 'datapriv', label: '网络 · 数据 · 个人信息', match: (c) => /个人信息|隐私|数据|网络/.test(c.cause + c.name) },
  { key: 'family', label: '婚姻家事', match: (c) => /离婚|抚养|继承|赡养|婚姻/.test(c.cause + c.name) },
  { key: 'civil', label: '民事 · 合同 · 侵权', match: () => true },
]

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
  // 检索偏向（R150）：类似案情=纯 Facts↔Facts 比对；裁判理由=Holding/Result 主导——
  // 与后端 /api/cases bias 参数一一对应（R146 字段加权检索的 UI 面）
  const [bias, setBias] = useState<'balanced' | 'facts' | 'reasoning'>('balanced')
  const [cases, setCases] = useState<CaseRecord[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // 检索下推 server（C7：/api/cases?q=&level= 与法条检索同一「单一引擎」口径）
  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    const level = tab === '指导性案例' || tab === '外国判例' ? tab : undefined
    api.listCases(q.trim(), level, bias).then(
      (d) => alive && (setCases(d.cases.filter((c) => c.verified && !c.sample)), setLoading(false)),
      (e) => alive && (setError(e instanceof ApiError ? e.message : String(e)), setLoading(false)),
    )
    return () => { alive = false }
  }, [q, tab, bias])

  const hits = cases

  // 谱系分组（派生）：外国判例单列，其余按案由规则顺次归类（民事为兜底组）
  const lineage = useMemo(() => {
    const foreign = cases.filter((c) => c.jurisdiction !== '中国')
    const domestic = cases.filter((c) => c.jurisdiction === '中国')
    const groups = DOMAIN_RULES.map((rule) => ({
      key: rule.key,
      label: rule.label,
      items: domestic.filter((c) => rule.match(c)),
    })).filter((g) => g.items.length > 0)
    return { foreign, groups }
  }, [cases])

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

      {!loading && cases.length > 0 && (
        <div className="card mt-16" style={{ padding: '12px 16px' }}>
          <div className="tiny bold mb-8">案例谱系 · {cases.length} 件一览（按案由派生分组）</div>
          <div style={{ display: 'grid', gap: 8 }}>
            {lineage.groups.map((g) => (
              <div key={g.key} className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
                <span className="bdg bdg-teal" style={{ flexShrink: 0 }}>{g.label} · {g.items.length} 件</span>
                <div className="row-wrap" style={{ gap: 6, minWidth: 0 }}>
                  {g.items.map((c) => (
                    <Link key={c.id} to={`/cases/${c.id}`} className="bdg bdg-gray" style={{ textDecoration: 'none' }}>
                      {c.no} · {c.name.length > 22 ? `${c.name.slice(0, 21)}…` : c.name}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
            {lineage.foreign.length > 0 && (
              <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
                <span className="bdg bdg-gray" style={{ flexShrink: 0 }}>域外比较研究 · {lineage.foreign.length} 件</span>
                <div className="row-wrap" style={{ gap: 6, minWidth: 0 }}>
                  {lineage.foreign.map((c) => (
                    <Link key={c.id} to={`/cases/${c.id}`} className="bdg bdg-gray" style={{ textDecoration: 'none' }}>
                      {c.name.length > 22 ? `${c.name.slice(0, 21)}…` : c.name}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="card mt-16">
        <div style={{ padding: '0 16px' }}>
          <Tabs tabs={TAB_DEFS} active={tab} onChange={setTab} right={<span className="tiny">{hits.length} 件当前结果</span>} />
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, margin: '10px 0 4px' }}>
            <Segmented
              ariaLabel="案例检索偏向"
              value={bias}
              onChange={(k) => setBias(k as typeof bias)}
              options={[
                { key: 'balanced', label: '综合' },
                { key: 'facts', label: '类似案情' },
                { key: 'reasoning', label: '裁判理由' },
              ]}
            />
            <span className="tiny">「类似案情」按案情事实比对；「裁判理由」按法院说理排序——同一关键词两种视角。</span>
          </div>
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
