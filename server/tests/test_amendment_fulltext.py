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
    # R393 加固：HTML 标签残渣必须为零——原始 HTML 直传清洗后管的缺陷曾全部通过既有断言
    assert "<ul" not in body["text"] and "<div" not in body["text"] and "<span" not in body["text"]
    assert set(body["source"].keys()) >= {"kind", "grade", "url", "accessed_at", "snapshot"}
    assert "一手文本" in body["scope_note"]


def test_amendment_fulltext_cl_amendment():
    """刑法修正案（五）（R55 时代 legacy schema 归一后）：正文干净且含修改项。"""
    r = client.get("/api/laws/cl-2023/amendments/5/fulltext")
    assert r.status_code == 200
    body = r.json()
    assert "刑法" in body["text"] and "一、" in body["text"]
    assert "<ul" not in body["text"]  # HTML 残渣为零（R393 修复的钉子）


def test_amendment_fulltext_unknown_no_404():
    """未登记的决定次序 → 404（fail-closed）。"""
    r = client.get("/api/laws/pcl-2023/amendments/99/fulltext")
    assert r.status_code == 404


def test_amendment_fulltext_unknown_law_404():
    r = client.get("/api/laws/no-such-law/amendments/1/fulltext")
    assert r.status_code == 404
