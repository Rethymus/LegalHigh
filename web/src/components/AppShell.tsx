// 应用外壳：深海军蓝玻璃侧栏 + Glass 导航条 + 按 Tone 着色的内容区
// 侧栏 240px 可折叠至 72px；正文区域不使用整页 Glass（材质使用原则 §34）
import { Suspense, useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Icon, type IconName } from './icons'
import { BRAND, NAV_MAIN, NAV_SUB } from '../data/model'
import { SkeletonLines } from './ui'
import { api } from '../lib/api'
import {
  AUDIENCE_OPTIONS,
  audienceLabel,
  canAudienceAccess,
  isKnownRoute,
  loadAudiencePreference,
  saveAudiencePreference,
  type AudienceMode,
} from '../lib/audience'

export interface AppOutletContext { audience: AudienceMode }

interface Inventory {
  laws: number
  articles: number
  verified_cases: number
  approved_explains: number
  fetched_at: string | null
}

/* 路由 → 面包屑 + 明暗基调 */
const ROUTE_META: { re: RegExp; crumb: string[]; tone: 'light' | 'dark' }[] = [
  { re: /^\/$/, crumb: ['首页'], tone: 'dark' },
  { re: /^\/needs/, crumb: ['首页', '事实与证据梳理'], tone: 'dark' },
  { re: /^\/search\/results/, crumb: ['法律检索', '检索结果'], tone: 'light' },
  { re: /^\/search/, crumb: ['法律检索'], tone: 'light' },
  { re: /^\/laws\/[^/]+$/, crumb: ['法规条文', '法条详情'], tone: 'light' },
  { re: /^\/laws/, crumb: ['法规条文'], tone: 'light' },
  { re: /^\/cases\/[^/]+$/, crumb: ['案例检索', '案件详情'], tone: 'dark' },
  { re: /^\/cases/, crumb: ['案例检索'], tone: 'light' },
  { re: /^\/research\/[^/]+\/evidence$/, crumb: ['来源研究', '证据链核查'], tone: 'light' },
  { re: /^\/research/, crumb: ['来源研究', '研究工作台'], tone: 'light' },
  { re: /^\/contracts\/[^/]+$/, crumb: ['合同审查', '审查工作台'], tone: 'light' },
  { re: /^\/contracts/, crumb: ['合同审查', '合同库'], tone: 'light' },
  { re: /^\/compare/, crumb: ['合同审查', '版本对比'], tone: 'light' },
  { re: /^\/draft\/validation$/, crumb: ['文书工具', '交付前校验'], tone: 'light' },
  { re: /^\/draft/, crumb: ['文书工具', '文书起草'], tone: 'light' },
  { re: /^\/comparative/, crumb: ['跨法域对比'], tone: 'light' },
  { re: /^\/learning/, crumb: ['学习中心'], tone: 'light' },
  { re: /^\/workspace\/matters\/[^/]+$/, crumb: ['专业工具工作台', '案件详情'], tone: 'light' },
  { re: /^\/workspace/, crumb: ['专业工具工作台'], tone: 'light' },
  { re: /^\/collections/, crumb: ['我的收藏'], tone: 'light' },
  { re: /^\/data-sources/, crumb: ['数据洞察', '数据源状态'], tone: 'light' },
  { re: /^\/audit/, crumb: ['历史记录', '操作审计'], tone: 'light' },
  { re: /^\/settings/, crumb: ['设置'], tone: 'light' },
  { re: /^\/guide/, crumb: ['使用指南'], tone: 'light' },
  { re: /^\/terms/, crumb: ['术语卡'], tone: 'light' },
  { re: /^\/quality/, crumb: ['质量透明度'], tone: 'light' },
  { re: /^\/process/, crumb: ['流程图解'], tone: 'light' },
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
  const [audience, setAudience] = useState<AudienceMode | null>(() => loadAudiencePreference()?.mode ?? null)
  const [inventory, setInventory] = useState<Inventory | null>(null)
  const [inventoryError, setInventoryError] = useState(false)
  // 窄屏（<768px）：侧栏转抽屉。
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 767.98px)').matches)
  const [mobileOpen, setMobileOpen] = useState(false)
  const nav = useNavigate()
  // TopBar 滚动海拔（HIG scroll edge effect）：内容滚过首行后边缘增强
  const [scrolled, setScrolled] = useState(false)
  const inventoryUnavailable = inventoryError || import.meta.env.VITE_STATIC_PREVIEW === '1'
  const visibleMain = NAV_MAIN.filter((item) => !item.audiences || (audience !== null && item.audiences.includes(audience)))
  const visibleSub = NAV_SUB.filter((item) => !item.audiences || (audience !== null && item.audiences.includes(audience)))
  const mayOpenRoute = audience !== null && canAudienceAccess(pathname, audience)

  const meta = ROUTE_META.find((m) => m.re.test(pathname)) ?? { crumb: ['首页'], tone: 'light' as const }
  const tone = override === 'auto' ? meta.tone : override

  // ToastHost 位于路由外层；把当前语义主题同步到根节点，确保 Portal/全局浮层继承同一套材质 Token。
  // .main 仍保留局部 tone 类，便于静态页面和嵌入场景独立退化。
  useEffect(() => {
    document.documentElement.classList.toggle('tone-dark', tone === 'dark')
    document.documentElement.classList.toggle('tone-light', tone === 'light')
  }, [tone])

  useEffect(() => {
    localStorage.setItem('le-sb-collapsed', collapsed ? '1' : '0')
  }, [collapsed])
  useEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', readReduceMotion())
    document.documentElement.classList.toggle('font-large', localStorage.getItem('le-font-large') === '1')
    const syncTone = () => setOverride(readOverride())
    const syncAudience = () => setAudience(loadAudiencePreference()?.mode ?? null)
    window.addEventListener('le-tone-changed', syncTone)
    window.addEventListener('le-audience-changed', syncAudience)
    const mq = window.matchMedia('(max-width: 767.98px)')
    const onMq = (e: MediaQueryListEvent) => { setNarrow(e.matches); if (!e.matches) setMobileOpen(false) }
    mq.addEventListener('change', onMq)
    return () => {
      window.removeEventListener('le-tone-changed', syncTone)
      window.removeEventListener('le-audience-changed', syncAudience)
      mq.removeEventListener('change', onMq)
    }
  }, [])
  useEffect(() => {
    if (import.meta.env.VITE_STATIC_PREVIEW === '1') return
    let alive = true
    api.inventory().then(
      (value) => { if (alive) { setInventory(value); setInventoryError(false) } },
      () => { if (alive) setInventoryError(true) },
    )
    return () => { alive = false }
  }, [])
  // 路由变化即收起抽屉（顶栏/页内链接导航同样生效）
  useEffect(() => { setMobileOpen(false) }, [pathname])
  // 路由切换回顶部：海拔复位
  useEffect(() => { setScrolled(false) }, [pathname])

  // 全局「/」快捷键：TopBar kbd 提示的真实实现（硬规则③ 假交互禁绝）。
  // 输入态让路；跨页跳转用 location.state 让 SearchHome 挂载后自聚焦（shell 轮询聚焦时序脆弱），
  // 已在本页则直接聚焦（页面已挂载，同步 focus 可靠）。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      e.preventDefault()
      if (pathname !== '/search') nav('/search', { state: { leFocusSearch: true } })
      else document.querySelector<HTMLInputElement>('.searchbar .inp')?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pathname, nav])

  // 本机浏览史（真实记录，供 /audit「浏览历史」Tab 渲染；不上传）
  useEffect(() => {
    try {
      const title = meta.crumb.join(' / ')
      const raw: unknown = JSON.parse(localStorage.getItem('lh:browse-history') ?? '[]')
      const list = Array.isArray(raw) ? raw.filter((item): item is { p: string; t: string; ts: number } =>
        !!item && typeof item === 'object'
        && typeof (item as { p?: unknown }).p === 'string'
        && typeof (item as { t?: unknown }).t === 'string'
        && typeof (item as { ts?: unknown }).ts === 'number') : []
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
          {visibleMain.map(renderItem)}
          <div className="sb-gap" role="separator" />
          {visibleSub.map(renderItem)}
        </nav>
        <div className="sb-user">
          <Link to="/settings" className="sb-reserve" title="查看数据储备并切换使用视图">
            <div className="sb-reserve-h"><span><Icon name="database" size={13} />数据储备</span><span>{audience ? `${audienceLabel(audience)}视图` : '选择视图'}</span></div>
            <div className="sb-reserve-grid">
              <span><b>{inventory ? inventory.laws.toLocaleString() : inventoryUnavailable ? '—' : '…'}</b><small>部法规</small></span>
              <span><b>{inventory ? inventory.articles.toLocaleString() : inventoryUnavailable ? '—' : '…'}</b><small>条条文</small></span>
              <span><b>{inventory ? inventory.verified_cases.toLocaleString() : inventoryUnavailable ? '—' : '…'}</b><small>件核实案例</small></span>
              <span><b>{inventory ? inventory.approved_explains.toLocaleString() : inventoryUnavailable ? '—' : '…'}</b><small>条审核解读</small></span>
            </div>
            <div className="sb-reserve-note">
              {import.meta.env.VITE_STATIC_PREVIEW === '1' ? '静态说明站不提供实时储备' : inventoryError ? '实时储备读取失败，请检查本机服务' : inventory?.fetched_at ? `证据快照 ${inventory.fetched_at}` : '正在核对实时储备'}
            </div>
          </Link>
        </div>
      </aside>

      <div className={'main ' + (tone === 'dark' ? 'tone-dark' : 'tone-light')}>
        <header className={'tb' + (scrolled ? ' is-scrolled' : '')}>
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
          {audience !== null && audience !== 'public' && <Link to="/research" className="tb-pill is-accent"><Icon name="sparkle" size={13} />研究工作台</Link>}
          {audience === 'professional' && <Link to="/audit" className="tb-icon" title="操作与浏览记录"><Icon name="history" size={15} /></Link>}
          <Link to="/settings" className="tb-icon" title="视图与设置"><Icon name="user" size={15} /></Link>
        </header>

        {narrow && audience !== null && (
          <Link to="/settings?feedback=mobile" className="mobile-feedback" title="反馈移动端体验问题">
            <Icon name="send" size={14} />
        </Link>
      )}

      {/* Pages 仅作静态说明与法规快照浏览，不在浏览器内伪造任何后端接口。 */}
      {import.meta.env.VITE_STATIC_PREVIEW === '1' && (
        <div className="banner banner-info" style={{ margin: '0 12px', borderRadius: 12 }}>
          <Icon name="info" size={15} />
          <span className="banner-tx">静态说明站：仅法规证据快照浏览可用；检索、案例、AI、合同、文书及所有读写 API 均未在本页面部署。请本地运行完整服务后使用。</span>
        </div>
      )}

      <main className="content" onScroll={(e) => {
        const next = (e.target as HTMLElement).scrollTop > 4
        setScrolled((s) => (s === next ? s : next))  // 阈值外不触发重渲染
      }}>
          <div key={pathname}>
            {audience === null ? (
              <AudienceChooser onChoose={(mode) => { saveAudiencePreference({ mode }); setAudience(mode) }} />
            ) : mayOpenRoute ? (
              <Suspense fallback={<PageFallback />}>
                <Outlet context={{ audience } satisfies AppOutletContext} />
              </Suspense>
            ) : isKnownRoute(pathname) ? (
              <AudienceAccessNotice pathLabel={meta.crumb.at(-1) ?? '此功能'} audience={audience} />
            ) : (
              <NotFoundNotice pathLabel={pathname} />
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

function AudienceChooser({ onChoose }: { onChoose: (mode: AudienceMode) => void }) {
  return (
    <div className="audience-onboarding">
      <section className="audience-sheet" aria-labelledby="audience-title">
        <div className="audience-mark"><Icon name="scale" size={22} /></div>
        <div className="tiny">首次使用 · 仅保存在本机</div>
        <h1 id="audience-title">选择适合你的使用视图</h1>
        <p className="audience-lead">法规条文和案例检索始终开放；其他入口会按用途精简。之后可随时在设置中切换。</p>
        <div className="audience-grid">
          {AUDIENCE_OPTIONS.map((option) => (
            <button key={option.mode} className="audience-card" onClick={() => onChoose(option.mode)}>
              <span className="audience-card-t">{option.title}</span>
              <span className="audience-card-d">{option.description}</span>
              <span className="audience-card-list">{option.highlights.map((item) => <i key={item}>✓ {item}</i>)}</span>
              <span className="audience-card-cta">选择并进入 <Icon name="arrowR" size={12} /></span>
            </button>
          ))}
        </div>
        <p className="audience-foot">选择“专业律师”只开启专业工作界面，不构成账号认证、执业资格核验或平台律师服务。</p>
      </section>
    </div>
  )
}

function NotFoundNotice({ pathLabel }: { pathLabel: string }) {
  return (
    <div className="page access-notice">
      <section className="card card-pad">
        <span className="access-ic"><Icon name="search" size={22} /></span>
        <h1>页面不存在（404）</h1>
        <p>路径 <b>{pathLabel}</b> 不在本站的已登记页面中——链接可能已过期或输入有误。法条、案例与流程图解始终开放，可直接检索。</p>
        <div className="row-wrap">
          <Link className="btn btn-primary" to="/search">法条检索</Link>
          <Link className="btn btn-secondary" to="/guide">使用指南</Link>
          <Link className="btn btn-secondary" to="/process">流程图解</Link>
        </div>
        <div className="banner banner-warm mt-12"><Icon name="bulb" size={15} />
          <span className="banner-tx">需要法律帮助？可拨打 12348 公共法律服务热线；本站内容仅作普法参考，不是法律意见。</span>
        </div>
      </section>
    </div>
  )
}

function AudienceAccessNotice({ pathLabel, audience }: { pathLabel: string; audience: AudienceMode }) {
  return (
    <div className="page access-notice">
      <section className="card card-pad">
        <span className="access-ic"><Icon name="lock" size={22} /></span>
        <h1>{pathLabel}未在{audienceLabel(audience)}视图中开放</h1>
        <p>这不是权限或资格认证。为了避免向所有人堆叠不相关的专业流程，当前视图已收起该入口。</p>
        <div className="row-wrap">
          <Link className="btn btn-primary" to="/settings">切换使用视图</Link>
          <Link className="btn btn-secondary" to="/search">继续法律检索</Link>
        </div>
      </section>
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
