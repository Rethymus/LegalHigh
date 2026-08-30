// FRAME 11 · Contract Compare —— 版本对比（真实 difflib 引擎）
// server POST /api/compare：Python 标准库 difflib 行级结构差异（复用标准库，不手搓比对算法）。
// 「AI Change Summary」为可选项：经模型插件三道 gate 生成，标注 AI 且不构成风险结论；
// 风险本身请将文本送入合同审查模块（费用/账户/责任审查点引擎）。
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../icons'
import { EmptyState, PageHeader, useToast } from '../ui'
import { api, ApiError, loadAiProfile, type CompareResult } from '../../lib/api'

const SAMPLE_A = `软件技术服务合同
第一条 服务内容与标准
甲方委托乙方提供软件技术服务，服务内容包括系统开发、部署与运维支持。服务标准应符合行业通行规范及双方确认的技术方案。
第二条 服务费用与支付
2.1 服务费用总额为人民币（大写）捌拾陆万元整（¥860,000元）。
2.2 乙方应在合同签署后 90 日内一次性向甲方支付全部服务费用。
2.3 甲方逾期付款的，按未付款项的 0.05%/日支付违约金。
第三条 双方责任与赔偿
因一方违约给对方造成损失的，违约方应承担赔偿责任。
第四条 争议解决与生效
因本合同引起的争议，双方同意提交北京仲裁委员会仲裁。本合同自双方签字盖章之日起生效。`

const SAMPLE_B = `软件技术服务合同
第一条 服务内容与标准
甲方委托乙方提供软件技术服务，服务内容包括系统开发、部署与运维支持。服务标准应符合行业通行规范及双方确认的技术方案。
第二条 服务费用与支付
2.1 服务费用总额为人民币（大写）捌拾陆万元整（¥860,000元）。
2.2 乙方应在合同签署后 180 日内一次性向甲方支付全部服务费用，甲方未收到款项前有权暂停服务。
2.3 甲方逾期付款的，每逾期一日按未付款项的 5% 向乙方支付违约金。
第三条 双方责任与赔偿
3.1 任何情况下，乙方因本合同所获赔偿总额不超过已收取服务费用的 10%。
因一方违约给对方造成损失的，违约方应承担赔偿责任。
第四条 争议解决与生效
因本合同引起的争议，双方同意提交乙方所在地人民法院管辖。本合同自双方签字盖章之日起生效。`

export default function ContractCompare() {
  const toast = useToast()
  const [ta, setTa] = useState(SAMPLE_A)
  const [tb, setTb] = useState(SAMPLE_B)
  const [result, setResult] = useState<CompareResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [summary, setSummary] = useState<{ text: string; blocked: boolean; model: string } | null>(null)
  const [sumBusy, setSumBusy] = useState(false)
  const [sumErr, setSumErr] = useState<string | null>(null)
  const profile = loadAiProfile()

  const runCompare = async () => {
    setBusy(true)
    try {
      setResult(await api.compareTexts(ta, tb))
      setSummary(null); setSumErr(null)
    } catch (e) {
      toast(e instanceof ApiError ? e.message : String(e), 'err')
    } finally { setBusy(false) }
  }

  const aiSummary = async () => {
    if (!result || !profile) { setSumErr('未配置模型插件：请到 设置 → AI 配置模型档案。'); return }
    setSumBusy(true); setSumErr(null)
    try {
      const diffText = result.ops.map((o) =>
        `[${o.type}] A${o.a_range.join('-')} → B${o.b_range.join('-')}\nA: ${o.a_lines.join(' / ')}\nB: ${o.b_lines.join(' / ')}`).join('\n')
      const r = await api.aiChat({
        provider_id: profile.provider_id, model: profile.model,
        api_key: profile.api_key, base_url_override: profile.base_url_override,
        messages: [
          { role: 'system', content: '你是合同版本对比助手。仅基于给定的行级差异归纳变化点（金额/期限/责任/争议解决等），禁止预测裁判结果、禁止使用「胜诉率/包赢」等表述、禁止编造未出现的条款。输出 ≤200 字要点列表。' },
          { role: 'user', content: `两版合同行级差异：\n${diffText}\n\n请归纳主要变化。` },
        ],
      })
      setSummary({ text: r.text, blocked: r.blocked, model: `${r.provider_name}/${r.model}` })
    } catch (e) {
      setSumErr(e instanceof ApiError ? e.message : String(e))
    } finally { setSumBusy(false) }
  }

  return (
    <div className="page" style={{ maxWidth: 'none' }}>
      <PageHeader
        back={<Link to="/contracts" className="tiny row" style={{ gap: 4 }}><Icon name="arrowL" size={13} />合同中心</Link>}
        title="合同版本对比"
        sub="server difflib 行级结构差异（复用 Python 标准库）：新增/删除/修改逐段标识。风险判断请进入合同审查模块并经执业律师复核。"
        actions={<button className="btn btn-primary" disabled={busy} onClick={runCompare}><Icon name="compare" size={14} />{busy ? '对比中…' : result ? '重新对比' : '开始对比'}</button>}
      />

      <div className="cols-2 cols mb-16" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="card card-pad">
          <div className="tiny bold mb-8"><span className="bdg bdg-gray" style={{ marginRight: 6 }}>Version A</span>左侧文本（可直接粘贴替换样例）</div>
          <textarea className="ta" style={{ minHeight: 220, fontSize: 12.5, lineHeight: 1.8 }} value={ta} onChange={(e) => setTa(e.target.value)} />
        </div>
        <div className="card card-pad">
          <div className="tiny bold mb-8"><span className="bdg bdg-blue" style={{ marginRight: 6 }}>Version B</span>右侧文本（可直接粘贴替换样例）</div>
          <textarea className="ta" style={{ minHeight: 220, fontSize: 12.5, lineHeight: 1.8 }} value={tb} onChange={(e) => setTb(e.target.value)} />
        </div>
      </div>

      {result && (
        <>
          <div className="row-wrap mb-12">
            <span className="bdg bdg-green">新增 {result.stats.added} 行</span>
            <span className="bdg bdg-red">删除 {result.stats.deleted} 行</span>
            <span className="bdg bdg-orange">修改 {result.stats.modified_lines} 行</span>
            <span className="tiny">差异块 {result.stats.op_count} 个</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {result.ops.map((o, i) => (
              <div key={i} className="card card-pad" style={{ paddingBlock: 12, borderLeft: `3px solid ${o.type === 'insert' ? 'var(--ok)' : o.type === 'delete' ? 'var(--danger)' : 'var(--warn)'}` }}>
                <div className="row-wrap mb-8" style={{ gap: 6 }}>
                  <span className={'bdg ' + (o.type === 'insert' ? 'bdg-green' : o.type === 'delete' ? 'bdg-red' : 'bdg-orange')}>
                    {o.type === 'insert' ? '新增' : o.type === 'delete' ? '删除' : '修改'}
                  </span>
                  <span className="tiny mono">A 第{o.a_range[0]}–{o.a_range[1]} 行 → B 第{o.b_range[0]}–{o.b_range[1]} 行</span>
                </div>
                {(o.a_lines.length > 0 && o.type !== 'insert') && (
                  <div style={{ fontSize: 12.5, lineHeight: 1.8, color: 'var(--tx-2)' }}>
                    {o.a_lines.map((ln, j) => <del key={j} className="diff-del" style={{ display: 'block', margin: '2px 0' }}>{ln}</del>)}
                  </div>
                )}
                {(o.b_lines.length > 0 && o.type !== 'delete') && (
                  <div style={{ fontSize: 12.5, lineHeight: 1.8 }}>
                    {o.b_lines.map((ln, j) => <ins key={j} className="diff-add" style={{ display: 'block', margin: '2px 0', textDecoration: 'none' }}>{ln}</ins>)}
                  </div>
                )}
              </div>
            ))}
            {result.ops.length === 0 && <div className="banner banner-ok"><Icon name="verify" size={15} /><span className="banner-tx">两版文本完全一致。</span></div>}
          </div>

          <div className="mt-16">
            <div className="row mb-8">
              <span className="ai-tag"><Icon name="sparkle" size={11} strokeWidth={2} />AI</span>
              <b style={{ fontSize: 12.5 }}>AI Change Summary（可选 · 需自备模型 · 三道 gate）</b>
              <span className="spacer" />
              <button className="btn btn-secondary btn-sm" disabled={sumBusy} onClick={aiSummary}>
                <Icon name="sparkle" size={12} />{sumBusy ? '生成中…' : '生成 AI 汇总'}
              </button>
            </div>
            {sumErr && <div className="banner banner-warn" style={{ padding: '8px 12px' }}><Icon name="alert" size={14} /><span className="banner-tx">{sumErr}</span></div>}
            {summary && (
              <div className="ai-block">
                <div className="ai-block-h">
                  <b style={{ fontSize: 12.5 }}>变更归纳（{summary.model}）</b>
                  <span className="spacer" />
                  {summary.blocked
                    ? <span className="bdg bdg-red">已拦截：不合规表述</span>
                    : <span className="bdg bdg-green">gate 通过</span>}
                </div>
                <div className="ai-block-b" style={{ whiteSpace: 'pre-wrap' }}>{summary.text}</div>
                <div className="ai-note"><Icon name="info" size={12} />AI 归纳仅供参考；逐条风险判断请使用合同审查模块（审查点引擎 + 执业律师复核）。</div>
              </div>
            )}
            <div className="banner banner-info mt-12"><Icon name="info" size={15} /><span className="banner-tx">{result.disclaimer}</span></div>
          </div>
        </>
      )}

      {!result && (
        <div className="card"><EmptyState icon="compare" title="粘贴两版文本后开始对比"
          desc="已预填样例（示例）：v2 → v3 的常见改动演示。对比为行级结构差异（difflib 标准库），风险与建议请转入合同审查模块。" /></div>
      )}
    </div>
  )
}
