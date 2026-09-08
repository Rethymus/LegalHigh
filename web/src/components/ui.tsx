// 通用 UI 原子组件：按钮/输入等直接使用 global.css 类；此处封装交互态组件
import { createContext, useCallback, useContext, useEffect, useRef, useState, type AnimationEvent, type ReactNode } from 'react'
import { Icon, type IconName } from './icons'

/* ---------- 时间显示：server 存 UTC ISO，展示一律转本地时区 ----------
   原型曾直接截取 ISO 串展示（对 UTC+8 用户偏差 8 小时，律师工作流易误读）。 */
export function fmtTime(iso: string | number | undefined | null, mode: 'dt' | 'd' | 't' = 'dt'): string {
  if (iso === undefined || iso === null || iso === '') return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  if (mode === 'd') return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
  if (mode === 't') return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/* ---------- Toast ----------
   弹簧入场（pop-in · bouncy）+ 退场（pop-out）后再卸载：
   到期先挂 .is-out 播退场动画，动画结束后才从状态里移除（避免闪断）。 */
interface ToastMsg { id: number; text: string; tone?: 'ok' | 'err' }
const ToastCtx = createContext<(text: string, tone?: 'ok' | 'err') => void>(() => {})
export const useToast = () => useContext(ToastCtx)

const TOAST_TTL = 2600

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastMsg[]>([])
  const [exiting, setExiting] = useState<Set<number>>(new Set())
  const seq = useRef(0)
  const timers = useRef<Set<number>>(new Set())
  useEffect(() => () => { timers.current.forEach(window.clearTimeout); timers.current.clear() }, [])
  const push = useCallback((text: string, tone?: 'ok' | 'err') => {
    const id = ++seq.current
    setItems((xs) => [...xs.slice(-3), { id, text, tone }])  // 堆叠上限 4 条，防刷屏
    const timer = window.setTimeout(() => {
      timers.current.delete(timer)
      setExiting((s) => new Set(s).add(id))
    }, TOAST_TTL)
    timers.current.add(timer)
  }, [])
  const finishExit = useCallback((id: number, event: AnimationEvent<HTMLDivElement>) => {
    if (event.currentTarget !== event.target || event.animationName !== 'pop-out') return
    setItems((xs) => xs.filter((x) => x.id !== id))
    setExiting((s) => { const next = new Set(s); next.delete(id); return next })
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-host">
        {items.map((t) => (
          <div key={t.id} onAnimationEnd={(event) => finishExit(t.id, event)} className={'toast' + (t.tone ? ' t-' + t.tone : '') + (exiting.has(t.id) ? ' is-out' : '')}>
            <Icon name={t.tone === 'err' ? 'alert' : t.tone === 'ok' ? 'verify' : 'info'} size={15} />
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

/* ---------- Dialog（声明式确认）----------
   弹簧开合：open 翻转为 false 时先播退场动画（dlg-out/fade-out）再卸载，API 不变。 */
export function Dialog({ open, title, children, actions }: {
  open: boolean; title: string; children?: ReactNode; actions?: ReactNode
}) {
  const [phase, setPhase] = useState<'hidden' | 'in' | 'out'>(open ? 'in' : 'hidden')
  useEffect(() => {
    if (open) { setPhase('in'); return }
    setPhase((p) => (p === 'in' ? 'out' : p))
  }, [open])
  if (phase === 'hidden') return null
  return (
    <div
      className={'dlg-mask' + (phase === 'out' ? ' is-out' : '')}
      role="dialog"
      aria-modal="true"
      onAnimationEnd={(event) => {
        if (phase === 'out' && event.currentTarget === event.target && event.animationName === 'fade-out') setPhase('hidden')
      }}
    >
      <div className="dlg">
        <div className="dlg-t">{title}</div>
        {children && <div className="dlg-b">{children}</div>}
        <div className="dlg-acts">{actions ?? <button className="btn btn-primary btn-sm" onClick={() => { /* closed by parent */ }}>知道了</button>}</div>
      </div>
    </div>
  )
}

/* ---------- 分段控件（竹简槽）----------
   iOS Segmented Control 语义：凹槽轨道 + 滑块弹簧滑动（--spring-snappy）。
   --seg-n / --seg-x 注入 CSS，滑块位移全部走 transform（合成器通道）。 */
export function Segmented({ options, value, onChange, ariaLabel }: {
  options: { key: string; label: string }[]
  value: string
  onChange: (k: string) => void
  ariaLabel?: string
}) {
  const idx = Math.max(0, options.findIndex((o) => o.key === value))
  return (
    <div className="seg" role="tablist" aria-label={ariaLabel} style={{ '--seg-n': options.length, '--seg-x': `${idx * 100}%` } as React.CSSProperties}>
      <span className="seg-thumb" aria-hidden />
      {options.map((o) => (
        <button
          key={o.key} type="button" role="tab" aria-selected={o.key === value}
          className={'seg-btn' + (o.key === value ? ' is-on' : '')}
          onClick={() => onChange(o.key)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ---------- 开关 / 复选 ---------- */
export function Switch({ on, onChange, disabled }: { on: boolean; onChange?: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button" role="switch" aria-checked={on}
      className={'sw' + (on ? ' is-on' : '')}
      disabled={disabled}
      onClick={() => onChange?.(!on)}
    />
  )
}

export function Ckbox({ on, onChange, label }: { on: boolean; onChange?: (v: boolean) => void; label?: ReactNode }) {
  return (
    <button type="button" className="row" style={{ textAlign: 'left', flex: 1 }} onClick={() => onChange?.(!on)}>
      <span className={'ckbox' + (on ? ' is-on' : '')}>{on && <Icon name="check" size={11} strokeWidth={2.6} />}</span>
      {label}
    </button>
  )
}

/* ---------- Tabs ---------- */
export function Tabs({ tabs, active, onChange, right }: {
  tabs: { key: string; label: string; count?: number }[]
  active: string
  onChange: (k: string) => void
  right?: ReactNode
}) {
  return (
    <div className="row" style={{ borderBottom: 'none' }}>
      <div className="tabs" style={{ flex: 1 }}>
        {tabs.map((t) => (
          <button key={t.key} type="button" className={'tab' + (active === t.key ? ' is-on' : '')} onClick={() => onChange(t.key)}>
            {t.label}
            {typeof t.count === 'number' && <span className="cnt">{t.count}</span>}
          </button>
        ))}
      </div>
      {right}
    </div>
  )
}

/* ---------- 页头 ---------- */
export function PageHeader({ title, sub, actions, back }: {
  title: ReactNode; sub?: ReactNode; actions?: ReactNode; back?: ReactNode
}) {
  return (
    <div className="ph">
      <div style={{ minWidth: 0 }}>
        {back && <div className="mb-8">{back}</div>}
        <h1 className="ph-t">{title}</h1>
        {sub && <div className="ph-sub">{sub}</div>}
      </div>
      {actions && <div className="ph-actions">{actions}</div>}
    </div>
  )
}

/* ---------- 空态 / 骨架（§48/§49） ---------- */
export function EmptyState({ icon = 'info', title, desc, action }: {
  icon?: IconName
  title: string; desc?: string; action?: ReactNode
}) {
  return (
    <div className="empty">
      <div className="empty-ic"><Icon name={icon} size={24} /></div>
      <div className="empty-t">{title}</div>
      {desc && <div className="empty-d">{desc}</div>}
      {action}
    </div>
  )
}

export function SkeletonLines({ n = 4, tall }: { n?: number; tall?: boolean }) {
  return (
    <div aria-busy="true">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className={'skl ' + (tall ? 'skl-l' : 'skl-t')} style={{ width: `${100 - ((i * 13) % 42)}%` }} />
      ))}
    </div>
  )
}

/* ---------- 状态徽章映射（§42 统一颜色） ---------- */
export function ValidityBadge({ v }: { v: string }) {
  if (/现行有效|有效|current/i.test(v)) return <span className="bdg bdg-green"><span className="dot" />现行有效</span>
  if (/废止|失效|outdated/i.test(v)) return <span className="bdg bdg-red">已废止</span>
  if (/修订|被取代|superseded/i.test(v)) return <span className="bdg bdg-gray">已被修订</span>
  if (/未核实|待核/i.test(v)) return <span className="bdg bdg-red">未核实</span>
  return <span className="bdg bdg-gray">{v}</span>
}

/* ---------- 复制到剪贴板 ---------- */
export function useCopy() {
  const toast = useToast()
  return useCallback((text: string, tip = '已复制到剪贴板') => {
    navigator.clipboard?.writeText(text).then(
      () => toast(tip, 'ok'),
      () => toast('复制失败，请手动选择文本', 'err'),
    )
  }, [toast])
}
