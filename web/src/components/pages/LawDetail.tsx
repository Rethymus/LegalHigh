// FRAME 04 · Law Detail —— 法条详情（规格 §9）
// 证据快照文本不可被 AI 改写；已审核解读与项目阅读方法必须明确分层。
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router-dom'
import { Icon } from '../icons'
import { WARM_TIPS, artParam, findArticle, findLaw, lawChapters, lawDisplayTitle, lawEvidenceGrade, parseArtParam, useLaws } from '../../data/model'
import { ActionSheet, EmptyState, PageHeader, SkeletonLines, Tabs, useCopy, useMediaQuery, useToast, ValidityBadge, type SheetAction } from '../ui'
import { AIContentBadge, AIWarning, CitationChip, OfficialArticle, SourceBadge } from '../domain'
import XRefBlock from '../XRefBlock'
import { api, isFav as isFavKey, toggleFav, type ArticleExplain, type ArticleLink, type LawAnalysisContext } from '../../lib/api'
import type { AppOutletContext } from '../AppShell'
import TERMS from '../../data/terms.json'

const TABS = [
  { key: 'rel-js', label: '关联司法解释' },
  { key: 'rel-case', label: '关联案例' },
  { key: 'cite', label: '引用关系' },
  { key: 'revision', label: '修订历史' },
  { key: 'related', label: '相关条文' },
  { key: 'version', label: '版本对比' },
]

/* 前身法全文区块（R390）：更名边界法专用——展开加载前身法清洗全文。
   note 含「前身关系定案」才渲染入口（登记册驱动，无登记不显示死按钮）。 */
function PredSection({ lawId }: { lawId: string }) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<Awaited<ReturnType<typeof api.predecessorFulltext>> | null>(null)
  useEffect(() => {
    if (!open || data) return
    let alive = true
    api.predecessorFulltext(lawId).then(
      (d) => alive && setData(d),
      () => alive && setData(null),
    )
    return () => { alive = false }
  }, [open, lawId, data])
  return (
    <div className="mt-8">
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen(v => !v)}>
        {open ? '收起前身法全文' : '查看前身法全文（现行法明文废止的前法）'}
      </button>
      {open && (
        data ? (
          <div className="card mt-8" style={{ padding: 14 }}>
            <div className="tiny mb-8">{data.relation}</div>
            <div className="banner banner-warn mb-12"><Icon name="alert" size={15} /><span className="banner-tx">{data.scope_note}</span></div>
            <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 12.5, lineHeight: 2, margin: 0, color: 'var(--tx)' }}>{data.text}</pre>
          </div>
        ) : (
          <div className="tiny muted mt-8">前身法全文加载中…（若长期为空说明快照暂不可用）</div>
        )
      )}
    </div>
  )
}

/* R412：多前身并列形态（民法典第1260条九法）——chips 选择器 + 全文卡。
   与单前身 PredSection 的区别：一部现行法废止多部前法时逐部切换查阅。 */
function MultiPredSection({ lawId, preds, relation }: { lawId: string; preds: { title: string; note?: string }[]; relation: string }) {
  const [sel, setSel] = useState(0)
  const [data, setData] = useState<Awaited<ReturnType<typeof api.predecessorFulltext>> | null>(null)
  useEffect(() => {
    let alive = true
    setData(null)
    api.predecessorFulltext(lawId, sel).then(
      (d) => alive && setData(d),
      () => alive && setData(null),
    )
    return () => { alive = false }
  }, [lawId, sel])
  return (
    <div className="mt-12">
      <div className="tiny mb-8" style={{ lineHeight: 1.8 }}>{relation}</div>
      <div className="chips">
        {preds.map((p, i) => (
          <button key={p.title} className={'chip' + (i === sel ? ' is-on' : '')} onClick={() => setSel(i)}>
            {p.title.replace('中华人民共和国', '')}
          </button>
        ))}
      </div>
      <div className="card mt-8" style={{ padding: 14 }}>
        {data ? (
          <>
            <div className="tiny mb-8">
              <b>{data.title}</b> · 快照 {data.snapshot}
              {data.predecessor_note ? ` · ${data.predecessor_note}` : ''}
            </div>
            <div className="banner banner-warn mb-12"><Icon name="alert" size={15} /><span className="banner-tx">{data.scope_note}</span></div>
            <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 12.5, lineHeight: 2, margin: 0, color: 'var(--tx)', maxHeight: 480, overflowY: 'auto' }}>{data.text}</pre>
          </>
        ) : (
          <div className="tiny muted">前身法全文加载中…（若长期为空说明该前法快照暂不可用）</div>
        )}
      </div>
    </div>
  )
}

export default function LawDetail() {
  const { audience } = useOutletContext<AppOutletContext>()
  const { lawId } = useParams()
  const [sp, setSp] = useSearchParams()
  const { data, error } = useLaws()
  const copy = useCopy()
  const toast = useToast()
  const nav = useNavigate()
  const isNarrow = useMediaQuery('(max-width: 767.98px)')
  const [sheetOpen, setSheetOpen] = useState(false)
  // tab 初始值支持 ?tab= 深链（R386：as_of 检索命中「在版本时间线中查证」入口直达）
  const [tab, setTab] = useState(() => {
    const t = sp.get('tab')
    return TABS.some(x => x.key === t) ? t! : 'rel-case'
  })

  const law = findLaw(data, lawId)
  // 人工通俗解读（决策项4 双轨：仅 approved 对外；无审核条目时保持 AI 通用指引）
  const [explains, setExplains] = useState<Record<string, ArticleExplain>>({})
  useEffect(() => {
    if (!lawId) return
    let alive = true
    api.lawExplains(lawId).then(
      (d) => alive && setExplains(d.explains ?? {}),
      () => { /* 解读库不可用不影响法条阅读 */ },
    )
    return () => { alive = false }
  }, [lawId])
  // 版本沿革（S2-T4 前端展示后续项）：仅多版本登记的法律显示；404/单版本隐藏
  const [versions, setVersions] = useState<Awaited<ReturnType<typeof api.lawVersions>> | null>(null)
  useEffect(() => {
    if (!lawId) return
    let alive = true
    api.lawVersions(lawId).then(
      (d) => alive && setVersions(d),
      () => { /* 未建版本注册表（404）不影响法条阅读 */ },
    )
    return () => { alive = false }
  }, [lawId])
  // R382 修复：无 ?art 参数时默认展示该法第一条（原默认 496 系民法典特化假设——
  // 对条数不足 496 的法律直接落入「未找到」空态，误导为页面故障）。任何法律必有第一条。
  const art = parseArtParam(sp.get('art')) ?? { no: 1 }
  const no = art.no
  const article = law ? findArticle(law, art.no, art.sub) : undefined
  const articleNo = article?.no
  // 官方解读关联层（决策项15）：有映射时展示司法解释条文卡
  const [articleLinks, setArticleLinks] = useState<ArticleLink[]>([])
  const [analysisContext, setAnalysisContext] = useState<LawAnalysisContext | null>(null)
  const [analysisContextError, setAnalysisContextError] = useState(false)
  useEffect(() => {
    if (!lawId || articleNo === undefined) return
    let alive = true
    setAnalysisContext(null)
    setAnalysisContextError(false)
    api.articleLinks(lawId, articleNo).then(
      (d) => alive && setArticleLinks(d.links ?? []),
      () => alive && setArticleLinks([]),
    )
    api.lawAnalysisContext(lawId, articleNo).then(
      (d) => alive && setAnalysisContext(d),
      () => alive && setAnalysisContextError(true),
    )
    return () => { alive = false }
  }, [lawId, articleNo])
  // 当前条号的已审核人工解读（决策项4：无则保持 AI 通用指引）
  const explain = article ? explains[String(article.no)] : undefined
  // 本法关联术语卡反查（v7 粉饰：打通术语卡↔法条详情双向导航）
  const relatedTerms = useMemo(
    () => TERMS.filter((t) => t.refs.some((r) => r.law_id === lawId)),
    [lawId],
  )
  const [favState, setFavState] = useState(false)
  useEffect(() => { setFavState(lawId ? isFavKey(`law:${lawId}#${no}`) : false) }, [lawId, no])

  const chapters = useMemo(() => (law ? lawChapters(law) : []), [law])
  // 同章条文按词面相似度排序（R331：bigram 重合度，当前条文排首位，其余按相关度递减）
  const sibling = useMemo(() => {
    if (!law || !article) return []
    const same = law.articles.filter((a) => a.chapter != null && a.chapter === article.chapter)
    const bg = (t: string) => {
      const clean = [...t].filter((ch) => /\w/.test(ch) || ch >= '\u4e00').join('')
      return new Set(Array.from({ length: Math.max(0, clean.length - 1) }, (_, i) => clean.slice(i, i + 2)))
    }
    const curBg = bg(article.text)
    const curKey = `${article.no}-${article.sub ?? ''}`
    return same
      .filter((a) => `${a.no}-${a.sub ?? ''}` !== curKey)
      .map((a) => {
        const b = bg(a.text)
        let inter = 0
        for (const g of b) if (curBg.has(g)) inter++
        return { a, score: inter / Math.max(1, Math.min(curBg.size, b.size)) }
      })
      .sort((x, y) => y.score - x.score || x.a.no - y.a.no)
      .map((x) => x.a)
  }, [law, article])
  const [cited, setCited] = useState<Awaited<ReturnType<typeof api.citedBy>> | null>(null)
  const [ftVid, setFtVid] = useState<string | null>(null)
  const [fulltext, setFulltext] = useState<Awaited<ReturnType<typeof api.versionFulltext>> | null>(null)
  // 修正决定全文（R384）：amNo=展开中的决定次序；amText=加载的决定正文
  const [amNo, setAmNo] = useState<number | null>(null)
  const [amText, setAmText] = useState<Awaited<ReturnType<typeof api.amendmentFulltext>> | null>(null)
  const [renumber, setRenumber] = useState<Awaited<ReturnType<typeof api.renumberMap>> | null>(null)
  useEffect(() => {
    let alive = true
    api.renumberMap(lawId ?? '').then(
      (d) => alive && setRenumber(d),
      () => alive && setRenumber(null),
    )
    return () => { alive = false }
  }, [lawId])
  const [histQ, setHistQ] = useState('')
  const [histHits, setHistHits] = useState<Awaited<ReturnType<typeof api.historySearch>> | null>(null)
  const [histBusy, setHistBusy] = useState(false)
  const [histError, setHistError] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    if (!ftVid) { setFulltext(null); return () => { alive = false } }
    // 历史版本全文（仅 has_fulltext 版本可展开）；不可用时诚实报错不伪造
    api.versionFulltext(lawId ?? '', ftVid).then(
      (d) => alive && setFulltext(d),
      () => alive && setFulltext(null),
    )
    return () => { alive = false }
  }, [lawId, ftVid])
  useEffect(() => { setFtVid(null) }, [lawId])
  // 修正决定全文（R384）：与版本全文同款加载纪律（不可用诚实报错不伪造）
  useEffect(() => {
    let alive = true
    if (amNo === null) { setAmText(null); return () => { alive = false } }
    api.amendmentFulltext(lawId ?? '', amNo).then(
      (d) => alive && setAmText(d),
      () => alive && setAmText(null),
    )
    return () => { alive = false }
  }, [lawId, amNo])
  useEffect(() => { setAmNo(null) }, [lawId])

  const runHistSearch = () => {
    const q = histQ.trim()
    if (!q) return
    setHistBusy(true)
    setHistError(null)
    api.historySearch(q, { lawId: lawId ?? undefined, topK: 10 }).then(
      (out) => { setHistHits(out); setHistBusy(false) },
      (reason: unknown) => { setHistHits(null); setHistError(reason instanceof Error ? reason.message : String(reason)); setHistBusy(false) },
    )
  }
  useEffect(() => {
    let alive = true
    // Citator「被引用于」：已核实案例对本法的精确引用（research_refs，含子条号）
    api.citedBy(lawId ?? '').then(
      (d) => alive && setCited(d),
      () => { /* Citator 不可用时不阻塞法条页 */ },
    )
    return () => { alive = false }
  }, [lawId])
  const articleCitedCases = useMemo(
    () => (cited?.cases ?? []).filter((c) => c.cited_articles.some((a) => a.no === no && (a.sub ?? '') === (art?.sub ?? ''))),
    [cited, no, art?.sub],
  )

  if (error) return <div className="page"><div className="banner banner-danger"><Icon name="alert" size={15} />语料加载失败：{error}</div></div>
  if (!data) return <div className="page"><div className="card card-pad"><SkeletonLines n={8} tall /></div></div>
  if (!law || !article) {
    return (
      <div className="page">
        <EmptyState icon="file" title="未找到该法律或条文" desc={`本地语料暂无 ${lawId ?? ''} 第${no}条。原型不手写法条，请从法规条文列表进入。`} action={<Link to="/laws" className="btn btn-secondary">返回法规条文</Link>} />
      </div>
    )
  }

  // 窄屏（R335）：7 件操作 flex-wrap 会占 3-4 行把正文挤出首屏——折叠为「更多」
  // 底部动作面板（iOS ActionSheet 范式）；桌面端保持完整按钮行，两形态互不影响。
  const researchTo = `/research?q=${encodeURIComponent(`《${law.title}》${article.label}的适用条件、例外与待确认事实`)}`
  const favNow = () => {
    const now = toggleFav({ key: `law:${lawId}#${artParam(no, art.sub)}`, type: '法条', title: `《${law.title.replace(/^中华人民共和国/, '')}》${article.label}`, meta: `${law.status} · ${law.effectiveDate} 施行`, to: `/laws/${lawId}?art=${artParam(no, art.sub)}` })
    setFavState(now)
    toast(now ? '已收藏（仅存本机）' : '已取消收藏', 'ok')
  }
  const sheetActions: SheetAction[] = [
    { label: '复制原文', icon: 'copy', onClick: () => copy(`${law.title} ${article.label}：${article.text}`, '已复制法条原文') },
    { label: '复制规范引用（含官方来源）', icon: 'quote', onClick: () => copy(`《${law.title.replace(/^中华人民共和国/, '')}》${article.label}（${law.status}，${law.effectiveDate} 施行）来源：${law.sourceUrl}`, '已复制规范引用（含官方来源）') },
    { label: '打印（仅条文与引用）', icon: 'docpen', onClick: () => window.print() },
    { label: favState ? '取消收藏' : '收藏（仅存本机）', icon: 'star', onClick: favNow },
    ...(audience !== 'public' ? [{ label: '基于本条研究', icon: 'sparkle' as const, onClick: () => nav(researchTo) }] : []),
  ]

  return (
    <div className="page">
      <PageHeader
        back={<Link to="/laws" className="tiny row" style={{ gap: 4 }}><Icon name="arrowL" size={13} />法规条文</Link>}
        title={<>《{lawDisplayTitle(law.title, law.status).replace(/^中华人民共和国/, '')}》{article.label}</>}
        sub={article.chapter}
        actions={
          isNarrow ? (
            <>
              <ValidityBadge v={law.status} />
              <SourceBadge kind="law" grade={lawEvidenceGrade(law.sourceUrl)} />
              <button className="btn btn-ghost btn-sm" aria-label="更多法条操作" onClick={() => setSheetOpen(true)}><Icon name="dots" size={14} />更多</button>
              <ActionSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={`${lawDisplayTitle(law.title, law.status).replace(/^中华人民共和国/, '')} ${article.label}`} actions={sheetActions} />
            </>
          ) : (
            <>
              <ValidityBadge v={law.status} />
              <SourceBadge kind="law" grade={lawEvidenceGrade(law.sourceUrl)} />
              <button className="btn btn-ghost btn-sm" onClick={() => copy(`${law.title} ${article.label}：${article.text}`, '已复制法条原文')}><Icon name="copy" size={13} />复制原文</button>
              <button className="btn btn-ghost btn-sm" onClick={() => copy(`《${law.title.replace(/^中华人民共和国/, '')}》${article.label}（${law.status}，${law.effectiveDate} 施行）来源：${law.sourceUrl}`, '已复制规范引用（含官方来源）')}><Icon name="quote" size={13} />复制规范引用</button>
              <button className="btn btn-ghost btn-sm" onClick={() => window.print()} title="打印法条（自动隐藏导航，仅保留条文与引用）"><Icon name="docpen" size={13} />打印</button>
              <button className="btn btn-secondary btn-sm" onClick={favNow}><Icon name="star" size={13} />{favState ? '已收藏' : '收藏'}</button>
              {audience !== 'public' && <Link to={researchTo} className="btn btn-primary btn-sm"><Icon name="sparkle" size={13} />基于本条研究</Link>}
            </>
          )
        }
      />

      <div className="cols cols-2r">
        {/* 官方原文 */}
        <div style={{ minWidth: 0 }}>
          <OfficialArticle law={law} article={article} />
          <XRefBlock lawId={lawId} articleKey={artParam(no, art.sub) ?? ''} />

          {/* 章内导航 */}
          <div className="card mt-16" style={{ padding: '12px 18px' }}>
            <div className="tiny bold mb-8">同章条文（{sibling.length}）</div>
            <div className="chips">
              {sibling.map((a) => (
                <button key={artParam(a.no, a.sub)} className={'chip' + (a.no === no && (a.sub ?? '') === (art.sub ?? '') ? ' is-on' : '')} onClick={() => setSp({ art: artParam(a.no, a.sub) })}>
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          {/* 底部 Tabs（§9） */}
          <div className="card mt-16">
            <div style={{ padding: '0 16px' }}>
              <Tabs tabs={TABS} active={tab} onChange={setTab} />
            </div>
            <div className="card-b">
              {tab === 'rel-case' && (
                articleCitedCases.length > 0 ? (
                  <div>
                    <div className="tiny mb-8">以下已核实案例的依据条文中<b>精确引用</b>了{article.label}（含子条号匹配；邻近/相似不冒充引用）。</div>
                    {articleCitedCases.map((c) => (
                      <Link key={c.id} to={`/cases/${c.id}`} className="lrow">
                        <span className={'bdg ' + (c.kind === 'foreign' ? 'bdg-gray' : 'bdg-teal')}>{c.level}</span>
                        <span className="lrow-t">{c.name}</span>
                        <span className="tiny">{c.case_no}{c.date ? ` · ${c.date}` : ''}</span>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="tiny">当前已核实案例清单中没有精确引用本条的记录（只认依据条文精确匹配，不做邻近猜测）。</div>
                )
              )}
              {tab === 'rel-js' && (
                articleLinks.length ? (
                  <div style={{ display: 'grid', gap: 12 }}>
                    {articleLinks.map((l) => (
                      <div key={`${l.law_id}-${l.no}`} className="card" style={{ padding: 14 }}>
                        <div className="row mb-8" style={{ gap: 6 }}>
                          <span className="bdg bdg-teal">官方解读</span>
                          <Link to={`/laws/${l.law_id}?art=${l.no}`} className="tiny bold" style={{ color: 'var(--accent-text)' }}>
                            {l.note ? `${l.note}` : `${l.law_id} 第${l.no}条`}
                          </Link>
                        </div>
                        <div style={{ fontSize: 12.5, lineHeight: 1.9, color: 'var(--tx)' }}>{l.text}</div>
                        <div className="tiny mt-8" style={{ color: 'var(--tx-3)' }}>来源：{l.ref_title} {l.label}（{l.ref_status}）· 司法解释 · 官方发布文本</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="tiny">当前本地司法解释证据快照中没有检出直接关联本条的条文。</div>
                )
              )}
              {tab === 'cite' && (
                cited && cited.case_count > 0 ? (
                  <div style={{ display: 'grid', gap: 12 }}>
                    <div className="stats">
                      <div className="stat"><b>{cited.case_count}</b><span>被引案例（精确引用）</span></div>
                      <div className="stat"><b>{cited.by_level['指导性案例'] ?? 0}</b><span>指导性案例（应当参照）</span></div>
                      <div className="stat"><b>{cited.by_level['外国判例'] ?? 0}</b><span>域外判例（比较研究）</span></div>
                    </div>
                    <div>
                      <div className="tiny bold mb-8">本法被引用最多的条文（点击跳转该条，其被引案例见「关联案例」）</div>
                      <div className="chips">
                        {cited.articles.slice(0, 10).map((a) => (
                          <button key={`${a.no}-${a.sub ?? ''}`} className="chip" onClick={() => setSp({ art: artParam(a.no, a.sub ?? undefined) })}>
                            第{a.no}{a.sub ?? ''}条 · {a.case_count} 件
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="banner banner-info"><Icon name="info" size={15} /><span className="banner-tx">{cited.scope_note}</span></div>
                    <div className="banner banner-warn"><Icon name="alert" size={15} /><span className="banner-tx">{cited.negative_history_note}</span></div>
                  </div>
                ) : (
                  <div className="citations">
                    <CitationChip label={`${law.title} ${article.label}`} />
                    <span className="tiny">当前已核实案例清单中没有引用本法的记录。引用关系只认精确匹配，不做图谱推断。</span>
                  </div>
                )
              )}
              {tab === 'revision' && (
                <div className="banner banner-info"><Icon name="info" size={15} />
                  <span className="banner-tx">当前展示<b>现行有效版本</b>（施行 {law.effectiveDate}）。该法的版本沿革证据登记在「版本对比」Tab（版本注册表，快照自证）；本页不作注册表之外的历史版本推断。</span>
                </div>
              )}
              {tab === 'related' && (
                <div>
                  <div className="chips mb-12">
                    {sibling.slice(0, 8).map((a) => (
                      <button key={artParam(a.no, a.sub)} className="chip" onClick={() => setSp({ art: artParam(a.no, a.sub) })}>{a.label}</button>
                    ))}
                  </div>
                  {relatedTerms.length > 0 && (
                    <div className="mt-12">
                      <div className="tiny bold mb-8">相关术语卡（{relatedTerms.length}）</div>
                      <div className="chips">
                        {relatedTerms.map((t) => (
                          <Link key={t.term} to="/terms" className="chip">{t.term}</Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {tab === 'version' && (
                <div>
                  {versions && versions.versions.length > 1 ? (
                    <>
                      <div className="tiny mb-12">统一立法事件时间线（R392）：版本（改后结果）与修正决定（改了什么）按日期同轴倒序排列——蓝标=版本、青标=决定；已采集全文的历史版本/决定可展开对照（非现行文本，不进检索语料）；跨版本对比仍禁用以避免误引。</div>
                      <div className="card mb-12" style={{ padding: 14 }}>
                        <div className="tiny bold mb-8">历史版本全文检索（非现行文本，仅供对照）</div>
                        <div className="row row-wrap">
                          <input
                            className="inp"
                            style={{ maxWidth: 300 }}
                            aria-label="历史版本全文检索词"
                            placeholder="如：网络安全等级保护"
                            value={histQ}
                            onChange={(e) => setHistQ(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') runHistSearch() }}
                          />
                          <button className="btn btn-secondary btn-sm" onClick={runHistSearch} disabled={histBusy}>
                            {histBusy ? '检索中…' : '检索本法历史文本'}
                          </button>
                        </div>
                        {histError && <div className="tiny mt-8" style={{ color: 'var(--danger)' }}>{histError}</div>}
                        {histHits && (
                          <div className="mt-12">
                            <div className="tiny muted mb-8">索引：{histHits.index_articles.toLocaleString()} 条 / {histHits.index_versions} 个历史版本 · {histHits.scope_note}</div>
                            {histHits.hits.length === 0 ? (
                              <div className="tiny">本法历史版本中未检出该词。</div>
                            ) : (
                              <div className="list-divided">
                                {histHits.hits.map((h) => (
                                  <div key={`${h.version_id}-${h.no}-${h.sub ?? ''}`} className="lrow" style={{ alignItems: 'flex-start' }}>
                                    <span className="bdg bdg-gray">{h.version_label}</span>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <b style={{ fontSize: 12.5 }}>{h.label}</b>
                                      <div className="tiny" style={{ lineHeight: 1.8 }}>{h.text.slice(0, 120)}{h.text.length > 120 ? '…' : ''}</div>
                                    </div>
                                    <span className="tiny">{h.effective_date} 施行</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="list-divided mb-12">
                        {/* R392：统一立法事件时间线——版本（改后结果）与修正决定（改了什么）按日期同轴，
                            读者看一条时间线即知「何时发生了什么」，不必在两个区块间来回拼合 */}
                        {(() => {
                          const events: { date: string; kind: 'version' | 'decree'; node: React.ReactNode; key: string }[] = []
                          for (const v of versions.versions) {
                            events.push({ date: v.promulgation_date, kind: 'version', key: 'v-' + v.version_id, node: (
                              <div className="list-row" style={{ alignItems: 'flex-start' }}>
                                <div style={{ minWidth: 0, flex: 1 }}>
                                  <div className="bold" style={{ fontSize: 13 }}>
                                    <span className="bdg bdg-blue" style={{ marginRight: 8 }}>版本</span>
                                    {v.label}
                                    {v.current && <span className="bdg bdg-green" style={{ marginLeft: 8 }}>现行有效</span>}
                                    {!v.current && <span className="bdg bdg-gray" style={{ marginLeft: 8 }}>历史版本</span>}
                                  </div>
                                  <div className="tiny mt-8">
                                    {v.promulgation_date} {v.promulgation_organ || ''}通过/修正
                                    {v.promulgation_instrument ? ` · ${v.promulgation_instrument}` : ''}
                                    {' · '}{v.effective_date} 施行
                                    {v.article_count != null && ` · ${v.article_count} 条`}
                                    {renumber && (() => {
                                      const pair = renumber.pairs.find((p) => p.to_version === v.version_id)
                                      if (!pair) return null
                                      const changed = pair.matches.filter((m) => m.text_changed).length
                                      const added = pair.unmatched_to.length
                                      const removed = pair.unmatched_from.length
                                      const parts = [
                                        changed > 0 && `修改 ${changed} 条`,
                                        added > 0 && `新增 ${added} 条`,
                                        removed > 0 && `废止 ${removed} 条`,
                                      ].filter(Boolean)
                                      return parts.length > 0 && <span> · 较上一版：{parts.join('、')}</span>
                                    })()}
                              </div>
                              {v.has_fulltext && (
                                <button className="btn btn-secondary btn-sm mt-8" onClick={() => setFtVid(ftVid === v.version_id ? null : v.version_id)}>
                                  {ftVid === v.version_id ? '收起该版全文' : '查看该版全文（对照）'}
                                </button>
                              )}
                              {ftVid === v.version_id && (
                                fulltext ? (
                                  <div className="card mt-8" style={{ padding: 14 }}>
                                    <div className="banner banner-warn mb-12"><Icon name="alert" size={15} /><span className="banner-tx">{fulltext.scope_note}</span></div>
                                    <div className="tiny mb-8">{fulltext.label} · {fulltext.promulgation_date} 通过 · {fulltext.effective_date} 施行 · {fulltext.article_count} 条 · 证据等级【{fulltext.source.grade}】· 查阅于 {fulltext.source.accessed_at} · <a href={fulltext.source.url} target="_blank" rel="noreferrer">来源页</a></div>
                                    {fulltext.articles.map((a) => (
                                      <div key={`${a.no}-${a.sub ?? ''}`} className="ot mb-8">
                                        <div className="ot-h"><b>{a.label}</b>{a.chapter && <span className="ot-tag">{a.chapter}</span>}</div>
                                        <div style={{ fontSize: 12.5, lineHeight: 1.9 }}>{a.text}</div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="tiny muted mt-8">历史全文加载中…（若长期为空说明该版本全文暂不可用）</div>
                                )
                              )}
                            </div>
                          </div>
                            ) })
                          }                          for (const a of versions.amendments ?? []) {
                            events.push({ date: a.passed_date, kind: 'decree', key: 'a-' + a.no, node: (
                              <div className="lrow" style={{ alignItems: 'flex-start', flexDirection: 'column' }}>
                                <div className="row" style={{ alignSelf: 'stretch', alignItems: 'flex-start' }}>
                                  <span className="bdg bdg-teal">决定</span>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <b style={{ fontSize: 12.5 }}>第{a.no}次修正 · {a.title}</b>
                                    <div className="tiny" style={{ lineHeight: 1.8 }}>
                                      {a.passed_date} 通过 · {a.effective} 施行
                                      {a.evidence?.grade && ` · 证据等级【${a.evidence.grade}】`}
                                      {a.note && ` · ${a.note.length > 90 ? a.note.slice(0, 90) + '…' : a.note}`}
                                    </div>
                                  </div>
                                  <div className="row" style={{ gap: 6, flexShrink: 0 }}>
                                    {a.evidence?.snapshot && (
                                      <button className="btn btn-ghost btn-sm" onClick={() => setAmNo(amNo === a.no ? null : a.no)}>
                                        {amNo === a.no ? '收起决定全文' : '决定全文'}
                                      </button>
                                    )}
                                    {a.evidence?.url && <a className="tiny" href={a.evidence.url} target="_blank" rel="noreferrer">原文</a>}
                                  </div>
                                </div>
                                {amNo === a.no && (
                                  amText ? (
                                    <div className="card mt-8" style={{ alignSelf: 'stretch', padding: 14 }}>
                                      <div className="tiny mb-8">{amText.title} · {amText.passed_date} 通过 · {amText.effective} 施行 · 快照 {amText.source.snapshot}（{amText.source.grade ? `等级【${amText.source.grade}】` : ''}查阅于 {amText.source.accessed_at}）</div>
                                      <div className="banner banner-warn mb-12"><Icon name="alert" size={15} /><span className="banner-tx">{amText.scope_note}</span></div>
                                      <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 12.5, lineHeight: 2, margin: 0, color: 'var(--tx)' }}>{amText.text}</pre>
                                    </div>
                                  ) : (
                                    <div className="tiny muted mt-8">决定全文加载中…（若长期为空说明该决定快照暂不可用）</div>
                                  )
                                )}
                              </div>
                            ) })
                          }
                          events.sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : 0))
                          return events.map((e) => <div key={e.key}>{e.node}</div>)
                        })()}
                      </div>
                      {versions.pending_note && <div className="tiny muted">{versions.pending_note}</div>}
                      {/* R410：多版本法同样可能有前身关系（食品卫生法→食品安全法/治安条例→治安法）——
                          时间线讲「同法沿革」，前身区块讲「本法取代了谁」，两层证据并列 */}
                      {versions.note?.includes('前身关系定案') && <PredSection lawId={lawId ?? ''} />}
                      {versions.predecessors && versions.predecessors.length > 0 && (
                        <MultiPredSection lawId={lawId ?? ''} preds={versions.predecessors} relation={versions.predecessors_relation || ''} />
                      )}
                    </>
                  ) : (
                    <>
                      <div className="row mb-12">
                        <select className="sel" style={{ width: 220 }} disabled><option>当前有效版本（{law.effectiveDate} 施行）</option></select>
                        <Icon name="compare" size={14} className="muted" />
                        <select className="sel" style={{ width: 220 }} disabled>{versions ? <option>暂无已采集历史版本</option> : <option>版本信息加载中…</option>}</select>
                        <button className="btn btn-primary btn-sm" disabled>对比</button>
                      </div>
                      <div className="banner banner-info"><Icon name="info" size={15} /><span className="banner-tx">{versions ? '该法版本注册表仅登记现行有效版本，尚无已采集的历史版本全文（历史版本按证据快照管线滚动采集入册）。' : '版本注册表信息暂不可用。'}引用不变量：法条引用必须附版本/生效/效力字段；本页禁用跨版本对比以避免误引。</span></div>
                      {/* R387：单版本法的定性说明消费——终态（从未修正）/前身（新法取代）/待采，登记册定性直达读者 */}
                      {versions?.note && <div className="tiny mt-8" style={{ lineHeight: 1.9, color: 'var(--tx-2)' }}>{versions.note.replace(/\s*R\d+ /g, ' ').trim()}</div>}
                      {/* R390：前身法全文展开（仅更名边界法有——医师法/学位法等明文废止的前法） */}
                      {versions?.note?.includes('前身关系定案') && (
                        <PredSection lawId={lawId ?? ''} />
                      )}
                      {/* R412：多前身并列（民法典九法形态）——单前身后、chips 选择逐部查阅 */}
                      {versions?.predecessors && versions.predecessors.length > 0 && (
                        <MultiPredSection lawId={lawId ?? ''} preds={versions.predecessors} relation={versions.predecessors_relation || ''} />
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 右：人工通俗解读（已审核才显示）+ AI 通用指引（永不与原文混排）——决策项4 双轨 */}
        <aside style={{ minWidth: 0 }}>
          <section className="card mb-16" style={{ padding: 16 }} aria-labelledby="evidence-analysis-title">
            <div className="row mb-8" style={{ gap: 8, alignItems: 'center' }}>
              <span id="evidence-analysis-title" className="tiny bold">综合解读证据</span>
              {analysisContext && <span className="bdg bdg-teal">{analysisContext.evidence_coverage.score}/100 证据覆盖</span>}
            </div>
            {analysisContextError && <div className="banner banner-warn"><Icon name="alert" size={14} /><span className="banner-tx">专业解读证据暂时无法加载。请仅依据左侧官方原文，并另行咨询专业人士。</span></div>}
            {!analysisContext && !analysisContextError && <SkeletonLines n={3} />}
            {analysisContext && (
              <>
                <div className="banner banner-info mb-12"><Icon name="info" size={14} /><span className="banner-tx">
                  <b>这不是正确率。</b>{analysisContext.evidence_coverage.method}
                </span></div>
                <div className="tiny mb-12" style={{ lineHeight: 1.8 }}>
                  <b>校准正确率：暂无。</b>{analysisContext.calibrated_accuracy.reason}
                </div>
                {analysisContext.professional_commentaries.length > 0 ? (
                  <div style={{ display: 'grid', gap: 10 }}>
                    {analysisContext.professional_commentaries.map((item) => (
                      <article key={item.id} className="card" style={{ padding: 12 }}>
                        <div className="row mb-8" style={{ gap: 6 }}>
                          <span className="bdg bdg-gray">专业观点摘要</span>
                          <span className="bdg bdg-teal">证据【{item.evidence_grade}】</span>
                        </div>
                        <div className="tiny bold mb-8">{item.title}</div>
                        <p className="tiny" style={{ lineHeight: 1.85, margin: 0 }}>{item.summary}</p>
                        <div className="tiny mt-8" style={{ color: 'var(--tx-3)' }}>
                          {item.authors.map((a) => `${a.name}（${a.credential}）`).join('；')} · {item.published_at}
                        </div>
                        <div className="tiny mt-8" style={{ lineHeight: 1.7 }}><b>适用边界：</b>{item.scope_note}</div>
                        <a className="tiny mt-8" style={{ display: 'inline-flex', color: 'var(--accent-text)' }} href={item.source_url} target="_blank" rel="noreferrer">
                          打开来源全文与资质出处（{item.institution}；{item.accessed_at} 查阅）
                        </a>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="tiny">当前登记册没有与本条直接绑定的具名专业解读；系统不会用 AI 补写或冒充专家观点。</div>
                )}
                {analysisContext.evidence_coverage.missing.length > 0 && (
                  <div className="tiny mt-12"><b>当前证据缺口：</b>{analysisContext.evidence_coverage.missing.join('；')}。</div>
                )}
                <div className="banner banner-warn mt-12"><Icon name="alert" size={14} /><span className="banner-tx">{analysisContext.disclaimer}</span></div>
              </>
            )}
          </section>
          {explain && (
            <div className="card mb-16" style={{ padding: 16 }}>
              <div className="row mb-8" style={{ gap: 8 }}>
                <span className="tiny bold">人工通俗解读</span>
                <span className="bdg bdg-green"><span className="dot" />已审核</span>
                <AIContentBadge draftedBy={explain.drafted_by} />
              </div>
              <div style={{ fontSize: 13.5, lineHeight: 1.9 }}>{explain.text}</div>
              {explain.drafted_by === 'ai' && <AIWarning compact />}
              <div className="tiny mt-8">编写：{explain.author} · 内容发布审核：{explain.reviewer}{explain.date ? ` · ${explain.date}` : ''}（审计署名，不代表执业资格核验）</div>
              {explain.source_note && <div className="tiny mt-8" style={{ color: 'var(--tx-3)' }}>{explain.source_note}</div>}
              <div className="tiny mt-8"><Icon name="info" size={12} /> 解读不替代法条原文，不构成法律意见。</div>
            </div>
          )}
          <section className="card" style={{ padding: 16 }}>
            <div className="tiny bold mb-8">通用阅读方法（项目整理，非逐条解读）</div>
            <p className="tiny" style={{ lineHeight: 1.9 }}>本条位于「{(article.chapter ?? '').split('>').slice(-1)[0]?.trim() || '（无章）'}」。具体含义请先以左侧证据快照文本为线索，并在正式使用前核对官方现行文本；上方专业观点仅在登记册有可回溯来源时展示。</p>
            <ul className="tiny" style={{ lineHeight: 1.9 }}>
              <li>先区分行为规范：条文要求、禁止或允许什么。</li>
              <li>再核对适用条件、例外与法律后果，并结合具体事实和证据。</li>
            </ul>
          </section>

          <div className="card mt-16" style={{ padding: 16 }}>
            <div className="tiny bold mb-8">本法分编（{chapters.length}）</div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {chapters.map((ch) => {
                const first = law.articles.find((a) => (a.chapter ?? '').split('>')[0]?.trim() === ch)
                return first
                  ? <Link key={ch} className="ol-item" to={`/laws/${law.id}?art=${first.no}`} title={`跳到 ${ch} 第一条`}>{ch}</Link>
                  : <span key={ch} className="ol-item">{ch}</span>
              })}
            </div>
          </div>
        </aside>
      </div>

      {/* 普法温度提示 */}
      <div className="banner-warm mt-16">
        <Icon name="bulb" size={15} />
        <span className="banner-tx">
          {WARM_TIPS.aid}
          {' '}<a href={WARM_TIPS.aidSourceUrl} target="_blank" rel="noreferrer">司法部来源</a>（{WARM_TIPS.aidSourceCheckedAt} 查阅；【{WARM_TIPS.aidSourceGrade}】）。
          {' '}{WARM_TIPS.limit.text}
          <CitationChip label="《民法典》第188条" to="/laws/civl-2020?art=188" />
        </span>
      </div>
    </div>
  )
}
