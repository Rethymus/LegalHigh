import { Link } from 'react-router-dom'
import { PageHeader } from '../ui'
import { Icon } from '../icons'
import TERMS from '../../data/terms.json'

/* 术语卡（粉饰清单②，v5-S2 2026-09-14）：高频法律术语的通俗解释，全部为项目原创
   内容并绑定受控语料内的真实条文（点击可核对原文）——与解读库双轨纪律一致的诚实形态：
   通俗解释不是法律意见。所有条号引用经检索/金标验证存在且现行有效。
   数据单一来源：src/data/terms.json（R91 抽出）——llms.txt 生成器与页面共用同一份。 */

interface TermCard {
  term: string
  explain: string
  refs: { law_id: string; art: string; label: string }[]
  cat: '民事' | '劳动' | '刑事' | '程序' | '网络与数据' | '治安' | '宪法'
}

const CATS: TermCard['cat'][] = ['治安', '民事', '劳动', '刑事', '程序', '网络与数据', '宪法']

export default function Terms() {
  return (
    <div className="page">
      <PageHeader
        title="术语卡"
        sub="高频法律术语的通俗解释卡片。每张卡都绑定受控语料内的真实条文，点击即可核对原文；通俗解释为项目原创内容，不是法律意见。"
      />
      <div className="banner banner-warm mb-16">
        <Icon name="bulb" size={15} />
        <span className="banner-tx">
          术语解释仅作普法参考，具体案件的适用请结合完整材料咨询执业律师或拨打 12348 法律援助热线。
        </span>
      </div>
      {CATS.map((cat) => {
        const list = TERMS.filter((t) => t.cat === cat)
        if (!list.length) return null
        return (
          <section key={cat} className="mb-20">
            <div className="tiny bold mb-8">{cat}</div>
            <div className="chips">
              {list.map((t) => (
                <div key={t.term} className="card" style={{ padding: '10px 14px', display: 'inline-block', maxWidth: 420, verticalAlign: 'top' }}>
                  <b style={{ fontSize: 13.5 }}>{t.term}</b>
                  <div className="tiny mt-8" style={{ lineHeight: 1.7 }}>{t.explain}</div>
                  <div className="tiny mt-8">
                    {t.refs.map((r) => (
                      <Link key={r.art} to={`/laws/${r.law_id}?art=${r.art}`} className="tiny bold" style={{ color: 'var(--accent-text)', marginRight: 10 }}>
                        {r.label} →
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )
      })}
      <div className="tiny" style={{ paddingBottom: 24 }}>
        以上共 {TERMS.length} 张术语卡将随语料扩张持续增补；术语解释为项目原创普法内容并逐条绑定语料条文，未采用任何 AI 未审核生成。
      </div>
    </div>
  )
}
