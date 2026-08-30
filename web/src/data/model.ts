// 全站数据模型与演示数据。
// 证据纪律：法条一律来自 /data/laws.json（server 证据快照语料）；案例仅收录可公开查证的
// 真实案件并标注来源与可信等级；虚构/占位内容一律带「示例」或「未核实」标记。
import { useEffect, useState } from 'react'
import type { IconName } from '../components/icons'

/* ================= 法条语料（运行时加载，构建自 server/data/laws） ================= */
export interface LawArticle { no: number; label: string; chapter: string; text: string }
export interface Law {
  id: string; title: string; status: string; organ: string
  promulgationDate: string; instrument: string; effectiveDate: string
  sourceUrl: string; authority: string; articles: LawArticle[]
}
export interface LawsFile { builtAt: string; fetchDate: string; note: string; laws: Law[] }

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
export function findArticle(law: Law | undefined, no: number): LawArticle | undefined {
  return law?.articles.find((a) => a.no === no)
}
export function lawChapters(law: Law): string[] {
  const seen: string[] = []
  for (const a of law.articles) {
    const top = a.chapter.split('>')[0]?.trim()
    if (top && !seen.includes(top)) seen.push(top)
  }
  return seen
}

/* 检索统一走 server BM25（GET /api/search）：前端子串匹配版本已于 2026-08-30 移除，
   防止双检索路径回归（多词查询在子串匹配下必然空结果，见查漏补缺计划 P0-3）。 */

/* ================= 品牌与导航 ================= */
export const BRAND = {
  name: 'LegalHigh',
  sub: '法律至上 · 普法惠民',
  user: 'Alex Wang', role: '执业律师（演示账号）',
}

/* 普法温度提示（内容均为可查证的公共法律常识；引用条文来自本地语料） */
export const WARM_TIPS = {
  aid: '遇到纠纷不必慌张：经济困难可依法申请法律援助，12348 公共法律服务热线提供免费咨询。',
  evidence: '维权第一步是留存证据：合同、转账记录、聊天记录、票据，都是保护你的凭证。',
  labor: '劳动争议实行仲裁前置：先申请劳动仲裁，对裁决不服再依法向法院起诉。',
  limit: {
    text: '向人民法院请求保护民事权利的诉讼时效期间一般为三年，及时主张权利。',
    lawId: 'civl-2020', no: 188,
  },
}

export interface NavEntry { to: string; icon: IconName; label: string }
export const NAV_MAIN: NavEntry[] = [
  { to: '/', icon: 'home', label: '首页' },
  { to: '/search', icon: 'lawSearch', label: '法律检索' },
  { to: '/research', icon: 'sparkle', label: 'AI 研究' },
  { to: '/cases', icon: 'caseSearch', label: '案例检索' },
  { to: '/laws', icon: 'article', label: '法规条文' },
  { to: '/contracts', icon: 'shield', label: '合同审查' },
  { to: '/draft', icon: 'docpen', label: '文书工具' },
  { to: '/workspace', icon: 'briefcase', label: '律师工作台' },
  { to: '/learning', icon: 'gradcap', label: '学习中心' },
  { to: '/comparative', icon: 'globe', label: '跨法域对比' },
  { to: '/data-sources', icon: 'database', label: '数据洞察' },
]
export const NAV_SUB: NavEntry[] = [
  { to: '/collections', icon: 'star', label: '我的收藏' },
  { to: '/audit', icon: 'history', label: '历史记录' },
]

/* ================= 案例库已迁移至 server（/api/cases，server/data/cases.json） =================
   数据纪律沿用：仅收录可公开查证案件；sample=true 为「未核实」演示占位，禁止引用。
   审计口径见 docs/2026-08-29-数据真实性审计.md */
export type SourceKind = 'law' | 'case' | 'academic' | 'foreign' | 'ai'
export type Grade = '强' | '中' | '弱'

/* ================= 合同库（虚构示例合同，当事人为通用占位名称） ================= */
export type RiskLevel = 'high' | 'mid' | 'low'
export interface ContractRisk {
  id: string; level: RiskLevel; type: string
  quote: string; anchor: string            // 原条款与正文定位
  basis: { lawId: string; no: number; label: string }[]
  explain: string
  suggest: string
  cases: string[]
  reviewer: string; time: string; status: '待处理' | '已忽略' | '已完成'
}
export interface ContractSection { id: string; h: string; paras: (string | { risk: string; riskId: string; level: RiskLevel })[] }
export interface ContractItem {
  id: string; name: string; type: string; party: string
  status: '待审查' | '审查中' | '已完成'; riskScore: number
  reviewedAt: string; owner: string; version: string; updatedAt: string
  expiring?: boolean
  outline: { id: string; h: string; risks: number }[]
  sections: ContractSection[]
  risks: ContractRisk[]
}
export const CONTRACTS: ContractItem[] = [
  {
    id: 'c-1', name: '软件技术服务合同（示例）', type: '技术服务', party: 'A 科技有限公司 / B 数据服务有限公司（示例）',
    status: '审查中', riskScore: 72, reviewedAt: '2026-08-28', owner: 'Alex Wang', version: 'v3', updatedAt: '2026-08-28 16:40', expiring: true,
    outline: [
      { id: 's1', h: '第一条 服务内容与标准', risks: 0 },
      { id: 's2', h: '第二条 服务费用与支付', risks: 2 },
      { id: 's3', h: '第三条 双方责任与赔偿', risks: 2 },
      { id: 's4', h: '第四条 保密与知识产权', risks: 1 },
      { id: 's5', h: '第五条 争议解决与生效', risks: 1 },
    ],
    sections: [
      { id: 's1', h: '第一条 服务内容与标准', paras: ['甲方委托乙方提供软件技术服务，服务内容包括系统开发、部署与运维支持。服务标准应符合行业通行规范及双方确认的技术方案。'] },
      {
        id: 's2', h: '第二条 服务费用与支付',
        paras: [
          '2.1 服务费用总额为人民币（大写）______________元（¥______________元）。',
          { risk: '2.2 乙方应在合同签署后 180 日内一次性向甲方支付全部服务费用，甲方未收到款项前有权暂停服务。', riskId: 'r-1', level: 'high' },
          { risk: '2.3 甲方逾期付款的，每逾期一日按未付款项的 5% 向乙方支付违约金。', riskId: 'r-2', level: 'high' },
        ],
      },
      {
        id: 's3', h: '第三条 双方责任与赔偿',
        paras: [
          { risk: '3.1 任何情况下，乙方因本合同所获赔偿总额不超过已收取服务费用的 10%。', riskId: 'r-3', level: 'high' },
          '3.2 因一方违约给对方造成损失的，违约方应承担赔偿责任。',
          { risk: '3.3 乙方对服务成果不作出任何明示或默示的保证。', riskId: 'r-4', level: 'mid' },
        ],
      },
      {
        id: 's4', h: '第四条 保密与知识产权',
        paras: [
          '4.1 双方对在合作过程中知悉的对方商业秘密负有保密义务，保密期限为合同终止后 2 年。',
          { risk: '4.2 服务过程中形成的全部工作成果（含源代码）知识产权归乙方所有，甲方仅享有使用权。', riskId: 'r-5', level: 'mid' },
        ],
      },
      {
        id: 's5', h: '第五条 争议解决与生效',
        paras: [
          { risk: '5.1 因本合同引起的争议，双方同意提交乙方所在地人民法院管辖。', riskId: 'r-6', level: 'low' },
          '5.2 本合同自双方签字盖章之日起生效，一式两份。',
        ],
      },
    ],
    risks: [
      {
        id: 'r-1', level: 'high', type: '付款期限',
        quote: '乙方应在合同签署后 180 日内一次性向甲方支付全部服务费用……',
        anchor: 's2', basis: [{ lawId: 'civl-2020', no: 577, label: '《民法典》第577条（违约责任）' }],
        explain: '付款周期过长且无进度款安排，收款方资金风险集中；暂停服务条款可能与服务连续性义务冲突。',
        suggest: '改为「合同生效后 10 个工作日内支付 50% 预付款，验收合格后 10 个工作日内支付剩余 50%」，并删除单方暂停服务的概括授权。',
        cases: ['服务合同纠纷中付款期限与验收挂钩的常见争议'], reviewer: 'AI 审查 · Alex Wang 已复核', time: '2026-08-28 16:12', status: '待处理',
      },
      {
        id: 'r-2', level: 'high', type: '违约金',
        quote: '甲方逾期付款的，每逾期一日按未付款项的 5% 向乙方支付违约金。',
        anchor: 's2', basis: [{ lawId: 'civl-2020', no: 585, label: '《民法典》第585条（违约金调整）' }],
        explain: '日 5% 折合年化约 1825%，显著高于实际损失，诉讼中大概率被酌减；对双方均有不确定性。',
        suggest: '调整为「每逾期一日按未付款项的 0.05% 支付违约金，总额不超过未付款项的 20%」。',
        cases: ['违约金过高酌减的公开案例中观察到法院多以 LPR 上浮为基准'], reviewer: 'AI 审查', time: '2026-08-28 16:13', status: '待处理',
      },
      {
        id: 'r-3', level: 'high', type: '责任上限',
        quote: '任何情况下，乙方因本合同所获赔偿总额不超过已收取服务费用的 10%。',
        anchor: 's3', basis: [{ lawId: 'civl-2020', no: 506, label: '《民法典》第506条（免责条款无效情形）' }],
        explain: '概括性超低责任上限，且未区分故意/重大过失；造成对方人身损害或因故意、重大过失造成财产损失的免责条款无效。',
        suggest: '增加除外情形：「因故意或重大过失造成损失的、侵犯知识产权的、保密义务违反的，不受该上限约束」，并将一般上限提高至合同总额。',
        cases: ['技术开发合同纠纷中责任上限条款效力的常见争点'], reviewer: 'AI 审查', time: '2026-08-28 16:15', status: '待处理',
      },
      {
        id: 'r-4', level: 'mid', type: '免责条款',
        quote: '乙方对服务成果不作出任何明示或默示的保证。',
        anchor: 's3', basis: [{ lawId: 'civl-2020', no: 497, label: '《民法典》第497条（格式条款无效）' }],
        explain: '与服务标准条款冲突：第一条已约定服务应符合技术方案，全面免责将架空质量义务，条款可能被认定不合理免除自身责任。',
        suggest: '改为「乙方保证服务成果符合第一条约定的技术标准；不符合的，应在合理期限内免费修复」。',
        cases: [], reviewer: 'AI 审查', time: '2026-08-28 16:16', status: '待处理',
      },
      {
        id: 'r-5', level: 'mid', type: '知识产权',
        quote: '服务过程中形成的全部工作成果（含源代码）知识产权归乙方所有，甲方仅享有使用权。',
        anchor: 's4', basis: [],
        explain: '成果归属属意思自治范畴，本条为对价失衡提示：甲方付费取得的仅为使用权，二次开发与数据迁移受限；无强制法条可直接支撑「必须归甲方」，故不虚构引用，建议结合交易对价与行业惯例评估。',
        suggest: '改为「工作成果知识产权归甲方所有，乙方保留背景知识产权及通用工具的复用权」。',
        cases: [], reviewer: 'AI 审查 · 待复核', time: '2026-08-28 16:18', status: '待处理',
      },
      {
        id: 'r-6', level: 'low', type: '管辖法院',
        quote: '双方同意提交乙方所在地人民法院管辖。',
        anchor: 's5', basis: [{ lawId: 'pcl-2023', no: 35, label: '《民事诉讼法》第35条（协议管辖）' }],
        explain: '协议管辖规则见于《民事诉讼法》第35条（2023修正，已入本地语料）：可书面协议选择被告住所地、合同履行地等与争议有实际联系地点的法院，但不得违反级别管辖与专属管辖。本条与被告住所地法定管辖重合，对甲方无额外利益；如改选仲裁须写明仲裁机构全称，否则条款可能无效。',
        suggest: '如选择仲裁：「提交北京仲裁委员会按其仲裁规则仲裁」；如诉讼：可改为「甲方所在地人民法院」。',
        cases: [], reviewer: 'AI 审查', time: '2026-08-28 16:20', status: '待处理',
      },
    ],
  },
  {
    id: 'c-2', name: '房屋租赁合同（示例）', type: '租赁', party: 'C 物业管理有限公司 / 个人租户（示例）',
    status: '待审查', riskScore: 41, reviewedAt: '—', owner: 'Alex Wang', version: 'v1', updatedAt: '2026-08-27 10:02',
    outline: [ { id: 's1', h: '第一条 租赁物与用途', risks: 0 }, { id: 's2', h: '第二条 租金与押金', risks: 1 }, { id: 's3', h: '第三条 续租与解除', risks: 1 } ],
    sections: [
      { id: 's1', h: '第一条 租赁物与用途', paras: ['甲方将位于______的房屋出租给乙方居住使用，租赁面积为______平方米。'] },
      { id: 's2', h: '第二条 租金与押金', paras: [ { risk: '2.3 租赁期满后押金不予退还，作为房屋占用补偿。', riskId: 'r-1', level: 'high' }, '2.1 月租金人民币______元。' ] },
      { id: 's3', h: '第三条 续租与解除', paras: [ { risk: '3.2 租赁期满自动续期一年，租金上浮 15%。', riskId: 'r-2', level: 'mid' } ] },
    ],
    risks: [
      { id: 'r-1', level: 'high', type: '押金/费用', quote: '租赁期满后押金不予退还，作为房屋占用补偿。', anchor: 's2', basis: [{ lawId: 'civl-2020', no: 497, label: '《民法典》第497条（格式条款无效）' }], explain: '无条件没收押金属于不合理免除出租人返还义务，通常被认定无效。', suggest: '改为「租赁期满，乙方结清费用并经房屋验收无损后，甲方于 7 日内无息退还押金」。', cases: [], reviewer: 'AI 审查', time: '2026-08-27 10:04', status: '待处理' },
      { id: 'r-2', level: 'mid', type: '自动续期', quote: '租赁期满自动续期一年，租金上浮 15%。', anchor: 's3', basis: [{ lawId: 'civl-2020', no: 734, label: '《民法典》第734条（续租）' }], explain: '概括性自动续租加重对方责任，且涨幅脱离市场基准；应改为需双方书面确认。', suggest: '改为「期满前 30 日内双方另行协商续租，同等条件下乙方享有优先承租权」。', cases: [], reviewer: 'AI 审查', time: '2026-08-27 10:06', status: '待处理' },
    ],
  },
  {
    id: 'c-3', name: '劳动合同-技术岗（示例）', type: '劳动', party: 'A 科技有限公司 / 拟聘员工（示例）',
    status: '已完成', riskScore: 18, reviewedAt: '2026-08-25', owner: '李律师（示例）', version: 'v2', updatedAt: '2026-08-25 14:20',
    outline: [ { id: 's1', h: '第一条 合同期限与试用', risks: 0 }, { id: 's2', h: '第二条 工作内容与地点', risks: 0 }, { id: 's3', h: '第三条 保密与竞业限制', risks: 1 } ],
    sections: [
      { id: 's1', h: '第一条 合同期限与试用', paras: ['本合同为三年期固定期限劳动合同，试用期六个月。'] },
      { id: 's2', h: '第二条 工作内容与地点', paras: ['岗位为软件工程师，工作地点为______。'] },
      { id: 's3', h: '第三条 保密与竞业限制', paras: [ { risk: '3.1 竞业限制期限为离职后三年，范围涵盖同行业全部企业，期间不支付经济补偿。', riskId: 'r-1', level: 'high' } ] },
    ],
    risks: [
      { id: 'r-1', level: 'high', type: '竞业限制', quote: '竞业限制期限为离职后三年，范围涵盖同行业全部企业，期间不支付经济补偿。', anchor: 's3', basis: [{ lawId: 'lcl-2012', no: 24, label: '《劳动合同法》第24条（竞业限制）' }], explain: '竞业限制期限不得超过二年；范围应限于有竞争关系的业务；未按月支付经济补偿的，劳动者可主张权利。', suggest: '期限改为不超过二年，限定具体竞争业务范围，并约定按月支付经济补偿。', cases: ['竞业限制补偿与期限效力的公开案例中观察到法院从严审查'], reviewer: 'AI 审查 · 李律师 已复核', time: '2026-08-25 14:08', status: '已完成' },
    ],
  },
]

/* ================= AI 研究工作台已迁移至 server（/api/research/memo，BM25 多查询检索） =================
   证据与引用由 server citation_of 收口；分析笔记/结论文稿为研究者本机撰写（localStorage）。 */
export const PIPELINE_STEPS = ['理解问题', '检索法条', '检索案例', '验证来源', '分析冲突', '生成回答', 'Citation Check']

/* ================= 对比研究素材（域外仅作比较研究） ================= */
export const FOREIGN_TERMS = [
  { flag: '🇺🇸', name: '美国', items: [{ t: 'Williams v. Walker-Thomas Furniture Co.', c: '350 F.2d 445 (D.C. Cir. 1965)', q: '确立显失公平（unconscionability）双要素：程序性＋实质性；法院可拒绝执行显失公平的合同条款。' }, { t: '《统一商法典》UCC §2-302', c: '制定法', q: '授权法院认定买卖合同条款显失公平并拒绝执行。' }] },
  { flag: '🇬🇧', name: '英国', items: [{ t: 'Unfair Contract Terms Act 1977', c: '制定法', q: '限制排除/限制因过失产生责任的条款效力，针对标准条款施加「合理性」检验。' }, { t: 'Consumer Rights Act 2015', c: '制定法', q: '消费者合同中不公平条款不具约束力，透明度与公平性为法定要求。' }] },
  { flag: '🇪🇺', name: '欧盟', items: [{ t: 'Council Directive 93/13/EEC（消费者合同不公平条款指令）', c: '指令', q: '未经个别协商的标准条款若造成权利义务显著失衡、有违善意，则对消费者不具约束力。' }] },
  { flag: '🇯🇵', name: '日本', items: [{ t: '《消費者契約法》', c: '2000年施行（2008年改正）', q: '误认/困惑缔结的消费者契约可撤销；经营者免责条款（仅限经营者损害赔偿责任的部分）可撤销。' }] },
]

/* ================= 学习中心 ================= */
export const SUBJECTS: { id: string; name: string; desc: string; count?: string; icon: IconName; tone: string }[] = [
  { id: 'civil', name: '民法', desc: '民法典精读 · 请求权基础', count: '1,260 条', icon: 'scale', tone: 'blue' },
  { id: 'labor', name: '劳动法', desc: '劳动合同法专题', count: '98 条', icon: 'briefcase', tone: 'green' },
  { id: 'consumer', name: '经济法', desc: '消费者保护 · 平台责任', count: '205 条', icon: 'shield', tone: 'purple' },
  { id: 'criminal', name: '刑法', desc: '语料未接入', icon: 'gavel', tone: 'gray' },
  { id: 'admin', name: '行政法', desc: '语料未接入', icon: 'building', tone: 'gray' },
  { id: 'procedure', name: '诉讼法', desc: '语料未接入', icon: 'file', tone: 'gray' },
  { id: 'intl', name: '国际法', desc: '语料未接入', icon: 'globe', tone: 'gray' },
  { id: 'ip', name: '知识产权', desc: '语料未接入', icon: 'bulb', tone: 'gray' },
]
export const Socratic_QS = [
  '若条款同时具有「免除责任」与「合理对价」属性，第497条的「不合理」应如何论证？',
  '指导案例24号中「体质不减轻责任」与过错相抵的边界在哪里？',
  '无合同关系的受害人可否援引“邻人原则”在中国法下请求赔偿？请求权基础是什么？',
]

/* ================= 工作台/审计已迁移至 server 真实数据 =================
   审查记录：/api/reviews；文书草稿：/api/drafts；审计：/api/audit；
   投诉：/api/complaints。原型不再内置虚构的 Matter/成员/审计演示数据（2026-08-30 模拟层清零）。 */

/* ================= 收藏（指向真实语料/案例 + 示例） ================= */
/* ================= 收藏已迁移：本机收藏夹（web/src/lib/api.ts loadFavs）+ server 研究记录 ================= */
/* ================= 仪表盘 ================= */
export const HOT_SEARCHES = ['劳动合同', '不当得利', '商业贿赂', '著作权侵权', '涉外离婚']
// 语料动态 = 历史事件流水（按日期如实记录，勿改写为「当前」口径；当前规模以侧栏/数据源页实时数据为准）
export const CORPUS_DYNAMICS = [
  { t: '证据快照语料更新：《民事诉讼法（2023修正）》入库，累计 8 部 1,953 条', m: '2026-08-30 · 本地语料（Wikisource 快照）', icon: 'database' as IconName },
  { t: '证据快照语料构建完成：7 部法律 1,647 条（顺序递增校验通过）', m: '2026-08-29 · 本地语料（Wikisource 快照）', icon: 'shieldCheck' as IconName },
  { t: '《生成式人工智能服务管理暂行办法》入库（24 条）', m: '2026-08-29 · 数据洞察', icon: 'sparkle' as IconName },
]

/* ================= 文书起草 ================= */
export const DOC_TYPES: { id: string; name: string; icon: IconName; tpl: string }[] = [
  { id: 'letter', name: '律师函', icon: 'send', tpl: 'letter' },
  { id: 'contract', name: '合同', icon: 'docShield', tpl: 'contract' },
  { id: 'complaint', name: '起诉状', icon: 'gavel', tpl: 'complaint' },
  { id: 'defense', name: '答辩状', icon: 'shield', tpl: 'defense' },
  { id: 'application', name: '申请书', icon: 'file', tpl: 'application' },
  { id: 'opinion', name: '法律意见书', icon: 'article', tpl: 'opinion' },
  { id: 'poa', name: '授权委托书', icon: 'stamp', tpl: 'poa' },
  { id: 'other', name: '其他文书', icon: 'note', tpl: 'other' },
]

/* ================= 校验清单（§20） ================= */
export interface CheckItem { id: string; group: string; t: string; d: string }
export const VALIDATION_CHECKS: CheckItem[] = [
  { id: 'v1', group: '事实完整性', t: '主体名称一致', d: '当事人名称在全文中拼写一致，与身份信息匹配。' },
  { id: 'v2', group: '事实完整性', t: '日期一致', d: '文内日期无矛盾、无未来日期。' },
  { id: 'v3', group: '事实完整性', t: '金额一致', d: '大小写金额一致，与请求金额匹配。' },
  { id: 'v4', group: '法律引用', t: '法条有效', d: '所引条文均为现行有效版本。' },
  { id: 'v5', group: '法律引用', t: '法条引用正确', d: '条文内容与引用编号对应无误。' },
  { id: 'v6', group: '法律引用', t: '案号有效 / 法院正确', d: '案号格式与法院层级、地域匹配。' },
  { id: 'v7', group: '法律引用', t: '引用来源存在', d: '每个引用可回溯到已接入来源。' },
  { id: 'v8', group: '格式规范', t: '附件完整', d: '文内提及的附件均已随文提交。' },
  { id: 'v9', group: '格式规范', t: '格式规范 / 页码 / 签名区域', d: '符合文书格式规范，签名与日期区域预留。' },
]

/* ================= 数据源（不虚构接入；策略依据 docs/research/庭审判罚刑侦案件数据源调研-2026-08-30.md） ================= */
export interface DataSource {
  name: string; kind: string; jurisdiction: string
  status: '已接入（本地快照）' | '官方公开文本 · 人工录入' | '规划接入' | '未接入'
  freq: string; last: string; docs: string; verify: string
  strategy?: string
  note?: string
}
export const DATA_SOURCES: DataSource[] = [
  { name: '本地证据快照语料（Wikisource 转录 + gov.cn）', kind: 'Official Legislation（快照）', jurisdiction: '中国', status: '已接入（本地快照）', freq: '随 build_corpus.py 构建', last: '2026-08-29', docs: '8 部法律 · 1,953 条', verify: '结构校验通过 · flk 逐条比对待完成（M6）', strategy: 'P0（进行中）：证据快照 → 结构校验 → 导出', note: '民法典/消保法/消保条例/劳动合同法/律师法/电商法/民诉法(2023)/生成式AI办法' },
  { name: '两高指导性案例 · 典型案例（官方发布文本）', kind: 'Court Database（官方发布）', jurisdiction: '中国', status: '官方公开文本 · 人工录入', freq: '随官方批次更新', last: '2026-08-29', docs: '样本 5 件（最高法 2 · 美国联邦最高法院 2 · 英国上议院 1）', verify: '以官方发布文本逐件核对', strategy: 'P0（进行中）：最高法公报/官网 + 最高检网上发布厅正式文本 → 人工结构化，零授权风险' },
  { name: '人民法院案例库（指导性 + 参考案例）', kind: 'Court Database', jurisdiction: '中国', status: '规划接入', freq: '随官方更新', last: '—', docs: '官方 2025-07 达 5,040 件（刑事 1,912 / 民事 2,159）', verify: '入库案例经最高法审核', strategy: 'P1：注册账号 + 按篇录入 + 官方文本核对；不批量抓取', note: '2024-02-27 上线并向社会开放（最高法官网）' },
  { name: '最高检指导性案例 · 典型案例（网上发布厅）', kind: 'Prosecution Cases', jurisdiction: '中国', status: '规划接入', freq: '随官方批次更新', last: '—', docs: '官方持续发布（刑事/公益诉讼等）', verify: '官网正式文本', strategy: 'P1：spp.gov.cn 网上发布厅正式文本 → 人工结构化' },
  { name: 'CAIL 开源裁判文书数据集（清华/中文信息学会）', kind: 'Academic Dataset（刑事判罚）', jurisdiction: '中国', status: '规划接入', freq: '—', last: '—', docs: 'CAIL2018：268 万份刑事文书 · 202 罪名 · 刑期预测', verify: '学术发布 + 入库前二次脱敏审查', strategy: 'P1：官方 GitHub/镜像下载 → 脱敏 → 「研究样本」区（统计与研究性结论，不作个案依据）', note: 'github.com/thunlp/CAIL；PIPL 拒绝/删除通道适用' },
  { name: 'CourtListener / Free Law Project（美国判例 + RECAP）', kind: 'Foreign Legal Database', jurisdiction: '美国', status: '规划接入', freq: '—', last: '—', docs: '数百万 opinions · 3,359 辖区 · REST API + bulk', verify: '—', strategy: 'P1：只读 REST API 接入 opinions 检索（域外资料 · 比较研究定位）' },
  { name: 'Harvard Caselaw Access Project（美国历史判例）', kind: 'Foreign Legal Database', jurisdiction: '美国', status: '规划接入', freq: '—', last: '—', docs: '670 万+ 件（360 余年）bulk 数据', verify: '—', strategy: 'P2：case.law bulk 下载（检索 API 已迁 Free Law Project）', note: '镜像：HuggingFace free-law/Caselaw_Access_Project' },
  { name: '国家法律法规数据库（flk.npc.gov.cn）', kind: 'Official Legislation', jurisdiction: '中国', status: '规划接入', freq: '—', last: '—', docs: '—', verify: '—', strategy: 'P1：现行有效文本与效力信息的权威对照基准（逐条比对 M6）' },
  { name: '司法解释库', kind: 'Judicial Interpretation', jurisdiction: '中国', status: '未接入', freq: '—', last: '—', docs: '—', verify: '—' },
  { name: 'legislation.gov.uk（英国立法 API）', kind: 'Foreign Legal Database', jurisdiction: '英国', status: '规划接入', freq: '—', last: '—', docs: '—', verify: '—', strategy: 'P2：官方 REST API（OpenAPI 规范）· OGL v3.0 许可', note: '域外资料仅作比较研究，不作中国裁判依据' },
  { name: 'EUR-Lex / CELLAR（欧盟法律）', kind: 'Foreign Legal Database', jurisdiction: '欧盟', status: '规划接入', freq: '—', last: '—', docs: '—', verify: '—', strategy: 'P2：REST/SPARQL/批量下载 · 免费复用（EU 2019/1024 开放数据指令）' },
  { name: 'FBI Crime Data Explorer（美国犯罪统计）', kind: 'Crime Statistics', jurisdiction: '美国', status: '规划接入', freq: '—', last: '—', docs: 'UCR 统计 · JSON/CSV 只读 API', verify: '官方统计', strategy: 'P2：统计专题卡（口径差异不与他国直接对比下结论）' },
  { name: 'data.police.uk（英国街面犯罪统计）', kind: 'Crime Statistics', jurisdiction: '英国', status: '规划接入', freq: '—', last: '—', docs: '街面级犯罪/结案/截查 · CSV + API', verify: 'OGL 许可', strategy: 'P2：统计专题卡' },
  { name: '中国庭审公开网', kind: 'Court Hearings', jurisdiction: '中国', status: '未接入', freq: '—', last: '—', docs: '全国法院接入 · 直播千万级场次', verify: '—', strategy: 'P2：链接引用 + 庭审程序科普（不自存录像，官方平台为准）' },
  { name: '中国裁判文书网', kind: 'Court Database', jurisdiction: '中国', status: '未接入', freq: '—', last: '—', docs: '上网文书逐年收缩（2020 年 1,920 万 → 2022 年 1,040 万件）', verify: '—', strategy: '不做批量抓取：仅授权合作 / 官方开放数据集路径（PIPL 风险）' },
  { name: '检察案例库（最高检内部系统）', kind: 'Prosecution Cases', jurisdiction: '中国', status: '未接入', freq: '—', last: '—', docs: '面向检察人员内部检索', verify: '—', strategy: '不接入（内部系统）；以最高检网上发布厅公开文本替代' },
  { name: 'LegalBench-RAG 评测集（arXiv:2408.10343）', kind: 'Academic Source', jurisdiction: '学术', status: '规划接入', freq: '—', last: '—', docs: '—', verify: '—', strategy: 'P2：引用召回/精确率基准评测' },
]
