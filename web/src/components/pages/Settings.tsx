// FRAME 21 · Settings —— 只呈现已实现且能说明真实边界的设置。
import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Icon, type IconName } from '../icons'
import { PageHeader, Switch, useToast } from '../ui'
import {
  api, ApiError, clearAdminToken, clearAiProfile, loadAdminToken, loadAiProfile, loadIdentity,
  saveAdminToken, saveAiProfile, saveIdentity,
  type AiProfile, type WorkIdentity,
} from '../../lib/api'
import { useLaws } from '../../data/model'

const SECTIONS: { key: string; label: string; icon: IconName }[] = [
  { key: 'identity', label: '本机身份', icon: 'user' },
  { key: 'ai', label: 'AI 模型', icon: 'sparkle' },
  { key: 'privacy', label: '隐私与纠错', icon: 'lock' },
  { key: 'data', label: '数据源', icon: 'database' },
  { key: 'appearance', label: '外观', icon: 'sun' },
  { key: 'accessibility', label: '可访问性', icon: 'eye' },
]

function Row({ icon, t, d, ctl }: { icon: IconName; t: string; d: string; ctl: ReactNode }) {
  return (
    <div className="set-row">
      <span className="set-ic"><Icon name={icon} size={15} /></span>
      <div style={{ minWidth: 0 }}><div className="set-t">{t}</div><div className="set-d">{d}</div></div>
      <div className="set-ctl">{ctl}</div>
    </div>
  )
}

interface ProviderInfo {
  id: string
  name: string
  base_url: string
  default_model: string
  docs: string
  env_key_set: boolean
  local: boolean
}

export default function Settings() {
  const mobileFeedback = new URLSearchParams(window.location.search).get('feedback') === 'mobile'
  const [sec, setSec] = useState(mobileFeedback ? 'privacy' : 'identity')
  const toast = useToast()
  const { data: laws, error: lawsError } = useLaws()
  const lawCount = laws?.laws.length ?? 0
  const artCount = laws ? laws.laws.reduce((s, l) => s + l.articles.length, 0) : 0

  const [tone, setTone] = useState(() => localStorage.getItem('le-tone-override') ?? 'auto')
  const [motion, setMotion] = useState(() => localStorage.getItem('le-reduce-motion') === '1')
  const [fontLarge, setFontLarge] = useState(() => localStorage.getItem('le-font-large') === '1')
  const [identity, setIdentity] = useState<WorkIdentity>(() => loadIdentity())
  const [serviceToken, setServiceToken] = useState(() => loadAdminToken())
  const [serverSession, setServerSession] = useState<{ principal: string; assurance: string } | null>(null)
  const [sessionError, setSessionError] = useState<string | null>(null)
  useEffect(() => { saveIdentity(identity) }, [identity])
  useEffect(() => {
    api.session().then((s) => { setServerSession(s); setSessionError(null) }, (e) => setSessionError(e instanceof ApiError ? e.message : String(e)))
  }, [])
  useEffect(() => { localStorage.setItem('le-tone-override', tone); window.dispatchEvent(new CustomEvent('le-tone-changed')) }, [tone])
  useEffect(() => { localStorage.setItem('le-reduce-motion', motion ? '1' : '0'); document.documentElement.classList.toggle('reduce-motion', motion) }, [motion])
  useEffect(() => { localStorage.setItem('le-font-large', fontLarge ? '1' : '0'); document.documentElement.classList.toggle('font-large', fontLarge) }, [fontLarge])

  const initialProfile = loadAiProfile()
  const [savedProfile, setSavedProfile] = useState<AiProfile | null>(initialProfile)
  const [aiCatalog, setAiCatalog] = useState<ProviderInfo[]>([])
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [aiProv, setAiProv] = useState(initialProfile?.provider_id ?? '')
  const [aiModel, setAiModel] = useState(initialProfile?.model ?? '')
  const [aiBase, setAiBase] = useState(initialProfile?.base_url_override ?? '')
  const [aiKey, setAiKey] = useState('')
  const [busyAi, setBusyAi] = useState(false)
  useEffect(() => {
    let alive = true
    api.aiProviders().then(
      (d) => { if (alive) setAiCatalog(d.providers) },
      (e) => { if (alive) setCatalogError(e instanceof ApiError ? e.message : String(e)) },
    )
    return () => { alive = false }
  }, [])
  const selectedProvider = aiCatalog.find((p) => p.id === aiProv)
  const currentProfile = (): AiProfile & { api_key?: string } => ({
    provider_id: aiProv,
    model: aiModel.trim(),
    base_url_override: aiProv === 'custom' && aiBase.trim() ? aiBase.trim() : undefined,
    api_key: aiKey || undefined,
  })
  const persistProfile = () => {
    const p = currentProfile()
    saveAiProfile(p)
    setSavedProfile({ provider_id: p.provider_id, model: p.model, base_url_override: p.base_url_override })
    setAiKey('')
    toast('非秘密模型配置已保存；API Key 未保存', 'ok')
  }

  const [cSubject, setCSubject] = useState(mobileFeedback ? '移动端体验反馈' : '')
  const cKind: 'general' | 'mobile' = mobileFeedback ? 'mobile' : 'general'
  const [cContent, setCContent] = useState('')
  const [cContact, setCContact] = useState('')
  const [busyC, setBusyC] = useState(false)

  return (
    <div className="page">
      <PageHeader title="设置" sub="使用视图和署名只保存在本机，不构成账号或资格认证；远程模型会改变数据是否离开本机的边界。" />

      <div className="st-layout">
        <nav className="st-nav">
          <div className="card" style={{ padding: 8 }}>
            {SECTIONS.map((s) => (
              <button key={s.key} className={'lrow' + (sec === s.key ? ' is-on' : '')} style={{ width: '100%', textAlign: 'left' }} onClick={() => setSec(s.key)}>
                <Icon name={s.icon} size={14} /><span className="lrow-t">{s.label}</span>
              </button>
            ))}
          </div>
        </nav>

        <div className="card card-pad">
          {sec === 'identity' && (
            <>
              <div className="sec-h"><span className="sec-t">敏感接口会话</span></div>
              <div className="banner banner-info mb-12"><Icon name="info" size={15} /><span className="banner-tx">桌面端由 Electron 主进程注入随机令牌，开发模式可由 Vite 代理注入；两者都不向页面暴露令牌。只有直接在普通浏览器打开后端静态页面时，才需要在下方输入与服务端 LH_ADMIN_TOKEN 一致的令牌，且仅保存在当前标签页。</span></div>
              <Row icon="key" t="本机服务令牌" d={serverSession ? `本机审计署名已连接：${serverSession.principal}；不代表身份或执业资格核验` : `会话未建立${sessionError ? `：${sessionError}` : ''}`}
                ctl={<div className="row">
                  <input className="inp" type="password" style={{ width: 220 }} value={serviceToken} placeholder="至少 32 字符；仅当前标签页" onChange={(e) => setServiceToken(e.target.value)} />
                  <button className="btn btn-secondary btn-sm" onClick={async () => {
                    saveAdminToken(serviceToken)
                    try { const s = await api.session(); setServerSession(s); setSessionError(null); toast(`已连接服务端主体：${s.principal}`, 'ok') }
                    catch (e) { setServerSession(null); setSessionError(e instanceof ApiError ? e.message : String(e)); toast(e instanceof Error ? e.message : String(e), 'err') }
                  }}>验证</button>
                  {serviceToken && <button className="btn btn-ghost btn-sm" onClick={() => { clearAdminToken(); setServiceToken(''); setServerSession(null); setSessionError('会话令牌已清除') }}>清除</button>}
                </div>} />
              <div className="sec-h"><span className="sec-t">本机使用视图</span></div>
              <div className="banner banner-warn mb-12"><Icon name="alert" size={15} /><span className="banner-tx">视图仅调整入口和文案组织。专业工具视图不是律师入驻，也不表示系统核验了任何人的执业资格。</span></div>
              <Row icon="user" t="姓名" d="批注等普通留痕动作可预填此姓名；请填写真实姓名。"
                ctl={<input className="inp" style={{ width: 200 }} value={identity.name} placeholder="真实姓名" onChange={(e) => setIdentity({ ...identity, name: e.target.value })} />} />
              <Row icon="briefcase" t="使用视图" d="公众用于求助准备，学生用于学习，专业视图提供合同和文书工具；三者都不构成身份认证。"
                ctl={<select className="sel" style={{ width: 180 }} value={identity.mode} onChange={(e) => setIdentity({ ...identity, mode: e.target.value as WorkIdentity['mode'] })}>
                  <option value="public">公众求助准备</option><option value="student">法学学习</option><option value="professional">专业工具</option>
                </select>} />
            </>
          )}

          {sec === 'ai' && (
            <>
              <div className="sec-h"><span className="sec-t">可选模型插件</span></div>
              <div className="banner banner-info mb-12"><Icon name="info" size={14} /><span className="banner-tx">默认不配置模型，也不会发生 LLM 调用。合同规则审查与 BM25 检索不依赖远程模型。所有模型生成请求必须经过服务端红线、语料引用绑定和审计 gate。</span></div>
              {selectedProvider && !selectedProvider.local && <div className="banner banner-danger mb-12"><Icon name="alert" size={14} /><span className="banner-tx">远程提供方会接收你提交给模型的消息。不得发送未经授权的合同、案件个人信息或秘密；第三方的保留、训练和跨境政策不由 LegalHigh 控制。</span></div>}
              {catalogError && <div className="banner banner-danger mb-12"><Icon name="alert" size={14} /><span className="banner-tx">模型目录加载失败：{catalogError}</span></div>}
              <div className="form-grid mb-8">
                <label className="fld"><span className="fld-l">提供方</span>
                  <select className="sel" value={aiProv} onChange={(e) => {
                    const p = aiCatalog.find((x) => x.id === e.target.value)
                    setAiProv(e.target.value)
                    if (p) { setAiModel(p.default_model); setAiBase(p.id === 'custom' ? '' : p.base_url) }
                  }}>
                    <option value="">未配置（默认关闭）</option>
                    {aiCatalog.map((p) => <option key={p.id} value={p.id}>{p.name}{p.env_key_set ? '（服务端已配置环境密钥）' : p.local ? '（本地）' : ''}</option>)}
                  </select>
                </label>
                <label className="fld"><span className="fld-l">模型名</span><input className="inp" value={aiModel} placeholder="由提供方目录给出默认值" onChange={(e) => setAiModel(e.target.value)} /></label>
                {aiProv === 'custom' && <label className="fld full"><span className="fld-l">自定义 HTTPS Base URL</span><input className="inp" value={aiBase} placeholder="主机名必须由部署方写入 LH_AI_CUSTOM_HOSTS 允许名单" onChange={(e) => setAiBase(e.target.value)} /></label>}
                <label className="fld full"><span className="fld-l">API Key（仅用于本次连接测试）</span><input className="inp" type="password" value={aiKey} autoComplete="off" placeholder="不会保存；正式调用建议使用服务端环境变量" onChange={(e) => setAiKey(e.target.value)} /></label>
              </div>
              <div className="row-wrap">
                <button className="btn btn-secondary btn-sm" disabled={!aiProv || !aiModel.trim() || busyAi} onClick={async () => {
                  setBusyAi(true)
                  try {
                    const r = await api.aiTest(currentProfile())
                    if (!r.ok) throw new Error(r.error || '提供方未返回成功状态')
                    toast(`连接成功：${r.sample ?? '服务端已确认响应'}`, 'ok')
                  } catch (e) { toast(e instanceof Error ? e.message : String(e), 'err') }
                  finally { setBusyAi(false) }
                }}><Icon name="zap" size={13} />{busyAi ? '测试中…' : '测试连接'}</button>
                <button className="btn btn-primary btn-sm" disabled={!aiProv || !aiModel.trim()} onClick={persistProfile}><Icon name="save" size={13} />保存配置</button>
                {savedProfile && <button className="btn btn-ghost btn-sm" onClick={() => {
                  clearAiProfile(); setSavedProfile(null); setAiProv(''); setAiModel(''); setAiBase(''); setAiKey(''); toast('模型配置已清除', 'ok')
                }}>清除配置</button>}
                {selectedProvider?.docs && <a className="tiny" href={selectedProvider.docs} target="_blank" rel="noreferrer">提供方文档 ↗</a>}
              </div>
              <div className="tiny mt-8">保存后只持久化提供方、模型名和地址配置。API Key 不写 localStorage、sessionStorage 或服务端数据库；研究页可单次输入，或由部署方设置服务端环境变量。</div>
            </>
          )}

          {sec === 'privacy' && (
            <>
              <div className="sec-h"><span className="sec-t">本机数据与权利通道</span></div>
              <Row icon="database" t="实际存储" d="合同审查、文书草稿、投诉和审计写入本机 SQLite；收藏、外观与研究索引写入浏览器存储。系统目前不承诺自动脱敏。" ctl={<span className="bdg bdg-gray">本机存储</span>} />
              <Row icon="download" t="导出服务端数据" d="导出当前本机数据库中的审查、草稿、投诉、批注和审计 JSON；不包含第三方模型可能保留的数据。"
                ctl={<button className="btn btn-secondary btn-sm" onClick={() => api.privacyExport().catch((e) => toast(e instanceof Error ? e.message : '导出失败', 'err'))}>导出</button>} />
              <Row icon="reject" t="逐条删除" d="审查、草稿和投诉可在工作台逐条删除；删除动作保留审计记录。" ctl={<Link to="/workspace" className="btn btn-danger btn-sm">前往工作台</Link>} />
              <div className="mt-16" style={{ borderTop: '1px solid var(--div-soft)', paddingTop: 14 }}>
                <div className="tiny bold mb-8">投诉与纠错通道</div>
                <div className="form-grid">
                  <label className="fld"><span className="fld-l">主题</span><input className="inp" value={cSubject} placeholder="如：某条引用有误" onChange={(e) => setCSubject(e.target.value)} /></label>
                  <label className="fld"><span className="fld-l">联系方式（可选）</span><input className="inp" value={cContact} placeholder="邮箱 / 电话" onChange={(e) => setCContact(e.target.value)} /></label>
                  <label className="fld full"><span className="fld-l">内容</span><textarea className="ta" style={{ minHeight: 80 }} value={cContent} placeholder="请说明页面、记录 ID、错误与期望更正内容…" onChange={(e) => setCContent(e.target.value)} /></label>
                </div>
                <button className="btn btn-primary btn-sm mt-12" disabled={busyC || !cSubject.trim() || !cContent.trim()} onClick={async () => {
                  setBusyC(true)
                  try {
                    const r = await api.createComplaint(cSubject.trim(), cContent.trim(), cContact.trim() || undefined, cKind)
                    toast(`投诉已写入：${r.complaint_id}（${r.status}）`, 'ok'); setCSubject(''); setCContent(''); setCContact('')
                  } catch (e) { toast(e instanceof ApiError ? e.message : String(e), 'err') }
                  finally { setBusyC(false) }
                }}><Icon name="send" size={13} />{busyC ? '提交中…' : '提交投诉'}</button>
              </div>
            </>
          )}

          {sec === 'data' && (
            <>
              <div className="sec-h"><span className="sec-t">证据快照语料</span></div>
              {lawsError && <div className="banner banner-danger mb-12"><Icon name="alert" size={14} /><span className="banner-tx">语料清单读取失败：{lawsError}</span></div>}
              <Row icon="database" t="当前导出" d={laws ? `${lawCount} 部、${artCount.toLocaleString()} 条；含来源 URL、状态与快照日期。Wikisource 转录不等于官方权威版本。` : '正在读取本地 laws.json…'} ctl={<Link to="/data-sources" className="btn btn-secondary btn-sm">查看来源</Link>} />
              <Row icon="download" t="下载语料 JSON" d="下载前端当前使用的只读导出文件；其上游必须由证据快照经 build_corpus.py 构建。" ctl={<a className="btn btn-ghost btn-sm" href={`${import.meta.env.BASE_URL}data/laws.json`} download="legalhigh_laws.json">下载</a>} />
            </>
          )}

          {sec === 'appearance' && (
            <>
              <div className="sec-h"><span className="sec-t">外观</span></div>
              <Row icon="sun" t="整体明暗" d="跟随页面，或强制浅色/深色；即时保存到本机。" ctl={<select className="sel" style={{ width: 150 }} value={tone} onChange={(e) => setTone(e.target.value)}><option value="auto">跟随页面</option><option value="light">强制浅色</option><option value="dark">强制深色</option></select>} />
              <Row icon="eye" t="大字模式" d="放大正文与控件，便于视力不佳者阅读。" ctl={<Switch on={fontLarge} onChange={setFontLarge} />} />
            </>
          )}

          {sec === 'accessibility' && (
            <>
              <div className="sec-h"><span className="sec-t">可访问性</span></div>
              <Row icon="eye" t="减少动效" d="关闭界面过渡与脉冲动画，并继续遵循系统 prefers-reduced-motion。" ctl={<Switch on={motion} onChange={setMotion} />} />
              <Row icon="target" t="键盘焦点环" d="始终启用，不能关闭。" ctl={<span className="bdg bdg-green">已启用</span>} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
