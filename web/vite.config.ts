import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub Pages 项目站点部署在 /LegalHigh/ 子路径——base 必须与之一致，
  // 否则构建产物的 /assets/... 引用会 404 导致白屏。本地开发/桌面端不受影响。
  base: '/LegalHigh/',
  server: {
    proxy: {
      // 开发期把 /api 代理到本地 FastAPI（server/.venv: uvicorn app.main:app --port 8000），
      // 浏览器侧同源、无 CORS。
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
