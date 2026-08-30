import type { ReactNode } from "react";
import { useIsNarrow } from "../hooks/useSizeClass";

/**
 * MobileActionBar（设计规格 v3 §一.6）：narrow 下把主 CTA 提到拇指区——
 * fixed 底部动作栏（material-bar），悬于 tab 栏上方（bottom: 66px + 安全区）。
 * regular 渲染 null：调用方保留 inline CTA，用 .only-narrow / .only-regular 切换显示。
 */
export function MobileActionBar({ children }: { children: ReactNode }) {
  const isNarrow = useIsNarrow();
  if (!isNarrow) return null;
  return <div className="actionbar material-bar">{children}</div>;
}

export default MobileActionBar;
