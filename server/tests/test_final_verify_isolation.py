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
        timeout=60,
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
