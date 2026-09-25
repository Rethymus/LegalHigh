// 通用 UI 原子组件：按钮/输入等直接使用 global.css 类；此处封装交互态组件
import { createContext, useCallback, useContext, useEffect, useRef, useState, type AnimationEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
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

/* ---------- 窄屏媒体查询 ----------
   桌面/移动差异化形态的渲染分叉点（R335）：CSS 断点 767.98px 与此处查询保持一致。 */
export function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = () => setMatch(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])
  return match
}

/* ---------- 底部抽屉拖拽（R337）----------
   iOS sheet 手势：把手向下拖 1:1 跟手（无过渡），向上越过 0 走阻尼橡皮筋（位移×0.3），
   松手越过阈值关闭（退场动画从当前位移继续，无跳变）、否则弹簧回位（smooth 曲线——
   红线③：用户直接驱动的交互禁 bounce 过冲）。
   实现要点（qa_motion 拖拽探针驱动的两处修正）：
   ① 骨架=window 级 pointermove/up 监听（setPointerCapture 在部分输入路径不生效，
     只靠捕获会把跟手中断成「原地不动+松手误触内容」）；
   ② onClose 只在事件回调里调（不得在 setState 更新器内调——那是渲染期，跨组件
     setState 会触发 React「update while rendering」违规）。 */
const SHEET_DRAG_CLOSE_PX = 90
const SHEET_RUBBER = 0.3
const SHEET_CLICK_SLOP = 8

export function useSheetDrag(onClose: () => void) {
  const [dragY, setDragY] = useState(0)
  const [dragging, setDragging] = useState(false)
  const st = useRef({ startY: 0, y: 0, moved: false })
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose }, [onClose])

  useEffect(() => {
    if (!dragging) return
    const move = (e: PointerEvent) => {
      const raw = e.clientY - st.current.startY
      const y = raw > 0 ? raw : raw * SHEET_RUBBER
      st.current.y = y
      if (Math.abs(raw) > SHEET_CLICK_SLOP) st.current.moved = true
      setDragY(y)
    }
    const up = () => {
      setDragging(false)
      if (st.current.y > SHEET_DRAG_CLOSE_PX) {
        onCloseRef.current()  // 保留 dragY（--sheet-y）供退场动画起点，无跳变
        return
      }
      st.current.y = 0
      setDragY(0)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [dragging])

  return {
    dragY,
    grabHandlers: {
      onPointerDown: (e: ReactPointerEvent) => {
        st.current = { startY: e.clientY, y: 0, moved: false }
        setDragging(true)
        e.currentTarget.setPointerCapture?.(e.pointerId)  // 尽力而为：捕获生效时 click 落在把手（无害）
      },
    },
    /* 拖拽超过 slop 后吞掉松手处的误点 click（捕获失效路径下 click 会落在内容按钮上） */
    swallowClick: {
      onClickCapture: (e: React.MouseEvent) => {
        if (st.current.moved) {
          e.preventDefault()
          e.stopPropagation()
          st.current.moved = false
        }
      },
    },
    dragStyle: {
      '--sheet-y': `${dragY}px`,
      transform: `translateY(${dragY}px)`,
      transition: dragging ? 'none' : 'transform var(--t-smooth) var(--spring-smooth)',
    } as React.CSSProperties,
  }
}

/* ---------- Dialog（声明式确认）----------
   弹簧开合：open 翻转为 false 时先播退场动画（dlg-out/fade-out）再卸载，API 不变。
   onClose（可选）：提供后 scrim 点击 / Escape 关闭；窄屏由 CSS 转底部抽屉形态。 */
export function Dialog({ open, title, children, actions, onClose }: {
  open: boolean; title: string; children?: ReactNode; actions?: ReactNode; onClose?: () => void
}) {
  const [phase, setPhase] = useState<'hidden' | 'in' | 'out'>(open ? 'in' : 'hidden')
  const close = onClose ?? (() => {})
  const { grabHandlers, dragStyle, swallowClick } = useSheetDrag(close)
  useEffect(() => {
    if (open) { setPhase('in'); return }
    setPhase((p) => (p === 'in' ? 'out' : p))
  }, [open])
  useEffect(() => {
    if (!open || !onClose) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (phase === 'hidden') return null
  return (
    <div
      className={'dlg-mask' + (phase === 'out' ? ' is-out' : '')}
      role="dialog"
      aria-modal="true"
      onClick={(event) => { if (event.target === event.currentTarget) onClose?.() }}
      onAnimationEnd={(event) => {
        if (phase === 'out' && event.currentTarget === event.target && event.animationName === 'fade-out') setPhase('hidden')
      }}
    >
      <div className="dlg" style={onClose ? dragStyle : undefined} {...(onClose ? swallowClick : {})}>
        <span className="dlg-grab" aria-hidden {...(onClose ? grabHandlers : {})} />
        <div className="dlg-t">{title}</div>
        {children && <div className="dlg-b">{children}</div>}
        <div className="dlg-acts">{actions ?? <button className="btn btn-primary btn-sm" onClick={() => { /* closed by parent */ }}>知道了</button>}</div>
      </div>
    </div>
  )
}

/* ---------- ActionSheet（移动端底部动作面板，R335）----------
   iOS 原生范式：页头操作行在窄屏折叠为「更多」入口，动作以底部面板呈现
   （拖拽把手视觉 + 44pt 行 + scrim 点击/Escape 关闭）。桌面端不使用该形态。 */
export interface SheetAction { label: string; icon?: IconName; danger?: boolean; onClick: () => void }

export function ActionSheet({ open, title, actions, onClose }: {
  open: boolean; title?: string; actions: SheetAction[]; onClose: () => void
}) {
  const [phase, setPhase] = useState<'hidden' | 'in' | 'out'>(open ? 'in' : 'hidden')
  const { grabHandlers, dragStyle, swallowClick } = useSheetDrag(onClose)
  useEffect(() => {
    if (open) { setPhase('in'); return }
    setPhase((p) => (p === 'in' ? 'out' : p))
  }, [open])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (phase === 'hidden') return null
  const run = (a: SheetAction) => { onClose(); a.onClick() }
  return (
    <div
      className={'sheet-mask' + (phase === 'out' ? ' is-out' : '')}
      role="dialog"
      aria-modal="true"
      aria-label={title ?? '更多操作'}
      onClick={(event) => { if (event.target === event.currentTarget) onClose() }}
      onAnimationEnd={(event) => {
        if (phase === 'out' && event.currentTarget === event.target && event.animationName === 'fade-out') setPhase('hidden')
      }}
    >
      <div className="sheet" style={dragStyle} {...swallowClick}>
        <span className="sheet-grab" aria-hidden {...grabHandlers} />
        {title && <div className="sheet-t">{title}</div>}
        <div className="sheet-list">
          {actions.map((a) => (
            <button key={a.label} type="button" className={'sheet-row' + (a.danger ? ' is-danger' : '')} onClick={() => run(a)}>
              {a.icon && <Icon name={a.icon} size={17} strokeWidth={1.7} />}
              <span>{a.label}</span>
            </button>
          ))}
        </div>
        <button type="button" className="sheet-cancel" onClick={onClose}>取消</button>
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
