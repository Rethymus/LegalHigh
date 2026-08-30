import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // 开发期把 /api 代理到本地 FastAPI（server/.venv: uvicorn app.main:app --port 8000），
      // 浏览器侧同源、无 CORS；生产部署形态未定（M8 前不安排部署）。
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
