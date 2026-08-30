// FRAME 15 · Learning Center —— 学习中心（规格 §22）
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon, type IconName } from '../icons'
import { Socratic_QS, SUBJECTS } from '../../data/model'
import { PageHeader, useToast } from '../ui'

const TONE: Record<string, { bg: string; fg: string }> = {
  blue: { bg: 'var(--accent-soft)', fg: 'var(--accent)' },
  green: { bg: 'var(--ok-soft)', fg: 'var(--ok)' },
  purple: { bg: 'var(--purple-soft)', fg: 'var(--purple-t)' },
  gray: { bg: 'var(--div-soft)', fg: 'var(--tx-3)' },
}

const FLASHCARD = { front: '《民法典》第497条：格式条款何时无效？', back: '①不合理免除/减轻提供方责任 ②不合理加重对方责任 ③排除对方主要权利 —— 满足其一即无效。' }

export default function Learning() {
  const [flip, setFlip] = useState(false)
  // IRAC 示例的依据只引用与议题（格式条款效力）直接相关的条文；指导案例24号是
  // 交通事故体质案，与格式条款无关，不得混入（数据真实性审计同类口径，2026-08-30 修正）。
  const [irac, setIrac] = useState({ issue: '', rule: '《民法典》第496条（格式条款提示说明义务）＋ 第497条（格式条款无效情形）', application: '', conclusion: '' })
  const toast = useToast()

  return (
    <div className="page">
      <PageHeader
        title="学习中心"
        sub="面向法学学习：法条精读、IRAC 分析、请求权基础与案例练习。AI 充当学习伙伴，不替代教师与教材。"
        actions={<Link to="/search" className="btn btn-secondary btn-sm"><Icon name="search" size={13} />去检索法条</Link>}
      />

      <div className="sec">
        <div className="sec-h"><span className="sec-t">学科模块</span><span className="spacer" /><span className="tiny">灰色模块语料未接入</span></div>
        <div className="subj-grid">
          {SUBJECTS.map((s) => {
            const tone = TONE[s.tone] ?? TONE.blue
            const card = (
              <>
                <span className="subj-ic" style={{ background: tone.bg, color: tone.fg }}><Icon name={s.icon as IconName} size={17} /></span>
                <div className="subj-t">{s.name}</div>
                <div className="subj-d">{s.desc}</div>
                {s.count ? <span className="bdg bdg-blue">{s.count}</span> : <span className="bdg bdg-gray">未接入</span>}
              </>
            )
            return s.count ? (
              <Link key={s.id} to={`/laws`} className="subj-card">{card}</Link>
            ) : (
              <div key={s.id} className="subj-card" style={{ opacity: 0.55, cursor: 'not-allowed' }} onClick={() => toast('该学科语料未接入（见数据洞察）')}>{card}</div>
            )
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
            <textarea className="ta" style={{ minHeight: 90, fontSize: 12.5 }} value={irac.rule} onChange={(e) => setIrac({ ...irac, rule: e.target.value })} />
            <Link to="/laws/civl-2020?art=497" className="tiny row mt-8" style={{ gap: 3 }}><Icon name="link" size={11} />打开第497条原文</Link>
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
          <button className="btn btn-secondary btn-sm mt-12" onClick={() => toast('请求权基础检查器为原型占位')}>打开检查器</button>
        </div>

        <div className="card card-pad">
          <div className="row mb-12"><Icon name="zap" size={15} className="muted" /><b>法条记忆卡</b><span className="spacer" /><span className="tiny">点击翻面</span></div>
          <div className={'flash' + (flip ? ' is-flip' : '')} onClick={() => setFlip((v) => !v)} role="button">
            <div className="flash-inner">
              <div className="flash-face"><div>{FLASHCARD.front}</div></div>
              <div className="flash-face flash-back"><div>{FLASHCARD.back}</div></div>
            </div>
          </div>
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
