import { useEffect, useState } from "react";
import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import { useSizeClass } from "./hooks/useSizeClass";
import { applyThemeMode } from "./hooks/useThemeMode";
import MobileNav from "./components/MobileNav";
import Home from "./pages/Home";
import QA from "./pages/QA";
import Research from "./pages/Research";
import CaseAnalysis from "./pages/CaseAnalysis";
import Review from "./pages/Review";
import Drafting from "./pages/Drafting";
import Compliance from "./pages/Compliance";
import { ToastHost } from "./components/toast";

function useTheme() {
  const [theme, setTheme] = useState<string>(document.documentElement.dataset.theme || "light");
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    applyThemeMode(theme); // v4 §一：TDesign theme-mode 与 data-theme 永远同步
    try { localStorage.setItem("lh-theme", theme); } catch { /* 隐私模式忽略 */ }
  }, [theme]);
  return { theme, toggle: () => setTheme(t => (t === "dark" ? "light" : "dark")) };
}

/** 大字模式（适老）：html[data-fontsize=large] + localStorage「lh-fontsize」持久 */
function useFontsize() {
  const [large, setLarge] = useState<boolean>(() => {
    const attr = document.documentElement.dataset.fontsize;
    if (attr) return attr === "large";
    try { return localStorage.getItem("lh-fontsize") === "large"; } catch { return false; }
  });
  useEffect(() => {
    if (large) {
      document.documentElement.dataset.fontsize = "large";
    } else {
      delete document.documentElement.dataset.fontsize;
    }
    try { localStorage.setItem("lh-fontsize", large ? "large" : "standard"); } catch { /* 隐私模式忽略 */ }
  }, [large]);
  return { large, toggle: () => setLarge(v => !v) };
}

const NAV = [
  { to: "/", label: "首页", end: true, no: "01" },
  { to: "/qa", label: "引用式问答", no: "02" },
  { to: "/research", label: "法律研究", no: "03" },
  { to: "/case", label: "案件分析", no: "04" },
  { to: "/review", label: "合同审查", no: "05" },
  { to: "/drafting", label: "文书起草", no: "06" },
  { to: "/compliance", label: "合规中心", no: "07" },
];

export default function App() {
  const { theme, toggle } = useTheme();
  const { large, toggle: toggleFontsize } = useFontsize();
  const sizeClass = useSizeClass(); // v3：narrow/regular 两形态（CSS 侧 html[data-sizeclass]）
  const isNarrow = sizeClass === "narrow";
  const location = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [location.pathname]);

  return (
    <div className="app-shell">
      <div id="app-backdrop" aria-hidden="true">
        <div className="blob b1" />
        <div className="blob b2" />
        <div className="blob b3" />
      </div>

      {/* v3：narrow 渲染移动壳层（紧凑栏 + tab 栏），桌面顶栏仅 regular */}
      {isNarrow ? (
        <MobileNav
          theme={theme}
          fontsizeLarge={large}
          onToggleTheme={toggle}
          onToggleFontsize={toggleFontsize}
        />
      ) : (
        <header className="topbar material-bar">
          <NavLink to="/" className="brand t-serif">
            <span className="brand-glyph">法</span>
            LegalHigh
          </NavLink>
          <nav className="nav">
            {NAV.map(n => (
              <NavLink key={n.to} to={n.to} end={n.end as never} className={({ isActive }) => (isActive ? "active" : "")}>
                <span className="t-mono" style={{ fontSize: 10, opacity: 0.55, marginRight: 4 }}>{n.no}</span>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div style={{ display: "flex", gap: "var(--sp-2)", flex: "none" }}>
            <button className="ghost small" onClick={toggleFontsize} title="切换大字模式（适老）" aria-label="切换大字模式" aria-pressed={large}>
              {large ? "标准" : "大字"}
            </button>
            <button className="ghost small" onClick={toggle} title="切换浅色/深色模式" aria-label="切换浅色/深色模式">
              {theme === "dark" ? "☀ 浅色" : "🌙 深色"}
            </button>
          </div>
        </header>
      )}

      <main className="page">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/qa" element={<QA />} />
          <Route path="/research" element={<Research />} />
          <Route path="/case" element={<CaseAnalysis />} />
          <Route path="/review" element={<Review />} />
          <Route path="/drafting" element={<Drafting />} />
          <Route path="/compliance" element={<Compliance />} />
        </Routes>
      </main>

      <footer className="footer material-thin">
        <div className="t-footnote muted">
          LegalHigh 原型 · 法律信息检索与文书辅助工具 · 输出不构成法律意见 · 重大事项请咨询执业律师或拨打 12348
        </div>
      </footer>

      {/* v4：反馈 toast（树内渲染，兼容 React 19；插件式 MessagePlugin 已弃用） */}
      <ToastHost />
    </div>
  );
}
