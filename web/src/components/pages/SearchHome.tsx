// FRAME 02 · Global Legal Search —— 专业检索工作台（规格 §7）
// 默认空态：「输入法律问题开始检索」（§48）
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Icon } from '../icons'
import { EmptyState, PageHeader } from '../ui'
import { HOT_SEARCHES, WARM_TIPS } from '../../data/model'
import SearchSuggest from '../SearchSuggest'

const SCOPES = ['全部', '法规', '司法解释', '案例']

export default function SearchHome() {
  const nav = useNavigate()
  const location = useLocation()
  const inputRef = useRef<HTMLInputElement>(null)
  const [q, setQ] = useState('')
  const [scope, setScope] = useState('全部')
  const [showScope, setShowScope] = useState(false)

  // TopBar「/」快捷键跨页跳转时由 AppShell 带 state 标记，挂载后自聚焦（一次性，用后即清）
  useEffect(() => {
    if ((location.state as { leFocusSearch?: boolean } | null)?.leFocusSearch) {
      inputRef.current?.focus()
      inputRef.current?.select()
      window.history.replaceState({}, '')
    }
  }, [location.state])

  return (
    <div className="page">
      <PageHeader
        title="法律检索"
        sub="跨法规、案例与司法解释的一站式词法检索。结果标注来源、时效与证据等级；摘要只显示程序统计，不调用生成模型。"
      />

      <div className="card card-pad" style={{ maxWidth: 980, margin: '0 auto', paddingBlock: 28 }}>
        <form
          className="searchbar"
          style={{ position: 'relative' }}
          onSubmit={(e) => { e.preventDefault(); if (q.trim()) nav(`/search/results?q=${encodeURIComponent(q.trim())}&scope=${encodeURIComponent(scope)}`) }}
        >
          <Icon name="search" size={18} className="muted" />
          <input ref={inputRef} className="inp" style={{ fontSize: 15.5 }} placeholder="输入法律问题开始检索：条文关键词、案由、争议焦点……" value={q} onChange={(e) => setQ(e.target.value)} aria-label="检索词" />
          <button className="btn btn-primary btn-lg">检索</button>
          {q.trim() && <SearchSuggest query={q} onPick={() => setQ('')} />}
        </form>

        <div className="row-wrap mt-16" style={{ justifyContent: 'center' }}>
          {SCOPES.map((s) => (
            <button key={s} type="button" className={'chip' + (scope === s ? ' is-on' : '')} onClick={() => setScope(s)}>{s}</button>
          ))}
          <button type="button" className={'chip' + (showScope ? ' is-on' : '')} onClick={() => setShowScope((v) => !v)}>
            <Icon name="info" size={13} />检索范围说明
          </button>
        </div>

        {showScope && (
          <div className="banner banner-info mt-16">
            <Icon name="info" size={15} />
            <span className="banner-tx">当前只支持关键词与四种真实范围：法规、已接入司法解释、已核实案例、综合。机构、法院、年份、案由等结构化高级筛选尚未实现，因此不提供无效控件。</span>
          </div>
        )}

        <div className="row-wrap mt-20" style={{ justifyContent: 'center' }}>
          <span className="tiny">推荐话题：</span>
          {HOT_SEARCHES.map((h) => (
            <button key={h} className="chip" onClick={() => nav(`/search/results?q=${encodeURIComponent(h)}`)}>{h}</button>
          ))}
        </div>

        <div className="banner-warm mt-20">
          <Icon name="bulb" size={15} />
          <span className="banner-tx">{WARM_TIPS.evidence}{WARM_TIPS.aid} <a href={WARM_TIPS.aidSourceUrl} target="_blank" rel="noreferrer">司法部来源</a>（{WARM_TIPS.aidSourceCheckedAt} 查阅；【{WARM_TIPS.aidSourceGrade}】）。</span>
        </div>
      </div>

      <div className="card mt-20" style={{ maxWidth: 980, margin: '20px auto 0' }}>
        <EmptyState
          icon="search"
          title="输入法律问题开始检索"
          desc="支持按条文关键词（如「格式条款」）、案由或争议焦点检索；结果展示证据快照原文、来源与效力信息，不生成伪摘要。"
          action={<button className="btn btn-secondary" onClick={() => nav('/search/results?q=格式条款')}>试试：格式条款</button>}
        />
      </div>
    </div>
  )
}
