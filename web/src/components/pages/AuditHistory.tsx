// FRAME 20 · Audit History —— 操作审计 + 浏览历史（真实数据驱动）
// server GET /api/audit：append-only 审计（who/when/entity/action/payload）——合同审查、批注流转、
// 文书复核/定稿、投诉等真实落库记录在此；浏览历史为本机浏览史。
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../icons'
import { EmptyState, PageHeader, SkeletonLines, Tabs, fmtTime } from '../ui'
import { api, ApiError, type AuditEntry } from '../../lib/api'

interface BrowseItem { p: string; t: string; ts: number }
function loadBrowse(): BrowseItem[] {
  try { return JSON.parse(localStorage.getItem('lh:browse-history') ?? '[]') } catch { return [] }
}

// 筛选 chips = 现行动作（中文标签）+ 旧版 verify/issue（仅历史日志）；与 ACTION_LABEL 同源，防止漂移。
const ACTION_FILTERS: { key: string; label: string }[] = [
  { key: '全部', label: '全部' },
  { key: 'create', label: '创建' },
  { key: 'review', label: '人工复核' },
  { key: 'finalize', label: '确认定稿' },
  { key: 'adopt', label: '采纳' },
  { key: 'amend', label: '修改' },
  { key: 'reject', label: '驳回' },
  { key: 'delete', label: '删除' },
  { key: 'generate', label: 'AI 调用' },
  { key: 'complaint', label: '投诉' },
  { key: 'explain_approve', label: '解读审核' },
  { key: 'docx_return', label: '回传修订' },
  { key: 'verify', label: '旧版核验' },
  { key: 'issue', label: '旧版签发' },
]

const ENTITY_LABEL: Record<string, string> = {
  review: '合同审查', draft: '文书起草', annotation: '批注', complaint: '投诉', research: '研究',
  ai_chat: 'AI 调用', explain: '法条解读',
}
const ACTION_LABEL: Record<string, string> = {
  create: '创建', adopt: '采纳', amend: '修改', reject: '驳回', reopen: '重开',
  review: '人工复核', finalize: '使用者确认定稿', verify: '旧版核验记录', issue: '旧版签发记录', complaint: '投诉受理', transition: '状态流转',
  delete: '删除', generate: 'AI 生成调用', docx_return: '回传修订',
  explain_approve: '解读审核通过', explain_reopen: '解读重开为草稿',
}

function parsePayload(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  try { return Object.entries(JSON.parse(raw)).map(([k, v]) => `${k}=${String(v)}`).join(' · ') } catch { return raw }
}

/** 从 payload 提取人类可读标题（C5：审计表不再以 rv_xxx、df_xxx 原始 id 作为主要信息） */
function payloadTitle(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  try {
    const o = JSON.parse(raw) as Record<string, unknown>
    for (const k of ['title', 'subject', 'template_id']) {
      const v = o[k]
      if (typeof v === 'string' && v.trim()) return v
    }
    return null
  } catch { return null }
}

export default function AuditHistory() {
  const [tab, setTab] = useState('audit')
  const [action, setAction] = useState('全部')
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [browse, setBrowse] = useState<BrowseItem[]>(loadBrowse)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [evEntries, setEvEntries] = useState<Awaited<ReturnType<typeof api.evidenceLedger>>['entries'] | null>(null)
  const [evError, setEvError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    api.auditAll(200).then(
      (d) => alive && (setEntries(d.entries), setLoading(false)),
      (e) => alive && (setError(e instanceof ApiError ? e.message : String(e)), setLoading(false)),
    )
    return () => { alive = false }
  }, [])

  useEffect(() => {
    let alive = true
    api.evidenceLedger(100).then(
      (d) => alive && setEvEntries(d.entries),
      (e) => alive && setEvError(e instanceof ApiError ? e.message : String(e)),
    )
    return () => { alive = false }
  }, [])

  const logs = useMemo(() => entries.filter((l) => action === '全部' || l.action === action), [entries, action])

  return (
    <div className="page">
      <PageHeader
        title="历史记录与操作审计"
        sub="append-only 审计：合同审查、批注流转、文书复核与定稿确认、投诉受理等本机操作记录。旧版 verify/issue 仅作为历史日志保留，不代表平台核验或签发。"
        actions={<button className="btn btn-ghost btn-sm" onClick={() => { setBrowse(loadBrowse()); api.auditAll(200).then((d) => { setEntries(d.entries); }).catch(() => { }) }}><Icon name="refresh" size={13} />刷新</button>}
      />

      <Tabs tabs={[{ key: 'audit', label: '操作审计' }, { key: 'evidence', label: '证据账本' }, { key: 'browse', label: '浏览历史' }]} active={tab} onChange={setTab} />

      {tab === 'evidence' && (
        <>
          <div className="banner banner-info mt-16 mb-12"><Icon name="info" size={15} />
            <span className="banner-tx">
              证据账本（append-only，无更新/删除通道）：六条链路（问答/研究/审查/要件分析/起草/AI 生成）每次作答所依据证据的 §19 快照——条文精确文本哈希、文档级哈希、规范 id 与来源核验状态。快照只含公共语料数据与问题哈希，不含用户输入原文；不随缓存过期。
            </span>
          </div>
          <div className="card">
            {evError && <div className="card-pad"><div className="banner banner-danger mb-12"><Icon name="alert" size={15} /><span className="banner-tx">{evError}</span></div><div className="tiny muted">证据账本为敏感端点（与操作审计同门）：需在设置页配置本机管理令牌后查看。</div></div>}
            {!evError && !evEntries && <div className="card-pad"><SkeletonLines n={6} tall /></div>}
            {!evError && evEntries && evEntries.length === 0 && <div className="card-pad"><div className="tiny">账本为空——六条链路尚无带依据的作答记录。</div></div>}
            {!evError && evEntries && evEntries.length > 0 && (
              <div style={{ overflowX: 'auto' }}>
                <table className="tbl">
                  <thead>
                    <tr><th>时间</th><th>链路</th><th>依据条数</th><th>涉及文档</th><th>实体</th></tr>
                  </thead>
                  <tbody>
                    {evEntries.map((l) => {
                      let count = '—'
                      let docs = '—'
                      try {
                        const p = JSON.parse(l.snapshot_json)
                        count = String(p.evidence_count ?? '—')
                        const cd = p.canonical_documents as string[] | undefined
                        if (cd?.length) docs = cd.map((x) => x.split('@')[0].replace(/^/, '')).slice(0, 3).join('、') + (cd.length > 3 ? ` 等 ${cd.length} 部` : '')
                        if (p.question_sha256) docs = `问题 ${p.question_sha256.slice(0, 8)}… · ${docs}`
                      } catch { /* 快照损坏按原样展示实体 */ }
                      return (
                        <tr key={l.id}>
                          <td className="tiny mono">{fmtTime(l.ts)}</td>
                          <td><span className="bdg bdg-purple">{ENTITY_LABEL[l.entity_type] ?? l.entity_type}</span></td>
                          <td className="mono">{count}</td>
                          <td className="tiny">{docs}</td>
                          <td className="tiny mono">{String(l.entity_id ?? '').slice(0, 18)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {tab === 'audit' && (
        <>
          <div className="row-wrap mt-16 mb-12">
            {ACTION_FILTERS.map((f) => (
              <button key={f.key} className={'chip' + (action === f.key ? ' is-on' : '')} onClick={() => setAction(f.key)}>{f.label}</button>
            ))}
            <span className="spacer" />
            <span className="tiny">{logs.length} 条</span>
          </div>
          <div className="card">
            {loading && <div className="card-pad"><SkeletonLines n={6} tall /></div>}
            {error && <div className="banner banner-danger mb-12"><Icon name="alert" size={15} /><span className="banner-tx">{error}</span></div>}
            {!loading && !error && (
              <div style={{ overflowX: 'auto' }}>
                <table className="tbl">
                  <thead>
                    <tr><th>时间</th><th>操作者</th><th>操作</th><th>实体</th><th>实体 / 标题</th><th>详情（payload）</th></tr>
                  </thead>
                  <tbody>
                    {logs.map((l, i) => {
                      const readable = payloadTitle(l.payload_json)
                      return (
                        <tr key={String(l.id ?? i)}>
                          <td className="tiny mono">{fmtTime(l.ts)}</td>
                          <td>{String(l.actor ?? '')}</td>
                          <td><span className="bdg bdg-blue">{ACTION_LABEL[String(l.action ?? '')] ?? String(l.action ?? '')}</span></td>
                          <td className="muted" style={{ whiteSpace: 'nowrap' }}>{ENTITY_LABEL[String(l.entity_type ?? '')] ?? String(l.entity_type ?? '')}</td>
                          <td className="tiny">
                            {readable ? (
                              <span className="row" style={{ gap: 6 }}>
                                <span>{readable.length > 18 ? readable.slice(0, 18) + '…' : readable}</span>
                                <span className="mono muted" title={String(l.entity_id ?? '')}>{String(l.entity_id ?? '').slice(0, 10)}…</span>
                              </span>
                            ) : (
                              <span className="mono">{String(l.entity_id ?? '')}</span>
                            )}
                          </td>
                          <td className="tiny">{parsePayload(l.payload_json)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {!loading && !error && logs.length === 0 && (
              <EmptyState icon="history" title={action === '全部' ? '暂无审计记录' : `暂无「${ACTION_LABEL[action] ?? action}」记录`}
                desc="发起合同审查、批注流转或文书复核后，操作将真实落库并在此展示。" />
            )}
          </div>
          <p className="tiny mt-12">审计为 append-only：创建、流转、复核、定稿与投诉等操作写入 audit_log，可复核不可静默修改。</p>
        </>
      )}

      {tab === 'browse' && (
        <div className="card mt-16" style={{ maxWidth: 640 }}>
          <div className="card-b">
            {browse.map((h) => (
              <Link key={h.p} to={h.p} className="lrow" style={{ border: '1px solid var(--div-soft)', marginBottom: 7 }}>
                <Icon name="clock" size={14} className="muted" />
                <span className="lrow-t">{h.t}</span>
                <span className="tiny mono">{fmtTime(h.ts)}</span>
              </Link>
            ))}
            {browse.length === 0 && (
              <EmptyState icon="history" title="暂无浏览记录" desc="浏览任意页面后，这里将按时间倒序展示本机访问历史。" />
            )}
            <div className="tiny mt-8">浏览历史仅保存在本机浏览器，不参与审计留痕。</div>
          </div>
        </div>
      )}
    </div>
  )
}
