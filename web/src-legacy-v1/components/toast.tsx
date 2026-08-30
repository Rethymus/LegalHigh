import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * 轻量 toast（v4 修正）：TDesign 的 MessagePlugin/DialogPlugin 插件通道
 * 与 React 19 不兼容（内部 createRoot 通道抛错），故反馈层用树内组件自建。
 * notify(msg, theme) 任意位置调用；<ToastHost/> 挂在 App 根部。
 * 样式走「纸与玻璃」token：玻璃面板 + 语义色边条。
 */
type Theme = "success" | "info" | "warning" | "error";
interface ToastItem { id: number; msg: string; theme: Theme }

const bus = new EventTarget();
let seq = 0;

export function notify(msg: string, theme: Theme = "info"): void {
  bus.dispatchEvent(new CustomEvent("lh-toast", { detail: { id: ++seq, msg, theme } }));
}

const ICON: Record<Theme, ReactNode> = {
  success: <span style={{ color: "var(--green)" }}>●</span>,
  info: <span style={{ color: "var(--accent)" }}>●</span>,
  warning: <span style={{ color: "var(--orange)" }}>●</span>,
  error: <span style={{ color: "var(--red)" }}>●</span>,
};

export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => {
    const on = (e: Event) => {
      const t = (e as CustomEvent<ToastItem>).detail;
      setItems(v => [...v.slice(-3), t]);
      window.setTimeout(() => setItems(v => v.filter(x => x.id !== t.id)), 3400);
    };
    bus.addEventListener("lh-toast", on);
    return () => bus.removeEventListener("lh-toast", on);
  }, []);
  return createPortal(
    <div className="toast-host" aria-live="polite">
      {items.map(t => (
        <div key={t.id} className={`toast toast-${t.theme}`}>
          {ICON[t.theme]}
          <span>{t.msg}</span>
        </div>
      ))}
    </div>,
    document.body,
  );
}
