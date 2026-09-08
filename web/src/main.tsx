import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import App from './App'
import { ToastProvider } from './components/ui'
import AppErrorBoundary from './components/AppErrorBoundary'
import './styles/global.css'

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
