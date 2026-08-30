import { useState } from "react";
import { Button, Input, Select, Textarea } from "tdesign-react";
import { notify } from "../components/toast";
import { api, type CaseAnalysis, type CaseBody } from "../lib/api";
import DocHeader from "../components/DocHeader";
import MobileActionBar from "../components/MobileActionBar";
import { EvidenceChain, type EvidenceStep } from "../components/EvidenceChain";

const CLAIMS: Array<{ id: string; name: string; desc: string }> = [
  { id: "loan_repayment", name: "民间借贷·返还借款请求权", desc: "借贷合意 · 款项交付 · 期限届满催告 · 利率合规 · 诉讼时效（民法典 667/668/675/679/680/188）" },
  { id: "breach_damage", name: "违约责任·赔偿请求权", desc: "违约行为 · 损失赔偿 · 违约金调整（民法典 577/585 组合）" },
  { id: "consumer_fraud", name: "消费欺诈·惩罚性赔偿请求权", desc: "欺诈行为 · 三倍赔偿（消费者权益保护法 55 条为主线）" },
  { id: "wage_claim", name: "劳动报酬·支付请求权", desc: "劳动报酬支付 · 拖欠事实（劳动合同法 30 条为主线，82 条兜底）" },
];

const SAMPLE_TITLE = "张三与李四民间借贷纠纷";
const SAMPLE_TEXT = "2024年6月1日，贷款人李四与借款人张三签订借条一份，约定借款金额50000元，借期六个月，年利率 24%，到期一次性还本付息。当日李四即通过银行转账方式向张三支付50000元。期限届满后张三逾期未还，李四分别于2024年12月10日、2025年1月5日两次催告，张三仅口头承诺延期还款但始终未履行。2025年2月1日李四发出最后警告：三日内不还就起诉！！并申请强制执行！！张三则辩称利息过高，同意分期归还本金，愿意协商和解。";

const LEVEL_BADGE = {
  high: { cls: "high", label: "高" },
  medium: { cls: "medium", label: "中" },
  low: { cls: "low", label: "低" },
  absent: { cls: "neutral", label: "未检出" },
} as const;

/** 原文片段引用（可溯源：均为案情原文切片） */
function Span({ text }: { text: string }) {
  return (
    <blockquote style={{ margin: "4px 0 8px", padding: "6px 12px", borderLeft: "3px solid var(--n300)", color: "var(--label-secondary)", fontSize: 13, wordBreak: "break-word" }}>
      {text}
    </blockquote>
  );
}

/** 证据链（设计理念 v2 §五.2）：③ 数字防御式取自 summary 与 references 长度 */
function caseSteps(result: CaseAnalysis): EvidenceStep[] {
  const supported = result.summary?.claim_supported ?? 0;
  const total = result.claim?.elements?.length ?? 5;
  const refCount = (result.references ?? []).length;
  return [
    { label: "采集", sub: "案情原文 · 本页内存", tone: "ink" },
    { label: "检索", sub: "关键词级匹配", tone: "accent" },
    { label: "绑定", sub: `要件 ${supported}/${total} + 引用 ${refCount} 条`, tone: "accent" },
    { label: "人工", sub: "律师可复核", tone: "seal" },
    { label: "留痕", sub: "不落库 · 报告可下载", tone: "ink" },
  ];
}

export default function CaseAnalysis() {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [claimId, setClaimId] = useState<string>(CLAIMS[0].id);
  const [result, setResult] = useState<CaseAnalysis | null>(null);
  const [lastBody, setLastBody] = useState<CaseBody | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function analyze() {
    if (text.trim().length < 30) return;
    const body: CaseBody = { title: title.trim() || null, case_text: text, claim_id: claimId };
    setLoading(true);
    setError(null);
    try {
      const res = await api.caseAnalyze(body);
      setResult(res);
      setLastBody(body);
      // v4 §二：完成反馈（要件 x/y 取自实际返回，防御式取值同 caseSteps）
      void notify(
        `分析完成 · 要件 ${res.summary?.claim_supported ?? 0}/${res.claim?.elements?.length ?? 0}`,
        "success",
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      // v4 §二：错误双通道——页内 finding 卡保留 + 顶部 toast
      void notify(msg, "error");
    } finally {
      setLoading(false);
    }
  }

  async function download() {
    if (!lastBody) return;
    setDownloading(true);
    setError(null);
    try {
      await api.caseReportDownload(lastBody);
      void notify("案件分析报告 DOCX 已下载", "success");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      void notify(msg, "error");
    } finally {
      setDownloading(false);
    }
  }

  const parties = result?.profile.parties ?? [];
  const timeline = result?.profile.timeline ?? [];
  const indicators = result?.behavior.indicators ?? [];
  const elements = result?.claim.elements ?? [];
  const claim = CLAIMS.find(c => c.id === claimId) ?? CLAIMS[0];

  /* v3（§二 CaseAnalysis）：主 CTA 双渲染共用同一 handler/disabled/label（逻辑零复制）
     v4（§三.1）：等待态用 Button loading prop 表达，文字不再变化 */
  const analyzeDisabled = text.trim().length < 30;

  return (
    <div>
      <DocHeader
        kicker="LEGALHIGH · MODULE 03 · CASE ANALYSIS"
        title="人像 · 行为 · 要件"
        lede="粘贴案情文本，选择请求权类型，系统做完全无状态的确定性分析（不写库、不落盘）：当事人人像、沟通行为模式（表层语言特征，非心理诊断）、请求权要件矩阵。每个结论都附案情原文片段或语料条文，抽不到的线索如实标注「未检出 / 待补充」。"
        meta={["无状态 · 不落库", "关键词级匹配", "非心理学诊断"]}
      />

      <div className="review-grid" style={{ marginTop: "var(--sp-5)" }}>
        <section className="panel material-regular elev-1" style={{ minWidth: 0 }}>
          <div className="field">
            <label>案件标题（可选）</label>
            {/* v4 §二：input 换 TDesign Input（clearable） */}
            <Input value={title} onChange={v => setTitle(v as string)} clearable placeholder="如：张三与李四民间借贷纠纷" />
          </div>
          <div className="field">
            <label>案情文本（至少 30 字，仅在本页内存中分析，不保存）</label>
            {/* v4 §二：textarea 换 TDesign Textarea（autosize） */}
            <Textarea
              value={text}
              onChange={v => setText(v)}
              autosize={{ minRows: 6, maxRows: 14 }}
              placeholder="粘贴案情、沟通记录或纠纷经过…"
            />
            <div className="t-caption faint" style={{ marginTop: 4 }}>
              当前 {text.trim().length} 字{text.trim().length < 30 ? "（不足 30 字，暂不能开始分析）" : ""}
            </div>
          </div>
          <div className="field">
            <label>请求权类型</label>
            {/* v4 §二：select 换 TDesign Select（label 同现有四选项） */}
            <Select
              value={claimId}
              onChange={v => setClaimId(v as string)}
              options={CLAIMS.map(c => ({ label: c.name, value: c.id }))}
            />
            <div className="t-caption faint" style={{ marginTop: 4 }}>{claim.desc}</div>
          </div>
          <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap" }}>
            <Button className="only-regular" theme="primary" loading={loading} disabled={analyzeDisabled} onClick={analyze}>
              开始分析
            </Button>
            <Button variant="outline" theme="default" onClick={() => { setText(SAMPLE_TEXT); setTitle(SAMPLE_TITLE); }}>填入示例案情</Button>
          </div>
          {error && <div className="finding risk-high" style={{ marginTop: 12 }}><b>出错了：</b>{error}</div>}
        </section>

        <section style={{ minWidth: 0 }}>
          {!result && !loading && (
            <div className="no-answer t-body">左侧粘贴案情（或填入示例）并选择请求权类型后，这里会展示四个分析分区：当事人人像、沟通行为模式、法律要件矩阵与综合提示。</div>
          )}

          {result && (
            <>
              <div className="panel material-thin elev-1" style={{ marginBottom: "var(--sp-3)" }}>
                <EvidenceChain steps={caseSteps(result)} />
              </div>

              <div className="t-caption faint" style={{ marginBottom: "var(--sp-3)" }}>
                {result.title} · 生成于 {result.generated_at} · 请求权：{result.claim.claim.name}（{result.claim.claim.id}）
              </div>

              <section className="panel material-regular elev-1" style={{ marginBottom: "var(--sp-4)" }}>
                <h3 className="t-title3" style={{ marginTop: 0 }}>① 当事人人像</h3>
                {parties.length === 0 && <div className="t-caption faint">未从文本中抽取出当事人角色线索（不推测）。</div>}
                {parties.map((p, i) => (
                  <div key={i} className="panel material-thin elev-1" style={{ marginBottom: "var(--sp-3)" }}>
                    <div className="finding-head">
                      <span className="badge info">{p.role}</span>
                      <span className="t-caption faint">{p.name_hint ?? "未识别到姓名线索"}</span>
                    </div>
                    <div className="finding-block">
                      {p.mentions.length > 0 && (
                        <>
                          <span className="label">提及 {p.mentions.length} 处</span>
                          {p.mentions.map((m, j) => <Span key={j} text={m.excerpt} />)}
                        </>
                      )}
                      {p.behaviors.length > 0 && (
                        <>
                          <span className="label">行为</span>
                          {p.behaviors.map((b, j) => (
                            <div key={j} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 6, flexWrap: "wrap" }}>
                              <span className="badge neutral">{b.type}</span>
                              <span style={{ fontSize: 13, color: "var(--label-secondary)", flex: 1, minWidth: 0, wordBreak: "break-word" }}>{b.excerpt}</span>
                            </div>
                          ))}
                        </>
                      )}
                      {p.mentions.length === 0 && p.behaviors.length === 0 && (
                        <div className="t-caption faint">仅有角色词，无更多片段。</div>
                      )}
                    </div>
                  </div>
                ))}
                {timeline.length > 0 && (
                  <>
                    <span className="label t-caption faint">全局时间线（{timeline.length} 个日期线索）</span>
                    {timeline.map((t, j) => (
                      <div key={j} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 6, flexWrap: "wrap" }}>
                        <span className="badge neutral">{t.date_hint}</span>
                        <span style={{ fontSize: 13, color: "var(--label-secondary)", flex: 1, minWidth: 0, wordBreak: "break-word" }}>{t.excerpt}</span>
                      </div>
                    ))}
                  </>
                )}
              </section>

              <section className="panel material-regular elev-1" style={{ marginBottom: "var(--sp-4)" }}>
                <h3 className="t-title3" style={{ marginTop: 0 }}>② 沟通行为模式</h3>
                <div className="premise"><b>⚠</b> {result.behavior.fixed_disclaimer}</div>
                {indicators.filter(i => i.level === "absent").map(ind => (
                  <div key={ind.id} style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", padding: "4px 0", flexWrap: "wrap" }}>
                    <span className="t-subhead muted">{ind.title}</span>
                    <span className="badge neutral">{LEVEL_BADGE[ind.level].label}</span>
                  </div>
                ))}
                {indicators.filter(i => i.level !== "absent").map(ind => (
                  <div key={ind.id} className={`finding risk-${ind.level}`}>
                    <div className="finding-head">
                      <h4>{ind.title}</h4>
                      <span className={`badge ${LEVEL_BADGE[ind.level].cls}`}>● {LEVEL_BADGE[ind.level].label}</span>
                    </div>
                    {ind.spans.map((s, j) => <Span key={j} text={s.excerpt} />)}
                    <div className="t-subhead muted" style={{ marginTop: 8 }}>{ind.note}</div>
                    <div className="t-subhead muted" style={{ marginTop: 4 }}><b>应对参考：</b>{ind.advice}</div>
                  </div>
                ))}
                {indicators.every(i => i.level === "absent") && (
                  <div className="t-caption faint">全部指标均未检出。</div>
                )}
              </section>

              <section className="panel material-regular elev-1" style={{ marginBottom: "var(--sp-4)" }}>
                <h3 className="t-title3" style={{ marginTop: 0 }}>③ 法律要件矩阵 · {result.claim.claim.name}</h3>
                {elements.map(el => (
                  <div key={el.id} className={`finding ${el.status === "unverified" ? "risk-medium" : ""}`}>
                    <div className="finding-head">
                      <h4>{el.id} · {el.title}</h4>
                      {el.status === "supported"
                        ? <span className="badge ok">● 有文本支持</span>
                        : <span className="badge neutral">● 待补充线索</span>}
                    </div>
                    {el.evidence_spans.length > 0
                      ? el.evidence_spans.map((s, j) => <Span key={j} text={s.excerpt} />)
                      : <div className="t-caption faint" style={{ margin: "6px 0" }}>案情文本中未检出相关线索（保留要件，不作推断）。</div>}
                    {el.citations.map((cit, j) => (
                      <div key={j} style={{ padding: "8px 12px", borderRadius: 10, background: "var(--accent-soft)", fontSize: 13, marginTop: 6, wordBreak: "break-word" }}>
                        《{cit.law_title}》{cit.article_label}（{cit.status}{cit.effective_date ? ` · 施行 ${cit.effective_date}` : ""}）
                        <a href={cit.source_url} target="_blank" rel="noreferrer" style={{ color: "var(--accent)", marginLeft: 6 }}>原文↗</a>
                      </div>
                    ))}
                  </div>
                ))}
                <div className="t-caption muted" style={{ marginTop: "var(--sp-2)" }}>{result.claim.summary.overall}</div>
              </section>

              <section className="panel material-regular elev-1">
                <h3 className="t-title3" style={{ marginTop: 0 }}>④ 综合提示</h3>
                <div className="summary-strip">
                  <div className="stat material-thin elev-1"><b>{result.summary.profile_parties}</b><span>当事人角色</span></div>
                  <div className="stat material-thin elev-1"><b>{result.summary.behavior_active}</b><span>活跃行为指标</span></div>
                  <div className="stat material-thin elev-1"><b style={{ color: "var(--green)" }}>{result.summary.claim_supported}</b><span>要件有文本支持</span></div>
                  <div className="stat material-thin elev-1"><b style={{ color: "var(--orange)" }}>{result.summary.claim_unverified}</b><span>要件待补充</span></div>
                </div>
                <div className="t-body muted" style={{ margin: 0 }}>{result.claim.summary.overall}</div>
                <div className="t-caption muted" style={{ marginTop: "var(--sp-3)" }}>
                  {(result.disclaimers ?? []).map((d, i) => <div key={i} style={{ marginBottom: 4 }}>· {d}</div>)}
                </div>
                <div style={{ marginTop: "var(--sp-4)" }}>
                  {/* v4 §二：下载按钮换 TDesign outline，loading 表达等待 */}
                  <Button variant="outline" theme="default" loading={downloading} onClick={download}>
                    下载案件分析报告 DOCX
                  </Button>
                </div>
              </section>
            </>
          )}
        </section>
      </div>

      {/* v3（§二 CaseAnalysis）：narrow 下主 CTA 进底部动作栏；示例按钮与下载留 inline */}
      <MobileActionBar>
        <Button theme="primary" loading={loading} disabled={analyzeDisabled} onClick={analyze}>开始分析</Button>
      </MobileActionBar>
    </div>
  );
}
