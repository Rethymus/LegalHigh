// FRAME 03 · Search Results —— 综合结果（规格 §8）
// Tabs / 排序 / 证据来源与有效性徽章 / 引用式问答分离
// 检索排序唯一来源：server GET /api/search（BM25，与问答/研究同一引擎）；
// 前端不再做子串匹配（多词/口语化查询在子串匹配下必然空结果，2026-08-30 修复）。
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Icon } from '../icons'
import { lawDisplayTitle, lawEvidenceGrade, useLaws } from '../../data/model'
import { EmptyState, SkeletonLines, Tabs, ValidityBadge } from '../ui'
import { api, ApiError, toggleFav, isFav, type CaseRecord, type SearchHit } from '../../lib/api'
import { CitationChip, SourceBadge } from '../domain'

interface QaResult {
  question: string
  premise_check: { rule_id: string; warning: string; citation: { law_id: string; law_title: string; article_no: number; article_label: string } } | null
  answer_cards: { law_id: string; law_title: string; law_status: string; effective_date: string; article_no: number; article_label: string; chapter: string; text: string; source_url: string; score: number }[]
  no_answer: boolean
}

const TAB_DEFS = [
  { key: 'all', label: '综合' },
  { key: 'law', label: '法规' },
  { key: 'case', label: '案例' },
  { key: 'js', label: '司法解释' },
]
const JUDICIAL_INTERPRETATION_IDS = new Set(['htjs-2023', 'wlxf-2022'])

function highlight(text: string, q: string) {
  const kw = q.trim()
  if (!kw) return text
  const parts = text.split(new RegExp(`(${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'))
  return parts.map((p, i) => (p.toLowerCase() === kw.toLowerCase() ? <mark key={i}>{p}</mark> : p))
}

/** 检索命中视图模型：server 排序 + laws.json 元数据（机关/公布/施行）合并 */
interface ResolvedHit {
  hit: SearchHit
  law: { id: string; title: string; organ: string; promulgationDate: string; effectiveDate: string; status: string; sourceUrl: string } | null
}

function FavButton({ favKey, item }: { favKey: string; item: Parameters<typeof toggleFav>[0] }) {
  const [on, setOn] = useState(() => isFav(favKey))
  return (
    <button className={'res-act' + (on ? ' is-on' : '')} onClick={() => setOn(toggleFav(item))}>
      <Icon name="star" size={12} />{on ? '已收藏' : '收藏'}
    </button>
  )
}

function LawResultCard({ r, q, si }: { r: ResolvedHit; q: string; si?: number }) {
  const { hit, law } = r
  const title = lawDisplayTitle((law?.title ?? hit.law_title).replace(/^中华人民共和国/, ''), law?.status)
  const to = `/laws/${hit.law_id}?art=${hit.no}`
  return (
    <article className="res-card" style={si === undefined ? undefined : { '--si': si } as React.CSSProperties}>
      <div className="res-h">
        <div style={{ minWidth: 0 }}>
          <Link to={to} className="res-t">《{title}》{hit.label}</Link>
        </div>
        <span className="spacer" />
        <SourceBadge kind="law" grade={lawEvidenceGrade(law?.sourceUrl)} />
        <ValidityBadge v={law?.status ?? '未核实'} />
      </div>
      <div className="res-meta">
        {law && <span>来源：<b>{law.organ}</b></span>}
        {law && <span>公布：<b>{law.promulgationDate}</b></span>}
        {law && <span>施行：<b>{law.effectiveDate || '待核'}</b></span>}
        <span>法域：<b>中国</b></span>
        {hit.chapter && <span>章节：<b>{hit.chapter.split('>').slice(0, 2).join(' > ')}</b></span>}
        <span>相关度：<b className="mono">{hit.score.toFixed(2)}</b></span>
      </div>
      <p className="res-snip">{highlight(hit.text, q)}</p>
      <div className="res-acts">
        <CitationChip label={`引用 ${hit.law_id}#${hit.no}`} to={to} />
        <span className="spacer" />
        <Link className="res-act" to={to}><Icon name="external" size={12} />查看证据快照</Link>
        <FavButton favKey={`law:${hit.law_id}:${hit.no}`} item={{ key: `law:${hit.law_id}:${hit.no}`, type: '法条', title: `《${title}》${hit.label}`, meta: hit.text.slice(0, 40) + '…', to }} />
      </div>
    </article>
  )
}

function CaseResultCard({ c, q, si }: { c: CaseRecord; q: string; si?: number }) {
  return (
    <article className="res-card" style={si === undefined ? undefined : { '--si': si } as React.CSSProperties}>
      <div className="res-h">
        <div style={{ minWidth: 0 }}>
          <Link to={`/cases/${c.id}`} className="res-t">{highlight(c.name, q)}</Link>
        </div>
        <span className="spacer" />
        <SourceBadge kind={c.kind} grade={c.grade} />
        <span className="bdg bdg-green">来源已核验</span>
      </div>
      <div className="res-meta">
        <span>{c.no}</span>
        <span>法院/机关：<b>{c.court}</b></span>
        <span><b>{c.date}</b></span>
        <span>案由：<b>{c.cause}</b></span>
        <span>来源层级：<b>{c.level}</b></span>
      </div>
      <p className="res-snip">{highlight(c.summary, q)}</p>
      <div className="res-acts">
        <CitationChip label={c.no} to={`/cases/${c.id}`} />
        <span className="spacer" />
        <Link className="res-act" to={`/cases/${c.id}`}><Icon name="external" size={12} />查看结构化摘要</Link>
        <a className="res-act" href={c.source_url} target="_blank" rel="noreferrer"><Icon name="link" size={12} />原始来源</a>
        <FavButton favKey={`case:${c.id}`} item={{ key: `case:${c.id}`, type: '案例', title: c.name, meta: `${c.no} · ${c.court}`, to: `/cases/${c.id}` }} />
      </div>
    </article>
  )
}

export default function SearchResults() {
  const [sp] = useSearchParams()
  const nav = useNavigate()
  const q = sp.get('q') ?? ''
  const requestedScope = sp.get('scope') ?? '全部'
  const scopeTab = requestedScope === '法规' ? 'law' : requestedScope === '司法解释' ? 'js' : requestedScope === '案例' ? 'case' : 'all'
  const [input, setInput] = useState(q)
  const [tab, setTab] = useState(scopeTab)
  const { data: laws, error } = useLaws()

  // 主检索：server BM25（与问答/研究同一引擎）；laws.json 仅用于补齐机关/日期等元数据
  const [srv, setSrv] = useState<{ hits: SearchHit[]; corpus: number } | null>(null)
  const [srvError, setSrvError] = useState<string | null>(null)
  useEffect(() => {
    setTab(scopeTab)
  }, [scopeTab])
  useEffect(() => {
    if (!q.trim()) { setSrv(null); setSrvError(null); return }
    let alive = true
    setSrv(null); setSrvError(null)
    api.search(q.trim(), 60).then(
      (d) => alive && setSrv({ hits: d.hits, corpus: d.retrieval_meta.corpus_size }),
      (e) => alive && setSrvError(e instanceof ApiError ? e.message : String(e)),
    )
    return () => { alive = false }
  }, [q])

  // 引用式问答（server BM25 检索，无 LLM 自由生成）
  const [qaQ, setQaQ] = useState(q)
  const [qa, setQa] = useState<QaResult | null>(null)
  const [qaBusy, setQaBusy] = useState(false)
  const [qaError, setQaError] = useState<string | null>(null)
  // 案例命中同样下推 server；无检索词时不请求或展示默认案例。
  const [allCases, setAllCases] = useState<CaseRecord[]>([])
  const [caseError, setCaseError] = useState<string | null>(null)
  useEffect(() => {
    if (!q.trim()) { setAllCases([]); setCaseError(null); return }
    let alive = true
    setCaseError(null)
    api.listCases(q.trim()).then(
      (d) => { if (alive) setAllCases(d.cases) },
      (e) => { if (alive) { setAllCases([]); setCaseError(e instanceof ApiError ? e.message : String(e)) } },
    )
    return () => { alive = false }
  }, [q])
  const runQa = async () => {
    if (!qaQ.trim()) return
    setQaBusy(true); setQaError(null)
    try { setQa(await api.ask(qaQ.trim())) }
    catch (e) { setQaError(e instanceof ApiError ? e.message : String(e)) }
    finally { setQaBusy(false) }
  }

  const resolved = useMemo<ResolvedHit[]>(() => {
    if (!srv || !laws) return []
    return srv.hits.map((h) => {
      const law = laws.laws.find((l) => l.id === h.law_id) ?? null
      return { hit: h, law }
    })
  }, [srv, laws])
  const lawHits = useMemo(() => resolved.filter((r) => !JUDICIAL_INTERPRETATION_IDS.has(r.hit.law_id)), [resolved])
  const judicialHits = useMemo(() => resolved.filter((r) => JUDICIAL_INTERPRETATION_IDS.has(r.hit.law_id)), [resolved])
  const caseHits = useMemo(() => {
    if (!q) return []
    return allCases.filter((c) => c.verified)
  }, [allCases, q])

  const counts = {
    all: resolved.length + caseHits.length,
    law: lawHits.length,
    case: caseHits.length,
    js: judicialHits.length,
  }
  const loading = !error && ((!!q && !srv && !srvError) || !laws)
  // 命中法律的分布（程序统计，非 AI 生成）
  const hitDist = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of resolved) {
      const t = (r.law?.title ?? r.hit.law_title).replace(/^中华人民共和国/, '')
      m.set(t, (m.get(t) ?? 0) + 1)
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [resolved])
  const visibleCount = tab === 'all' ? counts.all : tab === 'law' ? counts.law : tab === 'case' ? counts.case : counts.js
  const empty = !srvError && !!laws && !!q && !!srv && visibleCount === 0

  return (
    <div className="page">
      <div className="row-wrap mb-16" style={{ gap: 12 }}>
        <form
          className="searchbar"
          style={{ flex: 1, minWidth: 320 }}
          onSubmit={(e) => { e.preventDefault(); if (input.trim()) nav(`/search/results?q=${encodeURIComponent(input.trim())}`) }}
        >
          <Icon name="search" size={16} className="muted" />
          <input className="inp" value={input} onChange={(e) => setInput(e.target.value)} placeholder="修改检索词…" aria-label="修改检索词" />
          <button className="btn btn-primary">重新检索</button>
        </form>
        <Link className="btn btn-ghost" to="/search"><Icon name="sliders" size={14} />检索说明</Link>
      </div>

      <Tabs
        tabs={TAB_DEFS.map((t) => ({ ...t, count: counts[t.key as keyof typeof counts] }))}
        active={tab}
        onChange={setTab}
        right={
          <span className="tiny row"><Icon name="sort" size={13} className="muted" />服务端 BM25 相关性排序</span>
        }
      />

      {/* 引用式问答：回答由命中的法条原文卡片构成，无自由生成（无幻觉面） */}
      <div className="card card-pad mb-16" style={{ paddingBlock: 14 }}>
        <div className="row" style={{ gap: 10 }}>
          <span className="bdg bdg-purple">引用式问答</span>
          <input
            className="inp" style={{ flex: 1 }} placeholder="用一句话描述你的法律问题，回答由命中的法条原文构成…"
            value={qaQ} onChange={(e) => setQaQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void runQa() }}
          />
          <button className="btn btn-primary btn-sm" disabled={qaBusy} onClick={runQa}><Icon name="sparkle" size={13} />{qaBusy ? '检索中…' : '获取依据'}</button>
        </div>
        {qaError && <div className="banner banner-danger mt-12" style={{ padding: '8px 12px' }}><Icon name="alert" size={14} /><span className="banner-tx">{qaError}</span></div>}
        {qa && (
          <div className="mt-12">
            {qa.premise_check && (
              <div className="banner banner-warn mb-8" style={{ padding: '8px 12px' }}><Icon name="alert" size={14} />
                <span className="banner-tx">前提核查：{qa.premise_check.warning}
                  <CitationChip label={`《${qa.premise_check.citation.law_title ?? ''}》${qa.premise_check.citation.article_label}`} to={`/laws/${qa.premise_check.citation.law_id}?art=${qa.premise_check.citation.article_no}`} />
                </span>
              </div>
            )}
            {qa.no_answer && <div className="banner banner-info" style={{ padding: '8px 12px' }}><Icon name="info" size={14} /><span className="banner-tx">库内未找到依据——本系统不生成无依据的回答。</span></div>}
            {qa.answer_cards.slice(0, 3).map((c) => (
              <div key={`${c.law_id}-${c.article_no}`} className="ot" style={{ marginBottom: 8, padding: '11px 14px' }}>
                <div className="ot-h" style={{ marginBottom: 6 }}>
                  <span className="ot-tag">证据快照原文</span>
                  <Link to={`/laws/${c.law_id}?art=${c.article_no}`} className="tiny bold" style={{ color: 'var(--accent-text)' }}>《{c.law_title.replace(/^中华人民共和国/, '')}》{c.article_label}</Link>
                  <span className="ot-src">{c.law_status} · {c.effective_date || '施行日期待核'}{c.effective_date ? ' 施行' : ''} · 相关度 {c.score.toFixed(3)}</span>
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.9 }}>{c.text}</div>
              </div>
            ))}
            <div className="tiny">问答为「命中的法条原文」卡片，非生成文本；不构成法律意见。</div>
          </div>
        )}
      </div>

      <div className="cols cols-2l mt-16" style={{ gridTemplateColumns: '236px minmax(0,1fr)' }}>
        {/* 左：真实检索口径（不存在尚未实现的假筛选） */}
        <aside className="card card-pad" style={{ position: 'sticky', top: 0 }}>
          <div className="flt-t">当前检索口径</div>
          <p className="tiny">条文：本地证据快照语料，统一由服务端 BM25 排序。</p>
          <p className="tiny">案例：生产库只收录带直接来源链接与核验日期的公开真实案件。</p>
          <p className="tiny">司法解释：已接入的两部解释与规定会单列展示。</p>
          <p className="tiny">历史版本、学术资料和域外数据库尚未接入综合检索。</p>
          <Link to="/data-sources" className="btn btn-ghost btn-sm mt-8">查看数据源边界</Link>
        </aside>

        {/* 中：结果 */}
        <div style={{ minWidth: 0 }}>
          {error && (
            <div className="banner banner-danger mb-12"><Icon name="alert" size={15} />语料加载失败：{error}<span className="spacer" /><button className="btn btn-ghost btn-sm" onClick={() => location.reload()}>重试</button></div>
          )}
          {caseError && <div className="banner banner-warn mb-12"><Icon name="alert" size={15} /><span className="banner-tx">案例检索暂不可用：{caseError}；条文结果不受影响。</span></div>}
          {loading && (
            <div className="card card-pad">{<SkeletonLines n={5} tall />}</div>
          )}

          {!loading && (
            <>
              {srvError && (
                <div className="banner banner-danger mb-12"><Icon name="alert" size={15} />检索服务不可用：{srvError}<span className="spacer" /><button className="btn btn-ghost btn-sm" onClick={() => location.reload()}>重试</button></div>
              )}
              {q && counts.all > 0 && (
                <div className="banner banner-info mb-12"><Icon name="info" size={15} />
                  <span className="banner-tx">
                    「{q}」命中 <b>{counts.law}</b> 条法律/行政法规条文、<b>{counts.js}</b> 条司法解释、<b>{counts.case}</b> 件已核实公开案例（{hitDist.slice(0, 3).map(([t, n]) => `${t} ${n} 条`).join(' · ')}{hitDist.length > 3 ? ' 等' : ''}）。本行为程序统计（BM25 词法检索），非 AI 生成摘要。
                  </span>
                </div>
              )}
              {/* 列表级联入场（W5-2）：骨架屏→内容切换时 20ms 步长级联，序号封顶 12（.stagger 规则） */}
              <div className="mt-16 stagger">
                {(tab === 'all' || tab === 'case') && caseHits.map((c, i) => <CaseResultCard key={c.id} c={c} q={q} si={i} />)}
                {tab === 'all' && resolved.map((r, i) => <LawResultCard key={`${r.hit.law_id}-${r.hit.no}`} r={r} q={q} si={i + Math.min(caseHits.length, 6)} />)}
                {tab === 'law' && lawHits.map((r, i) => <LawResultCard key={`${r.hit.law_id}-${r.hit.no}`} r={r} q={q} si={i} />)}
                {tab === 'js' && judicialHits.map((r, i) => <LawResultCard key={`${r.hit.law_id}-${r.hit.no}`} r={r} q={q} si={i} />)}

                {tab === 'js' && q && judicialHits.length === 0 && (
                  <div className="card">
                    <EmptyState icon="database" title="已接入司法解释中没有本次命中" desc="当前语料含合同编通则司法解释与网络消费纠纷规定；请更换检索词。" action={<Link className="btn btn-secondary" to="/data-sources">查看数据源边界</Link>} />
                  </div>
                )}
                {empty && tab !== 'js' && (
                  <div className="card">
                    <EmptyState icon="search" title={`未找到与「${q}」相关的内容`} desc="尝试更换关键词、放宽筛选，或使用争议焦点描述问题。" action={<button className="btn btn-secondary" onClick={() => nav('/search')}>返回高级检索</button>} />
                  </div>
                )}
                {!q && (
                  <div className="card">
                    <EmptyState icon="search" title="输入法律问题开始检索" desc="示例：格式条款、劳动合同、不当得利。" action={<button className="btn btn-secondary" onClick={() => nav('/search/results?q=格式条款')}>试试「格式条款」</button>} />
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
