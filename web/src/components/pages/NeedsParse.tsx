// 需求解析（Beta）—— 抽象/语序不当的描述 → 可溯源的法条 + 案例（带官方入口链接）
// 管线（「薄 AI」双轨，调研 docs/research/需求解析与可溯源检索调研-2026-08-30.md）：
//   Stage A 理解层：已配置模型插件时用受控 LLM 做改写/结构化（JSON schema，不产出事实）；否则确定性关键词降级
//   Stage B 取证层：确定性 BM25 法条检索 + 案例样本检索（幻觉无法进入证据）
//   Stage C 呈现：官方核对入口（flk）/ 快照原文 / 案例官方发布入口 / 求助温度卡
import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Icon } from '../icons'
import { EmptyState, PageHeader, SkeletonLines, useToast, ValidityBadge } from '../ui'
import { CitationChip, SourceBadge } from '../domain'
import { WARM_TIPS } from '../../data/model'
import { api, ApiError, loadAiProfile, type NeedsParseResult } from '../../lib/api'

export default function NeedsParse() {
  const toast = useToast()
  const [sp] = useSearchParams()
  const initial = sp.get('q') ?? ''
  const [text, setText] = useState(initial)
  const [result, setResult] = useState<NeedsParseResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const profile = loadAiProfile()

  const run = useCallback(async (input: string) => {
    if (!input.trim() || input.trim().length < 4) { toast('请补充具体情形（至少 4 个字）', 'err'); return }
    setBusy(true); setError(null)
    try {
      const r = await api.needsParse(input.trim(), profile ?? undefined)
      setResult(r)
      if (r.ai_error) toast(`AI 理解层不可用，已降级为关键词检索：${r.ai_error.slice(0, 60)}`, 'err')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [profile])

  useEffect(() => {
    if (initial.trim().length >= 4) void run(initial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="page" style={{ maxWidth: 980 }}>
      <PageHeader
        title="需求解析 · 描述你的问题"
        sub="用大白话描述你遇到的情形（语序不必讲究），系统将解析出：可能涉及的法条（官方原文 + 官方核对入口）、可参考的公开案例，以及下一步建议。仅作参考，真实求助请找执业律师。"
        actions={<Link to="/search" className="btn btn-ghost btn-sm"><Icon name="lawSearch" size={13} />精确检索</Link>}
      />

      <div className="card card-pad mb-16">
        <textarea
          className="ta" style={{ minHeight: 96, fontSize: 14.5 }}
          placeholder={'例如：「公司三个月没发工资了找谁」「在网上买东西是假的想退货商家不同意」「租房合同到期房东不退押金」……\n语序不必讲究，把事情说清楚即可。'}
          value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void run(text) }}
        />
        <div className="row mt-12">
          <button className="btn btn-primary" disabled={busy || !text.trim()} onClick={() => void run(text)}>
            <Icon name="sparkle" size={14} />{busy ? '解析中…' : '解析需求'}
          </button>
          {profile
            ? <span className="tiny row" style={{ gap: 4 }}><span style={{ color: 'var(--ok)' }}><Icon name="check" size={12} /></span>已配置模型插件：{profile.provider_id}/{profile.model}（AI 参与理解）</span>
            : <span className="tiny">未配置模型：将使用确定性关键词检索（设置 → AI 可配置，理解效果更佳）</span>}
          <span className="spacer" />
          <span className="kbd">Ctrl</span><span className="kbd">↵</span>
        </div>
        {error && <div className="banner banner-danger mt-12"><Icon name="alert" size={15} /><span className="banner-tx">{error}</span></div>}
      </div>

      {busy && <div className="card card-pad"><SkeletonLines n={7} tall /></div>}

      {result && (
        <>
          {/* 解析卡 */}
          <div className="card card-pad mb-16">
            <div className="row-wrap mb-8">
              <span className="ai-tag"><Icon name="sparkle" size={11} strokeWidth={2} />{result.parse.by.startsWith('ai') ? 'AI 理解' : '关键词理解'}</span>
              <span className="bdg bdg-gray">{result.parse.issue_type}</span>
              <span className="spacer" />
              <span className="tiny mono">{result.parse.by}</span>
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.6 }}>{result.parse.understood}</div>
            {result.parse.assumed_causes.length > 0 && (
              <div className="row-wrap mt-8" style={{ gap: 6 }}>
                {result.parse.assumed_causes.map((c) => (
                  <span key={c} className="bdg bdg-orange" title="AI 假设，须经事实与专业人士确认">案由假设：{c}</span>
                ))}
              </div>
            )}
            <div className="row-wrap mt-8" style={{ gap: 6 }}>
              {result.parse.keywords.map((k) => <span key={k} className="chip">{k}</span>)}
            </div>
            {result.parse.cautions.length > 0 && (
              <ul className="tiny mt-12" style={{ lineHeight: 2, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {result.parse.cautions.map((c) => <li key={c}>· {c}</li>)}
              </ul>
            )}
            {result.ai_error && <div className="tiny mt-8" style={{ color: 'var(--warn)' }}>AI 理解层备注：{result.ai_error}</div>}
          </div>

          {/* 法条卡（官方原文 + 官方核对入口） */}
          <div className="sec">
            <div className="sec-h">
              <span className="sec-t">可能涉及的法律条款</span>
              <span className="tiny">{result.articles.length} 条（本地语料逐条 citation 校验）</span>
            </div>
            {result.articles_none && (
              <div className="card"><EmptyState icon="search" title="库内未找到直接对应条文"
                desc="换一种描述再试，或使用精确检索。本系统不作无依据的推断。" /></div>
            )}
            {result.articles.map((a) => (
              <div key={`${a.law_id}-${a.article_no}`} className="ot mb-12">
                <div className="ot-h">
                  <span className="ot-tag">官方原文</span>
                  <b style={{ fontSize: 13.5 }}>《{a.law_title.replace(/^中华人民共和国/, '')}》{a.article_label}</b>
                  <ValidityBadge v={a.status} />
                  <span className="ot-src">相关度 {a.score}</span>
                </div>
                <div style={{ fontSize: 14, lineHeight: 2 }}>{a.text}</div>
                <div className="ot-meta">
                  <span>施行：<b>{a.effective_date}</b></span>
                  <span>章节：<b>{a.chapter.split('>').slice(0, 2).join(' > ')}</b></span>
                  <span className="spacer" />
                  <a href={a.official_entry} target="_blank" rel="noreferrer" className="row tiny" style={{ gap: 4, color: 'var(--accent-text)' }}>
                    <Icon name="external" size={12} />{a.official_entry_note}
                  </a>
                  <a href={a.snapshot_url} target="_blank" rel="noreferrer" className="row tiny" style={{ gap: 4, color: 'var(--tx-2)' }}>
                    <Icon name="file" size={12} />快照原文
                  </a>
                  <CitationChip label="条文本页" to={`/laws/${a.law_id}?art=${a.article_no}`} />
                </div>
              </div>
            ))}
          </div>

          {/* 案例卡（官方发布入口） */}
          {result.cases.length > 0 && (
            <div className="sec">
              <div className="sec-h">
                <span className="sec-t">可参考的公开案例</span>
                <span className="tiny">{result.cases.length} 件（仅收录可公开查证案件）</span>
              </div>
              {result.cases.map((c) => (
                <div key={c.id} className="res-card" style={c.verified ? undefined : { borderStyle: 'dashed' }}>
                  <div className="res-h">
                    <div style={{ minWidth: 0 }}>
                      <Link to={`/cases/${c.id}`} className="res-t">{c.name}</Link>
                      <div className="res-meta" style={{ marginBottom: 4 }}>
                        <span><b>{c.no}</b></span>
                        <span>{c.court} · {c.date}</span>
                        <span>案由：<b>{c.cause}</b></span>
                      </div>
                    </div>
                    <span className="spacer" />
                    <SourceBadge kind={c.kind} grade={c.grade} />
                    {!c.verified && <span className="bdg bdg-red">未核实</span>}
                  </div>
                  <p className="res-snip clamp2">{c.summary}</p>
                  <div className="res-acts">
                    <span className="tiny">官方发布入口：</span>
                    {(c.official_entries ?? []).map((e) => (
                      <a key={e.url} href={e.url} target="_blank" rel="noreferrer" className="res-act"><Icon name="external" size={12} />{e.name}</a>
                    ))}
                    <span className="spacer" />
                    <Link className="res-act" to={`/cases/${c.id}`}><Icon name="external" size={12} />详情</Link>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 温度卡：求助指引 */}
          <div className="banner-warm mb-16"><Icon name="bulb" size={15} />
            <span className="banner-tx">
              {result.disclaimer}
              <div className="mt-8">· 经济困难可依法申请法律援助，12348 公共法律服务热线提供免费咨询。{WARM_TIPS.evidence}</div>
              <div>· 上述条文与案例仅为检索线索与参考方向，不构成法律意见；提起诉讼等专业事项请委托执业律师办理。</div>
            </span>
          </div>
        </>
      )}

      {!result && !busy && (
        <div className="card">
          <EmptyState icon="sparkle" title="描述你的情形，开始解析" desc="系统将：① 理解你的问题（已配置模型时由 AI 改写，否则关键词分析）→ ② 在本地语料与案例样本中确定性检索 → ③ 每条结果都给出官方核对入口与快照原文。" />
        </div>
      )}
    </div>
  )
}
