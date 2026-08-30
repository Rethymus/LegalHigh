import { useEffect, useState } from "react";
import { Button, Input, Table, Tag, Textarea } from "tdesign-react";
import { notify } from "../components/toast";
import type { PrimaryTableCol } from "tdesign-react";
import { api } from "../lib/api";
import DocHeader from "../components/DocHeader";

interface Compliance {
  positioning: string;
  disclaimer: string;
  model_status: { status: string; detail: string; filing_no: string | null };
  red_lines: string[];
  data_sources: Array<{ law_id: string; title: string; status: string; article_count: number; source_url: string; fetched_at: string }>;
  checkpoints: Array<{ id: string; category: string; risk: string; title: string; basis_kind: string; citation: string }>;
  complaint_channel: string;
}

interface Evals {
  metric_note: string;
  case_count: number;
  hit_at_5: number;
  mrr: number;
  precision_at_5: number;
  cases: Array<{ id: string; question: string; hit: boolean; rank: number | null }>;
}

const CATEGORY = { fee: "费用", account: "账户", liability: "责任" } as const;

type EvalCase = Evals["cases"][number];
type DataSource = Compliance["data_sources"][number];
type Checkpoint = Compliance["checkpoints"][number];

/* v4（§二 Compliance）：三个 src-table 换 TDesign Table（size=small · stripe · hover） */
const evalColumns: Array<PrimaryTableCol<EvalCase>> = [
  { colKey: "id", title: "#", width: 70 },
  { colKey: "question", title: "问题" },
  {
    colKey: "hit",
    title: "命中",
    width: 90,
    cell: ({ row }) =>
      row.hit ? <Tag theme="success" variant="light">命中</Tag> : <Tag theme="default" variant="light">未命中</Tag>,
  },
  { colKey: "rank", title: "排名", width: 80, cell: ({ row }) => row.rank ?? "—" },
];

const sourceColumns: Array<PrimaryTableCol<DataSource>> = [
  { colKey: "title", title: "法规" },
  { colKey: "status", title: "状态", width: 110 },
  { colKey: "article_count", title: "条数", width: 80 },
  {
    colKey: "source_url",
    title: "来源 / 抓取日期",
    cell: ({ row }) => {
      // 短锚文本：gov.cn 公报转载=强源；维基文库=转写层。完整 URL 在 href 中可查
      const isGov = row.source_url.includes("gov.cn");
      const label = isGov ? "政府网公报转载 ↗" : "维基文库转写核对 ↗";
      return (
        <span style={{ whiteSpace: "nowrap" }}>
          <a href={row.source_url} target="_blank" rel="noreferrer" title={row.source_url} style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 600 }}>
            {label}
          </a>
          <span className="t-mono" style={{ color: "var(--ink-3)", marginLeft: 8 }}>· {row.fetched_at}</span>
        </span>
      );
    },
  },
];

/* 风险列 Tag 化：高=danger / 中=warning / 低=库内无黄色 theme，default + 内联 var(--yellow) */
const checkpointColumns: Array<PrimaryTableCol<Checkpoint>> = [
  { colKey: "id", title: "编号", width: 90 },
  { colKey: "category", title: "类别", width: 80, cell: ({ row }) => CATEGORY[row.category as keyof typeof CATEGORY] },
  {
    colKey: "risk",
    title: "风险",
    width: 80,
    cell: ({ row }) =>
      row.risk === "high" ? (
        <Tag theme="danger" variant="light">高</Tag>
      ) : row.risk === "medium" ? (
        <Tag theme="warning" variant="light">中</Tag>
      ) : (
        <Tag theme="default" variant="light" style={{ color: "var(--yellow)" }}>低</Tag>
      ),
  },
  { colKey: "title", title: "审查点" },
  { colKey: "citation", title: "依据", cell: ({ row }) => (row.basis_kind === "statute" ? row.citation : "实务建议") },
];

export default function Compliance() {
  const [data, setData] = useState<Compliance | null>(null);
  const [evals, setEvals] = useState<Evals | null>(null);
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [contact, setContact] = useState("");
  const [complaintMsg, setComplaintMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.compliance().then(setData).catch(() => setData(null));
    api.evals().then(setEvals).catch(() => setEvals(null));
  }, []);

  async function submitComplaint() {
    setBusy(true);
    setComplaintMsg(null);
    try {
      const res = await api.createComplaint(subject, content, contact || undefined);
      setComplaintMsg(`${res.message}（工单号 ${res.complaint_id}）`);
      // v4 §二：操作反馈 toast（工单号）
      void notify(`投诉已受理 · 工单号 ${res.complaint_id}`, "success");
      setSubject(""); setContent("");
    } catch (e) {
      const msg = `提交失败：${e instanceof Error ? e.message : String(e)}`;
      setComplaintMsg(msg);
      void notify(msg, "error");
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <div className="no-answer t-body">合规数据加载中…（请确认后端已启动）</div>;

  return (
    <div>
      <DocHeader
        kicker="LEGALHIGH · MODULE 06 · COMPLIANCE"
        title="合规不是口号，是可查证的功能"
        lede="合规不是文档里的口号，而是可查证的功能。本页数据由后端实时返回。"
        meta={["红线清单", "数据来源公示", "投诉留痕"]}
      />

      <section className="kv-panel material-regular elev-1">
        <h3 className="t-title3" style={{ marginTop: 0 }}>系统定位</h3>
        <p className="t-body">{data.positioning}</p>
        <hr className="sep" />
        <h3 className="t-title3">大模型使用状态（如实公示）</h3>
        <div className="finding" style={{ background: "transparent" }}>
          <span className="badge info">{data.model_status.status}</span>
          <div className="finding-block">{data.model_status.detail}</div>
          {data.model_status.filing_no === null && (
            <div className="t-caption faint" style={{ marginTop: 6 }}>备案号公示位：待完成登记后在此展示（本原型不虚构备案号）。</div>
          )}
        </div>
        <hr className="sep" />
        <h3 className="t-title3">免责声明（全站展示）</h3>
        <p className="t-body muted" style={{ margin: 0 }}>{data.disclaimer}</p>
      </section>

      <section className="kv-panel material-regular elev-1">
        <h3 className="t-title3" style={{ marginTop: 0 }}>检索评测看板（实时计算 · 可复现）</h3>
        {!evals ? (
          <div className="t-caption faint">评测数据加载中…</div>
        ) : (
          <>
            <div className="metric-cards">
              <div className="metric-card material-thin elev-1"><b>{(evals.hit_at_5 * 100).toFixed(1)}%</b><span>金标命中 hit@5</span></div>
              <div className="metric-card material-thin elev-1"><b>{evals.mrr.toFixed(3)}</b><span>MRR（平均排名倒数）</span></div>
              <div className="metric-card material-thin elev-1"><b>{(evals.precision_at_5 * 100).toFixed(1)}%</b><span>precision@5</span></div>
              <div className="metric-card material-thin elev-1"><b>{evals.case_count}</b><span>金标评测组数</span></div>
            </div>
            <div className="t-caption faint">{evals.metric_note} 依据：LegalBench-RAG（arXiv:2408.10343）评测范式；本页数值由 GET /api/evals 对当前语料实时计算。</div>
            <details style={{ marginTop: 10 }}>
              <summary className="t-subhead muted" style={{ cursor: "pointer" }}>逐组评测明细</summary>
              <div className="table-scroll" style={{ marginTop: 8 }}>
                {/* v4 §二：src-table 换 TDesign Table */}
                <Table columns={evalColumns} data={evals.cases} rowKey="id" size="small" stripe hover />
              </div>
            </details>
          </>
        )}
      </section>

      <section className="kv-panel material-regular elev-1">
        <h3 className="t-title3" style={{ marginTop: 0 }}>合规红线清单（工程控制点映射见开发计划 §六）</h3>
        <ol className="redline-list">
          {data.red_lines.map(r => <li key={r}>{r}</li>)}
        </ol>
      </section>

      <section className="kv-panel material-regular elev-1">
        <h3 className="t-title3" style={{ marginTop: 0 }}>数据来源公示（全部可溯源）</h3>
        <div className="table-scroll">
          <Table columns={sourceColumns} data={data.data_sources} rowKey="law_id" size="small" stripe hover />
        </div>
        <p className="t-caption faint" style={{ marginBottom: 0 }}>
          说明：政府网页面为官方公报转载【强】；维基文库为忠实转写层【中】，已经多源交叉核对（详见
          docs/research/开源与论文调研核验-2026-08-29.md），正式发布前将逐条与国家法律法规数据库比对。
        </p>
      </section>

      <section className="kv-panel material-regular elev-1">
        <h3 className="t-title3" style={{ marginTop: 0 }}>合同审查点库（{data.checkpoints.length} 个）</h3>
        <div className="table-scroll">
          <Table columns={checkpointColumns} data={data.checkpoints} rowKey="id" size="small" stripe hover />
        </div>
      </section>

      <section className="kv-panel material-regular elev-1">
        <h3 className="t-title3" style={{ marginTop: 0 }}>投诉与纠错通道（真实落库留痕）</h3>
        <p className="t-subhead muted">{data.complaint_channel}</p>
        <div className="field">
          <label>主题 *</label>
          <Input value={subject} onChange={setSubject} clearable placeholder="如：某条引用条文与官方库不一致" />
        </div>
        <div className="field">
          <label>详细内容 *</label>
          <Textarea value={content} onChange={setContent} autosize={{ minRows: 3, maxRows: 8 }} placeholder="描述问题，如能提供具体条文更好" />
        </div>
        <div className="field">
          <label>联系方式（可选）</label>
          <Input value={contact} onChange={setContact} clearable placeholder="邮箱或电话" />
        </div>
        <Button theme="primary" loading={busy} disabled={busy || !subject.trim() || !content.trim()} onClick={submitComplaint}>提交工单</Button>
        {complaintMsg && <div className="finding" style={{ marginTop: 12 }}>{complaintMsg}</div>}
      </section>
    </div>
  );
}
