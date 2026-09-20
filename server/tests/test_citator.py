# -*- coding: utf-8 -*-
"""Citator 种子（FLERF §26，R165）：精确引用反查的机械检查。

- 只认 research_refs 精确匹配（邻近/语义相似不是引用）；
- 权威分级沿用案例库口径（指导性案例/外国判例）；
- 负面历史检查无数据源——必须如实声明不提供，不得冒充 KeyCite。
"""
import pytest

from app import cases as cases_mod, citator, main


def test_cited_by_shape_and_precision():
    cb = citator.cited_by("civl-2020")
    assert cb["law_id"] == "civl-2020"
    assert cb["case_count"] >= 20, "民法典应有多件指导案例引用（现有语料 30+）"
    assert set(cb["by_level"]) <= {"指导性案例", "外国判例"}
    # 逐条文计数：至少一个条文被多件案例引用（1165 过错责任是高引条文）
    top = cb["articles"][0]
    assert top["case_count"] >= 2
    # 排序确定性：case_count 降序，同数按条号升序
    counts = [a["case_count"] for a in cb["articles"]]
    assert counts == sorted(counts, reverse=True)
    # 每个案例的引用条号都非空且逐字精确
    for c in cb["cases"]:
        assert c["cited_articles"], f"{c['id']} 进入清单却没有精确引用条号"


def test_article_level_exact_match():
    arts = citator.cited_by_article("civl-2020", 1165)
    assert arts, "1165（过错责任）应有被引记录"
    for c in arts:
        assert any(a["no"] == 1165 and not a["sub"] for a in c["cited_articles"])
    # 精确性：同时出现在 1164/1165 清单里的案例必须真的两条都引（多条引用合法，错配不合法）
    art_1164 = citator.cited_by_article("civl-2020", 1164)
    by_id = {c["id"]: c for c in citator.cited_by("civl-2020")["cases"]}
    for cid in {c["id"] for c in arts} & {c["id"] for c in art_1164}:
        nos = {a["no"] for a in by_id[cid]["cited_articles"]}
        assert {1164, 1165} <= nos


def test_sub_article_citation_is_distinct():
    """子条号参与精确匹配：刑法第253条之一 ≠ 第253条基条（R29 引用不变量子条号纪律）。"""
    sub = citator.cited_by_article("cl-2023", 253, "之一")
    base = citator.cited_by_article("cl-2023", 253)
    assert sub, "253之一 应有被引案例（个人信息罪簇）"
    for c in sub:
        assert any(a["no"] == 253 and a.get("sub") == "之一" for a in c["cited_articles"])
    assert {c["id"] for c in sub}.isdisjoint({c["id"] for c in base}), "子条与基条清单不得混同"


def test_cited_by_deterministic():
    assert citator.cited_by("lcl-2012") == citator.cited_by("lcl-2012")


def test_endpoint_unknown_law_404():
    with pytest.raises(Exception) as ei:
        main.law_cited_by("no-such-law")
    assert getattr(ei.value, "status_code", None) == 404


def test_endpoint_public_shape():
    out = main.law_cited_by("civl-2020")
    for key in ("law_id", "case_count", "by_level", "articles", "cases",
                "negative_history_note", "scope_note"):
        assert key in out, f"公开契约缺 {key}"
    # 诚实纪律：负面历史检查必须显式声明不提供
    assert "不提供" in out["negative_history_note"]
    # 外国判例只能以比较研究身份出现（LEGAL-003）
    for c in out["cases"]:
        if c["kind"] == "foreign":
            assert c["level"] == "外国判例"


def test_citator_graph_totals_and_laws():
    """known-gaps #6 最小图谱（R244）：站点级聚合与逐法计数自洽。"""
    g = citator.graph()
    totals = g["totals"]
    assert totals["cases"] >= 200
    assert totals["citing_cases"] <= totals["cases"]
    assert totals["citations"] == sum(x["citation_count"] for x in g["laws"])
    assert totals["laws_cited"] == len(g["laws"])
    # 图谱的 laws 子集 = 全部已核实案例 research_refs 中出现过的 law_id
    refs_laws = {r["law_id"] for c in cases_mod.load_cases()
                 for r in (c.get("research_refs") or []) if r.get("law_id")}
    assert {x["law_id"] for x in g["laws"]} <= refs_laws
    # 排序：按被引案例数降序
    counts = [x["case_count"] for x in g["laws"]]
    assert counts == sorted(counts, reverse=True)


def test_citator_graph_matches_cited_by():
    """图谱逐法 case_count 与 cited_by() 一致；条文级 case_ids 与 cited_articles 一致。"""
    g = citator.graph()
    by_law = {x["law_id"]: x for x in g["laws"]}
    for law_id in ("cl-2023", "lcl-2012", "civl-2020"):
        cb = citator.cited_by(law_id)
        entry = by_law[law_id]
        assert entry["case_count"] == cb["case_count"]
        cb_articles = {(a["no"], a.get("sub") or ""): a["case_count"] for a in cb["articles"]}
        for art in entry["articles"]:
            key = (art["no"], art.get("sub") or "")
            assert len(art["case_ids"]) == cb_articles[key]
        # 条文级：cited_by_article 的案例都在图谱 case_ids 中
        first = entry["articles"][0]
        sub = first.get("sub")
        cited = citator.cited_by_article(law_id, first["no"], sub)
        assert {c["id"] for c in cited} <= set(first["case_ids"])
