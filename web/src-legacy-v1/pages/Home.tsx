import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { EvidenceChain, type EvidenceStep } from "../components/EvidenceChain";
import { Stamp } from "../components/Stamp";

type Health = Awaited<ReturnType<typeof api.health>>;
type Evals = Awaited<ReturnType<typeof api.evals>>;
type Compliance = Awaited<ReturnType<typeof api.compliance>>;

/**
 * 法典目录（设计理念 v2 §五.6 / §六）：TocRow 行式索引替代 feature-grid。
 * 一句白话只描述系统能力，不含统计数字。
 */
const VOLUMES = [
  { to: "/qa", volume: "第一编", name: "引用式问答", desc: "一句话，命中条文原文，检索不到就明说" },
  { to: "/research", volume: "第二编", name: "法律研究", desc: "三组查询扩展，备忘录可下载为 DOCX 报告" },
  { to: "/case", volume: "第三编", name: "案件分析", desc: "当事人 · 行为模式 · 请求权要件，三视角全程溯源" },
  { to: "/review", volume: "第四编", name: "合同审查", desc: "费用/账户/责任 14 审查点，批采纳驳回全留痕" },
  { to: "/drafting", volume: "第五编", name: "文书起草", desc: "律师函/合同/起诉状，生成即可交付，签发过 gate" },
  { to: "/compliance", volume: "第六编", name: "合规中心", desc: "红线清单、数据来源、评测看板，合规可查证" },
];

/** 三条铁律（语义引自 AGENTS.md 硬约束：不编造 / 引用不变量 / 人工核验 gate） */
const RULES = [
  { ordinal: "一", title: "不编造", desc: "查不到的内容明确标注「未核实」，绝不补一个像的。" },
  { ordinal: "二", title: "引用不变量", desc: "每条断言绑定条文原文与施行日期，来源可点开核对。" },
  { ordinal: "三", title: "人工核验", desc: "律师函未过执业律师核验签发，不得对外。" },
];

export default function Home() {
  const [health, setHealth] = useState<Health | null>(null);
  const [evals, setEvals] = useState<Evals | null>(null);
  const [compliance, setCompliance] = useState<Compliance | null>(null);

  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth(null));
    api.evals().then(setEvals).catch(() => setEvals(null));
    api.compliance().then(setCompliance).catch(() => setCompliance(null));
  }, []);

  /* 快照日期：优先取真实抓取日（compliance.data_sources[0].fetched_at），失败回退建站快照日 */
  const snapshotDate = compliance?.data_sources[0]?.fetched_at?.slice(0, 10) ?? "2026-08-29";

  /* 证据链节点：一切计数来自 API 实时返回，失败显示「—」占位 */
  const steps: EvidenceStep[] = [
    { label: "采集", sub: health ? `${health.articles.toLocaleString()} 条` : "—", tone: "ink" },
    {
      label: "检索",
      sub: `bm25 · hit@5 ${evals ? `${(evals.hit_at_5 * 100).toFixed(1)}%` : "—"}`,
      tone: "accent",
    },
    { label: "引用绑定", sub: "100% 条文级溯源", tone: "accent" },
    { label: "人工核验", sub: "律师 gate · 强制", tone: "seal" },
    { label: "留痕交付", sub: "append-only 审计", tone: "ink" },
  ];

  return (
    <div>
      {/* 1. Masthead 报头：mono kicker + 衬线大字 + mono 机器日期，右侧竖排格言 */}
      <section className="material-thin elev-1 home-masthead-panel">
        <header className="masthead masthead-panel">
          <div className="masthead-main">
            <div className="kicker">LEGALHIGH · 便民法律知识库原型</div>
            <h1 className="masthead-brand masthead-brand-lg t-serif">LegalHigh</h1>
            {/* v3（§二 Home）：narrow 下竖排格言不可用，品牌行下改横排小字 */}
            <div
              className="only-narrow t-mono"
              style={{ fontSize: 11, letterSpacing: "0.2em", color: "var(--ink-2)" }}
            >
              法为民所立 · 智为民所用
            </div>
            <div className="masthead-date">
              EST. 2026-08-29 · 语料快照 {snapshotDate} ·{" "}
              {health ? `${health.laws} 部法规` : "— 部法规"}
            </div>
          </div>
          <div className="masthead-motto only-regular">法为民所立 · 智为民所用</div>
        </header>
      </section>

      {/* 2. 宣言 hero：左右不对称（7fr 文字 / 5fr 留白 + 已签发印章旁注） */}
      <section className="home-hero">
        <div>
          <h2 className="home-hero-title">
            法律不该是少数人的特权。
            <br />
            我们把条文交还给每个人。
          </h2>
          <p className="home-hero-lede t-body">
            LegalHigh 以真实、可溯源的法条为底座：检索式回答只引用命中的条文原文，不生成法条之外的内容，
            检索不到就明说；同一底座支撑合同审查与文书起草。模型只是引擎，<b>harness 决定可靠性</b>。
          </p>
          <div className="home-hero-actions">
            <Link to="/qa"><button>开始提问</button></Link>
            <Link to="/compliance"><button className="ghost">查看合规声明</button></Link>
          </div>
        </div>
        <aside className="home-hero-aside">
          <Stamp state="issued" />
          <span className="home-hero-note">每一份产出都过这道 gate</span>
        </aside>
      </section>

      {/* 3. EvidenceChain 活体证据链：harness 摆在明面，计数实时 */}
      <section className="material-regular elev-2 home-chain-panel">
        <div className="home-section-head">
          <div className="kicker">HOW IT WORKS · 打开黑盒</div>
          <h3 className="home-section-title">每一条产出的完整流水线</h3>
        </div>
        <EvidenceChain steps={steps} />
      </section>

      {/* 4. 法典目录：行式索引，hover 行首 seal 竖线 */}
      <section className="home-toc">
        <div className="home-section-head">
          <div className="kicker">INDEX · 法典目录</div>
          <h3 className="home-section-title home-section-title-serif">六编</h3>
        </div>
        <nav className="toc-list" aria-label="模块目录">
          {VOLUMES.map((v, i) => (
            <Link key={v.to} to={v.to} className="toc-row">
              <span className="toc-volume">{v.volume}</span>
              <span className="toc-name">{v.name}</span>
              <span className="toc-desc">{v.desc}</span>
              <span className="toc-arrow">{String(i + 1).padStart(2, "0")} →</span>
            </Link>
          ))}
        </nav>
      </section>

      {/* 5. 不对称收尾区：左三条铁律（纯纸面）/ 右数据底座（实时） */}
      <section className="home-end">
        <div>
          <div className="home-section-head">
            <div className="kicker">RULES · 铁律</div>
            <h3 className="home-section-title home-section-title-serif">三條鐵律</h3>
          </div>
          <div className="rules-list">
            {RULES.map((r) => (
              <div className="rule-row" key={r.ordinal}>
                <span className="rule-ordinal" aria-hidden="true">{r.ordinal}</span>
                <div>
                  <h4 className="rule-title">{r.title}</h4>
                  <p className="rule-desc">{r.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <aside className="material-thin elev-1 src-panel">
          <div className="kicker">DATA · 语料来源（实时）</div>
          <div className="src-list">
            {compliance ? (
              compliance.data_sources.slice(0, 3).map((s) => (
                <div className="src-row" key={s.law_id}>
                  <span className="src-title">{s.title}</span>
                  <span>{s.article_count} 条</span>
                  <span>{s.fetched_at.slice(0, 10)}</span>
                </div>
              ))
            ) : (
              <div className="src-row">
                <span className="src-title">—</span>
                <span>—</span>
                <span>—</span>
              </div>
            )}
          </div>
          <div className="src-actions">
            <Link to="/compliance">
              <button className="ghost small">全部来源 → 合规中心</button>
            </Link>
          </div>
        </aside>
      </section>
    </div>
  );
}
