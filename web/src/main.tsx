import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import App from './App'
import { ToastProvider } from './components/ui'
import AppErrorBoundary from './components/AppErrorBoundary'
import './styles/global.css'
import './styles/print.css'

// Pages cannot serve arbitrary SPA paths with HTTP 200. Hash routes keep direct
// links and refreshes on its real index document; local builds keep clean URLs.
const STATIC_PREVIEW = import.meta.env.VITE_STATIC_PREVIEW === '1'
const Router = STATIC_PREVIEW ? HashRouter : BrowserRouter

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router basename={STATIC_PREVIEW ? '/' : import.meta.env.BASE_URL}>
      <AppErrorBoundary>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AppErrorBoundary>
    </Router>
  </StrictMode>,
)

// 只读离线壳（v6 S4-T1）：仅生产构建注册 service worker——本地 dev（localhost）
// 注册会把未哈希的 dev 资产写进缓存，干扰热更新，故显式跳过。
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* SW 不可用不影响在线功能：离线能力是增强而非依赖 */
    })
  })
}
