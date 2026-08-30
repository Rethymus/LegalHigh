// FRAME 02 · Global Legal Search —— 专业检索工作台（规格 §7）
// 默认空态：「输入法律问题开始检索」（§48）
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../icons'
import { EmptyState, PageHeader } from '../ui'
import { HOT_SEARCHES, WARM_TIPS } from '../../data/model'

const SCOPES = ['全部', '法规', '司法解释', '案例', '指导性案例', '法律期刊']
const ADVANCED: { label: string; options: string[] }[] = [
  { label: '法域', options: ['不限', '中国', '美国', '英国', '欧盟', '日本'] },
  { label: '发布机构', options: ['不限', '全国人民代表大会', '全国人大常委会', '国务院', '最高人民法院'] },
  { label: '法院层级', options: ['不限', '最高人民法院', '高级人民法院', '中级人民法院', '基层人民法院'] },
  { label: '案由', options: ['不限', '合同纠纷', '侵权责任', '劳动争议', '婚姻家庭'] },
  { label: '年份', options: ['不限', '2024 年后', '2020 年后', '2010 年后'] },
  { label: '时效性', options: ['不限', '仅现行有效', '含历史版本'] },
  { label: '来源', options: ['不限', '官方法源', '司法案例', '学术资料', '域外资料'] },
  { label: '文书类型', options: ['不限', '判决书', '裁定书', '调解书', '指导案例'] },
]

export default function SearchHome() {
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [scope, setScope] = useState('全部')
  const [adv, setAdv] = useState(false)

  return (
    <div className="page">
      <PageHeader
        title="法律检索"
        sub="跨法规、案例、司法解释的一站式检索。所有结果标注来源、时效与可信等级；AI 摘要与官方原文严格区分。"
      />

      <div className="card card-pad" style={{ maxWidth: 980, margin: '0 auto', paddingBlock: 28 }}>
        <form
          className="searchbar"
          onSubmit={(e) => { e.preventDefault(); if (q.trim()) nav(`/search/results?q=${encodeURIComponent(q.trim())}&scope=${encodeURIComponent(scope)}`) }}
        >
          <Icon name="search" size={18} className="muted" />
          <input className="inp" style={{ fontSize: 15.5 }} placeholder="输入法律问题开始检索：条文关键词、案由、争议焦点……" value={q} onChange={(e) => setQ(e.target.value)} aria-label="检索词" />
          <button className="btn btn-primary btn-lg">检索</button>
        </form>

        <div className="row-wrap mt-16" style={{ justifyContent: 'center' }}>
          {SCOPES.map((s) => (
            <button key={s} type="button" className={'chip' + (scope === s ? ' is-on' : '')} onClick={() => setScope(s)}>{s}</button>
          ))}
          <button type="button" className={'chip' + (adv ? ' is-on' : '')} onClick={() => setAdv((v) => !v)}>
            <Icon name="sliders" size={13} />高级检索
          </button>
        </div>

        {adv && (
          <div className="mt-16" style={{ borderTop: '1px dashed var(--div)', paddingTop: 16 }}>
            <div className="adv-grid">
              {ADVANCED.map((f) => (
                <label key={f.label} className="fld">
                  <span className="fld-l">{f.label}</span>
                  <select className="sel">{f.options.map((o) => <option key={o}>{o}</option>)}</select>
                </label>
              ))}
            </div>
            <div className="row mt-16" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-ghost btn-sm">重置</button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => q.trim() && nav(`/search/results?q=${encodeURIComponent(q.trim())}`)}>应用筛选</button>
            </div>
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
          <span className="banner-tx">{WARM_TIPS.evidence}{WARM_TIPS.aid}</span>
        </div>
      </div>

      <div className="card mt-20" style={{ maxWidth: 980, margin: '20px auto 0' }}>
        <EmptyState
          icon="search"
          title="输入法律问题开始检索"
          desc="支持按条文关键词（如「格式条款」）、案由、争议焦点检索；结果将给出官方原文、AI 摘要与来源可信等级。"
          action={<button className="btn btn-secondary" onClick={() => nav('/search/results?q=格式条款')}>试试：格式条款</button>}
        />
      </div>
    </div>
  )
}
