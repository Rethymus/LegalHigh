/**
 * TDesign 主题模式同步（设计规格 v4 §一）：
 * LegalHigh 以 `<html data-theme="dark|light">` 换肤；TDesign 以
 * `<html theme-mode="dark">` 属性换肤。两属性必须永远同步（v4 §四.3）。
 *
 * applyThemeMode(theme)：dark → 设置 theme-mode="dark"；light → 移除该属性
 * （TDesign light 走 :root 默认 token，无需属性存在）。
 */
export function applyThemeMode(theme: string): void {
  if (theme === "dark") {
    document.documentElement.setAttribute("theme-mode", "dark");
  } else {
    document.documentElement.removeAttribute("theme-mode");
  }
}

export default applyThemeMode;
