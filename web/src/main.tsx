import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { ToastProvider } from './components/ui'
import './styles/global.css'

// 演示模式（GitHub Pages 静态预览）：构建时 VITE_DEMO=1 启用浏览器内只读 API
if (import.meta.env.VITE_DEMO === '1') {
  import('./demo/demo-api').then((m) => m.installDemoApi())
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <App />
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
)
