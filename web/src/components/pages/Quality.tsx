import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../ui'
import { Icon as IconIcon } from '../icons'
import { useLaws } from '../../data/model'
import { api } from '../../lib/api'

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
}

interface CoverageData {
  national_law_catalog: { count: number; as_of: string }
  controlled_instrument_ids: string[]
  priority_backlog: { title: string }[]
}

const GATES: [string, string][] = [
  ['1 后端 pytest', '207 项测试（引用绑定、状态机、PIPL 级联、fail-closed、金标评测、子条号切分等）'],
  ['2 构建 + lint', 'tsc 类型检查 + vite 生产构建 + oxlint（--deny-warnings，与 CI Gate 2 对齐）'],
  ['3 数据纪律门', '派生数字禁硬编码 / 真值边界 / 身份品牌 / 受众分层 / 动效材质 Token 纪律'],
  ['4 性能预算门', '入口 JS ≤120KB gzip · 全 JS ≤200KB · CSS ≤25KB · laws.json ≤3.5MB（2026-09-14 修订）'],
  ['5 WCAG 对比度', '正文 4.5:1 + UI 指示器 3:1（--strict，32 组合）'],
  ['6 动效行为探针', '弹簧位移 / Toast 退场 / Reduce Motion 双通道 / 滚动海拔插值等 11 项断言'],
  ['7 可访问性探针', 'WCAG 2.2 AA 子集：交互目标 ≥24×24px、键盘焦点不被遮挡（52 路由逐页实测）'],
]

const HISTORY: [string, string][] = [
  ['2026-09-08 · v1.1.0-rc.1', '182 项后端测试 · 48 路由巡检 · 语料 14 部 2,380 条 · 金标 106 组 hit@5 0.97'],
  ['2026-09-13/14 · 语料扩张', '25 部 3,963 基条（4,016 条文条目）· 金标 162 组 · 新增治安管理处罚法（2025 修订）等 11 部'],
  ['2026-09-14 · 质量门扩容', '质量门 5→7 道（性能预算 / 可访问性探针）· 版本注册表 12 份（四部法律双版本时间线）'],
]

export default function Quality() {
  const laws = useLaws()
  const [evals, setEvals] = useState<EvalsData | null>(null)
  const [evalsState, setEvalsState] = useState<'loading' | 'done'>('loading')
  const [coverage, setCoverage] = useState<CoverageData | null>(null)

  useEffect(() => {
    let alive = true
    api.evals().then((e) => { if (alive) { setEvals(e); setEvalsState('done') } }, () => { if (alive) setEvalsState('done') /* 评测不可用不伪造 */ })
    api.corpusCoverage().then((c) => alive && setCoverage(c as CoverageData), () => { /* 覆盖登记册不可用不伪造 */ })
    return () => { alive = false }
  }, [])

  const articleCount = laws.data?.laws.reduce((n, l) => n + l.articles.length, 0) ?? 0

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
        <div className="card-h row-wrap"><b className="card-h-t">检索评测（确定性金标 · 实时复算）</b></div>
        <div className="card-b">
          {evalsState === 'loading' && (
            <div className="tiny muted">检索评测复算中…（金标 162 组逐题检索，首次约 3 秒）</div>
          )}
          {evalsState === 'loading' && (
            <div className="tiny muted">检索评测复算中…（金标 162 组逐题检索，首次约 3 秒）</div>
          )}
          {evals && (
            <>
              <div className="stats mb-12">
                <div className="stat"><b>{(evals.hit_at_5 * 100).toFixed(1)}%</b><span>hit@5（{evals.case_count} 组金标）</span></div>
                <div className="stat"><b>{evals.mrr.toFixed(2)}</b><span>MRR</span></div>
                <div className="stat"><b>{(evals.abstention_correct_rate * 100).toFixed(0)}%</b><span>拒答正确率（{evals.abstention_probes} 探针）</span></div>
                <div className="stat"><b>{(evals.citation_entity_completeness * 100).toFixed(1)}%</b><span>引用卡四要素完整率</span></div>
              </div>
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
