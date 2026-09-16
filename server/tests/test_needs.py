# -*- coding: utf-8 -*-
"""确定性需求解析：关键词、引用不变量与案例直接来源。"""
import re

import pytest

from app import needs  # noqa: E402


def test_parse_deterministic_fallback(tmp_db):
    """无 AI 配置：确定性关键词抽取 + 真实法条取证（引用不变量）。"""
    out = needs.parse_needs("老板拖欠我三个月工资一直不发放，我应该怎么维权")
    assert out["parse"]["by"] == "deterministic"
    assert out["parse"]["keywords"]
    assert out["articles"], "语料含劳动合同法/民法典，工资问题必须命中条文"
    for a in out["articles"]:
        assert a["official_entry"].startswith("https://flk.npc.gov.cn")
        assert a["snapshot_url"].startswith("http")
        assert a["status"] and a["effective_date"]


def test_parse_cases_official_entries(tmp_db):
    out = needs.parse_needs("交通事故受伤对方全责能不能获得赔偿")
    for c in out["cases"]:
        assert c["verified"] is True
        assert c["official_entries"], "案例必须携带直接核验来源"
        assert c["source_url"] == c["official_entries"][0]["url"]
        # 核验日随采集轮次推进（R131 升级为 2026-09-16 官方快照核验），冻结具体日期会让合法更新变成假失败
        assert re.fullmatch(r"\d{4}-\d{2}-\d{2}", c["source_accessed_at"])
        for e in c["official_entries"]:
            assert e["url"].startswith("https://")


def test_parse_too_short(tmp_db):
    with pytest.raises(ValueError):
        needs.parse_needs("合同")


def test_deterministic_keywords_noise_filtered():
    """D4 回归：度量/数词切分噪声（三个/个月）与域词子串冗余（工资⊂工资支付）不得进入关键词。"""
    from app.needs import deterministic_parse
    p = deterministic_parse("老板拖欠我三个月工资还不给离职证明")
    kws = p["keywords"]
    assert "三个" not in kws and "个月" not in kws, kws
    assert "工资" not in kws, kws  # 是「工资支付」的子串
    assert "劳动报酬" in kws and "工资支付" in kws  # 域词保留且在前


def test_keywords_display_curated():
    """决策项2 回归：有域词时展示层只显示域词（跨词二元组「板拖」不外露）；
    检索用完整 keywords（bigram 噪声对 BM25 无害），两列分离。"""
    out = needs.parse_needs("老板拖欠我三个月工资还不给离职证明")
    disp = out["parse"]["keywords_display"]
    assert disp == ["劳动报酬", "劳动合同", "工资支付"], disp
    assert "板拖" not in disp and "资还" not in disp
    assert "板拖" in out["parse"]["keywords"]  # 检索层不动


def test_intake_plan_keeps_user_facts_and_reports_gaps(tmp_db):
    out = needs.build_intake_plan({
        "summary": "公司拖欠两个月工资",
        "timeline": ["2026年6月开始未发工资", "2026年8月向公司询问未获答复"],
        "actual_outcome": "两个月工资仍未到账",
        "parties": ["劳动者（本人）", "用人单位"],
        "evidence_owned": ["劳动合同", "与人事的聊天记录"],
        "evidence_missing": ["工资表"],
        "desired_outcome": "了解追索工资前应准备什么",
        "questions": ["应当先向哪里反映"],
    })
    assert out["intake"]["timeline"][0] == "2026年6月开始未发工资"
    assert out["intake"]["method"].startswith("user-confirmed-facts")
    assert out["intake"]["missing_questions"] == []
    assert out["intake"]["issue_candidates"][0]["id"] == "labor-pay"
    assert out["intake"]["issue_candidates"][0]["fact_basis"]
    assert any(x["item"] == "工资表" and x["state"] == "待取得/待确认" for x in out["intake"]["evidence_checklist"])
    assert out["articles"]


def test_intake_plan_never_invents_missing_facts(tmp_db):
    out = needs.build_intake_plan({"summary": "房东不退押金"})
    assert out["intake"]["timeline"] == []
    assert out["intake"]["parties"] == []
    assert len(out["intake"]["missing_questions"]) >= 4
    assert all(x["source"] != "AI" for x in out["intake"]["evidence_checklist"])
    assert all(x["id"].startswith("material-") for x in out["intake"]["evidence_checklist"])


def test_intake_unknown_never_defaults_to_loan_model(tmp_db):
    out = needs.build_intake_plan({
        "summary": "我收到一封内容看不懂的通知",
        "actual_outcome": "目前没有采取行动",
        "questions": ["这是不是借贷纠纷"],
    })
    assert out["intake"]["issue_candidates"][0]["id"] == "unknown"
    assert "借款合同" not in out["parse"]["keywords"]
