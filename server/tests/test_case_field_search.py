# -*- coding: utf-8 -*-
"""案例按字段加权检索测试（R146，known-gaps 次项的机械检查）。"""
import pytest
from fastapi.testclient import TestClient

from app import cases as cases_mod
from app.cases import BIAS_OPTIONS, search_cases
from app.main import app


def test_bias_options_and_validation():
    assert set(BIAS_OPTIONS) >= {"balanced", "facts", "reasoning"}
    with pytest.raises(ValueError):
        search_cases("劳动", bias="nonsense")


def test_endpoint_rejects_invalid_bias():
    client = TestClient(app)
    assert client.get("/api/cases", params={"q": "劳动", "bias": "bad"}).status_code == 422
    assert client.get("/api/cases", params={"q": "劳动", "bias": "facts"}).status_code == 200


def test_recall_now_covers_facts_field():
    """「讨债」只出现在 guidance-93 的 facts 字段（旧子串检索的 hay 不含 facts）——
    字段加权检索后案情词可命中。"""
    hits = search_cases("讨债", bias="facts")
    ids = [h["id"] for h in hits]
    assert "guidance-93" in ids


def test_exact_identifier_boost():
    """案号/编号子串命中保底最优先。"""
    hits = search_cases("指导案例238号")
    assert hits and hits[0]["id"] == "guidance-238"


def test_facts_bias_is_section_aware():
    """Facts↔Facts：事实型查询下 facts 偏向的头部必须是案情事实强匹配的案例，
    且 reasoning 偏向（零化 facts）会改变排名——偏向真的改变结果，不是摆设。"""
    q = "骑手被注册个体工商户后送外卖发生劳动关系争议"
    facts_rank = {h["id"]: i for i, h in enumerate(search_cases(q, bias="facts"))}
    reasoning_rank = {h["id"]: i for i, h in enumerate(search_cases(q, bias="reasoning"))}
    assert facts_rank.get("guidance-238") == 0  # 案情强匹配
    # 存在至少一个案例的排名因偏向而改变（能力存在的证据）
    common = set(facts_rank) & set(reasoning_rank)
    assert any(facts_rank[cid] != reasoning_rank[cid] for cid in common)


def test_reasoning_bias_promotes_holding_matches():
    """裁判理由型查询：reasoning 偏向（Holding×4）相对 facts 偏向（holding 零权）
    提升「理由匹配」案例的排名——「类似案情」与「为什么这么判」两个意图分道。
    （R208 注：237/238/179 等新入库案例案情与理由双强、同时占据两偏向头部，
    旧的「头部集合不等」断言对语料增长脆弱，改为直接断言理由匹配案例
    guidance-40 在 reasoning 偏向下排名提升（实测 8→3）。）"""
    q = "法院认为个体工商户注册不影响劳动关系认定"
    facts_rank = {h["id"]: i for i, h in enumerate(search_cases(q, bias="facts"))}
    reasoning_rank = {h["id"]: i for i, h in enumerate(search_cases(q, bias="reasoning"))}
    facts_order = [h["id"] for h in search_cases(q, bias="facts")]
    reasoning_order = [h["id"] for h in search_cases(q, bias="reasoning")]
    assert facts_order != reasoning_order  # 偏向确实改变排序
    assert reasoning_rank["guidance-40"] < facts_rank["guidance-40"]  # 理由匹配案例被提升


def test_default_balanced_and_no_query_unchanged():
    """空查询仍返回全部已核实案例；level 过滤行为不回退。"""
    allc = search_cases("")
    assert len(allc) >= 50
    lv = search_cases("", level="外国判例")
    assert lv and all(x["kind"] == "foreign" for x in lv)


def test_search_is_deterministic():
    r1 = [h["id"] for h in search_cases("竞业限制 经济补偿", bias="reasoning")]
    r2 = [h["id"] for h in search_cases("竞业限制 经济补偿", bias="reasoning")]
    assert r1 == r2
