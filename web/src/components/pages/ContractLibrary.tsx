// FRAME 09 · Contract Library —— 合同中心（规格 §14）
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../icons'
import { CONTRACTS } from '../../data/model'
import { EmptyState, PageHeader, useToast } from '../ui'

const FILTERS = ['全部', '待审查', '审查中', '已完成', '高风险', '即将到期'] as const

function riskBadge(score: number) {
  if (score >= 60) return <span className="bdg bdg-red">{score} 高</span>
  if (score >= 30) return <span className="bdg bdg-orange">{score} 中</span>
  return <span className="bdg bdg-green">{score} 低</span>
}
function statusBadge(s: string) {
  if (s === '待审查') return <span className="bdg bdg-orange">待审查</span>
  if (s === '审查中') return <span className="bdg bdg-blue">审查中</span>
  return <span className="bdg bdg-green">已完成</span>
}

export default function ContractLibrary() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('全部')
  const [q, setQ] = useState('')
  const toast = useToast()

  const list = useMemo(() => CONTRACTS.filter((c) => {
    if (q && !(c.name + c.party).toLowerCase().includes(q.toLowerCase())) return false
    if (filter === '高风险') return c.riskScore >= 60
    if (filter === '即将到期') return !!c.expiring
    if (filter !== '全部') return c.status === filter
    return true
  }), [filter, q])

  return (
    <div className="page">
      <PageHeader
        title="合同中心"
        sub="上传或新建合同，进入三栏审查工作台；风险检测覆盖费用/账户/责任/期限等 30+ 类型，审查全程留痕。"
        actions={
          <>
            <button className="btn btn-ghost" onClick={() => toast('上传对话框为原型占位')}><Icon name="upload" size={14} />上传合同</button>
            <Link to="/draft?type=contract" className="btn btn-secondary"><Icon name="plus" size={14} />新建合同</Link>
            <Link to="/compare" className="btn btn-primary"><Icon name="compare" size={14} />版本对比</Link>
          </>
        }
      />

      <div className="row-wrap mb-16">
        {FILTERS.map((f) => (
          <button key={f} className={'chip' + (filter === f ? ' is-on' : '')} onClick={() => setFilter(f)}>{f}</button>
        ))}
        <span className="spacer" />
        <div className="searchbar" style={{ width: 260 }}>
          <Icon name="search" size={14} className="muted" />
          <input className="inp" placeholder="搜索合同…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <div className="card">
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl">
            <thead>
              <tr><th>合同名称</th><th>类型</th><th>相对方</th><th>状态</th><th>Risk Score</th><th>审查日期</th><th>负责人</th><th>版本</th><th>最后更新</th><th /></tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id} className="is-clickable" onClick={() => { /* navigate via Link */ }}>
                  <td>
                    <Link to={`/contracts/${c.id}`} className="row" style={{ fontWeight: 600, color: 'var(--tx)' }}>
                      <Icon name="docShield" size={15} className="muted" />{c.name}
                    </Link>
                  </td>
                  <td>{c.type}</td>
                  <td className="muted">{c.party}</td>
                  <td>{statusBadge(c.status)}</td>
                  <td>{riskBadge(c.riskScore)}</td>
                  <td className="muted">{c.reviewedAt}</td>
                  <td className="muted">{c.owner}</td>
                  <td><span className="bdg bdg-gray">{c.version}</span></td>
                  <td className="tiny">{c.updatedAt}{c.expiring && <span className="bdg bdg-orange" style={{ marginLeft: 6 }}>即将到期</span>}</td>
                  <td><Link to={`/contracts/${c.id}`} className="res-act"><Icon name="external" size={12} />审查</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {list.length === 0 && <EmptyState icon="file" title="没有匹配的合同" desc="上传合同开始审查，或调整筛选条件。" />}
      </div>
    </div>
  )
}
