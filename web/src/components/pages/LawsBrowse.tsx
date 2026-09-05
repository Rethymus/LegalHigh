// FRAME 04a · 法规条文浏览（导航「法规条文」落地页；详情见 LawDetail）
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../icons'
import { lawEvidenceGrade, useLaws } from '../../data/model'
import { EmptyState, PageHeader, SkeletonLines, ValidityBadge } from '../ui'
import { SourceBadge } from '../domain'

export default function LawsBrowse() {
  const { data, error } = useLaws()
  const [q, setQ] = useState('')
  const laws = useMemo(
    () => data?.laws.filter((l) => (l.title + l.organ).toLowerCase().includes(q.trim().toLowerCase())) ?? [],
    [data, q],
  )

  return (
    <div className="page">
      <PageHeader
        title="法规条文"
        sub={`共收录 ${data ? data.laws.length : '…'} 部法律、${data ? data.laws.reduce((s, l) => s + l.articles.length, 0).toLocaleString() : '…'} 条条文（本地证据快照语料）。引用一律附版本/生效/效力字段。`}
        actions={
          <div className="searchbar" style={{ height: 40 }}>
            <Icon name="search" size={15} className="muted" />
            <input className="inp" placeholder="按法律名称过滤…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        }
      />

      {error && <div className="banner banner-danger mb-16"><Icon name="alert" size={15} />语料加载失败：{error}</div>}
      {!data && !error && <div className="card card-pad"><SkeletonLines n={6} tall /></div>}

      {data && (
        <div className="card">
          <div style={{ padding: '8px 20px' }}>
            {laws.map((l) => (
              <Link key={l.id} to={`/laws/${l.id}`} className="law-card hoverable" style={{ borderRadius: 14, marginBottom: 8, border: '1px solid var(--div-soft)' }}>
                <span className="law-ic"><Icon name="article" size={19} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row-wrap" style={{ gap: 8 }}>
                    <b style={{ fontSize: 15 }}>{l.title}</b>
                    <ValidityBadge v={l.status} />
                    <SourceBadge kind="law" grade={lawEvidenceGrade(l.sourceUrl)} />
                  </div>
                  <div className="law-meta">
                    <span>发布机关：<b>{l.organ}</b></span>
                    <span>公布：<b>{l.promulgationDate}</b></span>
                    <span>施行：<b>{l.effectiveDate || '待核（flk 对照 · M5）'}</b></span>
                    <span><b>{l.articles.length}</b> 条</span>
                    {l.instrument && <span>公布令：<b>{l.instrument}</b></span>}
                  </div>
                </div>
                <span style={{ marginTop: 12 }}><Icon name="chevR" size={15} className="muted" /></span>
              </Link>
            ))}
            {laws.length === 0 && <EmptyState icon="search" title="未匹配到法律" desc="尝试更短的名称关键词。" />}
          </div>
          <div className="doc-statusbar">
            <span>文本来源：证据快照语料（Wikisource 转录） · 构建 {data.builtAt.slice(0, 10)}</span>
            <span className="sp" />
            <span>flk.npc.gov.cn 抽查比对（≥10%+字段全量）：M6 计划中</span>
          </div>
        </div>
      )}
    </div>
  )
}
