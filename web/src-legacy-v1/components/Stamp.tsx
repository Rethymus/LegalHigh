export type StampState = "draft" | "verified" | "issued";

const STATE_CN: Record<StampState, string> = {
  draft: "草稿",
  verified: "核验",
  issued: "签发",
};

/**
 * Stamp（设计理念 v2 §五.4）：印章状态，纯 CSS。
 * 64px 圆形双环（外 2px + 内 1px，间隔 2px），mono 小字（LH·STATE）+ 衬线状态两字；
 * draft = 灰印（--ink-3），verified/issued = 印泥红（--seal + --seal-soft 底），
 * 整体 rotate(-8deg)。--seal 只用于效力标记，禁止作装饰色。
 *
 * 定位约定：组件不带定位（64px 的 inline 元素），右上角绝对定位由调用方的
 * position:relative 容器包裹实现，例如：
 *   <div style={{ position: "relative" }}>
 *     （卡片内容）
 *     <span style={{ position: "absolute", top: 12, right: 16 }}>
 *       <Stamp state="draft" />
 *     </span>
 *   </div>
 */
export function Stamp({ state }: { state: StampState }) {
  return (
    <span
      className={`stamp ${state === "draft" ? "stamp-draft" : "stamp-seal"}`}
      role="img"
      aria-label={`印章：${STATE_CN[state]}`}
    >
      <span className="stamp-lh t-mono">LH·{state.toUpperCase()}</span>
      <span className="stamp-cn t-serif">{STATE_CN[state]}</span>
    </span>
  );
}

export default Stamp;
