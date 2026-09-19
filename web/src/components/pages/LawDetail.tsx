// FRAME 04 · Law Detail —— 法条详情（规格 §9）
// 证据快照文本不可被 AI 改写；已审核解读与项目阅读方法必须明确分层。
import { useEffect, useMemo, useState } from 'react'
import { Link, useOutletContext, useParams, useSearchParams } from 'react-router-dom'
import { Icon } from '../icons'
import { WARM_TIPS, artParam, findArticle, findLaw, lawChapters, lawDisplayTitle, lawEvidenceGrade, parseArtParam, useLaws } from '../../data/model'
import { EmptyState, PageHeader, SkeletonLines, Tabs, useCopy, useToast, ValidityBadge } from '../ui'
import { AIContentBadge, AIWarning, CitationChip, OfficialArticle, SourceBadge } from '../domain'
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

export default function LawDetail() {
  const { audience } = useOutletContext<AppOutletContext>()
  const { lawId } = useParams()
  const [sp, setSp] = useSearchParams()
  const { data, error } = useLaws()
  const copy = useCopy()
  const toast = useToast()
  const [tab, setTab] = useState('rel-case')

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
  const art = parseArtParam(sp.get('art')) ?? { no: 496 }
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
  const sibling = useMemo(
    () => (law && article ? law.articles.filter((a) => a.chapter === article.chapter) : []),
    [law, article],
  )
  const [cited, setCited] = useState<Awaited<ReturnType<typeof api.citedBy>> | null>(null)
  const [ftVid, setFtVid] = useState<string | null>(null)
  const [fulltext, setFulltext] = useState<Awaited<ReturnType<typeof api.versionFulltext>> | null>(null)
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

  return (
    <div className="page">
      <PageHeader
        back={<Link to="/laws" className="tiny row" style={{ gap: 4 }}><Icon name="arrowL" size={13} />法规条文</Link>}
        title={<>《{lawDisplayTitle(law.title, law.status).replace(/^中华人民共和国/, '')}》{article.label}</>}
        sub={article.chapter}
        actions={
          <>
            <ValidityBadge v={law.status} />
            <SourceBadge kind="law" grade={lawEvidenceGrade(law.sourceUrl)} />
            <button className="btn btn-ghost btn-sm" onClick={() => copy(`${law.title} ${article.label}：${article.text}`, '已复制法条原文')}><Icon name="copy" size={13} />复制原文</button>
            <button className="btn btn-ghost btn-sm" onClick={() => copy(`《${law.title.replace(/^中华人民共和国/, '')}》${article.label}（${law.status}，${law.effectiveDate} 施行）来源：${law.sourceUrl}`, '已复制规范引用（含官方来源）')}><Icon name="quote" size={13} />复制规范引用</button>
            <button className="btn btn-secondary btn-sm" onClick={() => {
              const now = toggleFav({ key: `law:${lawId}#${artParam(no, art.sub)}`, type: '法条', title: `《${law.title.replace(/^中华人民共和国/, '')}》${article.label}`, meta: `${law.status} · ${law.effectiveDate} 施行`, to: `/laws/${lawId}?art=${artParam(no, art.sub)}` })
              setFavState(now)
              toast(now ? '已收藏（仅存本机）' : '已取消收藏', 'ok')
            }}><Icon name="star" size={13} />{favState ? '已收藏' : '收藏'}</button>
            {audience !== 'public' && <Link to={`/research?q=${encodeURIComponent(`《${law.title}》${article.label}的适用条件、例外与待确认事实`)}`} className="btn btn-primary btn-sm"><Icon name="sparkle" size={13} />基于本条研究</Link>}
          </>
        }
      />

      <div className="cols cols-2r">
        {/* 官方原文 */}
        <div style={{ minWidth: 0 }}>
          <OfficialArticle law={law} article={article} />

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
                      <div className="tiny mb-12">以下为版本注册表（server/data/law_versions，快照自证）登记的版本时间线；已采集全文的历史版本可展开对照查阅（非现行文本，不进检索语料）；跨版本对比仍禁用以避免误引。</div>
                      <div className="list-divided mb-12">
                        {[...versions.versions].reverse().map((v) => (
                          <div key={v.version_id} className="list-row" style={{ alignItems: 'flex-start' }}>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div className="bold" style={{ fontSize: 13 }}>
                                {v.label}
                                {v.current && <span className="bdg bdg-green" style={{ marginLeft: 8 }}>现行有效</span>}
                                {!v.current && <span className="bdg bdg-gray" style={{ marginLeft: 8 }}>历史版本</span>}
                              </div>
                              <div className="tiny mt-8">
                                {v.promulgation_date} {v.promulgation_organ || ''}通过/修正
                                {v.promulgation_instrument ? ` · ${v.promulgation_instrument}` : ''}
                                {' · '}{v.effective_date} 施行
                                {v.article_count != null && ` · ${v.article_count} 条`}
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
                        ))}
                      </div>
                      {versions.pending_note && <div className="tiny muted">{versions.pending_note}</div>}
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
            <p className="tiny" style={{ lineHeight: 1.9 }}>本条位于「{article.chapter.split('>').slice(-1)[0]?.trim()}」。具体含义请先以左侧证据快照文本为线索，并在正式使用前核对官方现行文本；上方专业观点仅在登记册有可回溯来源时展示。</p>
            <ul className="tiny" style={{ lineHeight: 1.9 }}>
              <li>先区分行为规范：条文要求、禁止或允许什么。</li>
              <li>再核对适用条件、例外与法律后果，并结合具体事实和证据。</li>
            </ul>
          </section>

          <div className="card mt-16" style={{ padding: 16 }}>
            <div className="tiny bold mb-8">本法分编（{chapters.length}）</div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {chapters.map((ch) => {
                const first = law.articles.find((a) => a.chapter.split('>')[0]?.trim() === ch)
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
