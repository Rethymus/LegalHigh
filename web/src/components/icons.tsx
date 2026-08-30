import type { ReactNode } from 'react'

// 统一线性图标集：24 viewBox / 1.7 描边 / currentColor，SF Symbols-like，全站唯一来源
export type IconName =
  | 'home' | 'lawSearch' | 'caseSearch' | 'article' | 'shield' | 'docpen' | 'briefcase'
  | 'gradcap' | 'globe' | 'database' | 'star' | 'clock' | 'chevR' | 'chevL' | 'chevD'
  | 'arrowR' | 'arrowL' | 'bell' | 'sparkle' | 'compass' | 'user' | 'search' | 'bigSearch'
  | 'gavel' | 'docShield' | 'save' | 'eye' | 'download' | 'zap' | 'history' | 'graph'
  | 'trend' | 'compare' | 'api' | 'refresh' | 'check' | 'filter' | 'plus' | 'minus'
  | 'x' | 'alert' | 'info' | 'shieldCheck' | 'scale' | 'file' | 'link' | 'external'
  | 'copy' | 'sun' | 'moon' | 'lock' | 'gear' | 'upload' | 'layers' | 'book' | 'target'
  | 'tree' | 'quote' | 'stamp' | 'flag' | 'news' | 'bulb' | 'note' | 'grid' | 'sliders'
  | 'send' | 'dots' | 'pin' | 'tag' | 'calendar' | 'building' | 'coins' | 'verify'
  | 'reject' | 'edit' | 'trash' | 'share' | 'folder' | 'sort' | 'menu' | 'logout' | 'key'

const PATHS: Record<IconName, ReactNode> = {
  home: (<><path d="M4 11.2 12 4.8l8 6.4" /><path d="M6.2 10v9.2h11.6V10" /></>),
  lawSearch: (<><rect x="5" y="3.5" width="14" height="17" rx="2" /><path d="M9 8.5h6M9 12h6M9 15.5h3.4" /></>),
  caseSearch: (<><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2.5H20v19H6.5A2.5 2.5 0 0 1 4 19V5a2.5 2.5 0 0 1 2.5-2.5z" /></>),
  article: (<><path d="M2.5 5h6a3.5 3.5 0 0 1 3.5 3.5V20a2.8 2.8 0 0 0-2.8-2.5H2.5z" /><path d="M21.5 5h-6A3.5 3.5 0 0 0 12 8.5V20a2.8 2.8 0 0 1 2.8-2.5h6.7z" /></>),
  shield: (<><path d="M12 3.2 19 6v5.2c0 4.4-3 7.4-7 8.8-4-1.4-7-4.4-7-8.8V6z" /><path d="m9 11.6 2.1 2.1 4-4.2" /></>),
  docpen: (<><path d="M20 12V7.8L15.5 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h6" /><path d="M15 3.7V8h4.4" /><path d="M17.6 13.2a1.9 1.9 0 0 1 2.7 2.7l-4.6 4.6-3 .7.7-3z" /></>),
  briefcase: (<><rect x="3" y="7.2" width="18" height="12.8" rx="2" /><path d="M8.5 7V5.2A2.2 2.2 0 0 1 10.7 3h2.6a2.2 2.2 0 0 1 2.2 2.2V7" /><path d="M3 12.4h18" /></>),
  gradcap: (<><path d="m2.5 9.3 9.5-4.8 9.5 4.8-9.5 4.8z" /><path d="M6.5 11.7v4.1c0 1.6 2.5 2.9 5.5 2.9s5.5-1.3 5.5-2.9v-4.1" /><path d="M21.5 9.3v5" /></>),
  globe: (<><circle cx="12" cy="12" r="8.8" /><path d="M3.2 12h17.6" /><ellipse cx="12" cy="12" rx="4.2" ry="8.8" /></>),
  database: (<><ellipse cx="12" cy="5.2" rx="8" ry="2.9" /><path d="M4 5.2v13.6c0 1.6 3.6 2.9 8 2.9s8-1.3 8-2.9V5.2" /><path d="M4 12c0 1.6 3.6 2.9 8 2.9s8-1.3 8-2.9" /></>),
  star: <path d="m12 3.4 2.6 5.4 5.9.8-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.6l5.9-.8z" />,
  clock: (<><circle cx="12" cy="12" r="8.8" /><path d="M12 7.2V12l3.2 1.9" /></>),
  chevR: <path d="m9 5.5 6.5 6.5L9 18.5" />,
  chevL: <path d="M15 5.5 8.5 12l6.5 6.5" />,
  chevD: <path d="m5.5 9 6.5 6.5L18.5 9" />,
  arrowR: (<><path d="M4.5 12h14" /><path d="m13 6.5 5.5 5.5-5.5 5.5" /></>),
  arrowL: (<><path d="M19.5 12h-14" /><path d="m11 6.5-5.5 5.5 5.5 5.5" /></>),
  bell: (<><path d="M6.2 9.5a5.8 5.8 0 1 1 11.6 0c0 4.6 1.8 5.8 1.8 5.8H4.4s1.8-1.2 1.8-5.8" /><path d="M10 19.5a2.1 2.1 0 0 0 4 0" /></>),
  sparkle: (<><path d="M11 4.5 12.6 9l4.5 1.6-4.5 1.6L11 16.7l-1.6-4.5L4.9 10.6 9.4 9z" /><path d="m18.6 15.2.8 2.1 2.1.8-2.1.8-.8 2.1-.8-2.1-2.1-.8 2.1-.8z" /></>),
  compass: (<><circle cx="12" cy="12" r="8.8" /><path d="m15.6 8.4-1.9 5.3-5.3 1.9 1.9-5.3z" /></>),
  user: (<><circle cx="12" cy="8.2" r="3.9" /><path d="M4.8 20.2a7.4 7.4 0 0 1 14.4 0" /></>),
  search: (<><circle cx="11" cy="11" r="6.3" /><path d="m15.8 15.8 4.4 4.4" /></>),
  bigSearch: (<><circle cx="10.5" cy="10.5" r="6.8" /><path d="m15.5 15.5 5 5" /><path d="M8 10.5h5M10.5 8v5" /></>),
  gavel: (<><path d="m13.6 4.6 5.8 5.8" /><path d="m10.2 8 5.8 5.8" /><path d="M12.7 6 5.2 13.5a2.4 2.4 0 0 0 3.4 3.4l7.5-7.5" /><path d="M4 20.5h9" /></>),
  docShield: (<><path d="M19 11V7.8L15.5 4H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" /><path d="M15 4.2V8h4.3" /><path d="m17.5 12.2 3.5 1.5v2.6c0 2.2-1.5 3.7-3.5 4.4-2-.7-3.5-2.2-3.5-4.4v-2.6z" /></>),
  save: (<><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><path d="M17 21v-7H7v7M7 3v5h8" /></>),
  eye: (<><path d="M2.2 12S5.8 5.6 12 5.6 21.8 12 21.8 12 18.2 18.4 12 18.4 2.2 12 2.2 12z" /><circle cx="12" cy="12" r="2.8" /></>),
  download: (<><path d="M12 4v10.6" /><path d="M6.8 9.8 12 15l5.2-5.2" /><path d="M4.5 20h15" /></>),
  zap: <path d="M13 2.5 4.8 13.4h6L9.6 21.5 17.9 10.6h-6z" />,
  history: (<><path d="M4 12a8 8 0 1 1 2.3 5.6" /><path d="M4 13.5V9h4.5" /><path d="M12 8.4v4l2.8 1.7" /></>),
  graph: (<><circle cx="6" cy="6" r="2.5" /><circle cx="18" cy="7" r="2.5" /><circle cx="12" cy="17.5" r="2.5" /><path d="m8.5 6.4 7-.2M7.2 8.1l3.6 7.2M16.9 9.2l-3.7 6.1" /></>),
  trend: (<><path d="m3.5 16.5 5.5-5.5 4 4 7.5-8" /><path d="M15.5 7h5v5" /></>),
  compare: (<><path d="M12 4.5v15M5.5 8h13" /><path d="m5.5 8-2.6 5.6a2.9 2.9 0 0 0 5.2 0z" /><path d="m18.5 8-2.6 5.6a2.9 2.9 0 0 0 5.2 0z" /><path d="M8.5 19.5h7" /></>),
  api: (<><path d="m8 8-4 4 4 4" /><path d="m16 8 4 4-4 4" /><path d="M13.2 5.5 10.8 18.5" /></>),
  refresh: (<><path d="M20 12a8 8 0 1 1-2.3-5.6" /><path d="M20 10.5V6h-4.5" /></>),
  check: <path d="m4.5 12.5 5 5 10-11" />,
  filter: <path d="M4 5.5h16M7 12h10M10 18.5h4" />,
  plus: (<><path d="M12 5v14" /><path d="M5 12h14" /></>),
  minus: <path d="M5 12h14" />,
  x: <path d="m6 6 12 12M18 6 6 18" />,
  alert: (<><path d="M12 3.6 21.5 20h-19z" /><path d="M12 9.5v5M12 17.6v.1" /></>),
  info: (<><circle cx="12" cy="12" r="8.8" /><path d="M12 11v5.4M12 7.6v.1" /></>),
  shieldCheck: (<><path d="M12 3.2 19 6v5.2c0 4.4-3 7.4-7 8.8-4-1.4-7-4.4-7-8.8V6z" /><path d="m9 11.6 2.1 2.1 4-4.2" /></>),
  scale: (<><path d="M12 4v16M7.5 20h9M4 7.5h16M12 4.8 4 7.5l2.7 5.6a3.1 3.1 0 0 0 5.3 0zM12 4.8l8 2.7-2.7 5.6a3.1 3.1 0 0 1-5.3 0z" /></>),
  file: (<><path d="M19 11V7.8L15.5 4H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2z" /><path d="M15 4.2V8h4.3" /></>),
  link: (<><path d="M9.5 14.5 14.5 9.5" /><path d="M11 6.8 12.8 5a3.8 3.8 0 0 1 5.4 5.4L16.4 12" /><path d="m13 17.2-1.8 1.8A3.8 3.8 0 0 1 5.8 13.6L7.6 12" /></>),
  external: (<><path d="M9 5H6.8A2.8 2.8 0 0 0 4 7.8v9.4A2.8 2.8 0 0 0 6.8 20h9.4a2.8 2.8 0 0 0 2.8-2.8V15" /><path d="M14 4h6v6" /><path d="M20 4 11.5 12.5" /></>),
  copy: (<><rect x="8.5" y="8.5" width="12" height="12" rx="2" /><path d="M15.5 5.5v-1a2 2 0 0 0-2-2h-9a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h1" transform="translate(1.5 1.5)" /></>),
  sun: (<><circle cx="12" cy="12" r="4.2" /><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7" /></>),
  moon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z" />,
  lock: (<><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8.2 10.5V7.8a3.8 3.8 0 0 1 7.6 0v2.7" /></>),
  gear: (<><circle cx="12" cy="12" r="3" /><path d="M12 3.2 13.5 6a6.6 6.6 0 0 1 2.3 1l3-.7 1.4 2.4-2 2.3a6.8 6.8 0 0 1 0 2l2 2.3-1.4 2.4-3-.7a6.6 6.6 0 0 1-2.3 1L12 20.8 10.5 18a6.6 6.6 0 0 1-2.3-1l-3 .7L3.8 15.3l2-2.3a6.8 6.8 0 0 1 0-2l-2-2.3L5.2 6.3l3 .7a6.6 6.6 0 0 1 2.3-1z" /></>),
  upload: (<><path d="M12 15V4.4" /><path d="m6.8 9.2 5.2-5.2 5.2 5.2" /><path d="M4.5 20h15" /></>),
  layers: (<><path d="m12 3.5 9 4.5-9 4.5L3 8z" /><path d="m4.6 12 7.4 3.7L19.4 12" /><path d="m4.6 16 7.4 3.7L19.4 16" /></>),
  book: (<><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15.5H6.5A2.5 2.5 0 0 0 4 21z" /><path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20" /></>),
  target: (<><circle cx="12" cy="12" r="8.8" /><circle cx="12" cy="12" r="4.8" /><circle cx="12" cy="12" r="1" /></>),
  tree: (<><path d="M12 4v5M6 20v-3a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v3" /><circle cx="12" cy="4" r="1.6" /><circle cx="6" cy="19.5" r="1.6" /><circle cx="18" cy="19.5" r="1.6" /></>),
  quote: (<><path d="M9.5 7C7 7.6 5.5 9.4 5.5 12.4c0 2.2 1.3 3.6 3 3.6 1.5 0 2.7-1.1 2.7-2.7 0-1.5-1-2.5-2.4-2.6.2-1.3 1-2.2 2.2-2.7zM18.5 7c-2.5.6-4 2.4-4 5.4 0 2.2 1.3 3.6 3 3.6 1.5 0 2.7-1.1 2.7-2.7 0-1.5-1-2.5-2.4-2.6.2-1.3 1-2.2 2.2-2.7z" /></>),
  stamp: (<><path d="M9 4.5A2.5 2.5 0 0 1 14 5c0 1.6-1 2.4-1 4h-2c0-1.6-1-2.4-1-4z" transform="translate(0 -.5)" /><path d="M8.5 9.5h7l1 4.5h-9z" /><path d="M5 18a2.5 2.5 0 0 1 2.5-2.5h9A2.5 2.5 0 0 1 19 18v1.5H5z" /></>),
  flag: (<><path d="M6 21V4" /><path d="M6 5h12l-2.5 4L18 13H6z" /></>),
  news: (<><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M7.5 9h6M7.5 12.5h9M7.5 16h9" /></>),
  bulb: (<><path d="M9 18h6M10 21h4" /><path d="M12 3.5a6 6 0 0 1 3.5 10.9c-.8.6-1 1.2-1 2.1h-5c0-.9-.2-1.5-1-2.1A6 6 0 0 1 12 3.5z" /></>),
  note: (<><path d="M19 11V7.8L15.5 4H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5" /><path d="M15 4.2V8h4.3" /><path d="M13.5 19.5 18 15l2 2-4.5 4.5-2.6.6z" /></>),
  grid: (<><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></>),
  sliders: (<><path d="M5 4.5v6M5 14v5.5M12 4.5v3M12 11v8.5M19 4.5v9M19 17v2.5" /><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="9" r="1.8" /><circle cx="19" cy="15" r="1.8" /></>),
  send: (<><path d="m4.5 11 15-6.5-4 15-4.5-5.5z" /><path d="M11 14 19.5 4.5" /></>),
  dots: (<><circle cx="5.5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="18.5" cy="12" r="1.2" /></>),
  pin: (<><path d="M12 21v-7.5" /><path d="M8 4h8l-1 6.5 2 2.5H7l2-2.5z" /></>),
  tag: (<><path d="m12.5 3.5 8 8-9 9-8-8v-7a2 2 0 0 1 2-2z" /><circle cx="8.5" cy="8.5" r="1.4" /></>),
  calendar: (<><rect x="4" y="5.5" width="16" height="15" rx="2" /><path d="M4 10h16M8.5 3.5v3.5M15.5 3.5v3.5" /></>),
  building: (<><rect x="5" y="3.5" width="14" height="17" rx="1.5" /><path d="M9 7.5h2M13 7.5h2M9 11h2M13 11h2M9 14.5h2M13 14.5h2M10.5 20.5v-3h3v3" /></>),
  coins: (<><ellipse cx="9" cy="7" rx="6" ry="2.7" /><path d="M3 7v4c0 1.5 2.7 2.7 6 2.7s6-1.2 6-2.7V7" /><path d="M8 13.7V17c0 1.5 2.7 2.7 6 2.7s6-1.2 6-2.7v-4c0-1.2-1.8-2.2-4.4-2.6" /></>),
  verify: (<><circle cx="12" cy="12" r="8.8" /><path d="m8.2 12.3 2.6 2.6 5-5.4" /></>),
  reject: (<><circle cx="12" cy="12" r="8.8" /><path d="m9 9 6 6M15 9l-6 6" /></>),
  edit: (<><path d="M4 20h4.5L20 8.5a2.1 2.1 0 0 0-3-3L5.5 17z" /><path d="m14.5 8 3 3" /></>),
  trash: (<><path d="M4.5 6.5h15M9 6V4.5h6V6M6.5 6.5 7.5 20h9l1-13.5" /><path d="M10 10.5v5.5M14 10.5v5.5" /></>),
  share: (<><circle cx="6" cy="12" r="2.6" /><circle cx="17.5" cy="5.5" r="2.6" /><circle cx="17.5" cy="18.5" r="2.6" /><path d="m8.4 10.7 6.8-3.9M8.4 13.3l6.8 3.9" /></>),
  folder: <path d="M3.5 6.5A2 2 0 0 1 5.5 4.5h4l2 2.5h7a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />,
  sort: <path d="M7 4.5v15M7 19.5 4 16.5M7 19.5l3-3M17 19.5v-15M17 4.5 14 7.5M17 4.5l3 3" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  logout: (<><path d="M14 4.5H6.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2H14" /><path d="M10.5 12h9M16.5 8.5 20 12l-3.5 3.5" /></>),
  key: (<><circle cx="8" cy="14.5" r="4.5" /><path d="m11.5 11 8.5-8.5M17 5.5 19.5 8M14.5 8l2 2" /></>),
}

export function Icon({ name, size = 16, className, strokeWidth = 1.7 }: {
  name: IconName
  size?: number
  className?: string
  strokeWidth?: number
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  )
}
