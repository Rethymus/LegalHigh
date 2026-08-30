// FRAME 18 · Collections —— 我的收藏（真实数据：本机收藏夹 + server 研究记录）
// 收藏来自各页星标（CaseDetail/LawDetail 真实写入 localStorage）；研究来自本机研究列表。
// 分享/导出为规划功能（诚实标注），不虚构已实现能力。
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../icons'
import { EmptyState, PageHeader } from '../ui'
import { loadFavs, removeFav, type FavItem } from '../../lib/api'

const FOLDERS = ['全部', '法条', '案例', '研究']

export default function Collections() {
  const [favs, setFavs] = useState<FavItem[]>(loadFavs())
  const [researchList, setResearchList] = useState<{ rid: string; question: string; ts: string }[]>([])
  const [folder, setFolder] = useState('全部')
  const [q, setQ] = useState('')

  useEffect(() => {
    setFavs(loadFavs())
    try { setResearchList(JSON.parse(localStorage.getItem('lh:research:list') ?? '[]')) } catch { /* 本机 */ }
  }, [])

  const all: { key: string; type: string; title: string; meta: string; to: string }[] = [
    ...favs.map((f) => ({ key: f.key, type: f.type, title: f.title, meta: f.meta, to: f.to })),
    ...researchList.map((r) => ({ key: r.rid, type: '研究', title: r.question, meta: `本机研究 · ${r.ts.slice(0, 10)}`, to: `/research/${r.rid}` })),
  ]
  const items = useMemo(() => all.filter((it) => {
    if (folder !== '全部' && it.type !== folder) return false
    if (q && !(it.title + it.meta).toLowerCase().includes(q.toLowerCase())) return false
    return true
  }), [all, folder, q])

  return (
    <div className="page" style={{ maxWidth: 'none' }}>
      <PageHeader
        title="我的收藏"
        sub="各页点击星标即可收藏（法条/案例/研究），收藏与浏览记录仅保存在本机浏览器。"
        actions={
          <>
            <button className="btn btn-ghost btn-sm" onClick={() => {
              const blob = new Blob([JSON.stringify({ favs, research: researchList }, null, 2)], { type: 'application/json' })
              const a = document.createElement('a')
              a.href = URL.createObjectURL(blob)
              a.download = 'legalhigh_favs.json'
              a.click(); URL.revokeObjectURL(a.href)
            }}><Icon name="download" size={13} />导出（JSON）</button>
            <button className="btn btn-secondary btn-sm" disabled title="成组管理为规划功能（原型未实现）"><Icon name="plus" size={13} />新建合集（规划）</button>
          </>
        }
      />

      <div className="cols" style={{ gridTemplateColumns: '240px minmax(0,1fr)', alignItems: 'start' }}>
        <aside className="panel" style={{ maxHeight: 'calc(100vh - 300px)' }}>
          <div className="panel-h"><Icon name="folder" size={14} />文件夹</div>
          <div className="panel-b">
            {FOLDERS.map((fd) => (
              <button key={fd} className={'lrow' + (folder === fd ? ' is-on' : '')} style={{ width: '100%', textAlign: 'left' }} onClick={() => setFolder(fd)}>
                <Icon name="folder" size={13} className="muted" />
                <span className="lrow-t">{fd}</span>
                <span className="tiny">{fd === '全部' ? all.length : all.filter((i) => i.type === fd).length}</span>
              </button>
            ))}
          </div>
          <div className="panel-f tiny">合集（成组管理）为规划功能。</div>
        </aside>

        <div>
          <div className="searchbar mb-12" style={{ maxWidth: 380 }}>
            <Icon name="search" size={14} className="muted" />
            <input className="inp" placeholder="搜索收藏…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
            {items.map((it) => (
              <div key={it.key} className="card card-pad hoverable" style={{ paddingBlock: 15 }}>
                <div className="row-wrap mb-8" style={{ gap: 6 }}>
                  <span className="bdg bdg-gray">{it.type}</span>
                </div>
                <Link to={it.to} style={{ fontWeight: 600, fontSize: 14, color: 'var(--tx)' }}>{it.title}</Link>
                <div className="tiny mt-8">{it.meta}</div>
                <div className="row mt-8">
                  <button className="res-act" onClick={() => { removeFav(it.key); setFavs(loadFavs()) }}><Icon name="trash" size={12} />移除</button>
                </div>
              </div>
            ))}
          </div>
          {items.length === 0 && (
            <div className="card"><EmptyState icon="star" title="暂无收藏"
              desc="在法条详情、案例详情点击「收藏/星标」即可加入；收藏仅保存在本机。"
              action={<Link to="/laws" className="btn btn-secondary btn-sm">去法条库</Link>} /></div>
          )}
        </div>
      </div>
    </div>
  )
}
