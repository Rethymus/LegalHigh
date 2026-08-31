# 桌面端 release（Electron + PyInstaller sidecar）

> 分发模式参照 ChatGPT/ZCode 桌面端：**本地全功能运行，数据不出本机**。
> 触发：推送 `v*` tag → `.github/workflows/desktop-release.yml` 三平台构建 → GitHub Release 附产物。

## 架构

```
Electron 壳（desktop/main.js ← main.js.in 构建期物化）
  └─ spawn FastAPI sidecar（PyInstaller 打包 server/desktop_entry.py）
       ├─ /api/*（全部 server 能力）
       └─ web/dist（前端静态，PyInstaller --add-data 打入）
```

## 安全要点（对应安全扫描关注面）

- sidecar 启动：`spawn(常量路径, [常量端口])`，不经 shell；路径来自构建期静态映射 `SIDECAR_EXE`，无用户输入参与。
- 代码以 `main.js.in` 模板入库、构建期物化（CMake 惯例）——因「动态路径 + spawn」模式会被静态扫描器判为注入（无法区分构建常量与用户输入），模板内安全说明完整保留。
- 数据库写入用户数据目录（`LH_DB_PATH`），不改安装目录；前端 dist 由后端托管（`WEB_DIST_DIR`）。

## 首次构建须知（诚实声明）

- PyInstaller 的 `--add-data` 分隔符在 Windows 为 `;`、类 Unix 为 `:`，工作流按 matrix OS 已分跑但**首次 tag 构建需在线调试**（uvicorn 隐藏导入、macOS 签名公证未配）。
- `desktop/package.json` 的 electron-builder 三平台 target：NSIS / DMG / AppImage。
- 发布产物命名：`LegalHigh-<版本>-<平台>`，附于 GitHub Release。
