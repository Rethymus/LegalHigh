/* 设计系统页：把 docs/design/视觉系统规范.md 的参数变成可目检的样片。
   规范与实现不一致时，本页立即可见。 */
import DocHeader from "../components/DocHeader";

const NEUTRALS = ["n0", "n50", "n100", "n150", "n200", "n300", "n400", "n500", "n600", "n700", "n800", "n850", "n900", "n950", "n1000"];

const SEMANTICS = [
  { name: "accent", var: "--accent", use: "主操作/链接/焦点环" },
  { name: "red", var: "--red", use: "高风险" },
  { name: "orange", var: "--orange", use: "中风险" },
  { name: "yellow", var: "--yellow", use: "低风险" },
  { name: "green", var: "--green", use: "通过/已采纳" },
  { name: "teal", var: "--teal", use: "信息" },
  { name: "purple", var: "--purple", use: "文书/创作" },
];

const MATERIALS = [
  { cls: "material-ultrathin", name: "ultrathin", spec: "blur 24px · fill 46%/42% · 大面积背景层" },
  { cls: "material-thin", name: "thin", spec: "blur 28px · fill 58%/55% · 次级卡片" },
  { cls: "material-regular", name: "regular", spec: "blur 32px · fill 72%/68% · 标准面板" },
  { cls: "material-thick", name: "thick", spec: "blur 36px · fill 84%/80% · 浮层卡片" },
  { cls: "material-bar", name: "bar", spec: "blur 40px · fill 90%/88% · 顶栏/底栏" },
];

const SHADOWS = ["--shadow-1", "--shadow-2", "--shadow-3", "--shadow-4"];
const RADII = ["--r-xs", "--r-s", "--r-m", "--r-l", "--r-xl"];

const TYPE_ROWS = [
  ["t-large-title", "34/41 · 700", "大标题"],
  ["t-title1", "28/34 · 700", "页面标题"],
  ["t-title2", "22/28 · 700", "区块标题"],
  ["t-title3", "20/25 · 600", "卡片标题"],
  ["t-headline", "17/24 · 600", "小节标题"],
  ["t-body", "17/24 · 400", "正文"],
  ["t-subhead", "15/20", "辅助正文"],
  ["t-footnote", "13/18", "脚注"],
  ["t-caption", "12/16", "标注"],
];

export default function DesignSystem() {
  const v = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  return (
    <div>
      <DocHeader
        kicker="LEGALHIGH · MODULE 07 · DESIGN SYSTEM"
        title="纸与玻璃"
        lede="设计语言 v2「纸与玻璃」的 token 验收面：色阶、材质、阴影、字阶与 tokens.css / materials.css 一一对应，切换明暗模式观察同一套 token 的双模式取值。"
        meta={["tokens v1+v2", "材质五级", "明暗双模式"]}
      />

      <section className="ds-section">
        <h2 className="t-title3">① 中性色阶（Apple 风格偏冷纯灰，{NEUTRALS.length} 级）</h2>
        <div className="swatch-grid">
          {NEUTRALS.map(n => (
            <div key={n} className="swatch">
              <div className="sw" style={{ background: `var(--${n})`, borderBottom: "0.5px solid var(--hairline)" }} />
              <div className="swl"><b>--{n}</b><br /><code>{v(`--${n}`)}</code></div>
            </div>
          ))}
        </div>
      </section>

      <section className="ds-section">
        <h2 className="t-title3">② 语义色（iOS system colors，light/dark 各自取值）</h2>
        <div className="swatch-grid">
          {SEMANTICS.map(s => (
            <div key={s.name} className="swatch">
              <div className="sw" style={{ background: `var(${s.var})` }} />
              <div className="swl"><b>--{s.name}</b><br /><code>{v(s.var)}</code><br />{s.use}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="ds-section">
        <h2 className="t-title3">③ 材质层五级（真实屏幕采样模糊：注意面板背后光斑透过玻璃的层次）</h2>
        <div className="material-samples">
          {MATERIALS.map(m => (
            <div key={m.cls} className={`material-sample ${m.cls} elev-2`}>
              <b>.{m.cls.replace("-", "-")}</b>
              <span>{m.spec}</span>
              <span className="faint">内高光 + hairline 边框 + 顶部光带</span>
            </div>
          ))}
        </div>
        <p className="t-caption faint" style={{ marginTop: 8 }}>
          实现配方：backdrop-filter: blur() saturate()（屏幕采样）+ 半透明叠色 fill + inset 顶部高光 + 0.5px hairline
          + ::before 顶部光带；高对比模式自动转实体色。
        </p>
      </section>

      <section className="ds-section">
        <h2 className="t-title3">④ 阴影四档（dark 模式更重、环境半径更大）</h2>
        <div className="material-samples">
          {SHADOWS.map(s => (
            <div key={s} className="material-sample material-regular" style={{ boxShadow: `var(${s})`, borderRadius: "var(--r-l)" }}>
              <b>{s}</b>
              <span>{v(s)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="ds-section">
        <h2 className="t-title3">⑤ 圆角 / 焦点环 / 徽章</h2>
        <div className="panel material-thin elev-1">
          <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
            {RADII.map(r => (
              <div key={r} style={{ textAlign: "center" }}>
                <div style={{ width: 72, height: 48, background: "var(--accent-soft)", border: "1.5px solid var(--accent)", borderRadius: `var(${r})` }} />
                <code className="t-caption faint">{r}={v(r)}</code>
              </div>
            ))}
          </div>
          <hr className="sep" />
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <button>主按钮</button>
            <button className="subtle">次按钮</button>
            <button className="ghost">幽灵</button>
            <span className="badge high">● 高风险</span>
            <span className="badge medium">● 中风险</span>
            <span className="badge low">● 低风险</span>
            <span className="badge ok">● 通过</span>
            <span className="badge info">信息</span>
            <span className="t-caption faint">← Tab 键盘焦点到按钮上可看到统一焦点环（0 0 0 3.5px accent @45%）</span>
          </div>
        </div>
      </section>

      <section className="ds-section">
        <h2 className="t-title3">⑥ 字阶（iOS 公开字号/行高，中文栈 PingFang SC / HarmonyOS / 雅黑）</h2>
        <div className="type-specimen material-thin elev-1">
          {TYPE_ROWS.map(([cls, spec, use]) => (
            <div key={cls} className="type-row">
              <code>{cls} · {spec} · {use}</code>
              <span className={cls}>法律 Aa 民法典 123</span>
            </div>
          ))}
        </div>
      </section>

      {/* v4（§三 DesignSystem）：token 验收面保留原样，仅声明控件层来源 */}
      <div className="t-caption faint" style={{ textAlign: "center", padding: "0 0 var(--sp-6)" }}>
        控件层：TDesign React 1.18 · 主题桥 td-bridge.css
      </div>
    </div>
  );
}
