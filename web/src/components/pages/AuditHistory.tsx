// FRAME 20 · Audit History —— 操作审计 + 浏览历史（真实数据驱动）
// server GET /api/audit：append-only 审计（who/when/entity/action/payload）——合同审查、批注流转、
// 文书签发、投诉等全部真实落库记录在此；浏览历史为 AppShell 真实记录的本机浏览史。均无记录时诚实空态。
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../icons'
import { EmptyState, PageHeader, SkeletonLines, Tabs, fmtTime } from '../ui'
import { api, ApiError, type AuditEntry } from '../../lib/api'

interface BrowseItem { p: string; t: string; ts: number }
function loadBrowse(): BrowseItem[] {
  try { return JSON.parse(localStorage.getItem('lh:browse-history') ?? '[]') } catch { return [] }
}

const ACTION_FILTERS = ['全部', 'create', 'adopt', 'amend', 'reject', 'verify', 'issue', 'complaint']

const ENTITY_LABEL: Record<string, string> = {
  review: '合同审查', draft: '文书起草', annotation: '批注', complaint: '投诉', research: '研究',
}
const ACTION_LABEL: Record<string, string> = {
  create: '创建', adopt: '采纳', amend: '修改', reject: '驳回', reopen: '重开',
  verify: '人工核验', issue: '签发', complaint: '投诉受理', transition: '状态流转',
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

  useEffect(() => {
    let alive = true
    api.auditAll(200).then(
      (d) => alive && (setEntries(d.entries), setLoading(false)),
      (e) => alive && (setError(e instanceof ApiError ? e.message : String(e)), setLoading(false)),
    )
    return () => { alive = false }
  }, [])

  const logs = useMemo(() => entries.filter((l) => action === '全部' || l.action === action), [entries, action])

  return (
    <div className="page">
      <PageHeader
        title="历史记录与操作审计"
        sub="append-only 审计：合同审查、批注流转、文书核验签发、投诉受理等全量真实记录（who/when/entity/action/payload），可复核不可篡改。"
        actions={<button className="btn btn-ghost btn-sm" onClick={() => { setBrowse(loadBrowse()); api.auditAll(200).then((d) => { setEntries(d.entries); }).catch(() => { }) }}><Icon name="refresh" size={13} />刷新</button>}
      />

      <Tabs tabs={[{ key: 'audit', label: '操作审计' }, { key: 'browse', label: '浏览历史' }]} active={tab} onChange={setTab} />

      {tab === 'audit' && (
        <>
          <div className="row-wrap mt-16 mb-12">
            {ACTION_FILTERS.map((a) => (
              <button key={a} className={'chip' + (action === a ? ' is-on' : '')} onClick={() => setAction(a)}>{a}</button>
            ))}
            <span className="spacer" />
            <span className="tiny">{logs.length} 条</span>
          </div>
          <div className="card">
            {loading && <div className="card-pad"><SkeletonLines n={6} tall /></div>}
            {error && <div className="banner banner-danger m-16"><Icon name="alert" size={15} /><span className="banner-tx">{error}</span></div>}
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
                          <td className="muted">{ENTITY_LABEL[String(l.entity_type ?? '')] ?? String(l.entity_type ?? '')}</td>
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
              <EmptyState icon="history" title={action === '全部' ? '暂无审计记录' : `暂无「${action}」记录`}
                desc="发起一次合同审查、批注流转或文书签发后，操作将真实落库并在此展示。" />
            )}
          </div>
          <p className="tiny mt-12">审计为 append-only：任何状态变更（创建/流转/签发/投诉）都写入 audit_log，可重放不可修改。</p>
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
