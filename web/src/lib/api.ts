// LegalHigh 类型化 API 客户端：契约与 server/app/main.py 实测结构一一对应。
// 原则：错误显式上抛（含后端 detail），不吞错；无 mock 回退——后端不可用就让用户看到。
export const API_BASE = '/api'
const ADMIN_TOKEN_KEY = 'lh:admin-token:v1'

/** 直接浏览器模式的本机会话凭据；桌面端和 Vite 开发代理在主进程/代理层注入，不暴露给页面。 */
export function loadAdminToken(): string {
  return sessionStorage.getItem(ADMIN_TOKEN_KEY) ?? ''
}
export function saveAdminToken(token: string) {
  const value = token.trim()
  if (value) sessionStorage.setItem(ADMIN_TOKEN_KEY, value)
  else sessionStorage.removeItem(ADMIN_TOKEN_KEY)
}
export function clearAdminToken() {
  sessionStorage.removeItem(ADMIN_TOKEN_KEY)
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function requestHeaders(init?: RequestInit, json = true): Headers {
  const headers = new Headers(init?.headers)
  if (json && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const token = loadAdminToken()
  if (token) headers.set('X-LegalHigh-Admin-Token', token)
  return headers
}

async function apiFetch(path: string, init?: RequestInit, json = true): Promise<Response> {
  // 静态说明站（GitHub Pages，VITE_STATIC_PREVIEW=1）不部署后端：所有 /api 请求在
  // 客户端直接拒绝，不发注定 404 的网络请求（R21：曾出现逐页静默 404 噪声）。
  if (import.meta.env.VITE_STATIC_PREVIEW === '1') {
    throw new ApiError(503, '静态说明站不部署后端服务；请使用本地完整版或桌面版。')
  }
  return fetch(`${API_BASE}${path}`, { ...init, headers: requestHeaders(init, json) })
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await apiFetch(path, init)
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

async function downloadApi(path: string, filename: string, init?: RequestInit): Promise<void> {
  const res = await apiFetch(path, init, !(init?.body instanceof FormData))
  if (!res.ok) {
    let detail = `下载失败（HTTP ${res.status}）`
    try { const body = await res.json(); if (typeof body?.detail === 'string') detail = body.detail } catch { /* 非 JSON */ }
    throw new ApiError(res.status, detail)
  }
  const blob = await res.blob()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
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
  effective_date_evidence?: { title: string; url: string; accessed_at: string; grade: '强' | '中' | '弱'; source_kind: string; version?: string }
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
  /** 某个规则异常时后端会显式标记不完整；「未检出」不能被当作完整审查。 */
  analysis_incomplete?: boolean
  engine_meta: {
    checkpoint_count: number
    clause_count: number
    analysis_complete?: boolean
    analysis_incomplete?: boolean
    errors?: { checkpoint_id: string; error: string }[]
  }
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

/** 来源登记册条目（server/data/source_registry.json，公开只读）。 */
export interface SourceRegistryEntry {
  id: string
  name: string
  host: string
  authority_class: 'OFFICIAL_PRIMARY' | 'OFFICIAL_REPRINT' | 'COMMUNITY_TRANSCRIPTION' | 'REFERENCE_ONLY' | 'FOREIGN_OFFICIAL'
  jurisdiction: string
  roles?: string[]
  compliance: { approved: boolean }
  note?: string
  canary?: { url: string; expect: string[] }
}

/** Citator「被引用于」反查（已核实案例对本法的精确引用）。 */
export interface CitedBy {
  law_id: string
  case_count: number
  by_level: Record<string, number>
  articles: { no: number; sub?: string | null; case_count: number }[]
  cases: { id: string; name: string; case_no: string | null; court: string | null; date: string | null; level: string | null; kind: string | null; cited_articles: { no: number; sub?: string | null }[] }[]
  negative_history_note: string
  scope_note: string
}

/** 历史版本全文（非现行文本，仅供对照；不进现行检索语料）。 */
export interface VersionFulltext {
  law_id: string
  law_title: string
  version_id: string
  label: string
  status_note: string
  promulgation_date: string
  promulgation_organ: string | null
  effective_date: string
  article_count: number
  scope_note: string
  source: { kind: string; grade: string; url: string; snapshot: string; accessed_at: string; sha256: string }
  articles: { no: number; sub?: string; label: string; chapter?: string; text: string }[]
}

/** 历史文本独立检索（独立命名空间，永不混入现行检索排名）。 */
export interface HistorySearch {
  query: string
  total: number
  hits: {
    law_id: string
    version_id: string
    version_label: string
    effective_date: string | null
    no: number
    sub?: string | null
    label: string
    chapter?: string | null
    text: string
    score: number
  }[]
  scope_note: string
  index_versions: number
  index_articles: number
}

/** 跨版本条号重编号映射（相邻版本两两对齐，text_changed 标记实质修改）。 */
export interface RenumberMap {
  law_id: string
  pairs: {
    from_version: string
    to_version: string
    matches: { from_no: number; from_sub: string | null; to_no: number; to_sub: string | null; kind: 'same' | 'renumbered'; ratio: number; text_changed: boolean; label: string }[]
    unmatched_from: number[][]
    unmatched_to: number[][]
  }[]
  pair_count: number
  renumbered_count: number
  scope_note: string
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
  gate: { review_label: string; finalize_label: string }
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
  status: 'draft' | 'reviewed' | 'finalized'
  snapshot: Record<string, unknown>
}

/* server 契约：textarea_list 前端保持多行文本原样提交（server 端按行切分）；multi_select 传数组；citation_picker 传 {law_id, article_no}[] */
export type FieldsPayload = Record<string, string | string[] | { law_id: string; article_no: number }[]>

/* ---------- API ---------- */
export const api = {
  health: () => req<{ status: string; laws: number; articles: number }>('/health'),
  inventory: () => req<{
    laws: number
    articles: number
    verified_cases: number
    approved_explains: number
    fetched_at: string | null
    basis: 'current-controlled-corpus'
  }>('/inventory'),
  corpusCoverage: () => req<CorpusCoverage>('/corpus/coverage'),
  evals: () => req<{
    case_count: number
    hit_at_5: number
    mrr: number
    precision_at_5: number
    recall_at_20: number
    ndcg_at_10: number
    abstention_probes: number
    abstention_correct_rate: number
    citation_entity_total: number
    citation_entity_completeness: number
  }>('/evals'),

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
  transitionAnnotation: (rid: string, findingId: string, action: 'adopt' | 'amend' | 'reject' | 'reopen', amendedText?: string) =>
    req<unknown>(`/reviews/${rid}/annotations/${findingId}/transition`, {
      method: 'POST',
      body: JSON.stringify({ action, amended_text: amendedText }),
    }),
  reviewAudit: (rid: string) => req<{ entries: AuditEntry[] }>(`/reviews/${rid}/audit`),
  /** 审查记录 DOCX（Word 修订双轨：AI 建议以 w:ins 修订插入写入） */
  reviewDocxDownload: (rid: string) => downloadApi(`/reviews/${rid}/docx`, `review_${rid}.docx`),
  /** 律师回传修订稿（M7-T1 后半）：解析 Word 修订状态并同步批注状态机 */
  reviewDocxReturn: async (rid: string, file: File): Promise<{ accepted: string[]; rejected: string[]; pending: number; skipped: { id: string; reason: string }[]; accepted_n: number; rejected_n: number }> => {
    const fd = new FormData()
    fd.append('file', file)
    const res = await apiFetch(`/reviews/${rid}/docx-return`, { method: 'POST', body: fd }, false)
    if (!res.ok) {
      let detail = `HTTP ${res.status}`
      try { const b = await res.json(); if (typeof b?.detail === 'string') detail = b.detail } catch { /* 保留状态码 */ }
      throw new ApiError(res.status, detail)
    }
    return res.json()
  },
  /** PIPL 删除通道：删除审查记录（级联批注，审计留痕） */
  deleteReview: (rid: string) => req<{ deleted: string }>(`/reviews/${rid}`, { method: 'DELETE' }),
  /** PIPL 删除通道：删除文书草稿 */
  deleteDraft: (did: string) => req<{ deleted: string }>(`/drafts/${did}`, { method: 'DELETE' }),
  /** PIPL 删除通道：删除投诉工单 */
  deleteComplaint: (cid: string) => req<{ deleted: string }>(`/complaints/${cid}`, { method: 'DELETE' }),
  /** PIPL 导出通道：全量本机数据 JSON 下载 */
  privacyExport: async (): Promise<void> => {
    await downloadApi('/privacy/export', 'legalhigh_data_export.json')
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
  reviewDraft: (did: string, note?: string) =>
    req<{ from: string; to: string; actor: string }>(`/drafts/${did}/review`, { method: 'POST', body: JSON.stringify({ note }) }),
  finalizeDraft: (did: string, note?: string) =>
    req<{ from: string; to: string; actor: string; responsibility_confirmed: boolean }>(`/drafts/${did}/finalize`, { method: 'POST', body: JSON.stringify({ note, responsibility_confirmed: true }) }),
  draftDocxDownload: (did: string, templateId: string) => downloadApi(`/drafts/${did}/docx`, `${templateId}_${did}.docx`),

  // 引用式问答
  ask: (question: string, topK = 6) =>
    req<{
      question: string
      premise_check: { rule_id: string; warning: string; citation: Citation } | null
      answer_cards: {
        law_id: string; law_title: string; law_status: string; effective_date: string
        promulgation_instrument: string; article_no: number; article_label: string
        chapter: string; text: string; source_url: string; source_kind: string; score: number; sub?: string
      }[]
      no_answer: boolean
    }>('/qa/ask', { method: 'POST', body: JSON.stringify({ question, top_k: topK }) }),

  // 合规中心：投诉工单（真实落库 + 审计留痕）
  createComplaint: (subject: string, content: string, contact?: string, kind: 'general' | 'mobile' = 'general') =>
    req<{ complaint_id: string; status: string }>('/complaints', {
      method: 'POST',
      body: JSON.stringify({ subject, content, contact: contact || undefined, kind }),
    }),

  // 已核实案例清单（生产端点默认排除未核实记录）
  listCases: (q = '', level?: string, bias: 'balanced' | 'facts' | 'reasoning' = 'balanced') =>
    req<{ cases: CaseRecord[] }>(`/cases?q=${encodeURIComponent(q)}${level ? `&level=${encodeURIComponent(level)}` : ''}&bias=${bias}`),
  getCase: (caseId: string) => req<CaseRecord>(`/cases/${caseId}`),

  // 官方解读关联层（决策项15）：法条 → 对应司法解释条文（来源已核实）
  articleLinks: (lawId: string, no: number) =>
    req<{ law_id: string; no: number; links: ArticleLink[] }>(`/article-links/${encodeURIComponent(lawId)}/${no}`),

  // 法条人工通俗解读（仅已审核条目；AI 草稿审核前服务端不返回——决策项4 双轨）
  lawExplains: (lawId: string) =>
    req<{ law_id: string; explains: Record<string, ArticleExplain> }>(`/laws/${encodeURIComponent(lawId)}/explains`),

  // 版本注册表（S2-T4）：仅多版本登记的法律有数据；未建表返回 404（调用方容错隐藏）
  lawVersions: (lawId: string) =>
    req<{
      law_id: string; title: string
      versions: { version_id: string; label: string; status: string; promulgation_date: string; promulgation_organ?: string; promulgation_instrument?: string; effective_date: string; article_count: number | null; article_count_note?: string; current: boolean; has_fulltext?: boolean }[]
      amendments?: { no: string; title: string; passed_date: string; effective: string }[]
      pending_note: string
    }>(`/laws/${encodeURIComponent(lawId)}/versions`),

  // Citator「被引用于」（FLERF §26）：已核实案例对本法的精确引用反查（公开只读）
  citedBy: (lawId: string) =>
    req<CitedBy>(`/laws/${encodeURIComponent(lawId)}/cited-by`),

  // 历史版本全文（known-gaps #1 切片）：仅已采集版本可用；非现行文本对照查阅
  versionFulltext: (lawId: string, versionId: string) =>
    req<VersionFulltext>(`/laws/${encodeURIComponent(lawId)}/versions/${encodeURIComponent(versionId)}/fulltext`),

  // 历史文本独立检索（known-gaps #1）：37 份历史全文的独立 BM25 命中（非现行，独立命名空间）
  historySearch: (q: string, opts?: { lawId?: string; versionId?: string; topK?: number }) => {
    const p = new URLSearchParams({
      q,
      top_k: String(opts?.topK ?? 10),
      ...(opts?.lawId ? { law_id: opts.lawId } : {}),
      ...(opts?.versionId ? { version_id: opts.versionId } : {}),
    })
    return req<HistorySearch>(`/history/search?${p}`)
  },

  // 跨版本条号重编号映射（known-gaps #1）：difflib 确定性对齐（公开只读；少两个版本 404）
  renumberMap: (lawId: string) =>
    req<RenumberMap>(`/laws/${encodeURIComponent(lawId)}/renumber-map`),

  // 原文 + 官方解释 + 具名专业观点；证据覆盖分明确不等于正确率
  lawAnalysisContext: (lawId: string, no: number) =>
    req<LawAnalysisContext>(`/laws/${encodeURIComponent(lawId)}/articles/${no}/analysis-context`),

  // 解读审核队列（敏感端点：需本机管理令牌；未配置时服务端 503 明示关闭）
  explainsQueue: () => req<{ queue: { law_id: string; no: number; text: string; author: string; date?: string; source_note?: string }[] }>('/explains/queue'),
  /** 内容发布审核：审核署名=服务端配置主体（不可自报、不代表资格核验）；动作写入审计 */
  reviewExplain: (lawId: string, no: number, action: 'approve' | 'reopen') =>
    req<{ status: string }>(`/explains/${encodeURIComponent(lawId)}/${no}`, { method: 'PATCH', body: JSON.stringify({ action }) }),

  // 主检索（server BM25，与问答/研究同一引擎；多词/口语化查询可命中）
  // asOf（可选，YYYY-MM-DD）：时间视角——命中携带时点适用标记与历史版本对照
  search: (q: string, topK = 20, lawId?: string, asOf?: string) => {
    const extra = `${lawId ? `&law_id=${encodeURIComponent(lawId)}` : ''}${asOf ? `&as_of=${encodeURIComponent(asOf)}` : ''}`
    return req<SearchResult>(`/search?q=${encodeURIComponent(q)}&top_k=${topK}${extra}`)
  },

  // 平台合规声明（公开端点：定位/红线/模型状态，供页面公示与审计者核查）
  compliance: () =>
    req<{ positioning: string; disclaimer: string; model_status: { status: string; detail: string; filing_no: string | null }; red_lines: string[] }>('/compliance'),

  // 来源登记册（公开端点：全部外部来源的权威等级与合规批准状态；approved 之外禁止抓取）
  sources: () =>
    req<{ schema_version: number; approval_version: string; sources: SourceRegistryEntry[] }>('/sources'),

  // 交付前校验
  listDrafts: () => req<{ drafts: { id: string; created_at: string; template_id: string; status: string }[] }>('/drafts'),
  draftValidation: (did: string) => req<DraftValidation>(`/drafts/${did}/validation`),

  // 来源研究（server BM25 多查询检索备忘录；无 LLM 自由生成）
  researchMemo: (question: string, lawIds?: string[], topK = 12) =>
    req<ResearchMemo>('/research/memo', {
      method: 'POST',
      body: JSON.stringify({ question, law_ids: lawIds ?? null, top_k: topK }),
    }),
  /** 研究备忘录 DOCX（POST 二进制 → blob 下载） */
  researchReport: async (question: string, lawIds?: string[], topK = 12): Promise<void> => {
    const res = await apiFetch('/research/report', {
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

  session: () => req<{ principal: string; assurance: string }>('/session'),

  // AI 模型插件（OpenAI 协议 harness；BYO key，密钥仅随请求瞬态发送）
  aiProviders: () =>
    req<{ providers: { id: string; name: string; base_url: string; default_model: string; models_hint: string[]; docs: string; local: boolean; env_key: string | null; env_key_set: boolean }[] }>('/ai/providers'),
  aiTest: (p: { provider_id: string; model: string; api_key?: string; base_url_override?: string }) =>
    req<{ ok: boolean; sample?: string; error?: string }>('/ai/test', { method: 'POST', body: JSON.stringify(p) }),
  aiChat: (p: { provider_id: string; model: string; messages: { role: string; content: string }[]; api_key?: string; base_url_override?: string; allowed_refs?: { law_id?: string; law_title?: string; article_no: number }[]; temperature?: number }) =>
    req<{
      provider_id: string; provider_name: string; model: string; text: string
      gates: {
        redline: { pass: boolean; hits: string[] }
        citations: { pass: boolean; violations: string[]; note?: string }
        claim_support: { pass: boolean; verification_scope: string; violations: string[]; checks: { sentence: number; clause: number; lexical_overlap: number; has_citation: boolean; advisory: boolean; categorical_case_outcome: boolean; pass: boolean }[] }
      }
      evidence_context: { law_id: string; article_no: number; professional_sources: number; official_interpretations: number; evidence_coverage: LawAnalysisContext['evidence_coverage']; calibrated_accuracy: LawAnalysisContext['calibrated_accuracy'] }[]
      blocked: boolean; output_withheld: boolean; usage: Record<string, number>; disclaimer: string
    }>('/ai/chat', { method: 'POST', body: JSON.stringify(p) }),

  // 需求解析（本机确定性规则与 BM25；不把用户描述发送给模型）
  needsParse: (text: string) =>
    req<NeedsParseResult>('/needs/parse', { method: 'POST', body: JSON.stringify({ text }) }),
  needsPlan: (payload: IntakePlanPayload) =>
    req<NeedsParseResult>('/needs/plan', { method: 'POST', body: JSON.stringify(payload) }),

  // 案件要件练习：无状态、必须由使用者明确选择请求权模型，不自动定性
  caseAnalyze: (caseText: string, claimId: ClaimId, title?: string) =>
    req<CaseAnalysisResult>('/case/analyze', {
      method: 'POST', body: JSON.stringify({ case_text: caseText, claim_id: claimId, title }),
    }),

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
  ref_effective_date: string
  ref_promulgation_instrument: string
  ref_source_url: string
  ref_source_kind: string
}

/* ---------- 法条人工通俗解读（双轨：AI 草稿 → 人工审核 → approved 对外） ---------- */
export interface ArticleExplain {
  text: string
  author: string
  /** Structured AI-participation mark (S6-T2, Article 4): 'ai' | 'human'; missing = human (honest degradation; the author string never drives the badge). */
  drafted_by?: 'ai' | 'human'
  reviewer: string
  date?: string
  source_note?: string
}

export interface ProfessionalCommentary {
  id: string
  title: string
  source_kind: string
  authors: { name: string; credential: string; credential_source_url: string }[]
  institution: string
  published_at: string
  accessed_at: string
  source_url: string
  evidence_grade: '强' | '中' | '弱'
  rights: 'link-and-original-summary'
  summary: string
  scope_note: string
}

export interface LawAnalysisContext {
  law_id: string
  article_no: number
  citation: Citation & { text: string; article_label: string }
  official_interpretations: ArticleLink[]
  professional_commentaries: ProfessionalCommentary[]
  evidence_coverage: {
    score: number; max_score: 100; label: string; not_accuracy: true
    components: { name: string; points: number; present: boolean }[]
    missing: string[]; method: string
  }
  calibrated_accuracy: { status: 'unavailable' | 'available'; value: number | null; reason: string }
  limitations: string[]
  disclaimer: string
}

export interface CorpusCoverage {
  schema_version: 1
  updated_at: string
  national_law_catalog: {
    count: number; as_of: string; title: string; source_url: string
    accessed_at: string; evidence_grade: '强'; comparison_warning: string
  }
  controlled_instrument_ids: string[]
  priority_backlog: { title: string; reason: string; status: 'official-source-identified-not-imported'; source_url: string }[]
  update_protocol: string[]
}

/* ---------- 主检索（server BM25 结果；排序唯一来源） ---------- */
export interface SearchHit {
  law_id: string; law_title: string; no: number; sub?: string; label: string
  chapter: string; text: string; score: number
  law_status: string; effective_date: string
  source_url: string; source_kind: string
  /** 时间视角（as_of）存在时的时点适用标记与历史版本对照（R169/R178） */
  in_force_at_as_of?: boolean
  historical_version?: {
    version_id: string
    label: string
    promulgation_date: string | null
    effective_date: string | null
    text: string | null
    label_found: string | null
    located_via?: string
    mapped_from_no?: number
    mapped_ratio?: number
    shift_note: string
  }
}
export interface SearchResult {
  query: string
  total: number
  hits: SearchHit[]
  retrieval_meta: { method: string; corpus_size: number }
  temporal?: {
    reference_detected: boolean
    as_of: string | null
    granularity: string
    notice: string
    limitation: string
  } | null
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
const FAV_KEY = 'lh:favs:v1'
const LEGACY_FAV_KEY = 'lh:favs'
const FAV_TYPES = new Set<FavItem['type']>(['法条', '案例', '研究', '审查', '草稿'])
function isFavItem(v: unknown): v is FavItem {
  if (!v || typeof v !== 'object') return false
  const x = v as Record<string, unknown>
  return typeof x.key === 'string' && FAV_TYPES.has(x.type as FavItem['type'])
    && typeof x.title === 'string' && typeof x.meta === 'string'
    && typeof x.to === 'string' && typeof x.ts === 'string'
}
export function loadFavsState(): { items: FavItem[]; warning: string | null } {
  const raw = localStorage.getItem(FAV_KEY) ?? localStorage.getItem(LEGACY_FAV_KEY)
  if (raw === null) return { items: [], warning: null }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed) || !parsed.every(isFavItem)) {
      return { items: [], warning: '本机收藏数据格式不兼容，已停止读取；原始数据仍保留在浏览器存储中。' }
    }
    if (localStorage.getItem(FAV_KEY) === null) localStorage.setItem(FAV_KEY, JSON.stringify(parsed))
    return { items: parsed, warning: null }
  } catch {
    return { items: [], warning: '本机收藏数据无法解析，已停止读取；原始数据仍保留在浏览器存储中。' }
  }
}
export function loadFavs(): FavItem[] {
  return loadFavsState().items
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
  grade: '强' | '中' | '弱'; source_note: string; source_title: string; source_url: string
  source_accessed_at: string; verified: boolean
  official_entries: { name: string; url: string }[]
}
export interface NeedsParseResult {
  input: string
  parse: {
    understood: string; issue_type: string
    assumed_causes: string[]; keywords: string[]; cautions: string[]
    /** 展示降噪后的关键词（决策项2：有域词时仅显示域词）；缺省回退 keywords */
    keywords_display?: string[]
    /** 关键事实缺失清单（FLERF §8 unknown_material_facts）：只提示补充，不定性 */
    missing_material_facts?: { domain: string; missing: { id: string; fact: string; why: string }[]; note: string }[]
    by: 'deterministic'
  }
  ai_error: string | null
  articles: NeedArticle[]
  cases: NeedCase[]
  articles_none: boolean
  corpus_size: number
  disclaimer: string
  intake?: {
    summary: string
    trigger: string
    timeline: string[]
    actual_outcome: string
    parties: string[]
    desired_outcome: string
    questions: string[]
    missing_questions: string[]
    evidence_checklist: { id: string; item: string; state: string; source: string; verification: 'user-reported' | 'rule-suggested' }[]
    issue_candidates: { id: string; label: string; status: 'candidate' | 'unknown'; matched_terms: string[]; fact_basis: string[]; note: string }[]
    field_status: Record<string, 'filled' | 'not_provided'>
    next_steps: string[]
    method: string
  }
}

export interface IntakePlanPayload {
  summary: string
  trigger: string
  timeline: string[]
  actual_outcome: string
  parties: string[]
  evidence_owned: string[]
  evidence_missing: string[]
  desired_outcome: string
  questions: string[]
}

export type ClaimId = 'loan_repayment' | 'breach_damage' | 'consumer_fraud' | 'wage_claim'
export interface CaseAnalysisResult {
  title: string
  claim_id: ClaimId
  claim: {
    claim: { id: ClaimId; name: string }
    elements: { id: string; title: string; status: 'supported' | 'unverified'; evidence_spans: { excerpt: string; start: number }[]; citations: Citation[] }[]
    summary: { supported: number; unverified: number; overall: string }
    disclaimer: string
  }
  references: Citation[]
  disclaimers: string[]
}

/* ---------- AI 模型档案（只持久化非秘密配置；密钥永不写浏览器存储） ---------- */
export interface AiProfile {
  provider_id: string
  model: string
  base_url_override?: string
}
const AI_PROFILE_KEY = 'lh:ai:profile:v1'
const LEGACY_AI_PROFILE_KEY = 'lh:ai:profile'
// localStorage 键名（存的是用户本机填写的模型密钥，本身不是凭据字面量）
const AI_KEY_SLOT = 'lh:ai:secret:v1'
export function loadAiProfile(): AiProfile | null {
  try {
    const raw = localStorage.getItem(AI_PROFILE_KEY) ?? localStorage.getItem(LEGACY_AI_PROFILE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const x = parsed as Record<string, unknown>
    if (typeof x.provider_id !== 'string' || typeof x.model !== 'string') return null
    const config: AiProfile = {
      provider_id: x.provider_id,
      model: x.model,
      base_url_override: typeof x.base_url_override === 'string' ? x.base_url_override : undefined,
    }
    // 旧版本曾把密钥放入 local/session storage；读取时立即清除，不迁移秘密。
    if (localStorage.getItem(AI_PROFILE_KEY) === null) localStorage.setItem(AI_PROFILE_KEY, JSON.stringify(config))
    if (localStorage.getItem(LEGACY_AI_PROFILE_KEY) !== null) localStorage.removeItem(LEGACY_AI_PROFILE_KEY)
    sessionStorage.removeItem(AI_KEY_SLOT)
    return config
  } catch { return null }
}
export function saveAiProfile(p: AiProfile) {
  const config = { provider_id: p.provider_id, model: p.model, base_url_override: p.base_url_override }
  localStorage.setItem(AI_PROFILE_KEY, JSON.stringify(config))
  sessionStorage.removeItem(AI_KEY_SLOT)
}
export function clearAiProfile() {
  localStorage.removeItem(AI_PROFILE_KEY)
  localStorage.removeItem(LEGACY_AI_PROFILE_KEY)
  sessionStorage.removeItem(AI_KEY_SLOT)
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
export interface CaseStatute { law_id: string; no: number; label: string; sub?: string }
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
  result?: string
  statutes: CaseStatute[]
  research_refs?: CaseStatute[]
  court_level?: string
  procedure_type?: string
  doc_type?: string
  kind: SourceKind
  grade: '强' | '中' | '弱'
  source_title: string
  source_url: string
  source_accessed_at: string
  source_note: string
  verified: boolean
  sample?: boolean
}
type SourceKind = 'law' | 'case' | 'academic' | 'foreign' | 'ai'

export interface ValidationCheck { id: string; group: string; title: string; pass: boolean; detail: string }
export interface DraftValidation {
  draft_id: string
  template_id: string
  status: 'draft' | 'reviewed' | 'finalized'
  ready: boolean
  need_review: boolean
  checks: ValidationCheck[]
  disclaimer: string
}
