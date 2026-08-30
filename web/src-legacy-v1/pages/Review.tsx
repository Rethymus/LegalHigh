import { useState } from "react";
import { Button, Input, Tag, Textarea } from "tdesign-react";
import { notify } from "../components/toast";
import { api, type Finding, type ReviewRecord } from "../lib/api";
import { RiskBadge } from "../components/CitationCard";
import DocHeader from "../components/DocHeader";
import MobileActionBar from "../components/MobileActionBar";
import { Stamp, type StampState } from "../components/Stamp";

const SAMPLE = `服务合同
甲方：某某商贸有限公司　　乙方：某某设计工作室
第一条 服务内容：乙方为甲方提供品牌视觉设计服务，具体以附件一《设计需求书》为准。
第二条 费用与支付：合同总价款人民币 100000 元。乙方逾期交付的，每逾期一日按合同总价的 5% 支付违约金。甲方有权单方调整收费标准，无需通知乙方。
第三条 支付账户：甲方应将款项汇入乙方指定的第三方个人账户（户主为乙方负责人亲属）。
第四条 免责条款：乙方对服务过程中造成的任何损失概不负责；本协议最终解释权归甲方所有。
第五条 自动续费：服务期满后自动续费一年，费用照常从甲方账户扣除。
第六条 定金：本合同签订时甲方支付定金，金额为合同总价的 30%。`;

const CATEGORY_LABEL = { fee: "费用条款", account: "账户条款", liability: "责任条款" } as const;
const RISK_ORDER = { high: 0, medium: 1, low: 2 } as const;

/** 批注状态 → 印章效力：全部待复核=草稿；存在采纳/修改=核验；全部终态=签发 */
function stampOf(record: ReviewRecord): StampState {
  const states = record.annotations.map(a => a.state);
  if (states.length === 0 || states.every(s => s === "pending")) return "draft";
  if (states.some(s => s === "adopted" || s === "amended")) return "verified";
  return "issued";
}

/* v4（§二 Review）：状态徽章换 TDesign Tag（purple 系库内无对应 theme，用 default + 内联 var(--purple)） */
function StateTag({ state }: { state: string }) {
  const label = { pending: "待复核", adopted: "已采纳", amended: "已修改", rejected: "已驳回" }[state as never] as string;
  if (state === "amended") return <Tag theme="default" variant="light" style={{ color: "var(--purple)" }}>{label}</Tag>;
  const theme = state === "pending" ? "warning" : state === "adopted" ? "success" : "danger";
  return <Tag theme={theme} variant="light">{label}</Tag>;
}

/** 批注操作留痕文案（v4 §二：操作反馈 toast） */
const ACTION_MSG: Record<string, { kind: "success" | "info" | "warning"; text: string }> = {
  adopt: { kind: "success", text: "已采纳 · 已留痕" },
  amend: { kind: "success", text: "已修改 · 已留痕" },
  reject: { kind: "warning", text: "已驳回 · 已留痕" },
  reopen: { kind: "info", text: "已恢复待复核 · 已留痕" },
};

function FindingCard({
  f,
  state,
  actor,
  onAction,
}: {
  f: Finding;
  state: { state: string; amended_text: string | null; actor: string; updated_at: string };
  actor: string;
  onAction: (action: string, amended?: string) => void;
}) {
  const [amending, setAmending] = useState(false);
  const [amendText, setAmendText] = useState(state.amended_text || "");

  return (
    <div className={`finding risk-${f.risk}`}>
      <div className="finding-head">
        <h4>{f.checkpoint_title}</h4>
        <RiskBadge risk={f.risk} />
        <span className="badge neutral">{CATEGORY_LABEL[f.category]}</span>
        <StateTag state={state.state} />
      </div>
      <div className="finding-block">
        <span className="label">位置：{f.clause_label}{f.clause_heading ? ` · ${f.clause_heading}` : ""}</span>
        {f.excerpt && <blockquote style={{ margin: "4px 0 8px", padding: "6px 12px", borderLeft: "3px solid var(--n300)", color: "var(--label-secondary)", fontSize: 13 }}>{f.excerpt}</blockquote>}
        <div>{f.detail}</div>
        <div style={{ marginTop: 8 }}><b>建议：</b>{f.suggestion}</div>
        {f.citation ? (
          <div style={{ marginTop: 8 }}>
            <span className="label">依据条文（{f.citation.status}，施行 {f.citation.effective_date ?? "见文本"}）</span>
            <div style={{ padding: "8px 12px", borderRadius: 10, background: "var(--accent-soft)", fontSize: 13 }}>
              《{f.citation.law_title}》{f.citation.article_label}：{f.citation.text.length > 120 ? f.citation.text.slice(0, 120) + "…" : f.citation.text}
              <a href={f.citation.source_url} target="_blank" rel="noreferrer" style={{ color: "var(--accent)", marginLeft: 6 }}>原文↗</a>
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 8 }}><span className="badge neutral">实务建议 · 不引用法条</span></div>
        )}
      </div>
      <div className="finding-actions">
        {/* v4（§二 Review）：批注操作按钮换 TDesign Button size=small */}
        {state.state === "pending" && (
          <>
            <Button size="small" theme="default" onClick={() => onAction("adopt")}>采纳</Button>
            <Button size="small" variant="outline" theme="default" onClick={() => setAmending(v => !v)}>修改</Button>
            <Button size="small" theme="danger" variant="outline" onClick={() => onAction("reject")}>驳回</Button>
          </>
        )}
        {state.state === "rejected" && (
          <Button size="small" ghost theme="primary" onClick={() => onAction("reopen")}>恢复待复核</Button>
        )}
        <span className="t-caption faint" style={{ marginLeft: "auto" }}>
          最近操作：{state.actor} · {state.updated_at.replace("T", " ").slice(0, 16)}
        </span>
      </div>
      {amending && (
        <div style={{ marginTop: 10 }}>
          <Textarea
            value={amendText}
            onChange={v => setAmendText(v)}
            autosize={{ minRows: 2, maxRows: 5 }}
            placeholder={`以 ${actor} 身份输入修改后的批注意见…`}
          />
          <Button size="small" theme="default" style={{ marginTop: 8 }} onClick={() => { onAction("amend", amendText); setAmending(false); }}>提交修改</Button>
        </div>
      )}
    </div>
  );
}

export default function Review() {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [record, setRecord] = useState<ReviewRecord | null>(null);
  const [audit, setAudit] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actor, setActor] = useState("王律师");

  async function analyzeAndSave() {
    setLoading(true);
    setError(null);
    setAudit([]);
    try {
      const saved = await api.createReview(title.trim() || null, text);
      setRecord(await api.getReview(saved.review_id));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      // v4 §二：错误双通道——页内 finding 卡保留 + 顶部 toast
      void notify(msg, "error");
    } finally {
      setLoading(false);
    }
  }

  async function act(findingId: string, action: string, amended?: string) {
    if (!record) return;
    try {
      await api.transitionAnnotation(record.id, findingId, action, actor, amended);
      const [fresh, aud] = await Promise.all([api.getReview(record.id), api.reviewAudit(record.id)]);
      setRecord(fresh);
      setAudit(aud.entries.map(e => {
        const payload = (() => { try { return JSON.parse(e.payload_json); } catch { return {}; } })();
        const detail = payload.to ? `（${payload.from} → ${payload.to}）` : "";
        return `${e.ts.replace("T", " ").slice(0, 16)}  [${e.entity_type}] ${e.actor} ${e.action}${detail}`;
      }));
      // v4 §二：操作反馈 toast（文案见 ACTION_MSG）
      const msg = ACTION_MSG[action];
      if (msg) void notify(msg.text, msg.kind);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      void notify(msg, "error");
    }
  }

  const findings = record
    ? [...record.result.findings].sort((a, b) => RISK_ORDER[a.risk] - RISK_ORDER[b.risk])
    : [];
  const annOf = (id: string) =>
    record?.annotations.find(a => a.finding_id === id) ?? { state: "pending", amended_text: null, actor: "system", updated_at: "" };

  /* v3（§二 Review）：主 CTA 双渲染共用同一 handler/disabled/label（逻辑零复制）
     v4（§三.1）：等待态用 Button loading prop 表达，文字不再变化 */
  const reviewDisabled = text.trim().length < 30;
  const reviewLabel = record ? "重新分析并保存" : "开始审查";

  return (
    <div>
      <DocHeader
        kicker="LEGALHIGH · MODULE 04 · CONTRACT REVIEW"
        title="费用 · 账户 · 责任"
        lede="粘贴合同文本，系统按 14 个审查点（费用 / 账户 / 责任三类，范式对齐 CUAD 41 类条款标注）逐条检测，输出【风险等级｜位置｜依据条文｜建议改法】，支持律师逐条「采纳 / 修改 / 驳回」，全部操作写入审计日志。"
        meta={["14 审查点", "范式对齐 CUAD", "审计 append-only"]}
      />

      <div className="review-grid" style={{ marginTop: "var(--sp-5)" }}>
        <section className="panel material-regular elev-1">
          <div className="field">
            <label>合同名称（可选）</label>
            {/* v4 §二：input 换 TDesign Input（clearable） */}
            <Input value={title} onChange={v => setTitle(v as string)} clearable placeholder="如：设计服务合同" />
          </div>
          <div className="field">
            <label>合同文本</label>
            {/* v4 §二：textarea 换 TDesign Textarea（autosize） */}
            <Textarea value={text} onChange={v => setText(v)} autosize={{ minRows: 6, maxRows: 14 }} placeholder="粘贴合同全文…" />
          </div>
          <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap" }}>
            <Button className="only-regular" theme="primary" loading={loading} disabled={reviewDisabled} onClick={analyzeAndSave}>
              {reviewLabel}
            </Button>
            <Button variant="outline" theme="default" onClick={() => { setText(SAMPLE); setTitle("设计服务合同（示例）"); }}>填入示例合同</Button>
          </div>
          {error && <div className="finding risk-high" style={{ marginTop: 12 }}><b>出错了：</b>{error}</div>}

          {record && (
            <>
              <hr className="sep" />
              <div className="field">
                <label>操作人（模拟律师身份，留痕用）</label>
                {/* v4 §二：input 换 TDesign Input（库 Input 不透传 id，label 免绑即可） */}
                <Input value={actor} onChange={v => setActor(v as string)} />
              </div>
              <h3 className="t-title3">审计日志（append-only）</h3>
              {audit.length === 0 && <div className="t-caption faint">暂无操作记录——对右侧意见执行采纳/修改/驳回后，这里会出现不可篡改的操作留痕。</div>}
              <ul className="audit-list">
                {audit.map((a, i) => <li key={i}><code style={{ fontSize: 12 }}>{a}</code></li>)}
              </ul>
            </>
          )}
        </section>

        <section>
          {record && (
            <div style={{ position: "relative", display: "flex", alignItems: "center", gap: "var(--sp-3)", minHeight: 64, marginBottom: "var(--sp-2)" }}>
              <span className="t-caption muted t-mono">
                审查记录 {record.id} · 创建于 {record.created_at.replace("T", " ").slice(0, 16)}
              </span>
              <span style={{ marginLeft: "auto" }}>
                <Stamp state={stampOf(record)} />
              </span>
            </div>
          )}
          {record && (
            <div className="summary-strip">
              <div className="stat material-thin elev-1"><b style={{ color: "var(--red)" }}>{record.result.summary.high}</b><span>高风险</span></div>
              <div className="stat material-thin elev-1"><b style={{ color: "var(--orange)" }}>{record.result.summary.medium}</b><span>中风险</span></div>
              <div className="stat material-thin elev-1"><b style={{ color: "var(--yellow)" }}>{record.result.summary.low}</b><span>低风险</span></div>
              <div className="stat material-thin elev-1"><b>{record.result.engine_meta.clause_count}</b><span>识别条款数</span></div>
            </div>
          )}
          {findings.map(f => (
            <FindingCard key={f.id} f={f} state={annOf(f.id) as never} actor={actor} onAction={(a, t) => act(f.id, a, t)} />
          ))}
          {record && findings.length === 0 && (
            <div className="no-answer t-body">未触发任何审查点——本合同未检出明显风险表述。此结果不代表无法律风险，仍建议执业律师复核。</div>
          )}
        </section>
      </div>

      {/* v3（§二 Review）：narrow 下主 CTA 进底部动作栏；本页无 src-table，无需 table-scroll */}
      <MobileActionBar>
        <Button theme="primary" loading={loading} disabled={reviewDisabled} onClick={analyzeAndSave}>{reviewLabel}</Button>
      </MobileActionBar>
    </div>
  );
}
