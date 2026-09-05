// FRAME 01 · Dashboard —— Dark / Hero Glass（规格 §6）
// 不出现：Persona、Roadmap、Design System、优先级等内部设计内容（§52）
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Icon, type IconName } from '../icons'
import { CORPUS_DYNAMICS, HOT_SEARCHES, WARM_TIPS, useLaws } from '../../data/model'
import { EmptyState, SkeletonLines, fmtTime } from '../ui'
import { CitationChip } from '../domain'
import { api, type CaseRecord } from '../../lib/api'

// 能力卡副文案中的语料规模为实时派生（useLaws），禁止回退为硬编码数字（曾因 8 部 1,953 条
// 语料扩张后文案未同步而失真——查漏补缺计划 P0-2，新增派生数据一律走此口径）。
const ACTIONS: { title: string; lines: [string | null, string]; tone: string; icon: IconName; to: string }[] = [
  { title: '法律检索', lines: [null, '条条文 · 支持逐条引用'], tone: 'ac-blue', icon: 'bigSearch', to: '/search' },
  { title: '案例检索', lines: ['逐件核实的指导案例与公开判例', '关键词检索 · 争议焦点定位'], tone: 'ac-green', icon: 'gavel', to: '/cases' },
  { title: '合同审查', lines: ['风险条款检测与建议文本', '审查留痕 · 版本对比'], tone: 'ac-purple', icon: 'docShield', to: '/contracts' },
  { title: '专业文书工具', lines: ['律师函、合同与诉讼文书模板', '程序校验 · 使用者复核定稿'], tone: 'ac-orange', icon: 'docpen', to: '/draft' },
]

interface ReviewSummary {
  id: string
  created_at: string
  title: string
  high: number
  medium: number
  low: number
  findings: number
}

interface LocalResearchItem { rid: string; question: string; ts: string }
function loadResearchList(): LocalResearchItem[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem('lh:research:list') ?? '[]')
    if (!Array.isArray(raw)) return []
    return raw.filter((item): item is LocalResearchItem => !!item && typeof item === 'object'
      && typeof (item as LocalResearchItem).rid === 'string'
      && typeof (item as LocalResearchItem).question === 'string'
      && typeof (item as LocalResearchItem).ts === 'string')
  } catch { return [] }
}

export default function Dashboard() {
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const { data: laws, error: lawsError } = useLaws()
  const lawCount = laws?.laws.length ?? 0
  const artCount = laws ? laws.laws.reduce((s, l) => s + l.articles.length, 0) : 0
  const [today, setToday] = useState<CaseRecord | null>(null)
  const [caseCount, setCaseCount] = useState<number | null>(null)
  const [caseLoading, setCaseLoading] = useState(true)
  const [caseError, setCaseError] = useState<string | null>(null)
  const [reviews, setReviews] = useState<ReviewSummary[]>([])
  const [reviewsLoading, setReviewsLoading] = useState(true)
  const [reviewsError, setReviewsError] = useState<string | null>(null)
  const [researchList] = useState<LocalResearchItem[]>(loadResearchList)
  const STATIC_PREVIEW = import.meta.env.VITE_STATIC_PREVIEW === '1'
  useEffect(() => {
    // 静态说明站（GitHub Pages）不部署后端：不发任何 /api 请求（发了也只是 404，
    // 且与「所有读写 API 均未部署」的站点横幅矛盾——R21 发现首页曾照常请求）。
    if (STATIC_PREVIEW) {
      setCaseLoading(false); setReviewsLoading(false)
      setCaseCount(null); setToday(null); setReviews([])
      return
    }
    let alive = true
    const casesRequest = api.listCases()
    const reviewsRequest = api.listReviews(2)
    void Promise.allSettled([casesRequest, reviewsRequest]).then(([caseResult, reviewResult]) => {
      if (!alive) return
      if (caseResult.status === 'fulfilled') {
        const verifiedCases = caseResult.value.cases.filter((item) => item.verified && !item.sample)
        setToday(verifiedCases[0] ?? null)
        setCaseCount(verifiedCases.length)
      } else {
        setCaseError(caseResult.reason instanceof Error ? caseResult.reason.message : String(caseResult.reason))
      }
      if (reviewResult.status === 'fulfilled') {
        setReviews(reviewResult.value.reviews)
      } else {
        setReviewsError(reviewResult.reason instanceof Error ? reviewResult.reason.message : String(reviewResult.reason))
      }
      setCaseLoading(false)
      setReviewsLoading(false)
    })
    return () => { alive = false }
  }, [])

  return (
    <div className="dash">
      {/* Hero */}
      <section className="dash-hero">
        <div className="dash-hero-inner">
          <div className="hero-badges">
            <Link to="/research" className="hero-badge is-accent"><Icon name="sparkle" size={13} />研究工作台</Link>
            <Link to="/learning" className="hero-badge"><Icon name="compass" size={13} />新手引导</Link>
          </div>
          <h1 className="hero-t">让法律更有温度，让正义触手可及</h1>
          <p className="hero-s">整合可信法律知识：可溯源的法条检索、规则化的合同审查与受控 AI 辅助研究，全程证据留痕</p>
          <form
            className="searchbar"
            onSubmit={(e) => { e.preventDefault(); if (q.trim()) nav(`/needs?q=${encodeURIComponent(q.trim())}`) }}
          >
            <Icon name="search" size={17} className="muted" />
            <input className="inp" placeholder="用大白话描述你的法律问题，如「公司三个月没发工资怎么办」……" value={q} onChange={(e) => setQ(e.target.value)} aria-label="需求解析" />
            <button className="btn btn-primary" style={{ borderRadius: 999 }}><Icon name="sparkle" size={14} />需求解析</button>
          </form>
          <div className="row mt-8" style={{ justifyContent: 'center' }}>
            <Link to="/search" className="hero-hot" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Icon name="search" size={12} />精确检索（按条文/案例关键词）
            </Link>
          </div>
          <div className="hero-hot">
            <span>推荐话题：</span>
            {HOT_SEARCHES.map((h) => (
              <button key={h} type="button" className="ht" onClick={() => nav(`/search/results?q=${encodeURIComponent(h)}`)}>{h}</button>
            ))}
            <Link to="/search" className="ht">查看更多</Link>
          </div>
        </div>
      </section>

      <div className="page" style={{ maxWidth: 1240 }}>
        {lawsError && <div className="banner banner-danger mb-12"><Icon name="alert" size={15} /><span className="banner-tx">本地法条语料加载失败：{lawsError}</span></div>}
        {/* 普法温度提示（公共法律常识 + 语料内条文引用） */}
        <div className="banner-warm mb-12">
          <Icon name="bulb" size={16} />
          <span className="banner-tx">
            {WARM_TIPS.aid}
            {' '}<a href={WARM_TIPS.aidSourceUrl} target="_blank" rel="noreferrer">司法部来源</a>（{WARM_TIPS.aidSourceCheckedAt} 查阅；【{WARM_TIPS.aidSourceGrade}】）。
            {' '}{WARM_TIPS.limit.text}
            <CitationChip label="《民法典》第188条" to="/laws/civl-2020?art=188" />
          </span>
        </div>

        {/* 四大能力入口 */}
        <div className="ac-grid">
          {ACTIONS.map((a) => (
            <Link key={a.title} to={a.to} className={'ac-card ' + a.tone}>
              <span className="ac-ic"><Icon name={a.icon} size={19} /></span>
              <div className="ac-t">{a.title}</div>
              <div className="ac-d">
                {a.lines[0] === null
                  ? <>本地语料 {lawCount || '…'} 部法律<br />{artCount ? artCount.toLocaleString() : '…'} {a.lines[1]}</>
                  : <>{a.lines[0]}<br />{a.lines[1]}</>}
              </div>
              <span className="ac-cta">进入 <Icon name="arrowR" size={12} /></span>
            </Link>
          ))}
        </div>

        {/* 三栏 */}
        <div className="tri-grid">
          <section className="card">
            <div className="card-h"><b className="card-h-t">案例库选读</b><span className="spacer" /><Link to="/cases" className="tiny row" style={{ gap: 3 }}>更多 <Icon name="chevR" size={11} /></Link></div>
            <div className="card-b">
              {caseLoading ? <SkeletonLines n={4} /> : caseError ? (
                <EmptyState icon="alert" title="案例服务暂不可用" desc={caseError} />
              ) : STATIC_PREVIEW ? (
                <EmptyState icon="search" title="静态说明站不含案例服务" desc="本页为 GitHub Pages 静态预览；案例检索在本地完整版或桌面版中可用。" />
              ) : !today ? (
                <EmptyState icon="caseSearch" title="暂无已核实案例" desc="案例服务当前没有返回可公开展示且已核实的记录。" />
              ) : (
                <>
                  <div className="row-wrap mb-8">
                    <span className="bdg bdg-teal">{today.level}</span>
                    <span className="bdg bdg-gray">{today.jurisdiction}</span>
                  </div>
                  <Link to={`/cases/${today.id}`} className="mini-t" style={{ display: 'block' }}>{today.name}</Link>
                  <div className="mini-m">{today.no} · {today.date}</div>
                  <p className="mini-d" style={{ marginTop: 6 }}>{today.summary}</p>
                  <Link to={`/cases/${today.id}`} className="btn btn-secondary btn-sm mt-12">查看详情 <Icon name="arrowR" size={12} /></Link>
                </>
              )}
            </div>
          </section>

          <section className="card">
            <div className="card-h"><b className="card-h-t">数据与语料动态</b><span className="spacer" /><Link to="/data-sources" className="tiny row" style={{ gap: 3 }}>数据源 <Icon name="chevR" size={11} /></Link></div>
            <div className="card-b" style={{ paddingTop: 6 }}>
              {CORPUS_DYNAMICS.map((n) => (
                <div key={n.t} className="mini-row">
                  <span className="mini-ic"><Icon name={n.icon} size={15} /></span>
                  <div>
                    <div className="mini-t">{n.t}</div>
                    <div className="mini-m">{n.m}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="card">
            <div className="card-h"><b className="card-h-t">跨法域对比</b><span className="spacer" /><Link to="/comparative" className="tiny row" style={{ gap: 3 }}>进入 <Icon name="chevR" size={11} /></Link></div>
            <div className="card-b">
              <div className="vs-box">
                <div className="vs-side">
                  <div className="vs-flag">🇨🇳</div>
                  <div className="tiny mt-8 bold">《民法典》第1165条</div>
                  <div className="tiny">过错责任原则</div>
                </div>
                <span className="vs-vs">VS</span>
                <div className="vs-side">
                  <div className="vs-flag">🇬🇧</div>
                  <div className="tiny mt-8 bold">Donoghue v Stevenson</div>
                  <div className="tiny">注意义务 · [1932] AC 562</div>
                </div>
              </div>
              <p className="tiny" style={{ lineHeight: 1.7 }}>对比要点：过错认定、注意义务的成立、损害赔偿范围。</p>
              <Link to="/comparative?topic=侵权" className="btn btn-ghost btn-sm mt-12">开始对比 <Icon name="arrowR" size={12} /></Link>
              <p className="tiny mt-12">域外资料仅作比较研究，不构成中国司法裁判依据。</p>
            </div>
          </section>
        </div>

        {/* 最近工作（克制的一行入口） */}
        <div className="sec mt-20">
          <div className="sec-h">
            <span className="sec-t">最近工作</span>
            <span className="spacer" />
            <Link to="/collections" className="tiny">我的收藏</Link>
          </div>
          <div className="tri-grid">
            <div className="card card-pad" style={{ paddingBlock: 14 }}>
              <div className="tiny bold mb-8">最近合同</div>
              {reviewsLoading && <SkeletonLines n={2} />}
              {!reviewsLoading && reviews.map((r) => (
                <Link key={r.id} to={`/contracts/${r.id}`} className="lrow">
                  <Icon name="docShield" size={15} className="muted" />
                  <span className="lrow-t">{r.title}</span>
                  <span className={r.high ? 'bdg bdg-red' : r.medium ? 'bdg bdg-orange' : 'bdg bdg-gray'}>{r.findings} 项</span>
                  <span className="tiny">{fmtTime(r.created_at, 'd')}</span>
                </Link>
              ))}
              {!reviewsLoading && STATIC_PREVIEW && <div className="tiny mb-8">静态说明站不含合同审查服务；完整版在本地运行后可在此看到本机审查记录。</div>}
              {!reviewsLoading && !STATIC_PREVIEW && reviewsError && <div className="tiny mb-8">审查服务不可用：{reviewsError}</div>}
              {!reviewsLoading && !reviewsError && reviews.length === 0 && <div className="tiny mb-8">尚无本机审查记录</div>}
              <Link to="/contracts/new" className="lrow"><Icon name="plus" size={14} className="muted" /><span className="lrow-t muted">开始合同审查</span></Link>
            </div>
            <div className="card card-pad" style={{ paddingBlock: 14 }}>
              <div className="tiny bold mb-8">最近研究</div>
              {(researchList.length ? researchList.slice(0, 2) : []).map((r) => (
                <Link key={r.rid} to={`/research/${r.rid}`} className="lrow">
                  <Icon name="sparkle" size={15} className="muted" />
                  <span className="lrow-t">{r.question}</span>
                  <span className="tiny">{r.ts.slice(5, 10)}</span>
                </Link>
              ))}
              {researchList.length === 0 && <div className="tiny mb-8">尚无研究记录（本机）</div>}
              <Link to="/research" className="lrow"><Icon name="plus" size={14} className="muted" /><span className="lrow-t muted">新建研究</span></Link>
            </div>
            <div className="card card-pad" style={{ paddingBlock: 14 }}>
              <div className="tiny bold mb-8">数据源状态</div>
              <Link to="/data-sources" className="lrow">
                <span className="bdg bdg-green"><span className="dot" />已接入</span>
                <span className="lrow-t">本地证据快照语料（{lawCount || '…'} 部 · {artCount ? artCount.toLocaleString() : '…'} 条）</span>
              </Link>
              <Link to="/data-sources" className="lrow">
                <span className="bdg bdg-teal">逐件核实</span>
                <span className="lrow-t">{caseCount === null ? '案例服务状态待读取' : `${caseCount} 件公开案例（均带直达来源）`}</span>
              </Link>
              <div className="tiny mt-8">查看数据源页可逐项打开来源，并核对尚未提供的覆盖范围。</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
