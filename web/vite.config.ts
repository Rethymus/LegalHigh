import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// base 条件化：GitHub Pages 静态说明站（VITE_STATIC_PREVIEW=1）使用子路径，
// 本地开发/桌面端构建用 /（根路径），避免资源路径偏移。
// Pages 使用 HashRouter；本地 BrowserRouter 的 basename 从 BASE_URL 读取。
export default defineConfig(() => ({
  base: process.env.VITE_STATIC_PREVIEW === '1' ? '/LegalHigh/' : '/',
  plugins: [react()],
  server: {
    proxy: {
      // 开发期把 /api 代理到本地 FastAPI（server/.venv: uvicorn app.main:app --port 8000），
      // 浏览器侧同源、无 CORS。8000 被其他本机服务占用时可用 LH_API_PORT 指向备用端口。
      '/api': {
        target: `http://127.0.0.1:${process.env.LH_API_PORT || '8000'}`,
        changeOrigin: true,
        // 与后端在同一终端设置 LH_ADMIN_TOKEN 时，由开发代理附加请求头；
        // 密钥不进入前端 bundle、localStorage 或 URL。
        ...(process.env.LH_ADMIN_TOKEN ? { headers: { 'X-LegalHigh-Admin-Token': process.env.LH_ADMIN_TOKEN } } : {}),
      },
    },
  },
}))
