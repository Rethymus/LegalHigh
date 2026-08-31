// LegalHigh 类型化 API 客户端：契约与 server/app/main.py 实测结构一一对应。
// 原则：错误显式上抛（含后端 detail），不吞错；无 mock 回退——后端不可用就让用户看到。
export const API_BASE = '/api'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    })
  } catch {
    throw new ApiError(0, '无法连接后端服务（请确认已启动：server/.venv → uvicorn app.main:app --port 8000）')
  }
  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const body = await res.json()
      if (typeof body?.detail === 'string') detail = body.detail
    } catch { /* 非 JSON 错误体，保留状态码 */ }
    throw new ApiError(res.status, detail)
  }
  return res.json() as Promise<T>
}

/* ---------- 领域类型（对应 server 实测输出） ---------- */
export interface Citation {
  law_id: string
  law_title: string
  article_no: number
  article_label: string
  chapter: string
  text: string
  status: string
  effective_date: string
  source_url: string
  source_kind: string
}

export type RiskLevel = 'high' | 'medium' | 'low'
export type ReviewCategory = 'fee' | 'account' | 'liability'

export interface Finding {
  id: string
  clause_id: string | null
  clause_label: string
  clause_heading: string
  excerpt: string
  category: ReviewCategory
  risk: RiskLevel
  checkpoint_id: string
  checkpoint_title: string
  detail: string
  suggestion: string
  basis_kind: 'statute' | 'practice'
  citation: Citation | null
}

export interface Clause { id: string; label: string; heading: string; text: string }

export interface ReviewResult {
  title: string
  clauses: Clause[]
  findings: Finding[]
  summary: { high: number; medium: number; low: number; by_category: Record<ReviewCategory, number> }
  disclaimer: string
  engine_meta: { checkpoint_count: number; clause_count: number }
}

export interface Annotation {
  id: string
  review_id: string
  finding_id: string
  state: 'pending' | 'adopted' | 'amended' | 'rejected'
  text: string
  amended_text: string | null
  actor: string
  updated_at: string
}

export interface Review {
  id: string
  created_at: string
  title: string
  contract_text: string
  result: ReviewResult
  annotations: Annotation[]
}

export interface AuditEntry {
  id?: string
  ts?: string
  created_at?: string
  actor?: string
  entity_type?: string
  entity_id?: string
  action?: string
  payload_json?: string
  [k: string]: unknown
}

export interface TemplateField {
  key: string
  label: string
  type: 'text' | 'textarea' | 'textarea_list' | 'select' | 'multi_select' | 'citation_picker'
  required?: boolean
  placeholder?: string
  options?: string[]
}

export interface DocTemplate {
  template_id: string
  name: string
  description: string
  gate: { verify_label: string; issue_label: string; require_role: string }
  fields: TemplateField[]
}

export interface DraftBlock { type: string; text?: string; lines?: string[]; heading?: string }
export interface DraftContent { blocks?: DraftBlock[]; citations?: Citation[]; [k: string]: unknown }

export interface Draft {
  id: string
  created_at: string
  template_id: string
  fields: Record<string, unknown>
  content: DraftContent
  citations: Citation[]
  status: 'draft' | 'verified' | 'issued'
  snapshot: Record<string, unknown>
}

/* server 契约：textarea_list 前端保持多行文本原样提交（server 端按行切分）；multi_select 传数组；citation_picker 传 {law_id, article_no}[] */
export type FieldsPayload = Record<string, string | string[] | { law_id: string; article_no: number }[]>

/* ---------- API ---------- */
export const api = {
  health: () => req<{ status: string }>('/health'),

  // 合同审查
  analyzeContractText: (contractText: string, title?: string) =>
    req<ReviewResult>('/reviews/analyze', {
      method: 'POST',
      body: JSON.stringify({ contract_text: contractText, title }),
    }),
  createReview: (contractText: string, title?: string) =>
    req<{ review_id: string } & ReviewResult>('/reviews', {
      method: 'POST',
      body: JSON.stringify({ contract_text: contractText, title }),
    }),
  getReview: (rid: string) => req<Review>(`/reviews/${rid}`),
  transitionAnnotation: (rid: string, findingId: string, action: 'adopt' | 'amend' | 'reject' | 'reopen', actor: string, amendedText?: string) =>
    req<unknown>(`/reviews/${rid}/annotations/${findingId}/transition`, {
      method: 'POST',
      body: JSON.stringify({ action, actor, amended_text: amendedText }),
    }),
  reviewAudit: (rid: string) => req<{ entries: AuditEntry[] }>(`/reviews/${rid}/audit`),
  /** 审查记录 DOCX（Word 修订双轨：AI 建议以 w:ins 修订插入写入） */
  reviewDocxUrl: (rid: string) => `${API_BASE}/reviews/${rid}/docx`,
  /** 律师回传修订稿（M7-T1 后半）：解析 Word 修订状态并同步批注状态机 */
  reviewDocxReturn: async (rid: string, file: File): Promise<{ accepted: string[]; rejected: string[]; pending: number; skipped: { id: string; reason: string }[]; accepted_n: number; rejected_n: number }> => {
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch(`${API_BASE}/reviews/${rid}/docx-return`, { method: 'POST', body: fd })
    if (!res.ok) {
      let detail = `HTTP ${res.status}`
      try { const b = await res.json(); if (typeof b?.detail === 'string') detail = b.detail } catch { /* 保留状态码 */ }
      throw new ApiError(res.status, detail)
    }
    return res.json()
  },
  /** 解读审核队列（草稿可见于审核面，法条页仍不展示） */
  explainsQueue: () => req<{ queue: { law_id: string; no: number; text: string; author: string; date?: string; source_note?: string }[] }>('/explains/queue'),
  /** 审核动作：approve 须填执业律师真实姓名+执业证号（律师法§2/§13，依法公示）；写入审计 */
  reviewExplain: (lawId: string, no: number, action: 'approve' | 'reopen', reviewer: string, licenseNo?: string) =>
    req<{ status: string }>(`/explains/${encodeURIComponent(lawId)}/${no}`, { method: 'PATCH', body: JSON.stringify({ action, reviewer, license_no: licenseNo }) }),

  /** PIPL 删除通道：删除审查记录（级联批注，审计留痕） */
  deleteReview: (rid: string) => req<{ deleted: string }>(`/reviews/${rid}`, { method: 'DELETE' }),
  /** PIPL 删除通道：删除文书草稿 */
  deleteDraft: (did: string) => req<{ deleted: string }>(`/drafts/${did}`, { method: 'DELETE' }),
  /** PIPL 删除通道：删除投诉工单 */
  deleteComplaint: (cid: string) => req<{ deleted: string }>(`/complaints/${cid}`, { method: 'DELETE' }),
  /** PIPL 导出通道：全量本机数据 JSON 下载 */
  privacyExport: async (): Promise<void> => {
    const res = await fetch(`${API_BASE}/privacy/export`)
    if (!res.ok) throw new ApiError(res.status, `导出失败（HTTP ${res.status}）`)
    const blob = await res.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'legalhigh_data_export.json'
    a.click()
    URL.revokeObjectURL(a.href)
  },

  // 文书起草
  draftTemplates: () =>
    req<{ templates: DocTemplate[]; citation_laws: { law_id: string; title: string }[] }>('/drafts/templates'),
  /** 单部法律的引用池（A7 按需加载） */
  draftCitationPool: (lawId: string) =>
    req<{ law_id: string; title: string; articles: { no: number; label: string; chapter: string; excerpt: string }[] }>(`/drafts/citation-pool/${encodeURIComponent(lawId)}`),
  createDraft: (templateId: string, fields: Record<string, unknown>) =>
    req<{ draft_id: string; status: string; content: DraftContent }>('/drafts', {
      method: 'POST',
      body: JSON.stringify({ template_id: templateId, fields }),
    }),
  getDraft: (did: string) => req<Draft>(`/drafts/${did}`),
  verifyDraft: (did: string, actor: string, role = '执业律师', note?: string) =>
    req<{ from: string; to: string; actor: string }>(`/drafts/${did}/verify`, { method: 'POST', body: JSON.stringify({ actor, role, note }) }),
  issueDraft: (did: string, actor: string, role = '执业律师', note?: string) =>
    req<{ from: string; to: string; actor: string }>(`/drafts/${did}/issue`, { method: 'POST', body: JSON.stringify({ actor, role, note }) }),
  draftDocxUrl: (did: string) => `${API_BASE}/drafts/${did}/docx`,

  // 引用式问答
  ask: (question: string, topK = 6) =>
    req<{
      question: string
      premise_check: { rule_id: string; warning: string; citation: Citation } | null
      answer_cards: {
        law_id: string; law_title: string; law_status: string; effective_date: string
        promulgation_instrument: string; article_no: number; article_label: string
        chapter: string; text: string; source_url: string; source_kind: string; score: number
      }[]
      no_answer: boolean
    }>('/qa/ask', { method: 'POST', body: JSON.stringify({ question, top_k: topK }) }),

  // 合规中心：投诉工单（真实落库 + 审计留痕）
  createComplaint: (subject: string, content: string, contact?: string, kind: 'general' | 'mobile' = 'general') =>
    req<{ complaint_id: string; status: string }>('/complaints', {
      method: 'POST',
      body: JSON.stringify({ subject, content, contact: contact || undefined, kind }),
    }),

  // 案例样本库（仅可公开查证案件；sample=true 为未核实占位）
  listCases: (q = '', level?: string) =>
    req<{ cases: CaseRecord[] }>(`/cases?q=${encodeURIComponent(q)}${level ? `&level=${encodeURIComponent(level)}` : ''}`),
  getCase: (caseId: string) => req<CaseRecord>(`/cases/${caseId}`),

  // 官方解读关联层（决策项15）：法条 → 对应司法解释条文（来源已核实）
  articleLinks: (lawId: string, no: number) =>
    req<{ law_id: string; no: number; links: ArticleLink[] }>(`/article-links/${encodeURIComponent(lawId)}/${no}`),

  // 法条人工通俗解读（仅已审核条目；AI 草稿审核前服务端不返回——决策项4 双轨）
  lawExplains: (lawId: string) =>
    req<{ law_id: string; explains: Record<string, ArticleExplain> }>(`/laws/${encodeURIComponent(lawId)}/explains`),

  // 主检索（server BM25，与问答/研究同一引擎；多词/口语化查询可命中）
  search: (q: string, topK = 20, lawId?: string) =>
    req<SearchResult>(`/search?q=${encodeURIComponent(q)}&top_k=${topK}${lawId ? `&law_id=${encodeURIComponent(lawId)}` : ''}`),

  // 交付前校验
  listDrafts: () => req<{ drafts: { id: string; created_at: string; template_id: string; status: string }[] }>('/drafts'),
  draftValidation: (did: string) => req<DraftValidation>(`/drafts/${did}/validation`),

  // AI 研究（server BM25 多查询检索备忘录；无 LLM 自由生成）
  researchMemo: (question: string, lawIds?: string[], topK = 12) =>
    req<ResearchMemo>('/research/memo', {
      method: 'POST',
      body: JSON.stringify({ question, law_ids: lawIds ?? null, top_k: topK }),
    }),
  /** 研究备忘录 DOCX（POST 二进制 → blob 下载） */
  researchReport: async (question: string, lawIds?: string[], topK = 12): Promise<void> => {
    const res = await fetch(`${API_BASE}/research/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, law_ids: lawIds ?? null, top_k: topK }),
    })
    if (!res.ok) throw new ApiError(res.status, `报告生成失败（HTTP ${res.status}）`)
    const blob = await res.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `research_memo_${new Date().toISOString().slice(0, 10)}.docx`
    a.click()
    URL.revokeObjectURL(a.href)
  },

  // 全站审计（append-only）
  auditAll: (limit = 100) => req<{ entries: AuditEntry[] }>(`/audit?limit=${limit}`),

  // AI 模型插件（OpenAI 协议 harness；BYO key，密钥仅随请求瞬态发送）
  aiProviders: () =>
    req<{ providers: { id: string; name: string; base_url: string; default_model: string; models_hint: string[]; docs: string; local: boolean; env_key: string | null; env_key_set: boolean }[] }>('/ai/providers'),
  aiTest: (p: { provider_id: string; model: string; api_key?: string; base_url_override?: string }) =>
    req<{ ok: boolean; sample?: string; error?: string }>('/ai/test', { method: 'POST', body: JSON.stringify(p) }),
  aiChat: (p: { provider_id: string; model: string; messages: { role: string; content: string }[]; api_key?: string; base_url_override?: string; allowed_refs?: { law_title: string; article_no: number }[]; temperature?: number }) =>
    req<{
      provider_id: string; provider_name: string; model: string; text: string
      gates: { redline: { pass: boolean; hits: string[] }; citations: { pass: boolean; violations: string[]; note?: string } }
      blocked: boolean; usage: Record<string, number>; disclaimer: string
    }>('/ai/chat', { method: 'POST', body: JSON.stringify(p) }),

  // 需求解析（抽象描述 → 可溯源法条 + 案例；AI 仅参与改写，证据确定性检索）
  needsParse: (text: string, ai?: { provider_id: string; model: string; api_key?: string; base_url_override?: string }) =>
    req<NeedsParseResult>('/needs/parse', { method: 'POST', body: JSON.stringify({ text, ai: ai ?? null }) }),

  // 审查记录列表（轻量含风险摘要）
  listReviews: (limit = 50) =>
    req<{ reviews: { id: string; created_at: string; title: string; high: number; medium: number; low: number; findings: number }[] }>(`/reviews?limit=${limit}`),

  // 投诉工单列表
  listComplaints: () =>
    req<{ complaints: { id: string; created_at: string; contact: string | null; subject: string; status: string }[] }>('/complaints'),

  // 版本对比（server difflib 行级结构差异）
  compareTexts: (textA: string, textB: string) =>
    req<CompareResult>('/compare', { method: 'POST', body: JSON.stringify({ text_a: textA, text_b: textB }) }),
}

/* ---------- 官方解读关联层（法条 → 司法解释条文，来源已核实） ---------- */
export interface ArticleLink {
  law_id: string
  no: number
  label: string
  text: string
  note: string
  ref_title: string
  ref_status: string
}

/* ---------- 法条人工通俗解读（双轨：AI 草稿 → 人工审核 → approved 对外） ---------- */
export interface ArticleExplain {
  text: string
  author: string
  reviewer: string
  reviewer_license_no?: string
  reviewer_role?: string
  date?: string
  source_note?: string
}

/* ---------- 主检索（server BM25 结果；排序唯一来源） ---------- */
export interface SearchHit {
  law_id: string; law_title: string; no: number; label: string
  chapter: string; text: string; score: number
}
export interface SearchResult {
  query: string
  total: number
  hits: SearchHit[]
  retrieval_meta: { method: string; corpus_size: number }
}

/* ---------- 版本对比（difflib 结构差异） ---------- */
export interface DiffOp {
  type: 'replace' | 'delete' | 'insert' | 'equal'
  a_lines: string[]; b_lines: string[]
  a_range: [number, number]; b_range: [number, number]
}
export interface CompareResult {
  ops: DiffOp[]
  stats: { added: number; deleted: number; modified_lines: number; op_count: number }
  disclaimer: string
}

/* ---------- 收藏（本机 localStorage；跨页共享） ---------- */
export interface FavItem { key: string; type: '法条' | '案例' | '研究' | '审查' | '草稿'; title: string; meta: string; to: string; ts: string }
const FAV_KEY = 'lh:favs'
export function loadFavs(): FavItem[] {
  try { return JSON.parse(localStorage.getItem(FAV_KEY) ?? '[]') } catch { return [] }
}
export function addFav(item: Omit<FavItem, 'ts'>) {
  const list = loadFavs().filter((f) => f.key !== item.key)
  list.unshift({ ...item, ts: new Date().toISOString() })
  localStorage.setItem(FAV_KEY, JSON.stringify(list.slice(0, 200)))
}
export function removeFav(key: string) {
  localStorage.setItem(FAV_KEY, JSON.stringify(loadFavs().filter((f) => f.key !== key)))
}
export function isFav(key: string): boolean {
  return loadFavs().some((f) => f.key === key)
}
export function toggleFav(item: Omit<FavItem, 'ts'>): boolean {
  if (isFav(item.key)) { removeFav(item.key); return false }
  addFav(item); return true
}

/* ---------- 需求解析结果 ---------- */
export interface NeedArticle {
  law_id: string; law_title: string; article_no: number; article_label: string
  text: string; status: string; effective_date: string; chapter: string
  score: number; official_entry: string; official_entry_note: string; snapshot_url: string
}
export interface NeedCase {
  id: string; name: string; name_en?: string; no: string; court: string; date: string
  cause: string; level: string; summary: string; kind: 'law' | 'case' | 'academic' | 'foreign' | 'ai'
  grade: '强' | '中' | '弱'; source_note: string; verified: boolean
  official_entries: { name: string; url: string }[] | null
}
export interface NeedsParseResult {
  input: string
  parse: {
    understood: string; issue_type: string
    assumed_causes: string[]; keywords: string[]; cautions: string[]
    /** 展示降噪后的关键词（决策项2：有域词时仅显示域词）；缺省回退 keywords */
    keywords_display?: string[]
    by: string  // 'deterministic' | 'ai:provider/model'
  }
  ai_error: string | null
  articles: NeedArticle[]
  cases: NeedCase[]
  articles_none: boolean
  corpus_size: number
  disclaimer: string
}

/* ---------- 工作身份档案（决策9 最小可行版：本机自报，内网部署后升级为认证账号） ----------
   审核人/核验人/复核人字段默认取此身份，保证担责字段的一致性；
   注意：本机自报不等于认证身份——多用户场景须待最小账号体系（M7-T3 前置）。 */
export interface WorkIdentity { name: string; role: string }
const IDENTITY_KEY = 'lh:identity'
export function loadIdentity(): WorkIdentity {
  try {
    return { name: '', role: '执业律师', ...JSON.parse(localStorage.getItem(IDENTITY_KEY) ?? '{}') }
  } catch { return { name: '', role: '执业律师' } }
}
export function saveIdentity(v: WorkIdentity) {
  localStorage.setItem(IDENTITY_KEY, JSON.stringify(v))
}

/* ---------- AI 模型档案（仅存本机 localStorage，密钥随请求瞬态发送） ---------- */
export interface AiProfile {
  provider_id: string
  model: string
  base_url_override?: string
  api_key?: string
}
const AI_PROFILE_KEY = 'lh:ai:profile'
export function loadAiProfile(): AiProfile | null {
  try { return JSON.parse(localStorage.getItem(AI_PROFILE_KEY) ?? 'null') } catch { return null }
}
export function saveAiProfile(p: AiProfile) {
  localStorage.setItem(AI_PROFILE_KEY, JSON.stringify(p))
}

/* ---------- 研究备忘录（server research.build_research_memo 实测结构） ---------- */
export interface MemoCard {
  law_id: string; law_title: string; law_status: string; effective_date: string
  promulgation_instrument: string; article_no: number; article_label: string
  chapter: string; text: string; source_url: string; source_kind: string; score: number
}
export interface ResearchMemo {
  question: string
  scope: { law_ids: string[] | null; top_k: number }
  issue_frame: { restate: string; keywords: string[] }
  framework: { law_id: string; law_title: string; chapters: string[]; hit_count: number }[]
  cards: MemoCard[]
  gaps: string[]
  references: { kind: string; law_id: string; article_no: number; article_label: string; law_title: string; status: string; effective_date: string; source_url: string; text: string }[]
  disclaimer: string
  meta: { method: string; queries: string[]; corpus_size: number }
}

/* ---------- 案例记录（server/data/cases.json） ---------- */
export interface CaseStatute { law_id: string; no: number; label: string }
export interface CaseRecord {
  id: string
  name: string
  name_en?: string
  no: string
  court: string
  date: string
  jurisdiction: string
  cause: string
  level: string
  focus: string[]
  summary: string
  facts: string
  holding: string
  statutes: CaseStatute[]
  research_refs?: CaseStatute[]
  impact: string[]
  kind: SourceKind
  grade: '强' | '中' | '弱'
  source_note: string
  verified: boolean
  sample?: boolean
}
type SourceKind = 'law' | 'case' | 'academic' | 'foreign' | 'ai'

export interface ValidationCheck { id: string; group: string; title: string; pass: boolean; detail: string }
export interface DraftValidation {
  draft_id: string
  template_id: string
  status: 'draft' | 'verified' | 'issued'
  ready: boolean
  need_review: boolean
  checks: ValidationCheck[]
  disclaimer: string
}
