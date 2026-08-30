import type { Citation } from "../lib/api";
import { Tag } from "tdesign-react";

/**
 * RiskBadge（v4 §二 控件替换表）：内部渲染换 TDesign Tag（variant=light，
 * 主题桥映射 risk 色），导出签名与 v1 完全一致，调用方零改动。
 */
export function RiskBadge({ risk }: { risk: "high" | "medium" | "low" }) {
  const map = { high: "高", medium: "中", low: "低" } as const;
  return (
    <Tag
      theme={risk === "high" ? "danger" : risk === "medium" ? "warning" : "success"}
      variant="light"
    >
      ● {map[risk]}风险
    </Tag>
  );
}

/** source_kind → 中文（未登记的 kind 原样展示，不编造） */
const SOURCE_KIND_CN: Record<string, string> = {
  "official-gazette-republication": "政府网公报转载",
  "wikisource-transcription": "维基文库转写核对",
};

/**
 * CitationCard v2「法典页」（设计理念 v2 §五.3）：
 * --paper-2 纸面 + 顶部书眉双细线 + 底部脚注细线；衬线条号 + mono 脚注行。
 * 去玻璃 blur（纸不透玻璃），阴影保留 elev-1。签名与 v1 完全一致。
 */
export function CitationCard({ c, compact }: { c: Citation; compact?: boolean }) {
  const sourceCn = SOURCE_KIND_CN[c.source_kind] ?? c.source_kind;
  return (
    <article className="cite-card elev-1">
      <header className="cite-head">
        <span className="cite-article t-serif">{c.article_label}</span>
        <span className="cite-law">{c.law_title}</span>
      </header>
      {c.chapter && <div className="cite-chapter t-mono t-caption">{c.chapter}</div>}
      <p className={`cite-text t-body ${compact ? "clamp" : ""}`}>{c.text}</p>
      <footer className="cite-meta t-mono t-caption">
        <span className="cite-meta-facts">
          {c.effective_date && <span>施行 {c.effective_date}</span>}
          <span>{c.status}</span>
          <span>来源 {sourceCn}</span>
        </span>
        <a href={c.source_url} target="_blank" rel="noreferrer" className="cite-link">原文 ↗</a>
      </footer>
    </article>
  );
}

export default CitationCard;
