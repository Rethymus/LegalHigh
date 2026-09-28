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
    """无前身登记的普通法 → 404（fail-closed）。R412 起民法典有多前身（idx 缺省另测）。"""
    r = client.get("/api/laws/pcl-2023/predecessor/fulltext")
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


def test_predecessor_multi_civl_list_and_read():
    """R412：民法典九法多前身——清单精确、逐部可读、无 chrome。"""
    r = client.get("/api/laws/civl-2020/predecessor/fulltext?idx=0")
    assert r.status_code == 200
    body = r.json()
    titles = body["predecessors"]
    assert titles == [
        "中华人民共和国婚姻法", "中华人民共和国继承法", "中华人民共和国民法通则", "中华人民共和国收养法",
        "中华人民共和国担保法", "中华人民共和国合同法", "中华人民共和国物权法",
        "中华人民共和国侵权责任法", "中华人民共和国民法总则",
    ]
    assert "第1260条" in body["relation"]
    for i, marker in [(0, "1980年9月10日"), (5, "1999年3月15日"), (8, "2017年3月15日")]:
        b = client.get(f"/api/laws/civl-2020/predecessor/fulltext?idx={i}").json()
        assert marker in b["text"], i
        for chrome in ("添加语言", "不转换", "相关导览"):
            assert chrome not in b["text"], (i, chrome)


def test_predecessor_multi_idx_out_of_range_404():
    """R412：idx 越界与缺省 → 404（民法典多前身必须显式选择）。"""
    assert client.get("/api/laws/civl-2020/predecessor/fulltext?idx=9").status_code == 404
    assert client.get("/api/laws/civl-2020/predecessor/fulltext?idx=-1").status_code == 404
    assert client.get("/api/laws/civl-2020/predecessor/fulltext").status_code == 404


def test_predecessor_single_form_unchanged():
    """R412 回归：单前身 note 形态不受 idx 影响（身份证法）。"""
    r = client.get("/api/laws/id-card-2011/predecessor/fulltext")
    assert r.status_code == 200
    assert "1985年9月6日" in r.json()["text"]
    assert client.get("/api/laws/id-card-2011/predecessor/fulltext?idx=0").status_code == 200
