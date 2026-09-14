/** 本机受众视图：只决定功能组织，不是账号、身份或执业资格认证。 */
export type AudienceMode = 'public' | 'student' | 'professional'

export interface AudiencePreference {
  mode: AudienceMode
}

export const AUDIENCE_OPTIONS: {
  mode: AudienceMode
  title: string
  short: string
  description: string
  highlights: string[]
}[] = [
  {
    mode: 'public',
    title: '普通民众',
    short: '公众',
    description: '围绕事实梳理、证据准备和可溯源检索，隐藏不必要的专业工作流。',
    highlights: ['事实与证据梳理', '案件方向辅助', '法条与案例检索'],
  },
  {
    mode: 'student',
    title: '法学学生',
    short: '学生',
    description: '在通用检索之上提供学习、比较法和来源研究入口。',
    highlights: ['学习中心', '来源研究', '跨法域对比'],
  },
  {
    mode: 'professional',
    title: '专业律师',
    short: '专业',
    description: '开放合同审查、文书草稿和专业工作台；本选择不核验执业资格。',
    highlights: ['合同审查', '文书草稿', '专业工作台'],
  },
]

const STORAGE_KEY = 'lh:audience:v3'
const OLD_KEYS = ['lh:identity:v2', 'lh:identity:v1', 'lh:identity']
const MODES = new Set<AudienceMode>(['public', 'student', 'professional'])

/** 未明确选择时返回 null，禁止再静默假定为公众。 */
export function loadAudiencePreference(): AudiencePreference | null {
  try {
    // 旧版本曾保存姓名/角色；新模型不再消费这些字段，并在首次读取时主动清理。
    for (const key of OLD_KEYS) localStorage.removeItem(key)
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const mode = (parsed as { mode?: unknown }).mode
    return typeof mode === 'string' && MODES.has(mode as AudienceMode)
      ? { mode: mode as AudienceMode }
      : null
  } catch {
    return null
  }
}

export function saveAudiencePreference(value: AudiencePreference): void {
  if (!MODES.has(value.mode)) throw new Error('未知受众视图')
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode: value.mode }))
  for (const key of OLD_KEYS) localStorage.removeItem(key)
  window.dispatchEvent(new CustomEvent('le-audience-changed'))
}

export function audienceLabel(mode: AudienceMode): string {
  return AUDIENCE_OPTIONS.find((item) => item.mode === mode)?.title ?? '未选择'
}

/** 路由防线与导航共用的访问规则；法规和案例相关路由始终对三类受众开放。 */
export function canAudienceAccess(pathname: string, mode: AudienceMode): boolean {
  if (/^\/(search|laws|cases|collections|data-sources|settings)(\/|$)/.test(pathname) || pathname === '/') return true
  if (/^\/(needs|case-analysis)(\/|$)/.test(pathname)) return true
  if (/^\/guide(\/|$)/.test(pathname)) return true  // 使用指南：三视图开放（粉饰清单①）
  if (/^\/terms(\/|$)/.test(pathname)) return true  // 术语卡：三视图开放（粉饰清单②）
  if (/^\/quality(\/|$)/.test(pathname)) return true  // 质量透明度：三视图开放（粉饰清单③）
  if (/^\/process(\/|$)/.test(pathname)) return true  // 流程图解：三视图开放（v6 S4-T3）

  if (/^\/research(\/|$)/.test(pathname)) return mode !== 'public'
  if (/^\/(learning)(\/|$)/.test(pathname)) return mode === 'student'
  if (/^\/comparative(\/|$)/.test(pathname)) return mode !== 'public'
  if (/^\/(contracts|compare|draft|workspace|audit)(\/|$)/.test(pathname)) return mode === 'professional'
  // 新路由必须先明确登记受众；未知路径默认收口，避免未来静默开放。
  return false
}
