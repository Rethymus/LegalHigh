# -*- coding: utf-8 -*-
"""修正决定快照原文查阅端点测试（R384）。"""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_amendment_fulltext_returns_decree_body():
    """民诉法第 1 次修正决定：正文含「作如下修改」与修改项序号，且带来源五字段。"""
    r = client.get("/api/laws/pcl-2023/amendments/1/fulltext")
    assert r.status_code == 200
    body = r.json()
    assert body["title"].startswith("全国人民代表大会常务委员会关于修改")
    assert body["passed_date"] == "2007-10-28"
    assert body["effective"] == "2008-04-01"
    # 决定正文标志：对某法「作如下修改」+ 修改项序号
    assert "作如下修改" in body["text"]
    assert "一、" in body["text"]
    # 清洗后不应残留维基文库导航标记
    assert "@@H" not in body["text"]
    assert "- 维基文库" not in body["text"][:200]
    assert set(body["source"].keys()) >= {"kind", "grade", "url", "accessed_at", "snapshot"}
    assert "一手文本" in body["scope_note"]


def test_amendment_fulltext_unknown_no_404():
    """未登记的决定次序 → 404（fail-closed）。"""
    r = client.get("/api/laws/pcl-2023/amendments/99/fulltext")
    assert r.status_code == 404


def test_amendment_fulltext_unknown_law_404():
    r = client.get("/api/laws/no-such-law/amendments/1/fulltext")
    assert r.status_code == 404
