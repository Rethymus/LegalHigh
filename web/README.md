# LegalHigh Web

React 19 + React Router + Vite 前端。业务数据来自 `/api` 或构建生成的 `public/data/laws.json`；不得在组件中手写法条、案例、客户合同、审核人或已接入数据源。

```bash
npm ci
npm run dev
npm run build
node scripts/qa_gates.mjs
node scripts/qa_contrast.mjs --strict
```

Node.js 22 是当前验证版本。`npm run dev` 默认把 `/api` 代理到 `http://127.0.0.1:8000`。静态 Pages 构建只有法条快照能力；不能把需要后端的页面描述为可用服务。

浏览器本机数据（收藏、历史、研究标记、外观与可选 AI 设置）必须按不可信输入解析并验证 schema。不要在浏览器中持久化服务端管理员令牌；Electron 令牌由主进程在已验证的回环 origin 上加到请求头，渲染进程不可见。

视觉巡检脚本默认只读。写入式 E2E 必须同时使用 `--write-e2e --isolated-db`，并确保对应后端确实使用唯一临时 `LH_DB_PATH`。
