import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../ui'
import { Icon as IconIcon } from '../icons'
import { useLaws } from '../../data/model'
import { api, type CaseRecord } from '../../lib/api'

/* 质量透明度页（粉饰清单③，v5-S2 2026-09-14）：只读公示质量数字。
   数字分两类（决策 14 口径）：①实时派生——来自 /api/inventory、/api/evals、/api/corpus/coverage，
   与当前运行实例一致；②带日期历史记录——如测试数量，按贡献纪律作为不可变历史记录标注日期，
   禁止伪装成实时值。工程指标不是法律正确率。 */

interface EvalsData {
  case_count: number
  hit_at_5: number
  mrr: number
  abstention_correct_rate: number
  abstention_probes: number
  citation_entity_completeness: number
  rank1_rate?: number
  precision_at_5?: number
  recall_at_20?: number
  ndcg_at_10?: number
  gap_subset_count?: number
  gap_subset_hit_at_5?: number | null
  gap_subset_rank1?: number | null
}

interface CoverageData {
  national_law_catalog: { count: number; as_of: string }
  controlled_instrument_ids: string[]
  priority_backlog: { title: string }[]
}

const GATES: [string, string][] = [
  ['1 后端 pytest', '全量后端测试（引用绑定、状态机、PIPL 级联、fail-closed、金标评测、子条号切分等；当前规模见 README 质量表带日期记录）'],
  ['2 构建 + lint', 'tsc 类型检查 + vite 生产构建 + oxlint（--deny-warnings，与 CI Gate 2 对齐）'],
  ['3 数据纪律门', '派生数字禁硬编码 / 真值边界 / 身份品牌 / 受众分层 / 动效材质 Token 纪律 / 术语卡分类全渲染'],
  ['4 性能预算门', '入口 JS ≤120KB gzip · 全 JS ≤280KB · CSS ≤25KB · laws.json ≤5MB（2026-09-22 修订记录见 CHANGELOG）'],
  ['5 WCAG 对比度', '正文 4.5:1 + UI 指示器 3:1（--strict，32 组合）'],
  ['6 动效行为探针', '弹簧位移 / Toast 退场 / Reduce Motion 双通道 / 滚动海拔插值等 11 项断言'],
  ['7 可访问性探针', 'WCAG 2.2 AA 子集：交互目标 ≥24×24px、键盘焦点不被遮挡（13 路由抽样实测）'],
]

const HISTORY: [string, string][] = [
  ['2026-09-22 · 第二独立谱系收官', 'lttxzmj 81 部 flk-docx 源法律全部定性：74 部全一致 + 其余诚实分类（版本滞后/未收录/表形态注记）；刑法抓出 20 处转录缺陷经构建层修正；第三链锁定 26 部常驻自检'],
  ['2026-09-21 · bbbs 候选管线', 'flk native id 82/108 · 24 部现行版 bbbs 候选就绪（lawtext 快照 id 溯源）· 待业主授权批量核验'],
  ['2026-09-08 · v1.1.0-rc.1', '182 项后端测试 · 48 路由巡检 · 语料 14 部 2,380 条 · 金标 106 组 hit@5 0.97'],
  ['2026-09-13/14 · 语料扩张', '25 部 3,963 基条（4,016 条文条目）· 金标 162 组 · 新增治安管理处罚法（2025 修订）等 11 部'],
  ['2026-09-14 · 质量门扩容', '质量门 5→7 道（性能预算 / 可访问性探针）· 版本注册表 12 份（四部法律双版本时间线）'],
]

export default function Quality() {
  const laws = useLaws()
  const [evals, setEvals] = useState<EvalsData | null>(null)
  const [evalsState, setEvalsState] = useState<'loading' | 'done'>('loading')
  const [coverage, setCoverage] = useState<CoverageData | null>(null)
  const [cases, setCases] = useState<CaseRecord[] | null>(null)

  useEffect(() => {
    let alive = true
    api.evals().then((e) => { if (alive) { setEvals(e); setEvalsState('done') } }, () => { if (alive) setEvalsState('done') /* 评测不可用不伪造 */ })
    api.corpusCoverage().then((c) => alive && setCoverage(c as CoverageData), () => { /* 覆盖登记册不可用不伪造 */ })
    api.listCases('').then((d) => alive && setCases(d.cases.filter((c) => c.verified && !c.sample)), () => alive && setCases(null))
    return () => { alive = false }
  }, [])

  const articleCount = laws.data?.laws.reduce((n, l) => n + l.articles.length, 0) ?? 0
  // 案例库构成（粉饰②）：全部由已加载案例实时派生，不硬编码件数
  const caseStats = useMemo(() => {
    if (!cases) return null
    const guiding = cases.filter((c) => c.level === '指导性案例').length
    const foreign = cases.filter((c) => c.level === '外国判例').length
    const accessed = cases.map((c) => c.source_accessed_at).filter(Boolean).sort()
    return { total: cases.length, guiding, foreign, latest: accessed.at(-1) ?? null }
  }, [cases])

  return (
    <div className="page">
      <PageHeader
        title="质量透明度"
        sub="只读公示本项目的质量数字与验证口径。实时数字来自当前运行实例；带日期数字为不可变的历史运行记录。"
      />
      <div className="banner banner-info mb-16">
        <IconIcon name="info" size={15} />
        <span className="banner-tx">
          <b>口径：</b>以下全部是软件工程指标，<b>不是法律正确率</b>。没有独立法律专家金标评测集时，校准正确率显示为「暂无」。
        </span>
      </div>

      <section className="card mb-20">
        <div className="card-h row-wrap"><b className="card-h-t">受控语料与实时储备</b><span className="spacer" /><Link className="tiny" style={{ color: 'var(--accent-text)' }} to="/data-sources">数据与证据来源 →</Link></div>
        <div className="card-b">
          <div className="stats">
            <div className="stat"><b>{laws.data ? laws.data.laws.length : '—'}</b><span>受控规范文件</span></div>
            <div className="stat"><b>{articleCount ? articleCount.toLocaleString() : '—'}</b><span>条文条目</span></div>
            <div className="stat"><b>{laws.data ? (laws.data.fetchDate || '—') : '—'}</b><span>证据抓取日期</span></div>
          </div>
        </div>
      </section>

      <section className="card mb-20">
        <div className="card-h row-wrap"><b className="card-h-t">案例库构成（实时派生）</b><span className="spacer" /><Link className="tiny" style={{ color: 'var(--accent-text)' }} to="/cases">案例检索 →</Link></div>
        <div className="card-b">
          {caseStats ? (
            <div className="stats">
              <div className="stat"><b>{caseStats.total}</b><span>案例总数</span></div>
              <div className="stat"><b>{caseStats.guiding}</b><span>最高人民法院指导案例</span></div>
              <div className="stat"><b>{caseStats.foreign}</b><span>域外判例（比较研究）</span></div>
              <div className="stat"><b>{caseStats.latest ?? '—'}</b><span>最近来源核验日期</span></div>
            </div>
          ) : (
            <div className="tiny muted">案例库暂时不可用（本页不伪造替代数据）。</div>
          )}
        </div>
      </section>

      <section className="card mb-20">
        <div className="card-h row-wrap"><b className="card-h-t">检索评测（确定性金标 · 实时复算）</b></div>
        <div className="card-b">
          {evalsState === 'loading' && (
            <div className="tiny muted">检索评测复算中…（金标全集逐题检索，首次约 3 秒）</div>
          )}
          {evals && (
            <>
              <div className="stats mb-12">
                <div className="stat"><b>{(evals.hit_at_5 * 100).toFixed(1)}%</b><span>hit@5（{evals.case_count} 组金标）</span></div>
                <div className="stat"><b>{evals.rank1_rate != null ? `${(evals.rank1_rate * 100).toFixed(1)}%` : '—'}</b><span>rank-1 命中率（更严口径）</span></div>
                <div className="stat"><b>{evals.mrr.toFixed(2)}</b><span>MRR</span></div>
                <div className="stat"><b>{evals.recall_at_20 != null ? `${(evals.recall_at_20 * 100).toFixed(1)}%` : '—'}</b><span>Recall@20（宽截断召回）</span></div>
                <div className="stat"><b>{evals.ndcg_at_10 != null ? evals.ndcg_at_10.toFixed(2) : '—'}</b><span>nDCG@10</span></div>
                <div className="stat"><b>{(evals.abstention_correct_rate * 100).toFixed(0)}%</b><span>拒答正确率（{evals.abstention_probes} 探针）</span></div>
                <div className="stat"><b>{(evals.citation_entity_completeness * 100).toFixed(1)}%</b><span>引用卡四要素完整率</span></div>
              </div>
              {evals.gap_subset_count != null && evals.gap_subset_count > 0 && (
                <div className="banner banner-info mb-12"><IconIcon name="info" size={14} />
                  <span className="banner-tx">
                    词法鸿沟子集（{evals.gap_subset_count} 组口语问法实录，如「别人打我我还手」vs 条文「制止不法侵害」）：
                    hit@5 <b>{evals.gap_subset_hit_at_5 != null ? `${(evals.gap_subset_hit_at_5 * 100).toFixed(1)}%` : '—'}</b>
                    {evals.gap_subset_rank1 != null && <> · rank-1 <b>{(evals.gap_subset_rank1 * 100).toFixed(1)}%</b></>}
                    ——低于全量的差距就是口语问法的真实代价，是语义检索再评估的数据依据。
                  </span>
                </div>
              )}
              <div className="tiny">拒答正确率：语料外乱码探针不得输出法条卡片；引用卡四要素：状态 / 施行日期 / 来源 URL / 条号标签。指标全部随服务进程确定性复算，可复核。</div>
            </>
          )}
          {evalsState === 'done' && !evals && (
            <div className="tiny muted">评测不可用（本页不伪造替代数据）。</div>
          )}
</div>
      </section>

      {coverage && (
        <section className="card mb-20">
          <div className="card-h row-wrap"><b className="card-h-t">覆盖边界（诚实口径）</b></div>
          <div className="card-b">
            <div className="tiny" style={{ lineHeight: 1.8 }}>
              全国人大目录截至 {coverage.national_law_catalog.as_of} 载明 <b>{coverage.national_law_catalog.count}</b> 件现行有效法律；本系统当前受控 <b>{coverage.controlled_instrument_ids.length}</b> 部，优先待办 <b>{coverage.priority_backlog.length}</b> 部。两者统计口径不同——本项目不是完整中国法律数据库，也没有历史版本全库。
            </div>
          </div>
        </section>
      )}

      <section className="card mb-20">
        <div className="card-h row-wrap"><b className="card-h-t">质量门（提交与发布必过）</b></div>
        <div className="card-b">
          <div className="tiny" style={{ lineHeight: 2 }}>
            {GATES.map(([name, desc]) => (
              <div key={name}><b>{name}</b>：{desc}</div>
            ))}
          </div>
          <div className="tiny mt-8">
            <a href="https://github.com/Rethymus/LegalHigh/actions/workflows/qa.yml" target="_blank" rel="noreferrer" className="bold" style={{ color: 'var(--accent-text)' }}>查看云端 CI 实际运行记录（qa 六门）→</a>
          </div>
        </div>
      </section>

      <section className="card mb-20">
        <div className="card-h row-wrap"><b className="card-h-t">版本注册表（历史版本采集）</b><span className="spacer" /><span className="tiny">2026-09-14 记录</span></div>
        <div className="card-b">
          <div className="stats mb-12">
            <div className="stat"><b>16</b><span>版本注册表</span></div>
            <div className="stat"><b>52</b><span>已登记版本</span></div>
            <div className="stat"><b>13</b><span>多版本时间线</span></div>
            <div className="stat"><b>18</b><span>修正案 / 决定</span></div>
          </div>
          <div className="tiny">版本注册表只登记有仓库证据的版本（快照自证）；历史版本全文存证于 <code>docs/research/evidence/</code> 但不进入现行检索语料。完整 API：<code>GET /api/laws/{'{law_id}'}/versions</code>。</div>
        </div>
      </section>

      <section className="card mb-20">
        <div className="card-h row-wrap"><b className="card-h-t">历史运行记录（不可变 · 带日期）</b></div>
        <div className="card-b">
          <div className="tiny" style={{ lineHeight: 2 }}>
            {HISTORY.map(([k, v]) => (
              <div key={k}><b>{k}</b>：{v}</div>
            ))}
          </div>
          <div className="tiny mt-8">更多证据：<Link to="/data-sources" className="bold" style={{ color: 'var(--accent-text)' }}>数据与证据来源页</Link> · <a href="https://github.com/Rethymus/LegalHigh/releases" target="_blank" rel="noreferrer" className="bold" style={{ color: 'var(--accent-text)' }}>Releases（源码 / 静态站 / SBOM / SHA-256）</a></div>
        </div>
      </section>
    </div>
  )
}
