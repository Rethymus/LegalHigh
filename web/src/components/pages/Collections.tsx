// FRAME 18 · Collections —— 我的收藏（真实数据：本机收藏夹 + server 研究记录）
// 收藏来自各页星标（CaseDetail/LawDetail 真实写入 localStorage）；研究来自本机研究列表。
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../icons'
import { EmptyState, PageHeader } from '../ui'
import { loadFavs, loadFavsState, removeFav, type FavItem } from '../../lib/api'

const FOLDERS = ['全部', '法条', '案例', '研究']
interface ResearchRef { rid: string; question: string; ts: string }
function loadResearchList(): { items: ResearchRef[]; warning: string | null } {
  const raw = localStorage.getItem('lh:research:list')
  if (!raw) return { items: [], warning: null }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed) || !parsed.every((v) => v && typeof v === 'object'
      && typeof (v as Record<string, unknown>).rid === 'string'
      && typeof (v as Record<string, unknown>).question === 'string'
      && typeof (v as Record<string, unknown>).ts === 'string')) {
      return { items: [], warning: '本机研究索引格式不兼容，原始数据仍保留，当前未读取。' }
    }
    return { items: parsed as ResearchRef[], warning: null }
  } catch {
    return { items: [], warning: '本机研究索引无法解析，原始数据仍保留，当前未读取。' }
  }
}

export default function Collections() {
  const [initial] = useState(() => ({ favs: loadFavsState(), research: loadResearchList() }))
  const [favs, setFavs] = useState<FavItem[]>(initial.favs.items)
  const [researchList] = useState<ResearchRef[]>(initial.research.items)
  const [storageWarning] = useState<string | null>(initial.favs.warning ?? initial.research.warning)
  const [folder, setFolder] = useState('全部')
  const [q, setQ] = useState('')

  const all = useMemo(() => [
    ...favs.map((f) => ({ key: f.key, type: f.type, title: f.title, meta: f.meta, to: f.to, removable: true })),
    ...researchList.map((r) => ({ key: r.rid, type: '研究', title: r.question, meta: `本机研究记录 · ${r.ts.slice(0, 10)}`, to: `/research/${r.rid}`, removable: false })),
  ], [favs, researchList])
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
          </>
        }
      />

      {storageWarning && <div className="banner banner-warn mb-12"><Icon name="alert" size={15} /><span className="banner-tx">{storageWarning} 系统没有自动删除原始内容。</span></div>}

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
                  {it.removable
                    ? <button className="res-act" onClick={() => { removeFav(it.key); setFavs(loadFavs()) }}><Icon name="trash" size={12} />移除收藏</button>
                    : <span className="tiny">研究记录由研究工作台管理</span>}
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
