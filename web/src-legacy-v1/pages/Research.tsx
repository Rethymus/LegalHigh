import { useState } from "react";
import { Button, Checkbox, Textarea } from "tdesign-react";
import { notify } from "../components/toast";
import { api, type ResearchMemo } from "../lib/api";
import CitationCard from "../components/CitationCard";
import DocHeader from "../components/DocHeader";
import BottomSheet from "../components/BottomSheet";
import MobileActionBar from "../components/MobileActionBar";
import { useIsNarrow } from "../hooks/useSizeClass";
import { EvidenceChain, type EvidenceStep } from "../components/EvidenceChain";

const EXAMPLES = ["民间借贷的利率上限", "逾期利息怎么算", "网络购物七日无理由退货", "试用期工资标准"];

const LAWS: Array<{ id: string; title: string }> = [
  { id: "civl-2020", title: "中华人民共和国民法典" },
  { id: "cl-2013", title: "中华人民共和国消费者权益保护法" },
  { id: "lcl-2012", title: "中华人民共和国劳动合同法" },
  { id: "ll-2017", title: "中华人民共和国律师法" },
  { id: "ecom-2018", title: "中华人民共和国电子商务法" },
  { id: "crpl-imp-2024", title: "中华人民共和国消费者权益保护法实施条例" },
  { id: "genai-2023", title: "生成式人工智能服务管理暂行办法" },
];

/** 证据链（设计理念 v2 §五.2）：与 QA 同法，计数取 memo 实际返回值 */
function memoSteps(memo: ResearchMemo): EvidenceStep[] {
  return [
    { label: "采集", sub: `语料 ${memo.meta.corpus_size.toLocaleString()} 条`, tone: "ink" },
    { label: "检索", sub: memo.meta.method, tone: "accent" },
    { label: "绑定", sub: `${memo.cards.length} 条条文`, tone: "accent" },
    { label: "人工", sub: "律师可复核", tone: "seal" },
    { label: "留痕", sub: "来源可点击", tone: "ink" },
  ];
}

export default function Research() {
  const [question, setQuestion] = useState("");
  const [selectedLaws, setSelectedLaws] = useState<string[]>([]);
  const [memo, setMemo] = useState<ResearchMemo | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isNarrow = useIsNarrow();          // v3（§二 Research）：法律范围多选 narrow 折叠
  const [scopeOpen, setScopeOpen] = useState(false);

  /* 法律范围复选组：regular inline / narrow 折叠进 BottomSheet，同一份渲染体
     v4（§二 Research）：原生 checkbox 换 TDesign CheckboxGroup（Checkbox.Group） */
  const lawChecks = (
    <Checkbox.Group
      value={selectedLaws}
      onChange={v => setSelectedLaws(v as string[])}
      options={LAWS.map(l => ({ label: l.title, value: l.id }))}
    />
  );

  /* v3（§二 Research）：主 CTA 双渲染共用同一 handler/disabled/label（逻辑零复制）
     v4（§三.1）：等待态用 Button loading prop 表达，文字不再变化 */
  const onGenerate = () => generate(question);
  const generateDisabled = !question.trim();

  async function generate(q: string) {
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const m = await api.researchMemo({ question: q.trim(), law_ids: selectedLaws.length ? selectedLaws : null });
      setMemo(m);
      // v4 §二：操作反馈 toast
      void notify(`备忘录已生成 · 命中 ${m.cards.length} 条`, "info");
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
    if (!memo) return;
    setDownloading(true);
    setError(null);
    try {
      await api.researchReportDownload({
        question: memo.question,
        law_ids: memo.scope.law_ids,
        top_k: memo.scope.top_k,
      });
      void notify("研究报告 DOCX 已下载", "success");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      void notify(msg, "error");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div>
      <DocHeader
        kicker="LEGALHIGH · MODULE 02 · LEGAL RESEARCH"
        title="三组查询，一个备忘录"
        lede="输入研究问题，系统以三组查询（原句 / 关键词 / 编章扩展）在法规语料中多路检索并合并去重，产出问题界定、法律框架聚类与逐条引用卡；检索不到的领域如实列为「缺口」，不作推断，可一键下载带参考依据表的研究报告 DOCX。"
        meta={["方法 bm25-multiquery", "输出 DOCX 报告", "全程可溯源"]}
      />

      <div className="review-grid" style={{ marginTop: "var(--sp-5)" }}>
        <section className="panel material-regular elev-1" style={{ minWidth: 0 }}>
          <div className="field">
            <label>研究问题</label>
            {/* v4 §二：textarea 换 TDesign Textarea（autosize，Ctrl/⌘+Enter 提交保留） */}
            <Textarea
              value={question}
              onChange={v => setQuestion(v)}
              autosize={{ minRows: 2, maxRows: 6 }}
              placeholder="如：民间借贷的利率上限是多少？"
              onKeydown={(v, { e }) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) generate(v); }}
            />
          </div>
          <div className="qa-chips" style={{ margin: "0 0 var(--sp-4)" }}>
            {EXAMPLES.map(x => (
              <Button key={x} size="small" variant="outline" theme="default" onClick={() => { setQuestion(x); generate(x); }}>{x}</Button>
            ))}
          </div>
          <div className="field">
            <label>法律范围（全不选 = 检索全部 7 部法规）</label>
            {isNarrow ? (
              <>
                {/* 按钮文案不变；控件换 TDesign */}
                <Button block variant="outline" theme="default" onClick={() => setScopeOpen(true)}>
                  {selectedLaws.length ? `法律范围 · 已选 ${selectedLaws.length} 部` : "法律范围 · 全部 7 部"}
                </Button>
                <BottomSheet title="法律范围" open={scopeOpen} onClose={() => setScopeOpen(false)}>
                  {lawChecks}
                </BottomSheet>
              </>
            ) : (
              lawChecks
            )}
          </div>
          <Button className="only-regular" theme="primary" loading={loading} disabled={generateDisabled} onClick={onGenerate}>
            生成研究备忘录
          </Button>
          {error && <div className="finding risk-high" style={{ marginTop: 12 }}><b>出错了：</b>{error}</div>}
        </section>

        <section style={{ minWidth: 0 }}>
          {!memo && !loading && (
            <div className="no-answer t-body">左侧输入问题并生成后，这里会展示问题界定、法律框架、逐条引用卡与检索缺口。</div>
          )}

          {memo && (
            <>
              <div className="panel material-thin elev-1" style={{ marginBottom: "var(--sp-4)" }}>
                <EvidenceChain steps={memoSteps(memo)} />
              </div>

              <div className="panel material-thin elev-1" style={{ marginBottom: "var(--sp-4)" }}>
                <h3 className="t-title3" style={{ marginTop: 0 }}>问题界定</h3>
                <p className="t-body muted" style={{ margin: 0 }}>{memo.issue_frame?.restate ?? memo.question}</p>
                {(memo.issue_frame?.keywords ?? []).length > 0 && (
                  <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap", marginTop: "var(--sp-3)" }}>
                    {memo.issue_frame.keywords.map(k => <span key={k} className="badge neutral">{k}</span>)}
                  </div>
                )}
                <div className="t-caption faint" style={{ marginTop: "var(--sp-3)" }}>
                  范围：{memo.scope.law_ids?.length ? memo.scope.law_ids.join("、") : "全部 7 部法规"} · 最多取 {memo.scope.top_k} 条
                </div>
              </div>

              <div className="panel material-thin elev-1" style={{ marginBottom: "var(--sp-4)" }}>
                <h3 className="t-title3" style={{ marginTop: 0 }}>法律框架（命中条文按法律聚类）</h3>
                {memo.framework.length === 0 && <div className="t-caption faint">本次检索无命中法律。</div>}
                {memo.framework.map(f => (
                  <div key={f.law_id} style={{ padding: "var(--sp-2) 0", borderBottom: "0.5px solid var(--hairline)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", flexWrap: "wrap" }}>
                      <span className="t-headline">{f.law_title}</span>
                      <span className="badge info">{f.hit_count} 条命中</span>
                    </div>
                    {f.chapters.length > 0 && (
                      <div className="t-caption muted" style={{ marginTop: 4 }}>{f.chapters.join(" · ")}</div>
                    )}
                  </div>
                ))}
              </div>

              {(memo.gaps ?? []).map((g, i) => (
                <div className="premise" key={i}><b>⚠ 检索缺口：</b>{g}</div>
              ))}

              {memo.cards.length > 0 && (
                <>
                  <div className="t-subhead muted" style={{ margin: "var(--sp-4) 0 var(--sp-3)" }}>
                    共命中 {memo.cards.length} 条依据：
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
                    {memo.cards.map(c => (
                      <CitationCard key={`${c.law_id}-${c.article_no}`} c={{ ...c, status: c.law_status }} />
                    ))}
                  </div>
                </>
              )}

              <div className="t-caption faint" style={{ marginTop: "var(--sp-5)", wordBreak: "break-word" }}>
                检索方式：{memo.meta.method} · {memo.meta.queries.length} 组查询合并去重 · 语料 {memo.meta.corpus_size} 条
              </div>
              <div className="t-caption faint" style={{ marginTop: "var(--sp-2)" }}>{memo.disclaimer}</div>

              <div style={{ marginTop: "var(--sp-5)" }}>
                {/* v4 §二：下载按钮换 TDesign outline，loading 表达等待 */}
                <Button variant="outline" theme="default" loading={downloading} onClick={download}>
                  下载研究报告 DOCX
                </Button>
              </div>
            </>
          )}
        </section>
      </div>

      {/* v3（§二 Research）：narrow 下主 CTA 进底部动作栏；下载 DOCX 留在结果尾部 inline */}
      <MobileActionBar>
        <Button theme="primary" loading={loading} disabled={generateDisabled} onClick={onGenerate}>生成研究备忘录</Button>
      </MobileActionBar>
    </div>
  );
}
