// FRAME 21 · Settings —— 设置（规格 §28）
// AI 默认：Strict Evidence Mode ON；外观/可访问性设置写入 localStorage 并实时生效
import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Icon, type IconName } from '../icons'
import { PageHeader, Switch, useToast } from '../ui'
import { api, ApiError, loadAiProfile, saveAiProfile } from '../../lib/api'
import { useLaws } from '../../data/model'

const SECTIONS: { key: string; label: string; icon: IconName }[] = [
  { key: 'account', label: 'Account', icon: 'user' },
  { key: 'workspace', label: 'Workspace', icon: 'briefcase' },
  { key: 'privacy', label: 'Privacy', icon: 'lock' },
  { key: 'security', label: 'Security', icon: 'shield' },
  { key: 'ai', label: 'AI', icon: 'sparkle' },
  { key: 'data', label: 'Data Source', icon: 'database' },
  { key: 'appearance', label: 'Appearance', icon: 'sun' },
  { key: 'accessibility', label: 'Accessibility', icon: 'eye' },
  { key: 'notifications', label: 'Notifications', icon: 'bell' },
  { key: 'language', label: 'Language', icon: 'globe' },
  { key: 'export', label: 'Export', icon: 'download' },
]

function Row({ icon, t, d, ctl }: { icon: IconName; t: string; d: string; ctl: ReactNode }) {
  return (
    <div className="set-row">
      <span className="set-ic"><Icon name={icon} size={15} /></span>
      <div style={{ minWidth: 0 }}>
        <div className="set-t">{t}</div>
        <div className="set-d">{d}</div>
      </div>
      <div className="set-ctl">{ctl}</div>
    </div>
  )
}

export default function Settings() {
  const [sec, setSec] = useState('ai')
  const toast = useToast()
  const { data: laws } = useLaws()
  const lawCount = laws?.laws.length ?? 0
  const artCount = laws ? laws.laws.reduce((s, l) => s + l.articles.length, 0) : 0

  const [strict, setStrict] = useState(() => localStorage.getItem('le-strict-evidence') !== '0')
  const [citation, setCitation] = useState(() => localStorage.getItem('le-citation-required') !== '0')
  const [foreign, setForeign] = useState(() => localStorage.getItem('le-allow-foreign') === '1')
  const [explainLevel, setExplainLevel] = useState(() => localStorage.getItem('le-explain-level') ?? '通俗')
  const [tone, setTone] = useState(() => localStorage.getItem('le-tone-override') ?? 'auto')
  const [motion, setMotion] = useState(() => localStorage.getItem('le-reduce-motion') === '1')
  const [cSubject, setCSubject] = useState('')
  const [cContent, setCContent] = useState('')
  const [cContact, setCContact] = useState('')
  const [busyC, setBusyC] = useState(false)
  // 模型插件档案（仅本机）
  const aiProfile = loadAiProfile()
  const [aiCatalog, setAiCatalog] = useState<{ id: string; name: string; base_url: string; default_model: string; docs: string; env_key_set: boolean; local: boolean }[]>([])
  const [aiProv, setAiProv] = useState(aiProfile?.provider_id ?? '')
  const [aiModel, setAiModel] = useState(aiProfile?.model ?? '')
  const [aiBase, setAiBase] = useState(aiProfile?.base_url_override ?? '')
  const [aiKey, setAiKey] = useState(aiProfile?.api_key ?? '')
  const [busyAi, setBusyAi] = useState(false)
  useEffect(() => {
    api.aiProviders().then((d) => setAiCatalog(d.providers), () => setAiCatalog([]))
  }, [])

  useEffect(() => localStorage.setItem('le-strict-evidence', strict ? '1' : '0'), [strict])
  useEffect(() => localStorage.setItem('le-citation-required', citation ? '1' : '0'), [citation])
  useEffect(() => localStorage.setItem('le-allow-foreign', foreign ? '1' : '0'), [foreign])
  useEffect(() => localStorage.setItem('le-explain-level', explainLevel), [explainLevel])
  useEffect(() => { localStorage.setItem('le-tone-override', tone); window.dispatchEvent(new CustomEvent('le-tone-changed')) }, [tone])
  useEffect(() => { localStorage.setItem('le-reduce-motion', motion ? '1' : '0'); document.documentElement.classList.toggle('reduce-motion', motion) }, [motion])

  return (
    <div className="page">
      {/* 假「保存」按钮已移除（C8）：所有设置项均即时写本机生效，无需保存动作 */}
      <PageHeader title="设置" sub="账号、工作区、隐私与 AI 行为。所有设置修改后即时生效（仅存本机）；AI 相关默认遵循「严格证据模式」。" />

      <div className="st-layout">
        <nav className="st-nav">
          <div className="card" style={{ padding: 8 }}>
            {SECTIONS.map((s) => (
              <button key={s.key} className={'lrow' + (sec === s.key ? ' is-on' : '')} style={{ width: '100%', textAlign: 'left' }} onClick={() => setSec(s.key)}>
                <Icon name={s.icon} size={14} />
                <span className="lrow-t">{s.label}</span>
              </button>
            ))}
          </div>
          <Link to="/design-system" className="tiny row mt-12" style={{ gap: 4, paddingLeft: 6 }}>
            <Icon name="layers" size={12} />内部：设计系统规范（仅供团队）
          </Link>
        </nav>

        <div className="card card-pad">
          {sec === 'ai' && (
            <>
              <div className="sec-h"><span className="sec-t">AI 行为</span></div>
              <Row icon="shieldCheck" t="Strict Evidence Mode（严格证据模式）" d="无可靠来源支持的结论将被阻止生成，并标注「缺少可靠依据」。默认开启，建议保持。"
                ctl={<Switch on={strict} onChange={setStrict} />} />
              {!strict && <div className="banner banner-danger mb-8"><Icon name="alert" size={15} /><span className="banner-tx">已关闭严格证据模式：AI 输出可能包含无法溯源的断言，仅限内部测试使用。</span></div>}
              <Row icon="link" t="Citation Required（强制引用）" d="每条结论必须绑定来源段落；引用法条附版本/生效/效力字段。"
                ctl={<Switch on={citation} onChange={setCitation} />} />
              <Row icon="globe" t="Allow Foreign Sources（允许域外资料）" d="引入域外法律与案例，仅作比较研究材料，不作中国裁判依据。默认关闭。"
                ctl={<Switch on={foreign} onChange={setForeign} />} />
              <Row icon="compass" t="AI Explanation Level（解释深度）" d="通俗解释面向公众；专业解释面向执业者。"
                ctl={
                  <select className="sel" style={{ width: 140 }} value={explainLevel} onChange={(e) => setExplainLevel(e.target.value)}>
                    <option>通俗</option><option>专业</option>
                  </select>
                } />

              <div className="sec-h mt-20"><span className="sec-t">模型插件（OpenAI 协议 harness）</span></div>
              <div className="banner banner-info mb-12" style={{ padding: '9px 13px' }}><Icon name="info" size={14} />
                <span className="banner-tx">
                  本项目作为 harness 运行：模型由你自主选择并驱动，一切兼容 OpenAI 协议的服务均可接入（OpenAI / DeepSeek / Kimi / 智谱 / 通义 / Ollama / vLLM / LiteLLM·one-api 网关）。默认关闭——不配置即不调用任何模型。
                  密钥仅保存在<b>本机浏览器</b>并随请求瞬态发送，服务端不落库不记日志；也可改用环境变量（如 DEEPSEEK_API_KEY）。
                </span>
              </div>
              <div className="form-grid mb-8">
                <label className="fld">
                  <span className="fld-l">提供方</span>
                  <select className="sel" value={aiProv} onChange={(e) => {
                    const p = aiCatalog.find((x) => x.id === e.target.value)
                    setAiProv(e.target.value)
                    if (p) { setAiModel(p.default_model); setAiBase(p.base_url) }
                  }}>
                    <option value="">未配置（默认关闭）</option>
                    {aiCatalog.map((p) => <option key={p.id} value={p.id}>{p.name}{p.env_key_set ? '（已检测到环境变量密钥）' : p.local ? '（本地）' : ''}</option>)}
                  </select>
                </label>
                <label className="fld"><span className="fld-l">模型名</span>
                  <input className="inp" placeholder={aiCatalog.find((x) => x.id === aiProv)?.default_model || '如 deepseek-chat'} value={aiModel} onChange={(e) => setAiModel(e.target.value)} /></label>
                <label className="fld full"><span className="fld-l">Base URL（可覆盖为网关/本地端点）</span>
                  <input className="inp" placeholder="https://api.deepseek.com/v1" value={aiBase} onChange={(e) => setAiBase(e.target.value)} /></label>
                <label className="fld full"><span className="fld-l">API Key（仅存本机；留空则使用环境变量）</span>
                  <input className="inp" type="password" placeholder="sk-…（不回显）" value={aiKey} onChange={(e) => setAiKey(e.target.value)} /></label>
              </div>
              <div className="row">
                <button className="btn btn-secondary btn-sm" disabled={!aiProv || busyAi} onClick={async () => {
                  setBusyAi(true)
                  try {
                    const r = await api.aiTest({ provider_id: aiProv, model: aiModel, api_key: aiKey || undefined, base_url_override: aiBase || undefined })
                    if (r.ok) { toast(`连接成功：模型返回「${r.sample ?? 'OK'}」`, 'ok'); saveAiProfile({ provider_id: aiProv, model: aiModel, base_url_override: aiBase || undefined, api_key: aiKey || undefined }) }
                    else toast(`连接失败：${r.error}`, 'err')
                  } catch (e) { toast(e instanceof ApiError ? e.message : String(e), 'err') } finally { setBusyAi(false) }
                }}><Icon name="zap" size={13} />{busyAi ? '测试中…' : '测试连接'}</button>
                <button className="btn btn-primary btn-sm" disabled={!aiProv || !aiModel}
                  onClick={() => { saveAiProfile({ provider_id: aiProv, model: aiModel, base_url_override: aiBase || undefined, api_key: aiKey || undefined }); toast('模型档案已保存（仅本机）', 'ok') }}>
                  <Icon name="save" size={13} />保存模型档案</button>
                {aiProfile && <span className="tiny">当前档案：{aiProfile.provider_id} / {aiProfile.model}</span>}
                <span className="spacer" />
                {aiCatalog.find((x) => x.id === aiProv)?.docs && (
                  <a className="tiny" href={aiCatalog.find((x) => x.id === aiProv)!.docs} target="_blank" rel="noreferrer">接入文档 ↗</a>
                )}
              </div>
              <div className="tiny mt-8">调用将经过三道合规 gate：红线词拦截（禁「包赢/胜诉率」表述）、引用绑定校验（AI 提及的条文必须在给定依据集合内）、审计留痕（不含密钥与消息明文）。</div>
            </>
          )}

          {sec === 'appearance' && (
            <>
              <div className="sec-h"><span className="sec-t">外观</span></div>
              <Row icon="sun" t="整体明暗" d="默认「跟随页面」：深色 Dashboard/案件阅读，浅色文档工作区。可强制浅色或深色。"
                ctl={
                  <select className="sel" style={{ width: 160 }} value={tone} onChange={(e) => setTone(e.target.value)}>
                    <option value="auto">跟随页面</option>
                    <option value="light">强制浅色</option>
                    <option value="dark">强制深色</option>
                  </select>
                } />
              <Row icon="sparkle" t="强调色" d="Accent Blue #0A84FF（两套模式共用同一语义 Token）。"
                ctl={<span className="bdg bdg-blue">#0A84FF</span>} />
            </>
          )}

          {sec === 'accessibility' && (
            <>
              <div className="sec-h"><span className="sec-t">可访问性</span></div>
              <Row icon="eye" t="Reduce Motion（减少动效）" d="关闭过渡与脉冲动画（120–220ms ease-out 为默认；遵循系统 prefers-reduced-motion）。"
                ctl={<Switch on={motion} onChange={setMotion} />} />
              <Row icon="target" t="Focus Ring" d="所有可键盘聚焦元素使用 3px #0A84FF 外侧 Ring（不可关闭）。"
                ctl={<span className="bdg bdg-green">始终开启</span>} />
            </>
          )}

          {sec === 'account' && (
            <>
              <div className="sec-h"><span className="sec-t">账号</span></div>
              <Row icon="user" t="Alex Wang（演示账号）" d="执业律师 · 原型无真实用户体系；正式版接入统一身份认证。" ctl={<button className="btn btn-ghost btn-sm">编辑资料</button>} />
              <Row icon="logout" t="退出登录" d="结束本设备会话。" ctl={<button className="btn btn-danger btn-sm">退出</button>} />
            </>
          )}

          {sec === 'workspace' && (
            <>
              <div className="sec-h"><span className="sec-t">工作区</span></div>
              <Row icon="briefcase" t="当前工作区" d="A 律所 · 示例工作区（3 名成员）" ctl={<button className="btn btn-ghost btn-sm">管理</button>} />
              <Row icon="key" t="成员权限" d="主办律师 / 协办 / 助理三级权限。" ctl={<button className="btn btn-ghost btn-sm">配置</button>} />
            </>
          )}

          {sec === 'privacy' && (
            <>
              <div className="sec-h"><span className="sec-t">隐私</span></div>
              <Row icon="lock" t="数据脱敏" d="上传文档中的个人信息在分析前自动脱敏；可申请删除。" ctl={<Switch on onChange={() => toast('为必选项，不可关闭')} disabled />} />
              <Row icon="reject" t="拒绝与删除通道" d="对含个人信息的数据行使拒绝/删除权（合规红线）。" ctl={<button className="btn btn-danger btn-sm" onClick={() => toast('已提交删除申请（示例）', 'ok')}>发起申请</button>} />
              <div className="mt-16" style={{ borderTop: '1px solid var(--div-soft)', paddingTop: 14 }}>
                <div className="tiny bold mb-8">投诉与纠错通道（提交后写入工单库并留痕 · 《生成式AI办法》第 14/15 条）</div>
                <div className="form-grid">
                  <label className="fld"><span className="fld-l">主题</span>
                    <input className="inp" placeholder="如：某回答引用有误" value={cSubject} onChange={(e) => setCSubject(e.target.value)} /></label>
                  <label className="fld"><span className="fld-l">联系方式（可选）</span>
                    <input className="inp" placeholder="邮箱 / 电话" value={cContact} onChange={(e) => setCContact(e.target.value)} /></label>
                  <label className="fld full"><span className="fld-l">内容</span>
                    <textarea className="ta" style={{ minHeight: 70 }} placeholder="请描述问题：涉及哪个页面/回答/文书，问题是什么…" value={cContent} onChange={(e) => setCContent(e.target.value)} /></label>
                </div>
                <div className="row mt-12">
                  <button className="btn btn-primary btn-sm" disabled={busyC || !cSubject.trim() || !cContent.trim()}
                    onClick={async () => {
                      setBusyC(true)
                      try {
                        const r = await api.createComplaint(cSubject.trim(), cContent.trim(), cContact.trim() || undefined)
                        toast(`投诉已受理：工单号 ${r.complaint_id}（状态 ${r.status}）`, 'ok')
                        setCSubject(''); setCContent(''); setCContact('')
                      } catch (e) {
                        toast(e instanceof ApiError ? e.message : String(e), 'err')
                      } finally { setBusyC(false) }
                    }}><Icon name="send" size={13} />{busyC ? '提交中…' : '提交投诉'}</button>
                  <span className="tiny">投诉记录进入 append-only 审计日志，处置结果将通过联系方式反馈。</span>
                </div>
              </div>
            </>
          )}

          {sec === 'security' && (
            <>
              <div className="sec-h"><span className="sec-t">安全</span></div>
              <Row icon="key" t="两步验证（规划）" d="登录时要求动态验证码——规划功能，原型未实现。" ctl={<Switch on disabled />} />
              <Row icon="history" t="登录设备（示例）" d="2 台活跃设备（示例数据，原型无真实用户体系）。" ctl={<button className="btn btn-ghost btn-sm" disabled title="原型无真实用户体系">查看</button>} />
            </>
          )}

          {sec === 'data' && (
            <>
              <div className="sec-h"><span className="sec-t">数据源</span></div>
              <Row icon="database" t="已接入数据源" d={laws ? `本地证据快照语料（${lawCount} 部法律 · ${artCount.toLocaleString()} 条）。` : '本地证据快照语料（规模读取中…）。'} ctl={<Link to="/data-sources" className="btn btn-secondary btn-sm">查看全部</Link>} />
              <Row icon="download" t="语料导出" d="下载本地语料文件（含来源 URL 与快照日期），与线上数据同源。" ctl={<button className="btn btn-ghost btn-sm" onClick={() => {
                fetch(`${import.meta.env.BASE_URL}data/laws.json`, { cache: 'no-cache' })
                  .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.blob() })
                  .then((b) => {
                    const a = document.createElement('a')
                    a.href = URL.createObjectURL(b)
                    a.download = 'legalhigh_laws.json'
                    a.click(); URL.revokeObjectURL(a.href)
                  })
                  .catch(() => toast('语料导出失败：laws.json 不可达', 'err'))
              }}>导出</button>} />
            </>
          )}

          {sec === 'notifications' && (
            <>
              <div className="sec-h"><span className="sec-t">通知</span></div>
              <Row icon="bell" t="审查完成通知" d="合同审查完成时提醒。" ctl={<Switch on onChange={() => {}} />} />
              <Row icon="alert" t="风险升级提醒" d="合同风险等级变化时提醒。" ctl={<Switch on onChange={() => {}} />} />
            </>
          )}

          {sec === 'language' && (
            <Row icon="globe" t="界面语言" d="当前：简体中文（英文界面在路线图中）。"
              ctl={<select className="sel" style={{ width: 140 }} defaultValue="zh"><option value="zh">简体中文</option><option value="en" disabled>English（规划）</option></select>} />
          )}

          {sec === 'export' && (
            <>
              <div className="sec-h"><span className="sec-t">导出</span></div>
              <Row icon="download" t="个人数据导出" d="导出账号相关数据（JSON）。" ctl={<button className="btn btn-ghost btn-sm" onClick={() => toast('导出任务已创建（示例）', 'ok')}>导出</button>} />
              <Row icon="file" t="文书导出格式" d="Word（修订双轨）与 PDF。" ctl={<span className="bdg bdg-gray">docx / pdf</span>} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
