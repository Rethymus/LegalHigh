// 应用外壳：深海军蓝玻璃侧栏 + Glass 导航条 + 按 Tone 着色的内容区
// 侧栏 240px 可折叠至 72px；正文区域不使用整页 Glass（材质使用原则 §34）
import { Suspense, useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { Icon, type IconName } from './icons'
import { BRAND, NAV_MAIN, NAV_SUB, useLaws } from '../data/model'
import { SkeletonLines, useToast } from './ui'

/* 路由 → 面包屑 + 明暗基调 */
const ROUTE_META: { re: RegExp; crumb: string[]; tone: 'light' | 'dark' }[] = [
  { re: /^\/$/, crumb: ['首页'], tone: 'dark' },
  { re: /^\/needs/, crumb: ['首页', '需求解析'], tone: 'dark' },
  { re: /^\/search\/results/, crumb: ['法律检索', '检索结果'], tone: 'light' },
  { re: /^\/search/, crumb: ['法律检索'], tone: 'light' },
  { re: /^\/laws\/[^/]+$/, crumb: ['法规条文', '法条详情'], tone: 'light' },
  { re: /^\/laws/, crumb: ['法规条文'], tone: 'light' },
  { re: /^\/cases\/[^/]+$/, crumb: ['案例检索', '案件详情'], tone: 'dark' },
  { re: /^\/cases/, crumb: ['案例检索'], tone: 'light' },
  { re: /^\/research\/[^/]+\/evidence$/, crumb: ['AI 研究', '证据链核查'], tone: 'light' },
  { re: /^\/research/, crumb: ['AI 研究', '研究工作台'], tone: 'light' },
  { re: /^\/contracts\/[^/]+$/, crumb: ['合同审查', '审查工作台'], tone: 'light' },
  { re: /^\/contracts/, crumb: ['合同审查', '合同库'], tone: 'light' },
  { re: /^\/compare/, crumb: ['合同审查', '版本对比'], tone: 'light' },
  { re: /^\/draft\/validation$/, crumb: ['文书工具', '交付前校验'], tone: 'light' },
  { re: /^\/draft/, crumb: ['文书工具', '文书起草'], tone: 'light' },
  { re: /^\/comparative/, crumb: ['跨法域对比'], tone: 'light' },
  { re: /^\/learning/, crumb: ['学习中心'], tone: 'light' },
  { re: /^\/workspace\/matters\/[^/]+$/, crumb: ['律师工作台', '案件详情'], tone: 'light' },
  { re: /^\/workspace/, crumb: ['律师工作台'], tone: 'light' },
  { re: /^\/collections/, crumb: ['我的收藏'], tone: 'light' },
  { re: /^\/data-sources/, crumb: ['数据洞察', '数据源状态'], tone: 'light' },
  { re: /^\/audit/, crumb: ['历史记录', '操作审计'], tone: 'light' },
  { re: /^\/settings/, crumb: ['设置'], tone: 'light' },
  { re: /^\/design-system/, crumb: ['内部', '设计系统'], tone: 'dark' },
]

type ToneOverride = 'auto' | 'light' | 'dark'
function readOverride(): ToneOverride {
  const v = localStorage.getItem('le-tone-override')
  return v === 'light' || v === 'dark' ? v : 'auto'
}
function readReduceMotion(): boolean {
  return localStorage.getItem('le-reduce-motion') === '1'
}

export default function AppShell() {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('le-sb-collapsed') === '1')
  const [override, setOverride] = useState<ToneOverride>(readOverride)
  const { pathname } = useLocation()
  const toast = useToast()
  const { data: corpus } = useLaws()
  // 窄屏（<768px）：侧栏转抽屉（C4 基线；完整 v3 形态待移植，见查漏补缺计划）
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 767.98px)').matches)
  const [mobileOpen, setMobileOpen] = useState(false)
  const corpusArts = corpus ? corpus.laws.reduce((s, l) => s + l.articles.length, 0) : 0

  const meta = ROUTE_META.find((m) => m.re.test(pathname)) ?? { crumb: ['首页'], tone: 'light' as const }
  const tone = override === 'auto' ? meta.tone : override

  useEffect(() => {
    localStorage.setItem('le-sb-collapsed', collapsed ? '1' : '0')
  }, [collapsed])
  useEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', readReduceMotion())
    document.documentElement.classList.toggle('font-large', localStorage.getItem('le-font-large') === '1')
    const sync = () => setOverride(readOverride())
    window.addEventListener('le-tone-changed', sync)
    const mq = window.matchMedia('(max-width: 767.98px)')
    const onMq = (e: MediaQueryListEvent) => { setNarrow(e.matches); if (!e.matches) setMobileOpen(false) }
    mq.addEventListener('change', onMq)
    return () => { window.removeEventListener('le-tone-changed', sync); mq.removeEventListener('change', onMq) }
  }, [])
  // 路由变化即收起抽屉（顶栏/页内链接导航同样生效）
  useEffect(() => { setMobileOpen(false) }, [pathname])

  // 本机浏览史（真实记录，供 /audit「浏览历史」Tab 渲染；不上传）
  useEffect(() => {
    try {
      const title = meta.crumb.join(' / ')
      const list = JSON.parse(localStorage.getItem('lh:browse-history') ?? '[]') as { p: string; t: string; ts: number }[]
      const next = [{ p: pathname, t: title, ts: Date.now() }, ...list.filter((x) => x.p !== pathname)].slice(0, 50)
      localStorage.setItem('lh:browse-history', JSON.stringify(next))
    } catch { /* 本机存储不可用时静默 */ }
  }, [pathname, meta.crumb])

  const renderItem = (it: { to: string; icon: IconName; label: string }) => (
    <NavLink
      key={it.to}
      to={it.to}
      end={it.to === '/'}
      onClick={() => { if (narrow) setMobileOpen(false) }}
      className={({ isActive }) => 'sb-item' + (isActive ? ' is-active' : '')}
      title={it.label}
    >
      <Icon name={it.icon} size={15} />
      <span className="sb-label">{it.label}</span>
      <Icon name="chevR" size={11} className="sb-chev" />
    </NavLink>
  )

  return (
    <div className={'app' + (collapsed ? ' sb-collapsed' : '') + (narrow && mobileOpen ? ' sb-mobile-open' : '')}>
      {narrow && mobileOpen && <button className="sb-scrim" aria-label="关闭导航" onClick={() => setMobileOpen(false)} />}
      <aside className="sb" aria-hidden={narrow && !mobileOpen}>
        <Link to="/" className="sb-brand" title="LegalHigh">
          <span className="sb-logo"><Icon name="scale" size={18} strokeWidth={1.9} /></span>
          <div>
            <div className="sb-name">{BRAND.name}</div>
            <div className="sb-sub">{BRAND.sub}</div>
          </div>
        </Link>
        <nav className="sb-nav">
          {NAV_MAIN.map(renderItem)}
          <div className="sb-gap" role="separator" />
          {NAV_SUB.map(renderItem)}
        </nav>
        <div className="sb-user">
          <Link to="/settings" className="sb-usercard" title="账号设置">
            <span className="avatar av-sb">A</span>
            <div className="sb-uinfo">
              <div className="sb-uname">{BRAND.user}</div>
              <div className="sb-urole">{BRAND.role}</div>
            </div>
          </Link>
          <div className="sb-plan">
            <div className="sb-plan-top"><span>证据语料入库</span><span>{corpus ? `${corpus.laws.length} 部` : '…'}</span></div>
            <div className="sb-bar"><i style={{ width: corpus ? '100%' : '0%' }} /></div>
            <div className="sb-plan-top" style={{ marginTop: 5 }}>
              <span>{corpusArts ? `${corpusArts.toLocaleString()} 条条文` : ''}</span>
              <span>flk 抽查比对 · M6</span>
            </div>
          </div>
        </div>
      </aside>

      <div className={'main ' + (tone === 'dark' ? 'tone-dark' : 'tone-light')}>
        <header className="tb">
          <button
            className="tb-icon"
            onClick={() => { if (narrow) { setMobileOpen((o) => !o) } else { setCollapsed((c) => !c) } }}
            title={narrow ? (mobileOpen ? '关闭导航' : '打开导航') : collapsed ? '展开侧栏' : '折叠侧栏'}
            aria-label={narrow ? '切换导航' : '折叠侧栏'}
          >
            <Icon name="menu" size={16} />
          </button>
          <div className="tb-crumb">
            {meta.crumb.map((c, i) => (
              <span key={c} className="row" style={{ gap: 7 }}>
                {i > 0 && <span className="sep">/</span>}
                <span style={i === meta.crumb.length - 1 ? { color: 'var(--tx)', fontWeight: 600 } : undefined}>{c}</span>
              </span>
            ))}
          </div>
          <div className="tb-spacer" />
          <button className="tb-icon" onClick={() => setOverride((o) => (o === 'dark' ? 'light' : 'dark'))} title={tone === 'dark' ? '切换浅色外观' : '切换深色外观'}>
            <Icon name={tone === 'dark' ? 'sun' : 'moon'} size={15} />
          </button>
          <Link to="/search" className="tb-pill"><Icon name="search" size={13} />全局检索<span className="kbd">/</span></Link>
          <Link to="/research" className="tb-pill is-accent"><Icon name="sparkle" size={13} />AI 助手</Link>
          <button className="tb-icon" onClick={() => toast('通知中心为原型占位：3 条系统动态')} title="通知">
            <span className="row" style={{ position: 'relative' }}>
              <Icon name="bell" size={15} />
              <i style={{ position: 'absolute', top: -1, right: -1, width: 7, height: 7, borderRadius: 99, background: 'var(--danger)', border: '1.5px solid var(--bg)' }} />
            </span>
          </button>
          <Link to="/settings" className="tb-icon" title="账号与设置"><Icon name="user" size={15} /></Link>
        </header>

        <main className="content">
          <div key={pathname + tone}>
            <Suspense>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  )
}

export function PageFallback() {
  return (
    <div className="page">
      <div className="skl skl-l mb-16" style={{ width: 260 }} />
      <SkeletonLines n={6} tall />
    </div>
  )
}
