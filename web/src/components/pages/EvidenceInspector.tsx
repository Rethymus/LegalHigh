// FRAME 08 · Evidence Inspector —— 证据链核查（真实引擎驱动）
// 研究问题的依据链：Conclusion → Supported By → Statute（每条 references 均经 server citation_of 校验）
// 检索无命中 → 链路标红「缺少可靠依据」并停止（不继续生成）。Verify/Reject 标记仅存本机（诚实标注）。
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Icon } from '../icons'
import { EmptyState, PageHeader, SkeletonLines, useToast } from '../ui'
import { api, ApiError, type ResearchMemo } from '../../lib/api'

const LS_LIST = 'lh:research:list'
const LS_MARKS = 'lh:research:marks'

type LocalMark = 'verified' | 'rejected'
type ResearchListItem = { rid: string; question: string }

function loadLocalMarks(): Record<string, LocalMark> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(LS_MARKS) ?? '{}')
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
    return Object.fromEntries(
      Object.entries(raw).filter((entry): entry is [string, LocalMark] =>
        typeof entry[0] === 'string' && (entry[1] === 'verified' || entry[1] === 'rejected'),
      ),
    )
  } catch {
    return {}
  }
}

function loadResearchList(): ResearchListItem[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(LS_LIST) ?? '[]')
    if (!Array.isArray(raw)) return []
    return raw.filter((item): item is ResearchListItem =>
      !!item && typeof item === 'object'
      && typeof (item as ResearchListItem).rid === 'string'
      && typeof (item as ResearchListItem).question === 'string',
    )
  } catch {
    return []
  }
}

export default function EvidenceInspector() {
  const { rid } = useParams()
  const toast = useToast()
  const [memo, setMemo] = useState<ResearchMemo | null>(null)
  const [retrievedAt, setRetrievedAt] = useState<string | null>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [marks, setMarks] = useState<Record<string, LocalMark>>(loadLocalMarks)

  const question = useMemo(() => {
    return loadResearchList().find((item) => item.rid === rid)?.question ?? null
  }, [rid])

  useEffect(() => {
    let alive = true
    if (!question) { setBusy(false); return }
    api.researchMemo(question).then(
      (m) => alive && (setMemo(m), setRetrievedAt(new Date().toISOString()), setBusy(false)),
      (e) => alive && (setError(e instanceof ApiError ? e.message : String(e)), setBusy(false)),
    )
    return () => { alive = false }
  }, [question])

  const mark = (key: string, v: LocalMark) => {
    setMarks((current) => {
      const next = { ...current, [key]: v }
      try {
        localStorage.setItem(LS_MARKS, JSON.stringify(next))
      } catch {
        toast('本机存储不可用，本次标记仅在当前页面保留', 'err')
      }
      return next
    })
    toast(v === 'verified' ? '已标记为“本人已核对”（仅存本机）' : '已标记为“本人不采信”（仅存本机）', 'ok')
  }

  return (
    <div className="page">
      <PageHeader
        back={<Link to={rid ? `/research/${rid}` : '/research'} className="tiny row" style={{ gap: 4 }}><Icon name="arrowL" size={13} />返回研究</Link>}
        title="证据链核查 · Evidence Inspector"
        sub={memo ? `${memo.question} —— 每条依据均经 server citation 校验并携带版本/施行/来源字段。` : '每一条结论都必须可回溯到真实来源。'}
        actions={memo && <button className="btn btn-primary btn-sm" onClick={() => api.researchReport(memo.question).then(() => toast('研究备忘录 DOCX 已下载', 'ok')).catch(() => toast('导出失败', 'err'))}><Icon name="download" size={13} />导出研究备忘录</button>}
      />

      {busy && <div className="card card-pad"><SkeletonLines n={6} tall /></div>}
      {error && <div className="banner banner-danger mb-12"><Icon name="alert" size={15} /><span className="banner-tx">{error}</span></div>}
      {!busy && !question && (
        <div className="card"><EmptyState icon="search" title="未找到对应研究" desc="请从研究工作台发起研究后进入证据链核查。" action={<Link to="/research" className="btn btn-secondary">返回 AI 研究</Link>} /></div>
      )}

      {memo && (
        <div className="cols cols-2r" style={{ gridTemplateColumns: 'minmax(0,1fr) 300px' }}>
          <div>
            <div className="chain-lbl">Evidence Chain</div>
            {/* 链头是确定性管线生成的问题重述，不是模型结论。 */}
            <div className="chain-node">
              <span className="chain-dot" />
              <div className="evc" style={{ borderColor: 'rgba(10,132,255,.4)' }}>
                <div className="evc-h"><span className="bdg bdg-blue">确定性整理</span><b style={{ fontSize: 12.5 }}>Issue · 研究问题重述</b></div>
                <div style={{ fontSize: 13, lineHeight: 1.8 }}>{memo.issue_frame.restate}</div>
                <div className="tiny mt-8">这不是法律结论。系统只整理问题并列出检索命中的法源，最终判断须由使用者逐条核对。</div>
              </div>
            </div>

            <div className="chain-lbl mt-16">Supported By · Statute（{memo.references.length}）</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {memo.references.map((r, i) => {
                const key = `${r.law_id}#${r.article_no}`
                const st = marks[key]
                return (
                  <div key={key} className="chain-node">
                    <span className="chain-dot" />
                    <div className="evc" style={st === 'rejected' ? { borderColor: 'var(--danger)' } : undefined}>
                      <div className="evc-h">
                        <span className="evc-id">EV-{String(i + 1).padStart(3, '0')}</span>
                        <b style={{ fontSize: 12.5 }}>《{r.law_title.replace(/^中华人民共和国/, '')}》{r.article_label}</b>
                        <span className="spacer" />
                        {st === 'verified' && <span className="bdg bdg-green">本人已核对</span>}
                        {st === 'rejected' && <span className="bdg bdg-red">本人不采信</span>}
                      </div>
                      <div style={{ fontSize: 13, lineHeight: 1.8, marginBottom: 8 }}>{r.text}</div>
                      <div className="evc-kv">
                        <dt>文档位置</dt><dd>{memo.cards.find((c) => c.law_id === r.law_id && c.article_no === r.article_no)?.chapter ?? '—'}</dd>
                        <dt>时效性</dt><dd>{r.status} · {r.effective_date ? `${r.effective_date} 施行` : '生效日期待官方核对'}</dd>
                        <dt>法域</dt><dd>中国</dd>
                        <dt>来源</dt><dd><a href={r.source_url} target="_blank" rel="noreferrer" style={{ wordBreak: 'break-all' }}>{r.source_url.slice(0, 60)}…</a></dd>
                        <dt>Retrieved</dt><dd className="mono">本机检索 · {retrievedAt ? retrievedAt.slice(0, 16).replace('T', ' ') + 'Z' : '—'}</dd>
                      </div>
                      <div className="evc-acts">
                        <button className="btn btn-secondary btn-sm" onClick={() => mark(key, 'verified')}><Icon name="verify" size={12} />本人已核对</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => mark(key, 'rejected')}><Icon name="reject" size={12} />本人不采信</button>
                        <Link className="btn btn-ghost btn-sm" to={`/laws/${r.law_id}?art=${r.article_no}`}><Icon name="external" size={12} />查看原文</Link>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {memo.gaps.length > 0 && (
              <div className="chain-node mt-16">
                <span className="chain-dot" style={{ borderColor: 'var(--danger)', background: 'var(--danger-soft)' }} />
                <div className="evc missing">
                  <div className="evc-h"><span className="bdg bdg-red"><Icon name="alert" size={11} />缺少可靠依据</span></div>
                  {memo.gaps.map((g) => <div key={g} style={{ fontSize: 13, lineHeight: 1.8 }}>{g}</div>)}
                  <div className="tiny mt-8">检索无命中即停止：本系统不生成无依据的结论。</div>
                </div>
              </div>
            )}

            <div className="banner banner-info mt-16"><Icon name="info" size={15} />
              <span className="banner-tx"><b>标记边界：</b>“本人已核对 / 本人不采信”只是当前浏览器中的个人标记，不是律师审核、机构背书或服务端审计记录；来源与原文链接可继续独立复核。</span>
            </div>
          </div>

          <aside style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="card card-pad">
              <div className="tiny bold mb-8">链路结构</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
                <span className="lrow"><span className="bdg bdg-blue">Issue</span>问题重述（确定性整理）</span>
                <span className="tiny" style={{ paddingLeft: 26 }}>↓ Supported By</span>
                <span className="lrow"><span className="sg sg-law">Statute × {memo.references.length}</span></span>
                <span className="tiny" style={{ paddingLeft: 26 }}>↓ 检索方法</span>
                <span className="lrow"><span className="bdg bdg-purple">{memo.meta.method}</span></span>
              </div>
            </div>
            <div className="card card-pad">
              <div className="tiny bold mb-8">本页统计</div>
              <div className="row-wrap" style={{ gap: 8 }}>
                <span className="bdg bdg-green">已支持 {memo.references.length}</span>
                <span className="bdg bdg-red">缺少依据 {memo.gaps.length > 0 ? 1 : 0}</span>
                <span className="bdg bdg-blue">本机核验 {Object.values(marks).filter((v) => v === 'verified').length}</span>
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}
