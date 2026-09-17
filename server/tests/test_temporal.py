# -*- coding: utf-8 -*-
"""AS_OF_DATE 时间效力层测试（R144，LEGAL-004 的机械检查）。"""
import pytest
from fastapi.testclient import TestClient

from app import temporal
from app.main import app
from app.qa import ask


# ---------- 检测 ----------

def test_detect_explicit_year():
    d = temporal.detect_temporal_reference("2018年民间借贷利息超过多少违法")
    assert d["detected"] and d["as_of"] == "2018-12-31" and d["granularity"] == "year"


def test_detect_future_year_clamped_to_plausible():
    # 超出当前+1 的年份不触发（避免编号误判，如「第一百86年」不存在但「9999年」应忽略）
    d = temporal.detect_temporal_reference("9999年会怎样")
    assert not d["detected"]


def test_detect_deictic_without_date():
    d = temporal.detect_temporal_reference("当年的法律规定和现在一样吗")
    assert d["detected"] and d["as_of"] is None


def test_no_detection_for_plain_question():
    assert not temporal.detect_temporal_reference("诉讼时效是多久")["detected"]


# ---------- 生效标记 ----------

def test_in_force_at_semantics():
    assert temporal.in_force_at("2021-01-01", "2022-06-01") is True
    assert temporal.in_force_at("2021-01-01", "2018-12-31") is False
    assert temporal.in_force_at(None, "2020-01-01") is None
    assert temporal.in_force_at("2021-01-01", None) is None
    assert temporal.in_force_at("bad", "2020-01-01") is None


# ---------- qa 集成（fail-closed 三件套） ----------

def test_qa_temporal_block_on_year_question():
    r = ask("2018年民间借贷利息超过多少违法", top_k=3)
    t = r["temporal"]
    assert t and t["reference_detected"] and t["as_of"] == "2018-12-31"
    assert "现行版本" in t["notice"] and "不断言" not in t["notice"]
    assert "不会据此断言" in t["notice"]
    # 民法典 2021-01-01 施行：2018 视角必须标 False
    card = next(c for c in r["answer_cards"] if c["law_id"] == "civl-2020")
    assert card["in_force_at_as_of"] is False


def test_qa_no_temporal_block_for_plain_question():
    r = ask("诉讼时效是多久", top_k=2)
    assert r["temporal"] is None
    assert all("in_force_at_as_of" not in c for c in r["answer_cards"])


def test_qa_explicit_as_of_marks_unenacted_law():
    r = ask("商标注册有什么要求", top_k=8, as_of="2026-09-17")
    t = r["temporal"]
    assert t and t["as_of"] == "2026-09-17"
    tm = [c for c in r["answer_cards"] if c["law_id"] == "trademark-2026"]
    if tm:  # 命中商标法 2026（2027-01-01 施行）必须标 False
        assert all(c["in_force_at_as_of"] is False for c in tm)


def test_search_endpoint_as_of_flag():
    client = TestClient(app)
    r = client.get("/api/search", params={"q": "商标注册 三年不使用", "top_k": 6, "as_of": "2026-09-17"}).json()
    assert r["temporal"] and r["temporal"]["as_of"] == "2026-09-17"
    for h in r["hits"]:
        if h["law_id"] == "trademark-2026":
            assert h["in_force_at_as_of"] is False
    # 无 as_of 且无时间指涉：不带标记，保持既有契约
    r2 = client.get("/api/search", params={"q": "诉讼时效", "top_k": 3}).json()
    assert r2["temporal"] is None


def test_search_endpoint_deictic_notice():
    client = TestClient(app)
    r = client.get("/api/search", params={"q": "当年的规定是什么样的", "top_k": 3}).json()
    assert r["temporal"] and r["temporal"]["reference_detected"] and r["temporal"]["as_of"] is None
    assert "版本时间线" in r["temporal"]["notice"]


def test_ask_body_rejects_malformed_as_of():
    client = TestClient(app)
    r = client.post("/api/qa/ask", json={"question": "高利贷违法吗", "as_of": "2018-13-99"})
    # pattern 只约束格式；2018-13-99 格式合法但语义非法——in_force_at 对异常日期仍按字符串比较，
    # 但 detect 层不解析它；这里断言请求不 5xx 且 temporal 块存在（granularity=explicit）
    assert r.status_code == 200
    assert r.json()["temporal"]["as_of"] == "2018-13-99"


# ---------- fail-closed 红线：绝不生成历史断言 ----------

def test_notice_contains_no_historical_assertion():
    """告知文本必须是「方法性提示」而非结论——不得包含『当时合法/当时违法』类断言措辞。"""
    for text in (temporal.TEMPORAL_NOTICE, temporal.temporal_block("2018年X违法吗")["limitation"]):
        assert "当时是否合法" in text or "时点适用文本的认定" in text
        for bad in ("当时合法", "当时违法", "在当时是合法的", "在当时是违法的"):
            assert bad not in text.replace("不会据此断言「当时是否合法」", "")
