import { useState } from "react";
import { Button, Empty, Textarea } from "tdesign-react";
import { notify } from "../components/toast";
import { api, type QAResult } from "../lib/api";
import CitationCard from "../components/CitationCard";
import DocHeader from "../components/DocHeader";
import MobileActionBar from "../components/MobileActionBar";
import { EvidenceChain, type EvidenceStep } from "../components/EvidenceChain";

const EXAMPLES = [
  "网络购物七日无理由退货的依据是什么？",
  "约定的违约金过高法院会调整吗？",
  "自动续费之前经营者要做什么？",
  "试用期最长不能超过多久？",
  "合同里哪些免责条款是无效的？",
];

/** 证据链（设计理念 v2 §五.2）：检索→绑定→人工→留痕，n 取本次实际命中数 */
function qaSteps(result: QAResult): EvidenceStep[] {
  return [
    { label: "采集", sub: "语料 1,647 条", tone: "ink" },
    { label: "检索", sub: result.retrieval_meta.method, tone: "accent" },
    { label: "绑定", sub: `命中 ${result.answer_cards.length} 条全部绑定`, tone: "accent" },
    { label: "人工", sub: "律师可复核", tone: "seal" },
    { label: "留痕", sub: "来源可点击", tone: "ink" },
  ];
}

export default function QA() {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QAResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function ask(q: string) {
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    try {
      setResult(await api.ask(q.trim()));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      // v4 §二：错误双通道——页内 finding 卡保留 + 顶部 toast
      void notify(msg, "error");
    } finally {
      setLoading(false);
    }
  }

  /* v4（§二 QA 试点）：主 CTA 双渲染共用同一 handler（Button loading 表达等待） */
  const onAsk = () => ask(question);
  const askDisabled = !question.trim();

  return (
    <div>
      <DocHeader
        kicker="LEGALHIGH · MODULE 01 · CITATION QA"
        title="让每句话都有出处"
        lede="输入法律问题，系统在 7 部现行法律法规（1,647 条）中检索，并展示命中的法条原文。本系统不生成法条之外的内容：检索不到就明确说找不到，检测到错误前提会先纠正再检索。"
        meta={["语料 1,647 条", "快照 2026-08-29", "方法 bm25-char-bigram"]}
      />

      <div className="panel material-regular elev-1" style={{ marginTop: "var(--sp-5)" }}>
        <div className="qa-input-wrap">
          {/* v4 §二：textarea 换 TDesign Textarea（autosize，Ctrl/⌘+Enter 提交保留） */}
          <Textarea
            value={question}
            onChange={v => setQuestion(v)}
            autosize={{ minRows: 2, maxRows: 5 }}
            placeholder="如：合同里约定的违约金过高，法院会支持吗？"
            onKeydown={(v, { e }) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) ask(v); }}
          />
          <Button
            className="only-regular"
            theme="primary"
            loading={loading}
            disabled={askDisabled}
            onClick={onAsk}
          >
            检索
          </Button>
        </div>
        <div className="qa-chips">
          {EXAMPLES.map(x => (
            <Button key={x} size="small" variant="outline" theme="default" onClick={() => { setQuestion(x); ask(x); }}>{x}</Button>
          ))}
        </div>
        {error && <div className="finding risk-high"><b>出错了：</b>{error}</div>}
      </div>

      {result && (
        <div style={{ marginTop: "var(--sp-6)" }}>
          <div className="panel material-thin elev-1" style={{ marginBottom: "var(--sp-4)" }}>
            <EvidenceChain steps={qaSteps(result)} />
          </div>

          {result.premise_check && (
            <div className="premise">
              <b>⚠ 前提纠正：</b> {result.premise_check.warning}
              <div className="t-caption muted" style={{ marginTop: 6 }}>
                依据：《{result.premise_check.citation.law_title}》{result.premise_check.citation.article_label}
              </div>
            </div>
          )}

          {result.no_answer ? (
            /* v4 §二：无命中空态换 TDesign Empty */
            <Empty description={result.no_answer_message} />
          ) : (
            <>
              <div className="t-subhead muted" style={{ marginBottom: "var(--sp-3)" }}>
                共命中 {result.answer_cards.length} 条依据（检索方式：{result.retrieval_meta.method} · 语料 {result.retrieval_meta.corpus_size} 条）：
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
                {result.answer_cards.map(c => (
                  <CitationCard key={`${c.law_id}-${c.article_no}`} c={c} />
                ))}
              </div>
            </>
          )}

          <div className="t-caption faint" style={{ marginTop: "var(--sp-5)" }}>{result.disclaimer}</div>
        </div>
      )}

      {/* v3（§二 QA）：narrow 下主 CTA 进底部动作栏（regular 渲染 null）；与桌面颗共用 handler */}
      <MobileActionBar>
        <Button theme="primary" loading={loading} disabled={askDisabled} onClick={onAsk}>检索</Button>
      </MobileActionBar>
    </div>
  );
}
