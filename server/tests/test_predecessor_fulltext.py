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


def test_predecessor_fulltext_id_card():
    """R411：身份证法前身《居民身份证条例》1985（条例升法）。"""
    r = client.get("/api/laws/id-card-2011/predecessor/fulltext")
    assert r.status_code == 200
    assert "1985年9月6日" in r.json()["text"]
    assert "主席令第二十九号" in r.json()["text"]


def test_predecessor_fulltext_audit_no_parenthetical():
    """R411：审计条例 1988 快照无括注——chrome 剥除规则回归钉。

    标题行与正文首锚（第一章）之间的语言/导航/沿革侧栏块必须整段剥除；
    此前该形态页面会把「添加语言/不转换/維基文庫」整块泄进正文。
    """
    r = client.get("/api/laws/audit-2021/predecessor/fulltext")
    assert r.status_code == 200
    text = r.json()["text"]
    assert "中华人民共和国审计条例" in text[:40]
    assert "第一章" in text[:80]
    for chrome in ("添加语言", "不转换", "维基文库", "維基文庫", "制定机关：国务院"):
        assert chrome not in text, f"chrome 残留: {chrome}"


def test_predecessor_fulltext_police_1957():
    """R411：人民警察法前身《人民警察条例》1957（本库最古前身文本）。"""
    r = client.get("/api/laws/police-2012/predecessor/fulltext")
    assert r.status_code == 200
    assert "1957年6月25日" in r.json()["text"]


def test_predecessor_fulltext_anti_drug_decision():
    """R411：禁毒法前身《关于禁毒的决定》1990（列项式立法决定，无条号）。"""
    r = client.get("/api/laws/anti-drug-2008/predecessor/fulltext")
    assert r.status_code == 200
    assert "1990年12月28日" in r.json()["text"]
