import { useEffect, useState } from "react";

/**
 * Size class（设计规格 v3 §一.1）：narrow（<768px）/ regular 两形态。
 * 监听 matchMedia 并写入 documentElement.dataset.sizeclass，
 * 供 CSS 以 `html[data-sizeclass="narrow"] …` 分支做形态决策；
 * 禁止再用零散 @media 断点做形态决策（流式 clamp 除外）。
 */
export type SizeClass = "narrow" | "regular";

const QUERY = "(max-width: 767px)";

function compute(): SizeClass {
  return window.matchMedia(QUERY).matches ? "narrow" : "regular";
}

export function useSizeClass(): SizeClass {
  const [size, setSize] = useState<SizeClass>(compute);

  useEffect(() => {
    const apply = (value: SizeClass) => {
      document.documentElement.dataset.sizeclass = value;
      setSize(value);
    };
    apply(compute()); // 初始化（幂等：StrictMode 双调用安全）
    const mql = window.matchMedia(QUERY);
    const onChange = (e: MediaQueryListEvent) => apply(e.matches ? "narrow" : "regular");
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return size;
}

/** 便捷布尔：narrow 形态？（MobileActionBar / BottomSheet 等移动壳层用） */
export function useIsNarrow(): boolean {
  return useSizeClass() === "narrow";
}
