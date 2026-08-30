// FRAME 07 · AI Legal Research —— 研究工作台（真实引擎驱动）
// server: POST /api/research/memo（BM25 三组查询检索，引用不变量逐条 citation_of 校验；无 LLM 自由生成）
//   → 命中条文画布 / 诚实缺口 / DOCX 研究报告。证据速览每条 = 真实语料来源（含时效与相关度）。
// 分析笔记与结论文稿为用户人工输入（本地暂存），与检索证据严格分区。
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Icon } from '../icons'
import { PIPELINE_STEPS } from '../../data/model'
import { EmptyState, PageHeader, SkeletonLines, Tabs, useToast } from '../ui'
import { CitationChip, SourceBadge } from '../domain'
import { api, ApiError, loadAiProfile, type ResearchMemo } from '../../lib/api'

const CENTER_TABS = [
  { key: 'canvas', label: '研究画布' },
  { key: 'rules', label: '法律框架' },
  { key: 'draft', label: '结论文稿' },
]

const LS_LIST = 'lh:research:list'
const hash = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0 } return 'r' + Math.abs(h).toString(36) }
interface ResearchRef { rid: string; question: string; ts: string }
const loadList = (): ResearchRef[] => { try { return JSON.parse(localStorage.getItem(LS_LIST) ?? '[]') } catch { return [] } }

export function useNotes(rid: string) {
  const [notes, setNotes] = useState(() => localStorage.getItem(`lh:research:notes:${rid}`) ?? '')
  const set = (v: string) => { setNotes(v); localStorage.setItem(`lh:research:notes:${rid}`, v) }
  return [notes, set] as const
}

export default function Research() {
  const { rid } = useParams()
  const toast = useToast()
  const [list, setList] = useState<ResearchRef[]>(loadList)
  const [question, setQuestion] = useState('')
  const [memo, setMemo] = useState<ResearchMemo | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState(-1)
  const [tab, setTab] = useState('canvas')

  const activeRid = rid && rid !== 'new' ? rid : null
  const active = useMemo(() => list.find((r) => r.rid === activeRid) ?? null, [list, activeRid])

  const run = useCallback(async (q: string) => {
    if (!q.trim()) return
    setBusy(true); setError(null); setStep(0)
    try {
      const m = await api.researchMemo(q.trim())
      const id = hash(q.trim())
      setMemo(m)
      setList((ls) => {
        const next = [{ rid: id, question: q.trim(), ts: new Date().toISOString() }, ...ls.filter((x) => x.rid !== id)].slice(0, 20)
        localStorage.setItem(LS_LIST, JSON.stringify(next))
        return next
      })
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e)); setStep(-1)
    } finally { setBusy(false) }
  }, [])

  // 打开历史研究：按 question 重新检索（BM25 幂等可复现）
  useEffect(() => {
    if (active && activeRid && (!memo || memo.question !== active.question)) void run(active.question)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRid])

  useEffect(() => {
    if (step < 0 || step >= PIPELINE_STEPS.length) return
    const t = setTimeout(() => setStep((s) => s + 1), busy || step < PIPELINE_STEPS.length - 2 ? 480 : 140)
    return () => clearTimeout(t)
  }, [step, busy])

  return (
    <div className="page" style={{ maxWidth: 'none' }}>
      <PageHeader
        title={memo ? memo.question : 'AI 法律研究'}
        sub={memo
          ? `检索方法：${memo.meta.method} · 语料 ${memo.meta.corpus_size.toLocaleString()} 条 · 命中 ${memo.cards.length} 条依据（引用逐条经 citation 校验，无自由生成）`
          : '输入研究问题，引擎对本地语料做多查询检索并给出可溯源依据；分析结论由研究者本人撰写。'}
        actions={
          <>
            {memo && <button className="btn btn-ghost btn-sm" disabled={busy}
              onClick={() => api.researchReport(memo.question).then(() => toast('研究报告 DOCX 已生成', 'ok')).catch((e) => toast(e instanceof ApiError ? e.message : String(e), 'err'))}>
              <Icon name="download" size={13} />研究报告 DOCX
            </button>}
            {memo && activeRid && <Link to={`/research/${activeRid}/evidence`} className="btn btn-primary btn-sm"><Icon name="shieldCheck" size={13} />证据链核查</Link>}
          </>
        }
      />

      {/* 新建 / 切换研究 */}
      <div className="card card-pad mb-16" style={{ paddingBlock: 13 }}>
        <div className="row" style={{ gap: 10 }}>
          <span className="bdg bdg-purple">研究问题</span>
          <input className="inp" style={{ flex: 1 }} placeholder="如：平台以格式条款免除自身责任的条款何时无效？" value={question} onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void run(question) }} />
          <button className="btn btn-primary btn-sm" disabled={busy || !question.trim()} onClick={() => void run(question)}>
            <Icon name="sparkle" size={13} />{busy ? '检索中…' : '开始研究'}
          </button>
        </div>
        {step >= 0 && (
          <div className="pipe mt-12">
            {PIPELINE_STEPS.map((s, i) => (
              <span key={s} className="row" style={{ gap: 0 }}>
                <span className={'pipe-step ' + (step > i ? 'done' : step === i ? 'doing' : '')}>
                  <span className="st-dot">{step > i ? '✓' : i + 1}</span>{s}
                </span>
                {i < PIPELINE_STEPS.length - 1 && <span className="pipe-sep" />}
              </span>
            ))}
          </div>
        )}
        {error && <div className="banner banner-danger mt-12" style={{ padding: '8px 12px' }}><Icon name="alert" size={14} /><span className="banner-tx">{error}</span></div>}
      </div>

      <div className="cols cols-3w">
        {/* LEFT · Research Outline */}
        <aside className="panel" style={{ maxHeight: 'calc(100vh - 320px)' }}>
          <div className="panel-h"><Icon name="tree" size={14} />Research Outline</div>
          <div className="panel-b">
            {memo ? (
              <>
                <div className="ol-item l1"><Icon name="chevD" size={12} />Research Question</div>
                <div className="ol-item l2">{memo.question}</div>
                <div className="ol-item l1"><Icon name="chevD" size={12} />检索关键词</div>
                {memo.issue_frame.keywords.map((k) => <div key={k} className="ol-item l2">{k}</div>)}
                <div className="ol-item l1"><Icon name="chevD" size={12} />查询链（{memo.meta.queries.length}）</div>
                {memo.meta.queries.map((q, i) => <div key={i} className="ol-item l2" title={q}>Q{i + 1} · {q.slice(0, 18)}…</div>)}
                <div className="ol-item l1"><Icon name="chevD" size={12} />Sources（{memo.framework.length} 部法律）</div>
                {memo.framework.map((f) => (
                  <div key={f.law_id} className="ol-item l2">{f.law_title.replace(/^中华人民共和国/, '')} · {f.hit_count} 条</div>
                ))}
              </>
            ) : (
              <EmptyState icon="search" title="尚未开始研究" desc="输入研究问题后，此处展示问题拆解、检索关键词、查询链与命中来源。" />
            )}
            {list.length > 0 && (
              <>
                <div className="tiny bold mt-16 mb-8">历史研究（本机）</div>
                {list.map((r) => (
                  <Link key={r.rid} to={`/research/${r.rid}`} className={'lrow' + (r.rid === activeRid ? ' is-on' : '')}>
                    <Icon name="sparkle" size={13} className="muted" />
                    <span className="lrow-t">{r.question}</span>
                  </Link>
                ))}
              </>
            )}
          </div>
        </aside>

        {/* CENTER · Research Canvas（真实命中条文） */}
        <section className="panel" style={{ minHeight: 480 }}>
          <div className="panel-h" style={{ padding: 0 }}>
            <div style={{ flex: 1, padding: '0 12px' }}>
              {memo ? <Tabs tabs={CENTER_TABS} active={tab} onChange={setTab} /> : <div style={{ padding: '10px 12px' }} className="tiny bold">研究画布</div>}
            </div>
          </div>
          <div className="panel-b rs-canvas">
            {!memo && !busy && (
              <div className="card">
                <EmptyState icon="sparkle" title="输入法律问题开始研究" desc="引擎将对本地语料（8 部法律 · 1,953 条）做三组查询检索：原句 / 关键词 / 编章扩展。每条依据可溯源到条文原文与施行日期；检索无命中时明确声明，不作推断。"
                  action={<button className="btn btn-secondary" onClick={() => { setQuestion('格式条款免除自身责任何时无效'); void run('格式条款免除自身责任何时无效') }}>试试：格式条款效力</button>} />
              </div>
            )}
            {busy && !memo && <div className="card card-pad"><SkeletonLines n={6} tall /></div>}
            {memo && tab === 'canvas' && (
              <>
                {memo.gaps.map((g) => (
                  <div key={g} className="banner banner-warn"><Icon name="alert" size={15} /><span className="banner-tx"><b>诚实缺口：</b>{g}</span></div>
                ))}
                <div className="rs-q">
                  <div className="rs-q-t">RESEARCH QUESTION</div>
                  <div className="rs-q-b">{memo.issue_frame.restate}</div>
                </div>
                {memo.framework.map((f) => (
                  <div key={f.law_id} className="rs-sec">
                    <div className="rs-sec-h"><SourceBadge kind="law" grade="强" /><b>{f.law_title}</b>
                      <span className="bdg bdg-blue">{f.hit_count} 条命中</span>
                      <span className="spacer" />
                      <Link to={`/laws/${f.law_id}`} className="tiny row" style={{ gap: 3, color: 'var(--accent-text)' }}>法规详情 <Icon name="external" size={11} /></Link>
                    </div>
                    <div className="chips mt-8">
                      {f.chapters.slice(0, 6).map((ch) => <span key={ch} className="bdg bdg-gray">{ch.split('>').slice(0, 2).join('>')}</span>)}
                    </div>
                  </div>
                ))}
                {memo.cards.slice(0, 8).map((c) => (
                  <div key={`${c.law_id}-${c.article_no}`} className="rs-sec">
                    <div className="rs-sec-h">
                      <b>{c.article_label}</b>
                      <span className="muted" style={{ fontSize: 12 }}>{c.law_title.replace(/^中华人民共和国/, '')}</span>
                      <span className="bdg bdg-green">{c.law_status}</span>
                      <span className="spacer" />
                      <span className="tiny">相关度 {c.score.toFixed(3)}</span>
                      <CitationChip label="原文" to={`/laws/${c.law_id}?art=${c.article_no}`} />
                    </div>
                    <div className="rs-sec-b muted" style={{ fontSize: 13 }}>{c.text}</div>
                  </div>
                ))}
              </>
            )}
            {memo && tab === 'rules' && (
              <>
                {memo.references.map((r) => (
                  <div key={`${r.law_id}-${r.article_no}`} className="rs-sec">
                    <div className="rs-sec-h"><SourceBadge kind="law" grade="强" /><b>《{r.law_title.replace(/^中华人民共和国/, '')}》{r.article_label}</b>
                      <span className="bdg bdg-green">{r.status}</span>
                      <span className="spacer" />
                      <CitationChip label="查看原文" to={`/laws/${r.law_id}?art=${r.article_no}`} />
                    </div>
                    <div className="rs-sec-b muted" style={{ fontSize: 13 }}>{r.text}</div>
                    <div className="tiny mt-8">{r.effective_date} 施行 · {r.source_url.slice(0, 48)}…</div>
                  </div>
                ))}
              </>
            )}
            {memo && tab === 'draft' && <ConclusionDraft rid={activeRid ?? hash(memo.question)} question={memo.question} cards={memo.cards} references={memo.references} />}
          </div>
        </section>

        {/* RIGHT · Evidence（真实来源逐条） */}
        <aside className="panel" style={{ maxHeight: 'calc(100vh - 320px)' }}>
          <div className="panel-h"><Icon name="shieldCheck" size={14} />Evidence<span className="spacer" />
            {memo && activeRid && <Link to={`/research/${activeRid}/evidence`} className="tiny">证据链核查</Link>}
          </div>
          <div className="panel-b" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {!memo && <EmptyState icon="database" title="暂无证据" desc="开始研究后，每条命中条文都会在此列出来源、时效与相关度。" />}
            {memo && memo.cards.map((c, i) => (
              <div key={`${c.law_id}-${c.article_no}`} className="evc" style={{ padding: '10px 12px' }}>
                <div className="row-wrap mb-8" style={{ gap: 6 }}>
                  <span className="evc-id">EV-{String(i + 1).padStart(3, '0')}</span>
                  <span className="bdg bdg-green">已支持</span>
                </div>
                <div className="tiny" style={{ lineHeight: 1.7 }}>
                  《{c.law_title.replace(/^中华人民共和国/, '')}》{c.article_label} · {c.law_status} · {c.effective_date} 施行
                </div>
                <div className="mt-8">
                  <CitationChip label={`相关度 ${c.score.toFixed(2)}`} to={`/laws/${c.law_id}?art=${c.article_no}`} />
                </div>
              </div>
            ))}
            {memo && memo.cards.length === 0 && (
              <div className="evc missing" style={{ padding: '10px 12px' }}>
                <span className="bdg bdg-red"><Icon name="alert" size={11} />缺少可靠依据</span>
                <div className="tiny mt-8" style={{ lineHeight: 1.7 }}>{memo.gaps[0] ?? '语料中未检索到与该问题相关的依据。'}</div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}

function ConclusionDraft({ rid, question, cards, references }: {
  rid: string; question: string
  cards: { article_label: string; law_title: string; law_id: string; article_no: number }[]
  references: { law_id: string; article_no: number; article_label: string; law_title: string; status: string; effective_date: string; text: string }[]
}) {
  const [draft, setDraft] = useNotes(`draft:${rid}`)
  const [notes, setNotes] = useNotes(`notes:${rid}`)
  const [aiDraft, setAiDraft] = useState<{ text: string; gates: { redline: { pass: boolean; hits: string[] }; citations: { pass: boolean; violations: string[] } }; blocked: boolean; model: string } | null>(null)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiErr, setAiErr] = useState<string | null>(null)
  const profile = loadAiProfile()

  const genAiDraft = async () => {
    if (!profile) { setAiErr('未配置模型插件：请到 设置 → AI 配置模型档案（自备密钥）。'); return }
    setAiBusy(true); setAiErr(null)
    try {
      const ctx = references.map((r, i) => `[${i + 1}] 《${r.law_title}》${r.article_label}（${r.status}，${r.effective_date} 施行）：${r.text}`).join('\n')
      const r = await api.aiChat({
        provider_id: profile.provider_id, model: profile.model,
        api_key: profile.api_key, base_url_override: profile.base_url_override,
        allowed_refs: references.map((r) => ({ law_title: r.law_title, article_no: r.article_no })),
        messages: [
          { role: 'system', content: '你是法律研究助理。规则：①只基于提供的条文依据起草研究结论，禁止编造任何法条、案例、数据；②每个论断标注依据编号如[1]；③禁止使用「胜诉率/包赢/必胜/法院会判」等确定性承诺表述；④结尾列「仍需人工核验事项」。' },
          { role: 'user', content: `研究问题：${question}\n\n可用条文依据（仅限这些）：\n${ctx}\n\n请起草一段研究结论（250 字内）。` },
        ],
      })
      setAiDraft({ text: r.text, gates: r.gates, blocked: r.blocked, model: `${r.provider_name}/${r.model}` })
    } catch (e) {
      setAiErr(e instanceof ApiError ? e.message : String(e))
    } finally { setAiBusy(false) }
  }

  return (
    <>
      <div className="rs-sec">
        <div className="rs-sec-h"><Icon name="note" size={14} />分析笔记（研究者撰写 · 本机暂存）</div>
        <textarea className="ta" style={{ minHeight: 100 }} placeholder="把命中条文涵摄到案件事实：逐条记录适用条件与例外……" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <div className="rs-sec">
        <div className="rs-sec-h"><Icon name="quote" size={14} />结论文稿（研究者撰写）</div>
        <textarea className="ta" style={{ minHeight: 120 }} placeholder={`基于上方 ${cards.length} 条可溯源依据，撰写你的研究结论。AI 不代写结论——引用请标注条文号（如《民法典》第497条）。`} value={draft} onChange={(e) => setDraft(e.target.value)} />
        <div className="row mt-8">
          <button className="btn btn-secondary btn-sm" disabled={aiBusy || !profile} onClick={genAiDraft}>
            <Icon name="sparkle" size={12} />{aiBusy ? '生成中…' : 'AI 结论草稿（可选 · 需自备模型）'}
          </button>
          <span className="tiny">生成将过三道 gate：红线词拦截 / 引用绑定校验 / 审计留痕。</span>
        </div>
        {aiErr && <div className="banner banner-warn mt-8" style={{ padding: '8px 12px' }}><Icon name="alert" size={14} /><span className="banner-tx">{aiErr}</span></div>}
        {aiDraft && (
          <div className="mt-12">
            <div className="ai-block">
              <div className="ai-block-h">
                <span className="ai-tag"><Icon name="sparkle" size={11} strokeWidth={2} />AI</span>
                <b style={{ fontSize: 12.5 }}>AI Draft · 结论草稿（{aiDraft.model}）</b>
                <span className="spacer" />
                {aiDraft.blocked
                  ? <span className="bdg bdg-red">已拦截：不合规表述</span>
                  : <span className="bdg bdg-green">gate 通过</span>}
              </div>
              <div className="ai-block-b" style={{ whiteSpace: 'pre-wrap' }}>{aiDraft.text}</div>
              {!aiDraft.gates.redline.pass && (
                <div className="banner banner-danger mt-8" style={{ padding: '8px 12px' }}><Icon name="alert" size={13} />
                  <span className="banner-tx">红线词命中：{aiDraft.gates.redline.hits.join('、')}——该草稿不可直接使用。</span>
                </div>
              )}
              {!aiDraft.gates.citations.pass && (
                <div className="banner banner-danger mt-8" style={{ padding: '8px 12px' }}><Icon name="alert" size={13} />
                  <span className="banner-tx">越界引用：{aiDraft.gates.citations.violations.join('、')}——不在检索依据集合内，请人工删除或补充来源。</span>
                </div>
              )}
              <div className="ai-note"><Icon name="info" size={12} />AI 草稿仅供参考，须由研究者修改确认并经人工核验后方可进入对外产出。</div>
            </div>
          </div>
        )}
      </div>
      <div className="tiny">研究问题：{question}</div>
    </>
  )
}
