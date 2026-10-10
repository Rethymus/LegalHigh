import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../ui'
import { Icon } from '../icons'
import { api } from '../../lib/api'
import TERMS from '../../data/terms.json'

/* 术语卡（粉饰清单②，v5-S2 2026-09-14）：高频法律术语的通俗解释，全部为项目原创
   内容并绑定受控语料内的真实条文（点击可核对原文）——与解读库双轨纪律一致的诚实形态：
   通俗解释不是法律意见。所有条号引用经检索/金标验证存在且现行有效。
   数据单一来源：src/data/terms.json（R91 抽出）——llms.txt 生成器与页面共用同一份。 */

interface TermCard {
  term: string
  explain: string
  refs: { law_id: string; art: string; label: string }[]
  cat:
    | '民事'
    | '劳动'
    | '刑事'
    | '程序'
    | '网络与数据'
    | '治安'
    | '宪法'
    | '行政'
    | '经济法'
    | '社会法'
    | '知识产权'
}

/* 分类清单必须与 terms.json 实际出现的 cat 全集对齐（R271 教训：扩张批次引入
   行政/经济法/社会法/知识产权 四类共 122 张卡未同步进此列表，页面静默吞掉）——
   test 自检：corpus_selfcheck 术语卡计数 ≥ 本列表渲染计数。 */
const CATS: TermCard['cat'][] = [
  '治安',
  '民事',
  '劳动',
  '刑事',
  '程序',
  '网络与数据',
  '宪法',
  '行政',
  '经济法',
  '社会法',
  '知识产权',
]

export default function Terms() {
  // R342：术语卡→案例双向导航——从 citator 图谱取逐条被引案例数（一次 API 调用）
  const [graph, setGraph] = useState<Awaited<ReturnType<typeof api.citatorGraph>> | null>(null)
  useEffect(() => {
    let alive = true
    api.citatorGraph().then((g) => { if (alive) setGraph(g) }, () => { /* 图谱不可用时不显示案例徽章 */ })
    return () => { alive = false }
  }, [])

  // 构建 (law_id, no) → citing case 数 查找表（从图谱逐条文 case_ids）
  const caseCountMap = useMemo(() => {
    const m = new Map<string, number>()
    if (!graph) return m
    for (const law of graph.laws) {
      for (const art of law.articles) {
        m.set(`${law.law_id}-${art.no}`, art.case_ids.length)
      }
    }
    return m
  }, [graph])

  /** 获取术语卡引用条文的被引案例总数（跨全部 refs 求和） */
  const citingCount = (refs: TermCard['refs']): number => {
    let n = 0
    for (const r of refs) {
      const no = parseInt(r.art, 10)
      if (!isNaN(no)) n += caseCountMap.get(`${r.law_id}-${no}`) ?? 0
    }
    return n
  }

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
              {list.map((t) => {
                const nCases = citingCount(t.refs)
                return (
                <div key={t.term} className="card" style={{ padding: '10px 14px', display: 'inline-block', maxWidth: 420, verticalAlign: 'top' }}>
                  <b style={{ fontSize: 13.5 }}>{t.term}</b>
                  {nCases > 0 && (
                    <Link to={`/laws/${t.refs[0].law_id}?art=${t.refs[0].art}`} className="bdg bdg-blue" style={{ marginLeft: 6, fontSize: 10, textDecoration: 'none' }} title={`${nCases} 件已核实案例引用此条文——点击查看`}>
                      {nCases} 案例引用
                    </Link>
                  )}
                  <div className="tiny mt-8" style={{ lineHeight: 1.7 }}>{t.explain}</div>
                  <div className="tiny mt-8">
                    {t.refs.map((r) => (
                      <Link key={`${r.law_id}@${r.art}`} to={`/laws/${r.law_id}?art=${r.art}`} className="tiny bold" style={{ color: 'var(--accent-text)', marginRight: 10 }}>
                        {r.label} →
                      </Link>
                    ))}
                  </div>
                </div>
                )
              })}
            </div>
          </section>
        )
      })}
      <div className="tiny" style={{ paddingBottom: 24 }}>
        以上共 {TERMS.length} 张术语卡将随语料扩张持续增补；术语解释为项目原创普法内容并逐条绑定语料条文，未采用任何 AI 未审核生成。{graph ? '「N 案例引用」徽章数据来自案例-法条引用图谱（已核实案例精确匹配）。' : ''}
      </div>
    </div>
  )
}
