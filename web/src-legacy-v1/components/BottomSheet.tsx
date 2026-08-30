import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * BottomSheet（设计规格 v3 §一.6）：通用底部面板。
 * open 时渲染 backdrop（点击关闭）+ 面板（grabber 36×4、顶部圆角 --r-xl、
 * padding-bottom 避让 Home Indicator）；入场 320ms var(--ease)，
 * 关闭直接卸载（不做退场动画）；max-height 70vh 内部滚动。
 * 必须用 Portal 挂到 document.body：.material-* 的 backdrop-filter 会成为
 * fixed 后代的包含块（CSS 规范），内联渲染时 sheet 会被困在材质面板坐标系里。
 */
export function BottomSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <>
      <div className="sheet-backdrop" onClick={onClose} aria-hidden="true" />
      <section
        className="sheet-panel sheet-enter material-thick"
        role="dialog"
        aria-modal="true"
        aria-label={title ?? "底部面板"}
      >
        <div className="sheet-grabber" aria-hidden="true" />
        {title && <div className="sheet-title">{title}</div>}
        {children}
      </section>
    </>,
    document.body,
  );
}

export default BottomSheet;
