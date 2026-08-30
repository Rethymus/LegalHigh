import type { ReactNode } from "react";

/**
 * DocHeader（设计理念 v2 §五.1）：页面头三级披露 kicker → 衬线标题 → 白话导语，
 * meta 行为 mono「机器声音」，底部书眉双细线（--rule）。
 * 右侧可放 <Stamp>（调用方传入）。页面 DOM 第一元素应是它（deference：内容优先）。
 */
export function DocHeader({
  kicker,
  title,
  lede,
  meta,
  stamp,
}: {
  kicker: string;
  title: string;
  lede: string;
  meta?: string[];
  stamp?: ReactNode;
}) {
  return (
    <header className="doc-header">
      <div className="doc-header-main">
        <div className="kicker">{kicker}</div>
        <h1 className="doc-header-title t-serif t-title1">{title}</h1>
        {lede && <p className="doc-header-lede t-body">{lede}</p>}
        {meta && meta.length > 0 && (
          <div className="doc-header-meta t-mono t-caption">
            {meta.map((m, i) => (
              <span key={i}>{m}</span>
            ))}
          </div>
        )}
      </div>
      {stamp && <div className="doc-header-stamp">{stamp}</div>}
    </header>
  );
}

export default DocHeader;
