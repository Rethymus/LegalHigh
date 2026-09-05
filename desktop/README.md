# LegalHigh Desktop

Electron 只负责启动本机 PyInstaller sidecar 并显示其 Web UI。主进程使用随机回环端口、随机管理令牌和独立实例证明；只有 `/api/health` 返回本次实例证明后才创建窗口和附加认证请求头。渲染进程启用 sandbox、context isolation，关闭 Node integration，且不接收管理令牌。SQLite 位于 `app.getPath('userData')`，不写安装资源；sidecar 只继承运行所需系统变量和明确登记的模型密钥。

```bash
npm ci
npm run check
```

`main.js.in` 是受版本控制的源文件；`npm run check` 先生成被 `.gitignore` 排除的 `main.js` 再做语法检查。完整 `npm run dist` 需要 `desktop/backend/` 中存在当前平台的 `legalhigh-backend` sidecar。普通源码检出不包含该产物。

当前手动工作流只上传 `unsigned-desktop-candidate-*` 候选包，不创建正式 Release。发布前还必须：在目标平台构建 sidecar、运行安装/卸载测试、验证后端意外退出提示、进行代码签名与签名校验、生成 SBOM/许可证包，并确认安装包不含测试数据库、密钥或真实用户材料。工作流存在不代表这些发布步骤已经完成。
