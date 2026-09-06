// FRAME 22 · Design System —— 仅供设计与开发团队（规格 §29）
// 不出现在用户导航；仅从 Settings → 内部链接进入。深色基调展示 Tokens / 组件 / 状态。
import { useState } from 'react'
import { Icon } from '../icons'
import { Dialog, PageHeader, Segmented, Switch, useToast } from '../ui'
import { AIBlock, CitationChip, ForeignDisclaimer, SourceBadge } from '../domain'

const LIGHT = [
  ['Base Background', '#F5F5F7'], ['Secondary Background', '#F2F2F7'], ['Primary Surface', 'rgba(255,255,255,0.82)'],
  ['Elevated Surface', 'rgba(255,255,255,0.92)'], ['Primary Text', '#1D1D1F'], ['Secondary Text', '#6E6E73'],
  ['Divider', 'rgba(60,60,67,0.16)'], ['Accent Blue', '#0A84FF'], ['Success', '#30D158'], ['Warning', '#FF9F0A'], ['Danger', '#FF453A'], ['Purple', '#BF5AF2'],
]
const DARK = [
  ['Base Background', '#0B0B0D'], ['Primary Surface', '#1C1C1E'], ['Secondary Surface', '#2C2C2E'],
  ['Primary Text', '#F5F5F7'], ['Secondary Text', '#AEAEB2'], ['Divider', 'rgba(255,255,255,0.12)'], ['Accent', '#0A84FF'],
]
const RADII = [['Small', 8], ['Medium', 12], ['Large', 16], ['Panel', 20], ['Modal', 24], ['Pill', 999]] as const
const SPACING = [4, 8, 12, 16, 20, 24, 32, 40, 48, 64]
const TYPE = [
  ['Display', 40, 700], ['Page Title', 28, 700], ['Section Title', 20, 700], ['Card Title', 16, 600], ['Body', 14, 400], ['Caption', 12, 400],
] as const

export default function DesignSystem() {
  const [sw, setSw] = useState(true)
  const [seg, setSeg] = useState('snappy')
  const [travel, setTravel] = useState(false)   // 弹簧对比：位移开关
  const [shakeKey, setShakeKey] = useState(0)   // 换 key 重挂载以重放 shake
  const [dlgOpen, setDlgOpen] = useState(false)
  const toast = useToast()

  return (
    <div className="page">
      <PageHeader
        title="设计系统规范"
        sub="内部参考（Apple HIG 风格 Token 体系）。本页不属于用户产品界面。"
        actions={<span className="bdg bdg-purple">Internal · v6</span>}
      />

      <div className="ds-block">
        <h4>色彩体系 · Light Mode</h4>
        <div className="ds-swatches">
          {LIGHT.map(([n, v]) => (
            <div key={n} className="ds-swatch">
              <div className="ds-swatch-c" style={{ background: v, borderBottom: '1px solid var(--div)' }} />
              <div className="ds-swatch-i"><b>{n}</b>{v}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="ds-block">
        <h4>色彩体系 · Dark Mode（同一套语义 Token）</h4>
        <div className="ds-swatches">
          {DARK.map(([n, v]) => (
            <div key={n} className="ds-swatch">
              <div className="ds-swatch-c" style={{ background: v }} />
              <div className="ds-swatch-i"><b>{n}</b>{v}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="ds-block">
        <h4>材质标尺 · Material Scale（屏幕采样模糊 + 半透明叠色 + 内高光 + 发丝线，参数全部来自 Token）</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            ['Ultra-Thin', 'm-thin', 'blur 10 · alpha 0.28', '大标题后方 / 印象层'],
            ['Regular', 'm-regular', 'blur 14 · alpha 0.60', '卡片层（card 默认）'],
            ['Thick', 'm-thick', 'blur 20 · alpha 0.78', '工作台面板 / 正文容器'],
            ['Chrome', 'm-chrome', 'blur 30 · alpha 0.52', 'Sidebar / TopBar 悬浮铬层'],
            ['Float', 'm-float', 'blur 32 · alpha 0.70 + 大阴影', 'Toast / Popover / 浮层'],
          ].map(([name, cls, param, use]) => (
            <div key={name} className="m-strip">
              <div className={'material ' + cls}>
                <b>{name}</b>
                <code>{param}</code>
                <span style={{ marginLeft: 'auto', fontWeight: 400, opacity: 0.7 }}>{use} · 移动窗口可见背后色斑实时折射</span>
              </div>
            </div>
          ))}
        </div>
        <p className="tiny mt-12">
          统一参数源：--blur-chrome 30 / --blur-panel 20 / --blur-card 14 / --blur-float 32 · saturate 150% ·
          发丝线 --mat-hairline · 顶部内高光 --mat-edge · 焦点环 3px #0A84FF。正文阅读区（官方原文/文书纸/案件正文）强制高不透明度护栏。
        </p>
      </div>

      <div className="cols cols-2">
        <div className="ds-block">
          <h4>中性色阶 · Light（基色 → 前景）</h4>
          <div className="ds-row">
            {['#FFFFFF', '#F5F5F7', '#E8E8ED', '#D2D2D7', 'rgba(60,60,67,.12)', '#6E6E73', '#1D1D1F'].map((c) => (
              <div key={c} className="ds-swatch" style={{ width: 92 }}>
                <div className="ds-swatch-c" style={{ background: c, borderBottom: '1px solid var(--div)' }} />
                <div className="ds-swatch-i"><b>{c}</b></div>
              </div>
            ))}
          </div>
          <p className="tiny mt-8">面板材质 = 半透明白叠色（tint 255,255,255 · alpha 0.28–0.92），海拔越高越接近不透明。</p>
        </div>
        <div className="ds-block">
          <h4>中性色阶 · Dark（elevation = lighter：海拔越高表面越亮）</h4>
          <div className="ds-row">
            {['#000000', '#0B0B0D', '#1C1C1E', '#2C2C2E', '#323234', 'rgba(255,255,255,.10)', '#AEAEB2', '#F5F5F7'].map((c) => (
              <div key={c} className="ds-swatch" style={{ width: 92 }}>
                <div className="ds-swatch-c" style={{ background: c, borderBottom: '1px solid rgba(255,255,255,.08)' }} />
                <div className="ds-swatch-i"><b>{c}</b></div>
              </div>
            ))}
          </div>
          <p className="tiny mt-8">深色材质叠色基 tint 44,46,52 · alpha 0.44–0.85；台面 desk 透出环境极光，随内容产生玻璃层次。</p>
        </div>
      </div>

      <div className="cols cols-2">
        <div className="ds-block">
          <h4>圆角 / 间距 / 字号</h4>
          <div className="ds-row">
            {RADII.map(([n, v]) => (
              <div key={n} className="row" style={{ gap: 8 }}>
                <span style={{ width: 34, height: 34, border: '1.5px solid var(--blue)', borderRadius: v, display: 'inline-grid', placeItems: 'center', fontSize: 9 }}>{v}</span>
                <span className="tiny">{n}</span>
              </div>
            ))}
          </div>
          <div className="ds-row mt-12">
            {SPACING.map((s) => <span key={s} className="tiny" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><i style={{ display: 'inline-block', width: s, height: 14, background: 'var(--accent-soft)', border: '1px solid var(--accent)' }} />{s}</span>)}
          </div>
          <div className="mt-16">
            {TYPE.map(([n, size, weight]) => (
              <div key={n} style={{ fontSize: Math.min(size, 34), fontWeight: weight, lineHeight: 1.35 }}>
                {n} <span className="tiny" style={{ fontWeight: 400 }}>{size}px · w{weight}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="ds-block">
          <h4>来源徽章 · 状态（统一颜色，§42）</h4>
          <div className="ds-row mb-12">
            <SourceBadge kind="law" grade="强" /><SourceBadge kind="case" /><SourceBadge kind="academic" /><SourceBadge kind="foreign" /><SourceBadge kind="ai" />
          </div>
          <div className="ds-row">
            <span className="bdg bdg-green"><span className="dot" />Verified</span>
            <span className="bdg bdg-red">Unverified</span>
            <span className="bdg bdg-orange">Outdated</span>
            <span className="bdg bdg-gray">Superseded</span>
            <span className="bdg bdg-orange">Foreign</span>
            <span className="ai-tag">AI Generated</span>
          </div>

          <h4 className="mt-16">Citation 一级组件（§44）</h4>
          <div className="ds-row">
            <CitationChip n={1} label="《民法典》第497条" />
            <CitationChip n={2} label="指导案例24号" />
          </div>

          <h4 className="mt-16">AI 内容规则（§43）</h4>
          <AIBlock label="AI 摘要（样例）"><p>AI 内容永远携带 AI 标识，不得伪装官方内容。</p></AIBlock>

          <h4 className="mt-16">Legal Safety 表述（§45）</h4>
          <div className="tiny" style={{ lineHeight: 1.9 }}>
            禁用：「胜诉率 92%」「你一定能赢」「法院会判……」<br />
            替代：「公开案例中观察到……」「可能涉及……」「根据当前提供的信息……」「建议进一步确认……」
          </div>
        </div>
      </div>

      <div className="ds-block">
        <h4>组件状态（§47）：Default / Hover / Selected / Loading / Empty / Error / Disabled / Focus</h4>
        <div className="ds-row mb-12">
          <button className="btn btn-primary">Default</button>
          <button className="btn btn-secondary">Hover（背景/描边变化）</button>
          <button className="btn btn-primary is-loading">Loading…</button>
          <button className="btn btn-primary" disabled>Disabled</button>
          <button className="btn btn-ghost" style={{ boxShadow: 'var(--ring)' }}>Focus</button>
        </div>
        <div className="ds-row mb-12">
          <span className="chip">Filter</span><span className="chip is-on">Selected</span>
          <Switch on={sw} onChange={setSw} /><Switch on={false} disabled />
        </div>
        <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
          <div className="skl skl-l" style={{ width: 160 }} />
          <span className="bdg bdg-orange">Skeleton</span>
          <div className="banner banner-danger" style={{ padding: '8px 12px' }}><Icon name="alert" size={14} />Error：语料加载失败 · 可重试</div>
        </div>
        <div className="mt-12"><ForeignDisclaimer /></div>
      </div>

      <div className="ds-block">
        <h4>Motion Lab · 弹簧与按压（计划 v4 W1–W3；参数推导见调研 §2/§4）</h4>
        <div className="cols cols-2">
          <div>
            <div className="tiny mb-12">
              时阶：hover 160ms · 按压 80ms · 退场 120ms · 遮罩 240ms。
              弹簧 = SwiftUI 官方模型（ω₀=2π/duration · ζ=1−bounce）采样为 CSS linear()；
              时长配对：--t-smooth 740 / --t-snappy 560 / --t-bouncy 600 / --t-quick 340。
            </div>
            <div className="row mb-8">
              <button className="btn btn-secondary btn-sm" onClick={() => setTravel((v) => !v)}>{travel ? '回位' : '出发'}</button>
              <span className="tiny">同一距离，三种阻尼：smooth（无回弹）· snappy（+0.15）· bouncy（+0.3）</span>
            </div>
            <div style={{ position: 'relative', height: 108 }}>
              {([['smooth', 0], ['snappy', 36], ['bouncy', 72]] as const).map(([k, top]) => (
                <div key={k} className={'ball ball-' + k} style={{ top, transform: travel ? 'translateX(220px)' : 'none' }}>
                  <code>{k}</code>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="row mb-8" style={{ flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={() => toast('弹簧入场：bouncy（overshoot 峰值 1.046）', 'ok')}>Toast 弹簧入场</button>
              <button className="btn btn-ghost" onClick={() => setDlgOpen(true)}>Dialog 弹簧开合</button>
              <button className="btn btn-danger" onClick={() => setShakeKey((k) => k + 1)}>推石 shake（指数衰减）</button>
            </div>
            <div className="row mb-8" style={{ flexWrap: 'wrap' }}>
              <Segmented ariaLabel="弹簧演示选择" value={seg} onChange={setSeg} options={[{ key: 'smooth', label: '平滑' }, { key: 'snappy', label: '利落' }, { key: 'bouncy', label: '弹性' }]} />
              <span className="tiny">竹简槽：凹槽轨道 + 滑块 --spring-snappy</span>
            </div>
            <div className="row mb-8">
              <Switch on={sw} onChange={setSw} />
              <span className="tiny">开关 knob：--t-quick 弹簧 + 按压增宽</span>
            </div>
            <div key={shakeKey} className="banner banner-danger shake">
              <Icon name="alert" size={14} />
              <span className="banner-tx">非法操作反馈：x(t)=A·e^(−λt)·sin(2πft)，A=8px · f=9Hz · λ=6.5 —— 首摆 ±6.7px，单调指数衰减归零。</span>
            </div>
            <div className="tiny mt-8">按压反馈对：任意按钮按住 80ms 缩至 0.97，松开以 --spring-quick（340ms 微 overshoot）弹回——两段独立曲线构成「对」。全部只动 transform/opacity。</div>
          </div>
        </div>
        <Dialog open={dlgOpen} title="弹簧开合演示" actions={<button className="btn btn-primary btn-sm" onClick={() => setDlgOpen(false)}>关闭</button>}>
          遮罩 240ms 淡入，面板以 bouncy 弹簧缩放入场；关闭先播 120ms 退场再卸载（Dialog 状态机）。
        </Dialog>
      </div>

      <div className="ds-block">
        <h4>Motion / Focus（红线速查）</h4>
        <div className="tiny" style={{ lineHeight: 2 }}>
          位移类状态切换一律弹簧 Token · 只动 transform/opacity · Hover 仅背景/描边/阴影/≤1.01 缩放 ·
          Reduce Motion（系统+应用内）只关位移/缩放/循环，保留透明度渐变 ·
          焦点 Ring 统一 --ring / 输入 --ring-soft · 图标 SF Symbols-like 统一描边（本页图标即组件库实物）。
        </div>
      </div>
    </div>
  )
}
