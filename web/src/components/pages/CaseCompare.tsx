import { useEffect, useMemo, useState } from 'react'
import { Link, useOutletContext, useSearchParams } from 'react-router-dom'
import { Icon } from '../icons'
import { PageHeader } from '../ui'
import { api, type CaseRecord } from '../../lib/api'
import type { AppOutletContext } from '../AppShell'

/* 案例对比阅读（R341）：法学学生核心需求——选择两个案例并排比较
   裁判要点/适用法条/结果。每列独立滚动，共有法条高亮标注。
   数据 100% 出自已核实案例库（快照逐字钉住）。 */

function CasePicker({ cases, value, onChange, label }: { cases: CaseRecord[]; value: string; onChange: (id: string) => void; label: string }) {
  const grouped = useMemo(() => {
    const map = new Map<string, CaseRecord[]>()
    for (const c of cases) {
      const key = c.level || '其他'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(c)
    }
    return [...map.entries()]
  }, [cases])

  return (
    <label className="fld" style={{ flex: 1, minWidth: 220 }}>
      <span className="fld-l">{label}</span>
      <select className="sel" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
        <option value="">选择案例…</option>
        {grouped.map(([level, list]) => (
          <optgroup key={level} label={level}>
            {list.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  )
}

function SharedStatutes({ a, b }: { a: CaseRecord; b: CaseRecord }) {
  const aKeys = new Set((a.statutes ?? []).map((s) => `${s.law_id}-${s.no}`))
  const shared = (b.statutes ?? []).filter((s) => aKeys.has(`${s.law_id}-${s.no}`))
  if (!shared.length) return null
  return (
    <div className="banner banner-info mb-12">
      <Icon name="link" size={14} />
      <span className="banner-tx">
        两案共同引用 <b>{shared.length}</b> 部法律的相同条文：
        {shared.slice(0, 4).map((s) => (
          <Link key={`${s.law_id}-${s.no}`} to={`/laws/${s.law_id}?art=${s.no}`} className="bold" style={{ color: 'var(--accent-text)', marginLeft: 6 }}>
            {s.label}
          </Link>
        ))}
        {shared.length > 4 && <span> 等 {shared.length} 条</span>}
      </span>
    </div>
  )
}

function CompareColumn({ c }: { c: CaseRecord }) {
  const cStatutes = c.statutes ?? []
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', flex: 1, minWidth: 0 }}>
      <div className="card-h" style={{ padding: '12px 14px' }}>
        <div>
          <Link to={`/cases/${c.id}`} className="bold" style={{ color: 'var(--accent-text)', fontSize: 13 }}>{c.name}</Link>
          <div className="tiny muted mt-4">{c.no} · {c.court} · {c.date}</div>
        </div>
        <span className="bdg bdg-gray">{c.level}</span>
      </div>
      <div style={{ padding: '0 14px 14px' }}>
        <div className="tiny bold mt-8 mb-4" style={{ color: 'var(--tx-2)' }}>裁判要点</div>
        <div style={{ fontSize: 13, lineHeight: 1.9, whiteSpace: 'pre-wrap' }}>{c.holding}</div>

        {c.result && (
          <>
            <div className="tiny bold mt-12 mb-4" style={{ color: 'var(--tx-2)' }}>裁判结果</div>
            <div style={{ fontSize: 12.5, lineHeight: 1.8, color: 'var(--tx-2)', whiteSpace: 'pre-wrap' }}>{c.result.slice(0, 500)}{(c.result.length > 500 ? '…' : '')}</div>
          </>
        )}

        {cStatutes.length > 0 && (
          <>
            <div className="tiny bold mt-12 mb-4" style={{ color: 'var(--tx-2)' }}>适用法条（{cStatutes.length} 条）</div>
            <div className="chips">
              {cStatutes.map((s) => (
                <Link key={`${s.law_id}-${s.no}`} className="chip" to={`/laws/${s.law_id}?art=${s.no}`} style={{ color: 'var(--accent-text)', fontSize: 11 }}>
                  {s.label}
                </Link>
              ))}
            </div>
          </>
        )}

        <div className="tiny muted mt-12" style={{ borderTop: '1px solid var(--div-soft)', paddingTop: 8 }}>
          来源核验于 {c.source_accessed_at} ·{' '}
          <a href={c.source_url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-text)' }}>官方原文</a>
        </div>
      </div>
    </div>
  )
}

export default function CaseCompare() {
  const { audience } = useOutletContext<AppOutletContext>()
  const [sp, setSp] = useSearchParams()
  const [cases, setCases] = useState<CaseRecord[] | null>(null)
  const [aId, setAId] = useState(sp.get('a') ?? '')
  const [bId, setBId] = useState(sp.get('b') ?? '')

  useEffect(() => {
    let alive = true
    // R511 修复：此前误传 '300' 作第二参——listCases 的第二参是 level（案例等级）
    // 而非 top_k，'300' 匹配不到任何等级 → 服务端全滤空 → 下拉自 R341 起从未有
    // 选项（走查实测 6.5s 后 0 有效 option）。空查询返回全部已核实案例。
    api.listCases('').then((r) => { if (alive) setCases(r.cases) }, () => { if (alive) setCases([]) })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    const next = new URLSearchParams()
    if (aId) next.set('a', aId)
    if (bId) next.set('b', bId)
    setSp(next, { replace: true })
  }, [aId, bId, setSp])

  const a = useMemo(() => cases?.find((c) => c.id === aId) ?? null, [cases, aId])
  const b = useMemo(() => cases?.find((c) => c.id === bId) ?? null, [cases, bId])

  return (
    <div className="page">
      <PageHeader
        title="案例对比阅读"
        sub="选择两个案例并排比较裁判要点、适用法条与结果——类案分析的学习工具。共有法条自动高亮标注。"
      />

      <div className="banner banner-warm mb-16">
        <Icon name="bulb" size={15} />
        <span className="banner-tx">
          案例对比仅供学习研究，不构成对任何案件的法律意见或预判。全部内容出自已核实的官方发布页快照。
        </span>
      </div>

      <div className="row mb-16" style={{ gap: 12, flexWrap: 'wrap' }}>
        <CasePicker cases={cases ?? []} value={aId} onChange={setAId} label="案例 A" />
        <CasePicker cases={cases ?? []} value={bId} onChange={setBId} label="案例 B" />
      </div>

      {!cases && <div className="tiny muted">案例库加载中…</div>}

      {cases && !a && !b && (
        <div className="card card-pad" style={{ textAlign: 'center', padding: 32 }}>
          <Icon name="compare" size={24} className="muted" />
          <p className="tiny muted mt-8">从上方下拉列表选择两个案例开始对比。同法域案例对比效果最佳。</p>
        </div>
      )}

      {a && !b && <div className="tiny muted mb-8">已选案例 A「{a.name}」——请再选择案例 B。</div>}
      {!a && b && <div className="tiny muted mb-8">已选案例 B「{b.name}」——请再选择案例 A。</div>}

      {a && b && (
        <>
          {a.jurisdiction !== b.jurisdiction && (
            <div className="banner banner-warn mb-12">
              <Icon name="alert" size={14} />
              <span className="banner-tx">跨法域对比（{a.jurisdiction} vs {b.jurisdiction}）——法律体系不同，类比结论需谨慎。</span>
            </div>
          )}
          <SharedStatutes a={a} b={b} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
            <CompareColumn c={a} />
            <CompareColumn c={b} />
          </div>
        </>
      )}

      {audience === null && (
        <div className="banner banner-info mt-16">
          <Icon name="info" size={14} />
          <span className="banner-tx">请先在首页选择使用视图后再使用案例对比。</span>
        </div>
      )}
    </div>
  )
}
