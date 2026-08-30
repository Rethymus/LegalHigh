// LegalHigh API 客户端：类型化封装（后端 server/app/main.py）
const BASE = import.meta.env.DEV ? "http://localhost:8000" : "";

export interface Citation {
  law_id: string;
  law_title: string;
  article_no: number;
  article_label: string;
  chapter: string | null;
  text: string;
  status: string;
  effective_date: string | null;
  source_url: string;
  source_kind: string;
}

export interface QAResult {
  question: string;
  premise_check: { rule_id: string; warning: string; citation: Citation } | null;
  answer_cards: Array<Citation & { score: number; law_status: string; effective_date: string | null }>;
  no_answer: boolean;
  no_answer_message: string | null;
  disclaimer: string;
  retrieval_meta: { method: string; top_k: number; corpus_size: number };
}

export interface Finding {
  id: string;
  clause_id: string | null;
  clause_label: string;
  clause_heading: string;
  excerpt: string;
  category: "fee" | "account" | "liability";
  risk: "high" | "medium" | "low";
  checkpoint_id: string;
  checkpoint_title: string;
  detail: string;
  suggestion: string;
  basis_kind: "statute" | "practice";
  citation: Citation | null;
}

export interface ReviewResult {
  title: string;
  clauses: Array<{ id: string; label: string; heading: string; text: string }>;
  findings: Finding[];
  summary: { high: number; medium: number; low: number; by_category: Record<string, number> };
  disclaimer: string;
  engine_meta: { checkpoint_count: number; clause_count: number };
}

export interface Annotation {
  id: string;
  review_id: string;
  finding_id: string;
  state: "pending" | "adopted" | "amended" | "rejected";
  text: string;
  amended_text: string | null;
  actor: string;
  updated_at: string;
}

export interface ReviewRecord {
  id: string;
  created_at: string;
  title: string;
  contract_text: string;
  result: ReviewResult;
  annotations: Annotation[];
}

export interface AuditEntry {
  id: number;
  ts: string;
  actor: string;
  entity_type: string;
  entity_id: string;
  action: string;
  payload_json: string;
}

export interface FieldSchema {
  key: string;
  label: string;
  type: "text" | "textarea" | "textarea_list" | "select" | "multi_select" | "citation_picker";
  required?: boolean;
  placeholder?: string;
  options?: string[];
}

export interface Template {
  template_id: string;
  name: string;
  description: string;
  gate: { verify_label: string; issue_label: string; require_role: string };
  fields: FieldSchema[];
}

export interface Section {
  type: string;
  text: string;
  n?: number;
  lines?: string[];
}

export interface DraftRecord {
  id: string;
  template_id: string;
  status: "draft" | "verified" | "issued";
  fields: Record<string, unknown>;
  content: { sections: Section[]; citations: Citation[]; gate_note: string };
  citations: Citation[];
  snapshot: { generated_at: string; template_version: string; corpus_manifest: { fetch_date: string; laws: unknown[] } };
  verified_by?: string | null;
  verified_role?: string | null;
  issued_by?: string | null;
  issued_at?: string | null;
  created_at: string;
}

/* —— 法律研究备忘录（M4）—— */
export interface ResearchCard {
  law_id: string;
  law_title: string;
  law_status: string;
  effective_date: string | null;
  promulgation_instrument: string | null;
  article_no: number;
  article_label: string;
  chapter: string | null;
  text: string;
  source_url: string;
  source_kind: string;
  score: number;
}

export interface ResearchMemo {
  question: string;
  scope: { law_ids: string[] | null; top_k: number };
  issue_frame: { restate: string; keywords: string[] };
  framework: Array<{ law_id: string; law_title: string; chapters: string[]; hit_count: number }>;
  cards: ResearchCard[];
  gaps: string[];
  references: unknown[];
  disclaimer: string;
  meta: { method: string; queries: string[]; corpus_size: number };
}

export interface ResearchBody {
  question: string;
  law_ids?: string[] | null;
  top_k?: number;
}

/* —— 案件分析（M4，无状态）—— */
export interface CaseSpan {
  excerpt: string;
  start: number;
}

export interface CaseParty {
  role: string;
  name_hint: string | null;
  mentions: CaseSpan[];
  behaviors: Array<CaseSpan & { type: string }>;
}

export interface CaseTimelineItem extends CaseSpan {
  date_hint: string;
}

export interface CaseIndicator {
  id: string;
  title: string;
  level: "high" | "medium" | "low" | "absent";
  spans: CaseSpan[];
  note: string;
  advice: string;
}

export interface CaseCitation {
  law_id: string;
  law_title: string;
  article_no: number;
  article_label: string;
  article_text?: string;
  text?: string;
  status: string;
  effective_date: string | null;
  source_url: string;
}

export interface CaseElement {
  id: string;
  title: string;
  status: "supported" | "unverified";
  evidence_spans: CaseSpan[];
  citations: CaseCitation[];
}

export interface CaseAnalysis {
  title: string;
  generated_at: string;
  profile: { parties: CaseParty[]; timeline: CaseTimelineItem[] };
  behavior: { indicators: CaseIndicator[]; fixed_disclaimer: string };
  claim: {
    claim: { id: string; name: string };
    elements: CaseElement[];
    summary: { supported: number; unverified: number; overall: string };
  };
  summary: { profile_parties: number; behavior_active: number; claim_supported: number; claim_unverified: number };
  references: unknown[];
  disclaimers: string[];
}

export interface CaseBody {
  title?: string | null;
  case_text: string;
  claim_id: string;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch { /* 忽略非 JSON 错误体 */ }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

/** POST → DOCX 二进制 → 触发浏览器下载（失败时读取 422 {detail} 抛错） */
async function downloadDocx(path: string, body: unknown, filename: string): Promise<void> {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const err = await res.json();
      detail = typeof err.detail === "string" ? err.detail : JSON.stringify(err.detail);
    } catch { /* 忽略非 JSON 错误体 */ }
    throw new Error(detail);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const dateStamp = () => new Date().toISOString().slice(0, 10).replace(/-/g, "");

export const api = {
  health: () => req<{ status: string; laws: number; articles: number }>("/api/health"),
  ask: (question: string, top_k = 6) =>
    req<QAResult>("/api/qa/ask", { method: "POST", body: JSON.stringify({ question, top_k }) }),
  analyze: (title: string | null, contract_text: string) =>
    req<ReviewResult>("/api/reviews/analyze", { method: "POST", body: JSON.stringify({ title, contract_text }) }),
  createReview: (title: string | null, contract_text: string) =>
    req<{ review_id: string } & ReviewResult>("/api/reviews", { method: "POST", body: JSON.stringify({ title, contract_text }) }),
  getReview: (id: string) => req<ReviewRecord>(`/api/reviews/${id}`),
  transitionAnnotation: (reviewId: string, findingId: string, action: string, actor: string, amended_text?: string) =>
    req<{ finding_id: string; from: string; to: string }>(
      `/api/reviews/${reviewId}/annotations/${findingId}/transition`,
      { method: "POST", body: JSON.stringify({ action, actor, amended_text }) },
    ),
  reviewAudit: (id: string) => req<{ entries: AuditEntry[] }>(`/api/reviews/${id}/audit`),
  templates: () => req<{ templates: Template[]; citation_pool: Array<{ law_id: string; title: string; articles: Array<{ no: number; label: string; chapter: string | null; excerpt: string }> }> }>("/api/drafts/templates"),
  createDraft: (template_id: string, fields: Record<string, unknown>) =>
    req<{ draft_id: string; status: string; content: DraftRecord["content"]; snapshot: DraftRecord["snapshot"]; gate: Template["gate"] }>(
      "/api/drafts",
      { method: "POST", body: JSON.stringify({ template_id, fields }) },
    ),
  getDraft: (id: string) => req<DraftRecord>(`/api/drafts/${id}`),
  verifyDraft: (id: string, actor: string, role: string, note?: string) =>
    req<{ to: string }>(`/api/drafts/${id}/verify`, { method: "POST", body: JSON.stringify({ actor, role, note }) }),
  issueDraft: (id: string, actor: string) =>
    req<{ to: string }>(`/api/drafts/${id}/issue`, { method: "POST", body: JSON.stringify({ actor, role: "执业律师" }) }),
  draftDocxUrl: (id: string) => `${BASE}/api/drafts/${id}/docx`,
  researchMemo: (body: ResearchBody) =>
    req<ResearchMemo>("/api/research/memo", { method: "POST", body: JSON.stringify(body) }),
  researchReportDownload: (body: ResearchBody) =>
    downloadDocx("/api/research/report", body, `research_memo_${dateStamp()}.docx`),
  caseAnalyze: (body: CaseBody) =>
    req<CaseAnalysis>("/api/case/analyze", { method: "POST", body: JSON.stringify(body) }),
  caseReportDownload: (body: CaseBody) =>
    downloadDocx("/api/case/report", body, `case_analysis_${dateStamp()}.docx`),
  compliance: () => req<{
    positioning: string;
    disclaimer: string;
    model_status: { status: string; detail: string; filing_no: string | null };
    red_lines: string[];
    data_sources: Array<{ law_id: string; title: string; status: string; article_count: number; source_url: string; fetched_at: string }>;
    checkpoints: Array<{ id: string; category: string; risk: string; title: string; basis_kind: string; citation: string }>;
    complaint_channel: string;
  }>("/api/compliance"),
  createComplaint: (subject: string, content: string, contact?: string) =>
    req<{ complaint_id: string; message: string }>("/api/complaints", {
      method: "POST",
      body: JSON.stringify({ subject, content, contact }),
    }),
  evals: () => req<{
    metric_note: string;
    case_count: number;
    hit_at_5: number;
    mrr: number;
    precision_at_5: number;
    cases: Array<{ id: string; question: string; hit: boolean; rank: number | null; expect: Array<{ law_id: string; no: number }>; got: Array<{ law_id: string; no: number }> }>;
  }>("/api/evals"),
};
