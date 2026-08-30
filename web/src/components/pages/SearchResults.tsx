// FRAME 03 · Search Results —— 综合结果（规格 §8）
// Tabs / 排序 / 官方来源与有效性徽章 / 引用式问答分离 / 未核实态
// 检索排序唯一来源：server GET /api/search（BM25，与问答/研究同一引擎）；
// 前端不再做子串匹配（多词/口语化查询在子串匹配下必然空结果，2026-08-30 修复）。
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Icon } from '../icons'
import { useLaws } from '../../data/model'
import { EmptyState, SkeletonLines, Tabs, useSimLoad, ValidityBadge } from '../ui'
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
  { key: 'academic', label: '学术' },
]
const SORTS = ['按相关性', '按最新', '按引用程度']
const FILTERS: { t: string; opts: string[] }[] = [
  { t: '法域', opts: ['中国', '美国', '英国', '欧盟'] },
  { t: '发布机构', opts: ['全国人民代表大会', '全国人大常委会', '国务院', '最高人民法院'] },
  { t: '时效性', opts: ['仅现行有效', '含历史版本'] },
  { t: '来源', opts: ['官方法源', '司法案例', '学术资料', '域外资料'] },
]

function highlight(text: string, q: string) {
  const kw = q.trim()
  if (!kw) return text
  const parts = text.split(new RegExp(`(${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'))
  return parts.map((p, i) => (p.toLowerCase() === kw.toLowerCase() ? <mark key={i}>{p}</mark> : p))
}

/** 检索命中视图模型：server 排序 + laws.json 元数据（机关/公布/施行）合并 */
interface ResolvedHit {
  hit: SearchHit
  law: { id: string; title: string; organ: string; promulgationDate: string; effectiveDate: string; status: string } | null
}

function FavButton({ favKey, item }: { favKey: string; item: Parameters<typeof toggleFav>[0] }) {
  const [on, setOn] = useState(() => isFav(favKey))
  return (
    <button className={'res-act' + (on ? ' is-on' : '')} onClick={() => setOn(toggleFav(item))}>
      <Icon name="star" size={12} />{on ? '已收藏' : '收藏'}
    </button>
  )
}

function LawResultCard({ r, q }: { r: ResolvedHit; q: string }) {
  const { hit, law } = r
  const title = (law?.title ?? hit.law_title).replace(/^中华人民共和国/, '')
  const to = `/laws/${hit.law_id}?art=${hit.no}`
  return (
    <article className="res-card">
      <div className="res-h">
        <div style={{ minWidth: 0 }}>
          <Link to={to} className="res-t">《{title}》{hit.label}</Link>
        </div>
        <span className="spacer" />
        <SourceBadge kind="law" grade="强" />
        <ValidityBadge v={law?.status ?? '现行有效'} />
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
        <span className="tiny">引用统计待接入（不虚构计数）</span>
        <span className="spacer" />
        <Link className="res-act" to={to}><Icon name="external" size={12} />查看原文</Link>
        <FavButton favKey={`law:${hit.law_id}:${hit.no}`} item={{ key: `law:${hit.law_id}:${hit.no}`, type: '法条', title: `《${title}》${hit.label}`, meta: hit.text.slice(0, 40) + '…', to }} />
      </div>
    </article>
  )
}

function CaseResultCard({ c, q }: { c: CaseRecord; q: string }) {
  return (
    <article className="res-card" style={c.sample ? { borderStyle: 'dashed' } : undefined}>
      <div className="res-h">
        <div style={{ minWidth: 0 }}>
          <Link to={`/cases/${c.id}`} className="res-t">{highlight(c.name, q)}</Link>
        </div>
        <span className="spacer" />
        <SourceBadge kind={c.kind} grade={c.grade} />
        <ValidityBadge v={c.verified ? '有效' : '未核实'} />
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
        <Link className="res-act" to={`/cases/${c.id}`}><Icon name="external" size={12} />查看原文</Link>
        <FavButton favKey={`case:${c.id}`} item={{ key: `case:${c.id}`, type: '案例', title: c.name, meta: `${c.no} · ${c.court}`, to: `/cases/${c.id}` }} />
      </div>
    </article>
  )
}

export default function SearchResults() {
  const [sp] = useSearchParams()
  const nav = useNavigate()
  const q = sp.get('q') ?? ''
  const [input, setInput] = useState(q)
  const [tab, setTab] = useState('all')
  const [sort, setSort] = useState(SORTS[0])
  const lawHitsLoading = useSimLoad([q, tab], 550)
  const { data: laws, error } = useLaws()

  // 主检索：server BM25（与问答/研究同一引擎）；laws.json 仅用于补齐机关/日期等元数据
  const [srv, setSrv] = useState<{ hits: SearchHit[]; corpus: number } | null>(null)
  const [srvError, setSrvError] = useState<string | null>(null)
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
  const [allCases, setAllCases] = useState<CaseRecord[]>([])
  useEffect(() => {
    api.listCases().then((d) => setAllCases(d.cases), () => setAllCases([]))
  }, [])
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
  const lawHits = resolved
  const caseHits = useMemo(() => {
    if (!q) return allCases.filter((c) => c.verified).slice(0, 3)
    const query = q.toLowerCase()
    return allCases.filter((c) => (c.name + c.cause + c.summary + c.no).toLowerCase().includes(query))
  }, [allCases, q])

  const counts = {
    all: lawHits.length + caseHits.length,
    law: lawHits.length,
    case: caseHits.length,
    js: 0,
    academic: 0,
  }
  const loading = !error && (lawHitsLoading || (!!q && !srv && !srvError) || !laws)
  // 命中法律的分布（程序统计，非 AI 生成）
  const hitDist = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of lawHits) {
      const t = (r.law?.title ?? r.hit.law_title).replace(/^中华人民共和国/, '')
      m.set(t, (m.get(t) ?? 0) + 1)
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [lawHits])
  const empty = !srvError && !!laws && !!q && !!srv && counts.all === 0

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
        <button className="btn btn-ghost"><Icon name="sliders" size={14} />高级检索</button>
      </div>

      <Tabs
        tabs={TAB_DEFS.map((t) => ({ ...t, count: counts[t.key as keyof typeof counts] }))}
        active={tab}
        onChange={setTab}
        right={
          <div className="row">
            <Icon name="sort" size={13} className="muted" />
            <select className="sel" style={{ width: 130, height: 32 }} value={sort} onChange={(e) => setSort(e.target.value)} aria-label="排序">
              {SORTS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
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
                  <span className="ot-tag">官方原文</span>
                  <Link to={`/laws/${c.law_id}?art=${c.article_no}`} className="tiny bold" style={{ color: 'var(--accent-text)' }}>《{c.law_title.replace(/^中华人民共和国/, '')}》{c.article_label}</Link>
                  <span className="ot-src">{c.law_status} · {c.effective_date} 施行 · 相关度 {c.score.toFixed(3)}</span>
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.9 }}>{c.text}</div>
              </div>
            ))}
            <div className="tiny">问答为「命中的法条原文」卡片，非生成文本；不构成法律意见。</div>
          </div>
        )}
      </div>

      <div className="cols cols-2l mt-16" style={{ gridTemplateColumns: '236px minmax(0,1fr)' }}>
        {/* 左：过滤 */}
        <aside className="card" style={{ padding: '6px 16px', position: 'sticky', top: 0 }}>
          {FILTERS.map((g) => (
            <div key={g.t} className="flt-group">
              <div className="flt-t">{g.t}</div>
              {g.opts.map((o) => (
                <label key={o} className="flt-opt">
                  <input type="checkbox" style={{ accentColor: 'var(--accent)' }} />
                  {o}
                </label>
              ))}
            </div>
          ))}
        </aside>

        {/* 中：结果 */}
        <div style={{ minWidth: 0 }}>
          {error && (
            <div className="banner banner-danger mb-12"><Icon name="alert" size={15} />语料加载失败：{error}<span className="spacer" /><button className="btn btn-ghost btn-sm" onClick={() => location.reload()}>重试</button></div>
          )}
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
                    「{q}」命中 <b>{counts.law}</b> 条条文（{hitDist.slice(0, 3).map(([t, n]) => `${t} ${n} 条`).join(' · ')}{hitDist.length > 3 ? ' 等' : ''}）、<b>{counts.case}</b> 件公开案例样本。本行为程序统计（BM25 词法检索），非 AI 生成摘要。
                  </span>
                </div>
              )}
              <div className="mt-16">
                {(tab === 'all' || tab === 'case') && caseHits.map((c) => <CaseResultCard key={c.id} c={c} q={q} />)}
                {(tab === 'all' || tab === 'law') && lawHits.map((r) => <LawResultCard key={`${r.hit.law_id}-${r.hit.no}`} r={r} q={q} />)}

                {tab === 'js' && (
                  <div className="card">
                    <EmptyState icon="database" title="司法解释库未接入" desc="原型不虚构已接入的司法解释数据源。接入后此处将展示司法解释及其效力字段。" action={<Link className="btn btn-secondary" to="/data-sources">查看数据源规划</Link>} />
                  </div>
                )}
                {tab === 'academic' && (
                  <div className="card">
                    <EmptyState icon="book" title="学术资料源规划中" desc="规划接入 LegalBench-RAG 等评测与文献来源，用于引用质量评测，不参与裁判依据。" />
                  </div>
                )}
                {empty && (
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
