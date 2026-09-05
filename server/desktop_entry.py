# -*- coding: utf-8 -*-
"""桌面端后端入口（PyInstaller sidecar）：
- argv[1] = 端口（Electron 主进程传入，构建期常量）
- WEB 静态资源从可执行同目录 web/ 解析（PyInstaller --add-data 打入）
- SQLite 数据库写入用户数据目录（不改安装目录）
"""
import os
import sys
from pathlib import Path


def _resolve() -> Path:
    if getattr(sys, "frozen", False):  # PyInstaller 打包态
        return Path(sys.executable).parent
    return Path(__file__).resolve().parent.parent


def main() -> None:
    base = _resolve()
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    # 正常桌面启动由 Electron 主进程注入随机令牌并在网络层附加请求头；若用户
    # 直接执行 sidecar，未配置时仍只开放公开检索，敏感接口 fail closed。
    if not (os.environ.get("LH_ADMIN_TOKEN") or "").strip() or not (os.environ.get("LH_ADMIN_PRINCIPAL") or "").strip():
        print(
            "LegalHigh: 未配置 LH_ADMIN_TOKEN/LH_ADMIN_PRINCIPAL；敏感接口已关闭（503），公开检索仍可用。",
            file=sys.stderr,
        )
    os.environ["WEB_DIST_DIR"] = str(base / "web")
    os.environ["LH_DB_PATH"] = str(
        (Path(os.environ.get("APPDATA") or Path.home() / ".config") / "LegalHigh" / "app.db"))
    Path(os.environ["LH_DB_PATH"]).parent.mkdir(parents=True, exist_ok=True)

    sys.path.insert(0, str(base))
    from app.main import app  # noqa: E402
    import uvicorn  # noqa: E402

    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")


if __name__ == "__main__":
    main()
