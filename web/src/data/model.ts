// 全站静态配置与明确标注的练习输入文本。
// 证据纪律：法条一律来自 /data/laws.json（server 证据快照语料）；案例仅收录可公开查证的
// 真实案件由 server 提供并标注来源与可信等级；生产状态不得由前端静态伪造。
import { useEffect, useState } from 'react'
import type { IconName } from '../components/icons'
import type { AudienceMode } from '../lib/audience'

/* ================= 法条语料（运行时加载，构建自 server/data/laws） ================= */
export interface LawArticle { no: number; sub?: string; label: string; chapter: string; text: string }
export interface Law {
  id: string; title: string; status: string; organ: string
  promulgationDate: string; instrument: string; effectiveDate: string
  effectiveDateEvidence?: { title: string; url: string; accessed_at: string; grade: '强' | '中' | '弱'; source_kind: string; version?: string }
  sourceUrl: string; authority: string; articles: LawArticle[]
}
export interface LawsFile { builtAt: string; fetchDate: string; note: string; laws: Law[] }

/** 当前语料的证据等级：gov.cn 官方发布页为强；Wikisource 等转录快照为中，须再与官方现行文本核对。 */
export function lawEvidenceGrade(sourceUrl: string | undefined): '强' | '中' {
  const host = (() => { try { return new URL(sourceUrl ?? '').hostname.toLowerCase() } catch { return '' } })()
  return host === 'www.gov.cn' || host.endsWith('.gov.cn') ? '强' : '中'
}

let lawsPromise: Promise<LawsFile> | null = null
export function loadLaws(): Promise<LawsFile> {
  lawsPromise ??= fetch(`${import.meta.env.BASE_URL}data/laws.json`, { cache: 'no-cache' }).then((r) => {
    if (!r.ok) throw new Error(`语料加载失败（HTTP ${r.status}）`)
    return r.json() as Promise<LawsFile>
  })
  return lawsPromise
}

export function useLaws(): { data: LawsFile | null; error: string | null } {
  const [data, setData] = useState<LawsFile | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    loadLaws().then(
      (d) => alive && setData(d),
      (e) => alive && setError(e instanceof Error ? e.message : String(e)),
    )
    return () => { alive = false }
  }, [])
  return { data, error }
}

export function findLaw(laws: LawsFile | null, id: string | undefined): Law | undefined {
  return laws?.laws.find((l) => l.id === id)
}
export function findArticle(law: Law | undefined, no: number, sub?: string): LawArticle | undefined {
  // 子条号（之一/之二…）与基条同 no——按 (no, sub) 精确匹配；sub 缺省取基条
  return law?.articles.find((a) => a.no === no && (a.sub ?? '') === (sub ?? ''))
}

/** 解析 ?art= 参数（如 "287" 或 "287之一"）→ {no, sub}；非法返回 undefined。 */
export function parseArtParam(raw: string | null): { no: number; sub?: string } | undefined {
  const m = /^(\d+)(之[一二三四五六七八九十]+)?$/.exec((raw ?? '').trim())
  if (!m) return undefined
  return { no: Number(m[1]), sub: m[2] }
}

/** 子条号 URL 片段：基条为 "287"，子条号为 "287之一"。 */
export function artParam(no: number, sub?: string): string {
  return `${no}${sub ?? ''}`
}
export function lawChapters(law: Law): string[] {
  const seen: string[] = []
  for (const a of law.articles) {
    const top = a.chapter.split('>')[0]?.trim()
    if (top && !seen.includes(top)) seen.push(top)
  }
  return seen
}

/** 引注显示标题（D2）：status 含修订年份时并入标题，如《民事诉讼法（2023修正）》 */
export function lawDisplayTitle(title: string, status?: string): string {
  const m = status?.match(/（(\d{4}(?:修正|修订))）/)
  return m ? `${title}（${m[1]}）` : title
}

/* 检索统一走 server BM25（GET /api/search）：前端子串匹配版本已于 2026-08-30 移除，
   防止双检索路径回归（多词查询在子串匹配下必然空结果，见查漏补缺计划 P0-3）。 */

/* ================= 品牌与导航 ================= */
export const BRAND = {
  name: 'LegalHigh',
  sub: '法律至上 · 普法惠民',
}

/* 普法温度提示（内容均为可查证的公共法律常识；引用条文来自本地语料） */
export const WARM_TIPS = {
  aid: '符合法定条件者可以申请法律援助；全国拨打 12348 可免费获得基本法律咨询服务。',
  aidSourceUrl: 'https://www.moj.gov.cn/pub/sfbgwapp/bnywapp/202105/t20210527_422679.html',
  aidSourceTitle: '司法部：公共法律服务体系建设情况',
  aidSourceCheckedAt: '2026-09-01',
  aidSourceGrade: '强' as const,
  evidence: '维权第一步是留存证据：合同、转账记录、聊天记录、票据，都是保护你的凭证。',
  labor: '劳动争议实行仲裁前置：先申请劳动仲裁，对裁决不服再依法向法院起诉。',
  limit: {
    text: '向人民法院请求保护民事权利的诉讼时效期间一般为三年，及时主张权利。',
    lawId: 'civl-2020', no: 188,
  },
}

export interface NavEntry { to: string; icon: IconName; label: string; audiences?: AudienceMode[] }
export const NAV_MAIN: NavEntry[] = [
  { to: '/', icon: 'home', label: '首页' },
  { to: '/needs', icon: 'compass', label: '事实与证据梳理' },
  { to: '/search', icon: 'lawSearch', label: '法律检索' },
  { to: '/research', icon: 'sparkle', label: '来源研究', audiences: ['student', 'professional'] },
  { to: '/cases', icon: 'caseSearch', label: '案例检索' },
  { to: '/laws', icon: 'article', label: '法规条文' },
  { to: '/contracts', icon: 'shield', label: '合同审查', audiences: ['professional'] },
  { to: '/draft', icon: 'docpen', label: '文书工具', audiences: ['professional'] },
  { to: '/workspace', icon: 'briefcase', label: '专业工作台', audiences: ['professional'] },
  { to: '/learning', icon: 'gradcap', label: '学习中心', audiences: ['student'] },
  { to: '/comparative', icon: 'globe', label: '跨法域对比', audiences: ['student', 'professional'] },
  { to: '/data-sources', icon: 'database', label: '数据洞察' },
  { to: '/guide', icon: 'book', label: '使用指南' },
  { to: '/terms', icon: 'bulb', label: '术语卡' },
]
export const NAV_SUB: NavEntry[] = [
  { to: '/collections', icon: 'star', label: '我的收藏' },
  { to: '/audit', icon: 'history', label: '历史记录', audiences: ['professional'] },
]

/* ================= 案例库已迁移至 server（/api/cases，server/data/cases.json） =================
   数据纪律：生产数据只收录带直接来源链接和核验日期的真实案件。 */
export type SourceKind = 'law' | 'case' | 'academic' | 'foreign' | 'ai'
export type Grade = '强' | '中' | '弱'

/* ================= 来源研究工作台已迁移至 server（/api/research/memo，BM25 多查询检索） =================
   证据与引用由 server citation_of 收口；分析笔记/研究记录为研究者本机撰写（localStorage）。 */
export const PIPELINE_STEPS = ['理解问题', '检索法条', '检索案例', '验证来源', '分析冲突', '生成回答', 'Citation Check']

/* ================= 学习中心 ================= */
export const SUBJECTS: { id: string; name: string; desc: string; lawIds: string[]; icon: IconName; tone: string }[] = [
  { id: 'civil', name: '民法', desc: '民法典精读 · 请求权基础', lawIds: ['civl-2020'], icon: 'scale', tone: 'blue' },
  { id: 'labor', name: '劳动用工', desc: '劳动合同法专题', lawIds: ['lcl-2012'], icon: 'briefcase', tone: 'green' },
  { id: 'consumer', name: '消费者保护', desc: '消费者权益 · 平台责任', lawIds: ['cl-2013', 'crpl-imp-2024', 'ecom-2018', 'wlxf-2022'], icon: 'shield', tone: 'purple' },
  { id: 'procedure', name: '民事诉讼', desc: '民事诉讼法专题', lawIds: ['pcl-2023'], icon: 'file', tone: 'blue' },
  { id: 'contract', name: '合同规则', desc: '民法典合同编司法解释', lawIds: ['htjs-2023'], icon: 'docShield', tone: 'purple' },
  { id: 'profession', name: '律师执业', desc: '律师法与执业边界', lawIds: ['ll-2017'], icon: 'briefcase', tone: 'green' },
  { id: 'genai', name: '生成式 AI 合规', desc: '生成式人工智能服务管理暂行办法', lawIds: ['genai-2023'], icon: 'sparkle', tone: 'blue' },
]
export const Socratic_QS = [
  '若条款同时具有「免除责任」与「合理对价」属性，第497条的「不合理」应如何论证？',
  '指导案例24号中「体质不减轻责任」与过错相抵的边界在哪里？',
  '无合同关系的受害人可否援引“邻人原则”在中国法下请求赔偿？请求权基础是什么？',
]

/* ================= 工作台/审计已迁移至 server 真实数据 =================
   审查记录：/api/reviews；文书草稿：/api/drafts；审计：/api/audit；
   投诉：/api/complaints。原型不再内置虚构的 Matter/成员/审计演示数据（2026-08-30 模拟层清零）。 */

/* ================= 收藏（指向真实语料与已核实案例） ================= */
/* ================= 收藏已迁移：本机收藏夹（web/src/lib/api.ts loadFavs）+ server 研究记录 ================= */
/* ================= 仪表盘 ================= */
export const HOT_SEARCHES = ['劳动合同', '不当得利', '商业贿赂', '著作权侵权', '涉外离婚']
// 语料动态 = 历史事件流水（按日期如实记录，勿改写为「当前」口径；当前规模以侧栏/数据源页实时数据为准）
export const CORPUS_DYNAMICS = [
  { t: '证据快照语料更新：《民事诉讼法（2023修正）》入库，累计 8 部 1,953 条', m: '2026-08-30 · 本地语料（Wikisource 快照）', icon: 'database' as IconName },
  { t: '证据快照语料构建完成：7 部法律 1,647 条（顺序递增校验通过）', m: '2026-08-29 · 本地语料（Wikisource 快照）', icon: 'shieldCheck' as IconName },
  { t: '《生成式人工智能服务管理暂行办法》入库（24 条）', m: '2026-08-29 · 数据洞察', icon: 'sparkle' as IconName },
]
