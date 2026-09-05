// FRAME 15 · Learning Center —— 学习中心（规格 §22）
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon, type IconName } from '../icons'
import { findArticle, findLaw, Socratic_QS, SUBJECTS, useLaws } from '../../data/model'
import { PageHeader } from '../ui'

const TONE: Record<string, { bg: string; fg: string }> = {
  blue: { bg: 'var(--accent-soft)', fg: 'var(--accent-text)' },
  green: { bg: 'var(--ok-soft)', fg: 'var(--ok)' },
  purple: { bg: 'var(--purple-soft)', fg: 'var(--purple-t)' },
  gray: { bg: 'var(--div-soft)', fg: 'var(--tx-3)' },
}

export default function Learning() {
  const [flip, setFlip] = useState(false)
  // IRAC 示例的依据只引用与议题（格式条款效力）直接相关的条文；指导案例24号是
  // 交通事故体质案，与格式条款无关，不得混入（数据真实性审计同类口径，2026-08-30 修正）。
  const [irac, setIrac] = useState({ issue: '', rule: '', application: '', conclusion: '' })
  const { data: laws } = useLaws()
  const civilCode = findLaw(laws, 'civl-2020')
  const article496 = findArticle(civilCode, 496)
  const article497 = findArticle(civilCode, 497)

  return (
    <div className="page">
      <PageHeader
        title="学习中心"
        sub="面向法学学习的本机练习：法条精读、IRAC 分析、请求权基础与提问卡；不替代教师、教材或个案法律意见。"
        actions={<Link to="/search" className="btn btn-secondary btn-sm"><Icon name="search" size={13} />去检索法条</Link>}
      />

      <div className="sec">
        <div className="sec-h"><span className="sec-t">已接入专题</span><span className="spacer" /><span className="tiny">数量由当前 laws.json 实时派生</span></div>
        <div className="subj-grid">
          {SUBJECTS.map((s) => {
            const tone = TONE[s.tone] ?? TONE.blue
            const included = laws?.laws.filter((law) => s.lawIds.includes(law.id)) ?? []
            const count = included.reduce((sum, law) => sum + law.articles.length, 0)
            const to = s.lawIds.length === 1 ? `/laws/${s.lawIds[0]}` : '/laws'
            const card = (
              <>
                <span className="subj-ic" style={{ background: tone.bg, color: tone.fg }}><Icon name={s.icon as IconName} size={17} /></span>
                <div className="subj-t">{s.name}</div>
                <div className="subj-d">{s.desc}</div>
                <span className="bdg bdg-blue">{laws ? `${count.toLocaleString()} 条` : '读取中…'}</span>
              </>
            )
            return <Link key={s.id} to={to} className="subj-card">{card}</Link>
          })}
        </div>
      </div>

      <div className="sec">
        <div className="sec-h"><span className="sec-t">IRAC 分析工作台</span><span className="spacer" /><span className="tiny">示例议题：平台格式条款效力</span></div>
        <div className="irac">
          <div className="irac-cell">
            <span className="irac-letter" style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}>I</span>
            <div className="irac-t">Issue · 争议</div>
            <textarea className="ta" style={{ minHeight: 90, fontSize: 12.5 }} placeholder="平台以格式条款免除审慎义务是否有效？" value={irac.issue} onChange={(e) => setIrac({ ...irac, issue: e.target.value })} />
          </div>
          <div className="irac-cell">
            <span className="irac-letter" style={{ background: 'var(--purple-soft)', color: 'var(--purple-t)' }}>R</span>
            <div className="irac-t">Rule · 规则</div>
            <textarea className="ta" style={{ minHeight: 90, fontSize: 12.5 }} placeholder="阅读原文后，用自己的话写出拟适用规则；不要把系统提示当作结论。" value={irac.rule} onChange={(e) => setIrac({ ...irac, rule: e.target.value })} />
            <div className="row-wrap mt-8">
              {[article496, article497].filter(Boolean).map((article) => (
                <Link key={article!.no} to={`/laws/civl-2020?art=${article!.no}`} className="tiny row" style={{ gap: 3 }}>
                  <Icon name="link" size={11} />打开{article!.label}证据快照
                </Link>
              ))}
            </div>
          </div>
          <div className="irac-cell">
            <span className="irac-letter" style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }}>A</span>
            <div className="irac-t">Application · 适用</div>
            <textarea className="ta" style={{ minHeight: 90, fontSize: 12.5 }} placeholder="将规则涵摄到事实：提示方式、对价平衡……" value={irac.application} onChange={(e) => setIrac({ ...irac, application: e.target.value })} />
          </div>
          <div className="irac-cell">
            <span className="irac-letter" style={{ background: 'var(--ok-soft)', color: 'var(--ok)' }}>C</span>
            <div className="irac-t">Conclusion · 结论</div>
            <textarea className="ta" style={{ minHeight: 90, fontSize: 12.5 }} placeholder="得出暂定结论……" value={irac.conclusion} onChange={(e) => setIrac({ ...irac, conclusion: e.target.value })} />
          </div>
        </div>
      </div>

      <div className="cols cols-3">
        <div className="card card-pad">
          <div className="row mb-12"><Icon name="tree" size={15} className="muted" /><b>请求权基础导航</b></div>
          <div style={{ fontSize: 12.5, lineHeight: 2 }}>
            <div>谁得向谁？<b>请求返还货款</b></div>
            <div className="muted">└ 合同请求权 ·《民法典》第577条（违约责任）</div>
            <div className="muted">└ 类合同 · 第157条（无效后果）</div>
            <div className="muted">└ 不当得利 · 第985条</div>
            <div className="muted">└ 侵权 · 第1165条</div>
          </div>
          <div className="tiny mt-12">练习示意：请求权基础的竞合与顺位必须结合真实事实、抗辩和时效逐项核验。交互式检查器尚未实现。</div>
        </div>

        <div className="card card-pad">
          <div className="row mb-12"><Icon name="zap" size={15} className="muted" /><b>法条原文卡</b><span className="spacer" /><span className="tiny">点击或键盘激活翻面</span></div>
          <button
            type="button"
            className={'flash' + (flip ? ' is-flip' : '')}
            onClick={() => setFlip((value) => !value)}
            aria-pressed={flip}
            aria-label="翻转民法典第四百九十七条原文卡"
            style={{ display: 'block', width: '100%', padding: 0, border: 0, color: 'inherit', background: 'transparent' }}
          >
            <div className="flash-inner">
              <div className="flash-face"><div>{article497 ? `《${civilCode?.title}》${article497.label} · 查看证据快照原文` : '正在读取法条证据快照…'}</div></div>
              <div className="flash-face flash-back"><div>{article497?.text ?? '法条证据快照尚未加载，不能显示手写替代文本。'}</div></div>
            </div>
          </button>
        </div>

        <div className="card card-pad">
          <div className="row mb-12"><Icon name="compass" size={15} className="muted" /><b>苏格拉底式提问</b></div>
          <ul style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {Socratic_QS.map((q) => <li key={q} className="mini-d" style={{ display: 'block', WebkitLineClamp: 'unset' }}>· {q}</li>)}
          </ul>
        </div>
      </div>
    </div>
  )
}
