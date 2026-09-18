# -*- coding: utf-8 -*-
"""发布前终验必须隔离运行，不能污染本机用户数据库。"""
import os
import subprocess
import sys
from pathlib import Path


SERVER_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DB = SERVER_ROOT / "data" / "app.db"
VERIFY_SCRIPT = SERVER_ROOT / "scripts" / "final_verify.py"


def _db_snapshot() -> bytes | None:
    return DEFAULT_DB.read_bytes() if DEFAULT_DB.exists() else None


def test_final_verify_defaults_to_isolated_database():
    before = _db_snapshot()
    env = os.environ.copy()
    env.pop("LH_VERIFY_BASE", None)
    env.pop("LH_VERIFY_ALLOW_WRITES", None)

    result = subprocess.run(
        [sys.executable, str(VERIFY_SCRIPT)],
        cwd=SERVER_ROOT,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        # 2026-09-18 R157 修订 60→180s：冷进程 final_verify 需自起服务并跑全量金标评测
        # （488 组 + 90 部语料索引），语料增长使固定 60s 不再可靠（R155 观察到的超时
        # 实为本因，端口独占只是并发条件之一）。验证语义不变——仍然断言 ALL PASS 与
        # 数据库快照不变。
        timeout=180,
        check=False,
    )

    assert result.returncode == 0, result.stdout.decode(errors="replace")
    assert b"ALL PASS" in result.stdout
    assert _db_snapshot() == before


def test_live_final_verify_requires_explicit_write_opt_in():
    env = os.environ.copy()
    env["LH_VERIFY_BASE"] = "http://127.0.0.1:65534"
    env.pop("LH_VERIFY_ALLOW_WRITES", None)

    result = subprocess.run(
        [sys.executable, str(VERIFY_SCRIPT)],
        cwd=SERVER_ROOT,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=15,
        check=False,
    )

    assert result.returncode != 0
    assert b"LH_VERIFY_ALLOW_WRITES=1" in result.stdout
