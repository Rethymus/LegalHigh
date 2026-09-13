import { useCopy } from '../ui'
import { Link } from 'react-router-dom'
import { PageHeader } from '../ui'
import { Icon } from '../icons'
import { audienceLabel, loadAudiencePreference } from '../../lib/audience'

/* 使用指南（粉饰清单①，v5-S2 2026-09-13）：纯静态内容页，三类视图开放。
   文案与 README/备案口径一致：不是律师、不提供法律意见、高风险产出平台外独立复核。
   配图来自 docs/readme 媒体池（readme_media.mjs 唯一来源，sync_guide_media.mjs 同步）。 */

const WORKFLOWS = [
  {
    img: '/guide/gif-search.gif',
    title: '① 法条检索 → 引用卡片',
    desc: '跨 14 部受控语料的确定性检索，每条结果带来源、时效与证据等级；摘要只显示程序统计，不调用生成模型。',
    to: '/search',
    linkLabel: '进入法律检索',
  },
  {
    img: '/guide/gif-needs.gif',
    title: '② 事实与证据梳理（公众视图）',
    desc: '六步记录起因、经过、结果、人员、材料与诉求；系统只据此检索可回溯来源并给出「候选问题方向」，未知明确标未知，不自动判案。结果仅在本页存在，可导出 JSON 带给法律援助或律师。',
    to: '/needs',
    linkLabel: '进入事实与证据梳理',
  },
  {
    img: '/guide/gif-case-analysis.gif',
    title: '③ 请求权要件检查',
    desc: '仅在使用者明确选择方向后运行：逐项回链原文片段与现行条文，只报告「文本中发现线索/未见线索」，不作案由认定或结果预测。',
    to: '/case-analysis',
    linkLabel: '进入要件检查',
  },
  {
    img: '/guide/gif-contract.gif',
    title: '④ 合同规则审查（专业视图）',
    desc: '本地规则扫描费用、账户与责任条款：审查点 → Risk Inspector 批注状态机 → DOCX 修订稿导出；结果不是律师审查结论。',
    to: '/contracts/new',
    linkLabel: '进入合同审查',
    professionalOnly: true,
  },
]

export default function Guide() {
  const copy = useCopy()
  const mode = loadAudiencePreference()?.mode

  return (
    <div className="page">
      <PageHeader
        title="使用指南"
        sub="LegalHigh 是本地优先的普法与事实准备工具：证据快照 → 确定性检索 → 引用绑定 → 人工核验 → 审计留痕。本页只描述真实存在的能力与边界。"
      />

      <div className="banner banner-warm mb-16">
        <Icon name="scale" size={15} />
        <span className="banner-tx">
          它不是律师事务所，不以律师名义执业，不提供法律意见，也不预测裁判结果；任何高风险输出都必须由有权且具备相应资格的人在平台外独立复核后使用。遇到具体法律问题，可拨打 12348 法律援助热线或咨询执业律师。
        </span>
      </div>

      <section className="card card-pad mb-20">
        <div className="card-h row-wrap"><b className="card-h-t">第一步：选择使用视图</b><span className="spacer" /><span className="tiny">当前：{audienceLabel(mode ?? 'public')}</span></div>
        <div className="tiny" style={{ lineHeight: 1.8 }}>
          首次使用需在<b>普通民众 / 法学学习者 / 专业使用者</b>三种本机视图中自行选择（设置 → 使用视图可随时切换，不采集姓名、不是资格认证）。法条与案例检索对三类视图始终开放；来源研究、学习与比较法按用途展示；合同审查、文书草稿与专业工作台仅在专业使用者视图出现，直接输入地址也会被视图门拦截。
        </div>
      </section>

      {WORKFLOWS.map((w) => (
        <section className="card mb-20" key={w.title}>
          <div className="card-h row-wrap">
            <b className="card-h-t">{w.title}</b>
            <span className="spacer" />
            {!w.professionalOnly || mode === 'professional' ? (
              <Link className="tiny" style={{ color: 'var(--accent-text)' }} to={w.to}>{w.linkLabel} →</Link>
            ) : (
              <span className="tiny">需专业使用者视图</span>
            )}
          </div>
          <div style={{ padding: '0 16px 16px' }}>
            <div className="tiny mb-8" style={{ maxWidth: 880 }}>{w.desc}</div>
            <img src={w.img} alt={w.title} loading="lazy" style={{ width: '100%', maxWidth: 880, borderRadius: 'var(--r-c, 10px)', border: '1px solid var(--mat-hairline)' }} />
          </div>
        </section>
      ))}

      <section className="card mb-20">
        <div className="card-h row-wrap"><b className="card-h-t">界面外观与可访问性</b></div>
        <div style={{ padding: '0 16px 16px' }}>
          <div className="tiny mb-8" style={{ maxWidth: 880 }}>
            界面遵循系统浅色/深色与减少动态效果设置；大字模式可在 设置 → 外观 开启。分段控件、开关与列表动效均通过无头浏览器行为探针验证；对比度按 WCAG AA（正文 4.5:1、UI 指示器 3:1）门禁。
          </div>
          <img src="/guide/gif-theme.gif" alt="明暗主题切换演示" loading="lazy" style={{ width: '100%', maxWidth: 880, borderRadius: 'var(--r-c, 10px)', border: '1px solid var(--mat-hairline)' }} />
        </div>
      </section>

      <section className="card card-pad mb-20">
        <div className="card-h row-wrap mb-8"><b className="card-h-t">常见问题</b></div>
        <div className="tiny" style={{ lineHeight: 2 }}>
          <b>数据从哪里来？</b>法条由仓库内官方/转录证据快照构建（每条带来源 URL、核验日期与证据等级，可在数据洞察页逐条查看）；案例只收录带直接来源的可核验记录；页面提供「全国人大目录 310 件现行有效法律」的覆盖边界对照——本项目不是完整法律数据库。<br />
          <b>我的材料存在哪里？</b>合同、草稿、投诉与审计写入本机 SQLite；收藏、外观与研究索引存浏览器本机存储。没有多用户账号体系，不适合公网共享部署。<br />
          <b>AI 功能默认开启吗？</b>默认关闭。只有你明确配置并授权后，请求才会发送到你选择的受控远程端点，且全部输出经过红线、引用绑定与审计三道 gate；引用 gate 不通过时不交付生成正文。发送前请删除个人信息（页面会在检测到疑似个人信息时提醒）。<br />
          <b>生成的文书能直接用吗？</b>文书草稿须由使用者本机复核并确认承担责任后定稿；平台不核验执业资格、不实施签发，正式使用前必须经平台外独立复核。模板中的律所、律师与证号由使用者自行填写。<br />
          <button
            type="button"
            className="btn btn-ghost btn-sm mt-8"
            onClick={() => copy('LegalHigh（法律至上 · 普法惠民）——本地优先的普法与事实准备工具。它不是律师，不提供法律意见；法律问题请咨询 12348 法律援助热线或执业律师。', '已复制项目简介')}
          >
            <Icon name="copy" size={13} />复制项目简介
          </button>
        </div>
      </section>
    </div>
  )
}
