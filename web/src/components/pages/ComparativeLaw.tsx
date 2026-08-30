// FRAME 14 · Comparative Law —— 跨法域对比（规格 §21）
// China | 可比性分析 | Foreign；域外资料醒目免责
import { useState } from 'react'
import { Icon } from '../icons'
import { FOREIGN_TERMS } from '../../data/model'
import { PageHeader } from '../ui'
import { AIBlock, ForeignDisclaimer, SourceBadge } from '../domain'

const TOPICS = ['格式条款是否构成显失公平', '侵权中的注意义务边界', '惩罚性赔偿的适用']

export default function ComparativeLaw() {
  const [topic, setTopic] = useState(TOPICS[0])
  const [jur, setJur] = useState(0)
  const foreign = FOREIGN_TERMS[jur]

  return (
    <div className="page">
      <PageHeader
        title="跨法域对比"
        sub="就同一法律争议并置中国法与域外法源，输出可比性分析。域外法律与案例仅作比较研究资料。"
      />

      <div className="card card-pad mb-16">
        <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div className="fld" style={{ flex: 1, minWidth: 320 }}>
            <span className="fld-l">法律争议问题</span>
            <input className="inp" value={topic} onChange={(e) => setTopic(e.target.value)} />
          </div>
          <div className="fld" style={{ width: 200 }}>
            <span className="fld-l">对比法域</span>
            <select className="sel" value={jur} onChange={(e) => setJur(Number(e.target.value))}>
              {FOREIGN_TERMS.map((t, i) => <option key={t.name} value={i}>{t.name}</option>)}
            </select>
          </div>
        </div>
        <div className="chips mt-12">
          {TOPICS.map((t) => <button key={t} className={'chip' + (topic === t ? ' is-on' : '')} onClick={() => setTopic(t)}>{t}</button>)}
        </div>
      </div>

      <div className="mb-16"><ForeignDisclaimer /></div>

      <div className="cols cols-3">
        {/* 中国 */}
        <section className="card">
          <div className="card-h"><span className="jur-flag">🇨🇳</span><div><b className="card-h-t">中国</b><small className="tiny" style={{ display: 'block' }}>法律 · 司法解释 · 案例</small></div></div>
          <div className="card-b" style={{ paddingTop: 8 }}>
            <div className="src-item">
              <div className="src-item-t"><SourceBadge kind="law" grade="强" />《民法典》第497条</div>
              <div className="src-item-q">不合理地免除或减轻提供方责任、加重对方责任、限制对方主要权利的格式条款无效。</div>
            </div>
            <div className="src-item">
              <div className="src-item-t"><SourceBadge kind="law" grade="强" />《消费者权益保护法》第26条</div>
              <div className="src-item-q">经营者不得以格式条款等方式排除或限制消费者权利、加重消费者责任。</div>
            </div>
            <div className="src-item">
              <div className="src-item-t"><SourceBadge kind="case" />指导案例24号</div>
              <div className="src-item-q">责任减免须有法定事由——受害人体质不属于减轻责任的情形（责任边界议题的类案参照）。</div>
            </div>
          </div>
        </section>

        {/* 可比性分析（AI） */}
        <section>
          <AIBlock label={`可比性分析（中国 × ${foreign.name}）`}>
            <ul>
              <li><b>共同点：</b>均反对利用优势地位施加显著失衡的合同条款，均要求条款公平与程序正当。</li>
              <li><b>区别：</b>中国以列举式无效情形（第497条）为主；美国采判例式双要素（程序性＋实质性显失公平）；英国/欧盟以制定法的「合理性/公平性」检验为中心。</li>
              <li><b>制度背景：</b>法源结构不同（成文法主导 vs 判例法主导），法院对「显失公平」的审查强度与阶段（缔约时）不同。</li>
              <li><b>不可类推部分：</b>外国法院的裁判结论对中国法院无拘束力；涉及公共政策的认定不可直接移植。</li>
            </ul>
          </AIBlock>
          <div className="banner banner-warn mt-12"><Icon name="alert" size={15} /><span className="banner-tx">方法论边界：外国判例只作说理性/教育性材料，不作证据。</span></div>
        </section>

        {/* 域外 */}
        <section className="card">
          <div className="card-h"><span className="jur-flag">{foreign.flag}</span><div><b className="card-h-t">{foreign.name}</b><small className="tiny" style={{ display: 'block' }}>Foreign Statute / Case</small></div><span className="spacer" /><SourceBadge kind="foreign" /></div>
          <div className="card-b" style={{ paddingTop: 8 }}>
            {foreign.items.map((it) => (
              <div key={it.t} className="src-item">
                <div className="src-item-t">{it.t}<span className="bdg bdg-gray">{it.c}</span></div>
                <div className="src-item-q">{it.q}</div>
              </div>
            ))}
            <div className="tiny mt-12">Court / Holding 字段以官方判决与制定法文本核对为准；接入域外数据源后提供逐字原文。</div>
          </div>
        </section>
      </div>
    </div>
  )
}
