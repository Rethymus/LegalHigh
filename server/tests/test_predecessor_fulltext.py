# -*- coding: utf-8 -*-
"""前身法全文查阅端点测试（R390）。"""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_predecessor_fulltext_physicians():
    """医师法前身《执业医师法》1998：正文含章名与首条，relation 回显定案句。"""
    r = client.get("/api/laws/physicians-2021/predecessor/fulltext")
    assert r.status_code == 200
    body = r.json()
    assert "前身关系定案" in body["relation"]
    assert "1998年6月26日" in body["text"]
    assert "执业医师" in body["text"]
    assert "不入版本时间线" in body["scope_note"]
    assert body["snapshot"].endswith(".html")


def test_predecessor_fulltext_degree():
    """学位法前身《学位条例》1980。"""
    r = client.get("/api/laws/academic-degree-2024/predecessor/fulltext")
    assert r.status_code == 200
    assert "1980年2月12日" in r.json()["text"]


def test_predecessor_fulltext_no_registration_404():
    """无前身登记的普通法 → 404（fail-closed）。"""
    r = client.get("/api/laws/civl-2020/predecessor/fulltext")
    assert r.status_code == 404


def test_predecessor_fulltext_unknown_law_404():
    r = client.get("/api/laws/no-such-law/predecessor/fulltext")
    assert r.status_code == 404
