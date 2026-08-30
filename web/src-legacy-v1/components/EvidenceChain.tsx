import { Fragment } from "react";

export interface EvidenceStep {
  label: string;
  sub: string;
  /** ink = 墨（默认）；seal = 印泥红（人工节点专用）；accent = 蓝（检索/AI 节点） */
  tone?: "ink" | "seal" | "accent";
}

const SERIF_NUMS = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"];

/**
 * EvidenceChain（设计理念 v2 §五.2）：harness 可视化。
 * 横向节点流（窄屏自动换行），每节点 = 衬线序号圈 + 名称(sans 600) + mono 副标(11px)；
 * 节点间 hairline 连接线带 mono → 字符。tone 决定序号圈描边色。
 * 外层是否包 .material-thin.elev-1 面板由调用方决定，组件本身不带面板。
 */
export function EvidenceChain({ steps }: { steps: EvidenceStep[] }) {
  return (
    <ol className="evidence-chain" aria-label="证据链：从采集到留痕的处理流程">
      {steps.map((s, i) => {
        const tone = s.tone ?? "ink";
        return (
          <Fragment key={`${s.label}-${i}`}>
            {i > 0 && (
              <li className="evidence-link t-mono" aria-hidden="true">→</li>
            )}
            <li className={`evidence-node tone-${tone}`}>
              <span className="evidence-num t-serif" aria-hidden="true">
                {SERIF_NUMS[i] ?? i + 1}
              </span>
              <span className="evidence-body">
                <span className="evidence-label">{s.label}</span>
                <span className="evidence-sub t-mono">{s.sub}</span>
              </span>
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}

export default EvidenceChain;
