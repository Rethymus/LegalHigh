// FRAME 11 · Contract Compare —— 版本对比（真实 difflib 引擎）
// server POST /api/compare：Python 标准库 difflib 行级结构差异（复用标准库，不手搓比对算法）。
// 合同文本可能高度敏感，本页不调用模型；风险判断请转入本机规则审查模块。
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../icons'
import { EmptyState, PageHeader, useToast } from '../ui'
import { api, ApiError, type CompareResult } from '../../lib/api'

export default function ContractCompare() {
  const toast = useToast()
  const [ta, setTa] = useState('')
  const [tb, setTb] = useState('')
  const [result, setResult] = useState<CompareResult | null>(null)
  const [busy, setBusy] = useState(false)

  const runCompare = async () => {
    setBusy(true)
    try {
      setResult(await api.compareTexts(ta, tb))
    } catch (e) {
      toast(e instanceof ApiError ? e.message : String(e), 'err')
    } finally { setBusy(false) }
  }

  return (
    <div className="page" style={{ maxWidth: 'none' }}>
      <PageHeader
        back={<Link to="/contracts" className="tiny row" style={{ gap: 4 }}><Icon name="arrowL" size={13} />合同中心</Link>}
        title="合同版本对比"
        sub="server difflib 行级结构差异（复用 Python 标准库）：新增/删除/修改逐段标识。风险判断请进入合同审查模块并经执业律师复核。"
        actions={<button className="btn btn-primary" disabled={busy || !ta.trim() || !tb.trim()} onClick={runCompare}><Icon name="compare" size={14} />{busy ? '对比中…' : result ? '重新对比' : '开始对比'}</button>}
      />

      <div className="cols-2 cols mb-16" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="card card-pad">
          <div className="tiny bold mb-8"><span className="bdg bdg-gray" style={{ marginRight: 6 }}>Version A</span>左侧文本</div>
          <textarea className="ta" aria-label="合同版本 A" placeholder="粘贴你有权处理的旧版本文本" style={{ minHeight: 220, fontSize: 12.5, lineHeight: 1.8 }} value={ta} onChange={(e) => setTa(e.target.value)} />
        </div>
        <div className="card card-pad">
          <div className="tiny bold mb-8"><span className="bdg bdg-blue" style={{ marginRight: 6 }}>Version B</span>右侧文本</div>
          <textarea className="ta" aria-label="合同版本 B" placeholder="粘贴你有权处理的新版本文本" style={{ minHeight: 220, fontSize: 12.5, lineHeight: 1.8 }} value={tb} onChange={(e) => setTb(e.target.value)} />
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

          <div className="banner banner-info mt-16"><Icon name="info" size={15} /><span className="banner-tx">{result.disclaimer} 本页不把合同内容发送给模型。</span></div>
        </>
      )}

      {!result && (
        <div className="card"><EmptyState icon="compare" title="粘贴两版文本后开始对比"
          desc="项目不预填虚构合同。对比只计算行级结构差异（Python difflib），不会自动给出法律风险结论。" /></div>
      )}
    </div>
  )
}
