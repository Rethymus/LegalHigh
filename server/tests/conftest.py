# -*- coding: utf-8 -*-
import sys
from pathlib import Path

import pytest

SERVER_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SERVER_DIR))

from app import storage  # noqa: E402


@pytest.fixture()
def tmp_db(tmp_path, monkeypatch):
    """每个用例独立的临时 SQLite，避免污染开发数据。"""
    db_file = tmp_path / "test_app.db"
    monkeypatch.setattr(storage, "DB_PATH", db_file)
    monkeypatch.setattr(storage, "_conn", None)
    yield db_file
    storage._conn = None
