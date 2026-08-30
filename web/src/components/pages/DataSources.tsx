// FRAME 19 · Data Sources —— 数据源架构与接入状态（规格 §26）
// 关键纪律：不虚构已接入的数据库。已接入仅本地证据快照语料；其余全部为规划/未接入。
import { Icon, type IconName } from '../icons'
import { DATA_SOURCES, useLaws } from '../../data/model'
import { PageHeader, SkeletonLines } from '../ui'

const KIND_ICON: Record<string, IconName> = {
  'Official Legislation（快照）': 'shieldCheck',
  'Official Legislation': 'article',
  'Court Database': 'gavel',
  'Judicial Interpretation': 'scale',
  'Foreign Legal Database': 'globe',
  'Academic Source': 'book',
}

export default function DataSources() {
  const { data } = useLaws()

  return (
    <div className="page">
      <PageHeader
        title="数据源状态"
        sub="展示系统数据源架构与接入状态。原型不虚构任何已接入的官方数据库；已接入来源仅本地证据快照语料。"
        actions={<button className="btn btn-ghost btn-sm"><Icon name="refresh" size={13} />刷新状态</button>}
      />

      <div className="banner banner-info mb-16">
        <Icon name="info" size={15} />
        <span className="banner-tx"><b>授权与合规：</b>接入裁判文书将遵循三重授权原则；含个人信息文书入库前二次脱敏，并提供拒绝/删除通道（合规红线清单）。</span>
      </div>

      <div className="row-wrap mb-16">
        <span className="bdg bdg-green"><span className="dot" />已接入 {DATA_SOURCES.filter((s) => s.status === '已接入（本地快照）').length}</span>
        <span className="bdg bdg-teal">官方公开文本 · 人工录入 {DATA_SOURCES.filter((s) => s.status === '官方公开文本 · 人工录入').length}</span>
        <span className="bdg bdg-blue">规划接入 {DATA_SOURCES.filter((s) => s.status === '规划接入').length}</span>
        <span className="bdg bdg-gray">未接入 {DATA_SOURCES.filter((s) => s.status === '未接入').length}</span>
        <span className="spacer" />
        {data && <span className="tiny">语料构建于 {data.builtAt.slice(0, 10)} · 快照抓取 {data.fetchDate}</span>}
      </div>

      <div className="banner banner-info mb-16">
        <Icon name="book" size={15} />
        <span className="banner-tx">接入策略依据《庭审判罚刑侦案件数据源调研》（docs/research/庭审判罚刑侦案件数据源调研-2026-08-30.md）：逐源核实官方性/许可/接入方式并多源互证——国内以两高官方发布文本与合规开源数据集（CAIL，脱敏后）为主；国外以开放 API 与 OGL/开放许可数据为主；裁判文书网不做批量抓取。</span>
      </div>

      {!data && <div className="card card-pad"><SkeletonLines n={4} tall /></div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 12 }}>
        {DATA_SOURCES.map((s) => {
          const live = s.status === '已接入（本地快照）'
          const official = s.status === '官方公开文本 · 人工录入'
          return (
            <div key={s.name} className="card dsv-card" style={live ? { borderColor: 'rgba(48, 209, 88, 0.4)' } : undefined}>
              <span className="dsv-ic" style={{ background: live ? 'var(--ok-soft)' : official ? 'var(--teal-soft)' : 'var(--bg-2)', color: live ? 'var(--ok)' : official ? 'var(--teal-t)' : 'var(--tx-3)' }}>
                <Icon name={KIND_ICON[s.kind] ?? 'database'} size={17} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row-wrap mb-8" style={{ gap: 7 }}>
                  <b style={{ fontSize: 13.5 }}>{s.name}</b>
                  {live ? <span className="bdg bdg-green"><span className="dot" />已接入</span>
                    : official ? <span className="bdg bdg-teal">官方公开文本 · 已录入</span>
                    : s.status === '规划接入' ? <span className="bdg bdg-blue">规划接入</span> : <span className="bdg bdg-gray">未接入</span>}
                </div>
                <div className="dsv-kv">
                  <span>类型：<b>{s.kind}</b></span>
                  <span>法域：<b>{s.jurisdiction}</b></span>
                  <span>更新频率：<b>{s.freq}</b></span>
                  <span>最近更新：<b>{s.last}</b></span>
                  <span>文档数：<b>{s.docs}</b></span>
                  <span>核验状态：<b>{s.verify}</b></span>
                </div>
                {s.strategy && (
                  <div className="tiny mt-8" style={{ color: 'var(--accent-text)' }}>
                    <span style={{ display: 'inline-flex', verticalAlign: -2, marginRight: 4 }}><Icon name="target" size={11} /></span>接入策略：{s.strategy}
                  </div>
                )}
                {s.note && <div className="tiny mt-8">{s.note}</div>}
              </div>
            </div>
          )
        })}
      </div>

      <div className="card mt-20">
        <div className="card-h"><b className="card-h-t">来源类型图例</b></div>
        <div className="card-b row-wrap">
          <span className="sg sg-law">Official Legislation</span>
          <span className="sg sg-case">Court Database</span>
          <span className="sg sg-academic">Judicial Interpretation / Academic</span>
          <span className="sg sg-foreign">Foreign Legal Database</span>
          <span className="tiny">统一来源徽章颜色与全局一致（数据可信视觉语言）。</span>
        </div>
      </div>
    </div>
  )
}
