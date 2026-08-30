import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import BottomSheet from "./BottomSheet";

/**
 * MobileNav（设计规格 v3 §一.6，narrow 专用壳层）：
 * 顶部紧凑栏（brand glyph + 滚动过大标题后浮现的当前页标题 17px/600
 * + 右侧大字/主题 44px 图标钮）+ 底部 tab 栏（5 主 tab + 「更多」BottomSheet）。
 * 大字/主题行为复用 App.tsx 的 toggle（props 注入）；路由切换自动关 sheet。
 */

const TABS = [
  { to: "/qa", glyph: "问", label: "问答" },
  { to: "/research", glyph: "研", label: "研究" },
  { to: "/case", glyph: "案", label: "分析" },
  { to: "/review", glyph: "审", label: "审查" },
  { to: "/drafting", glyph: "书", label: "起草" },
] as const;

/** 「更多」sheet 内的次级页面（不高亮任何主 tab） */
const MORE_LINKS = [
  { to: "/", glyph: "首", label: "首页" },
  { to: "/compliance", glyph: "合", label: "合规中心" },
  { to: "/design", glyph: "设", label: "设计系统" },
] as const;

const TITLES: Record<string, string> = {
  "/": "LegalHigh",
  "/qa": "引用式问答",
  "/research": "法律研究",
  "/case": "案件分析",
  "/review": "合同审查",
  "/drafting": "文书起草",
  "/compliance": "合规中心",
  "/design": "设计系统",
};

export function MobileNav({
  theme,
  fontsizeLarge,
  onToggleTheme,
  onToggleFontsize,
}: {
  theme: string;
  fontsizeLarge: boolean;
  onToggleTheme: () => void;
  onToggleFontsize: () => void;
}) {
  const location = useLocation();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [titleShown, setTitleShown] = useState(false);

  // 路由切换自动关 sheet
  useEffect(() => {
    setSheetOpen(false);
  }, [location.pathname]);

  // 大标题（main 内第一个 .doc-header 或 h1）滚过视口顶部后，紧凑标题浮现
  useEffect(() => {
    setTitleShown(false);
    const target = document.querySelector<HTMLElement>("main.page .doc-header, main.page h1");
    if (!target || typeof IntersectionObserver === "undefined") {
      setTitleShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        const e = entries[entries.length - 1];
        setTitleShown(!e.isIntersecting && e.boundingClientRect.top < 0);
      },
      { threshold: 0 },
    );
    io.observe(target);
    return () => io.disconnect();
  }, [location.pathname]);

  const title = TITLES[location.pathname] ?? "LegalHigh";

  return (
    <>
      <header className="compactbar material-bar">
        <NavLink to="/" className="brand t-serif" aria-label="LegalHigh 首页">
          <span className="brand-glyph">法</span>
        </NavLink>
        <span className={`compactbar-title${titleShown ? " is-shown" : ""}`}>{title}</span>
        <div className="compactbar-actions">
          <button
            type="button"
            className="iconbtn t-serif"
            onClick={onToggleFontsize}
            title="切换大字模式（适老）"
            aria-label="切换大字模式"
            aria-pressed={fontsizeLarge}
          >
            大
          </button>
          <button
            type="button"
            className="iconbtn"
            onClick={onToggleTheme}
            title="切换浅色/深色模式"
            aria-label="切换浅色/深色模式"
          >
            {theme === "dark" ? "☀" : "🌙"}
          </button>
        </div>
      </header>

      <nav className="tabbar material-bar" aria-label="主导航">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} className={({ isActive }) => `tab${isActive ? " active" : ""}`}>
            <span className="tab-glyph t-serif" aria-hidden="true">{t.glyph}</span>
            <span className="tab-label">{t.label}</span>
          </NavLink>
        ))}
        <button
          type="button"
          className="tab"
          onClick={() => setSheetOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={sheetOpen}
        >
          <span className="tab-glyph t-serif" aria-hidden="true">更</span>
          <span className="tab-label">更多</span>
        </button>
      </nav>

      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="更多">
        <nav className="sheet-links" aria-label="更多页面">
          {MORE_LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.to === "/"} className="sheet-link">
              <span className="sheet-link-glyph t-serif" aria-hidden="true">{l.glyph}</span>
              {l.label}
            </NavLink>
          ))}
        </nav>
        <hr className="sheet-sep" />
        <div className="sheet-links">
          <button type="button" className="sheet-row" onClick={onToggleFontsize} aria-pressed={fontsizeLarge}>
            大字模式
            <span className="sheet-row-value">{fontsizeLarge ? "开" : "关"}</span>
          </button>
          <button type="button" className="sheet-row" onClick={onToggleTheme}>
            深色模式
            <span className="sheet-row-value">{theme === "dark" ? "开" : "关"}</span>
          </button>
        </div>
      </BottomSheet>
    </>
  );
}

export default MobileNav;
