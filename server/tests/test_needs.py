# -*- coding: utf-8 -*-
"""需求解析管线测试：确定性降级 / 法条引用不变量 / 官方链接在场 / AI 解析 JSON 契约。"""
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
        assert c["official_entries"], "案例必须携带官方发布入口"
        for e in c["official_entries"]:
            assert e["url"].startswith("https://")


def test_parse_too_short(tmp_db):
    with pytest.raises(ValueError):
        needs.parse_needs("合同")


def test_ai_parse_json_contract(tmp_db, monkeypatch):
    """AI 理解层契约：合法 JSON → 结构化；非法 JSON → ValueError 降级路径。"""
    good = '{"understood":"拖欠劳动报酬","issue_type":"劳动","assumed_causes":["追索劳动报酬"],' \
           '"keywords":["劳动报酬","拖欠工资"],"cautions":["保留劳动合同与考勤记录"]}'
    monkeypatch.setattr(needs.ai_governor, "chat",
                        lambda *a, **k: {"text": "```json\n" + good + "\n```", "blocked": False})
    p = needs.ai_parse("老板不发工资", provider_id="deepseek", model="m", api_key="k" + "ey")
    assert p["issue_type"] == "劳动" and "劳动报酬" in p["keywords"] and p["by"].startswith("ai:")

    monkeypatch.setattr(needs.ai_governor, "chat",
                        lambda *a, **k: {"text": "抱歉我不能输出JSON", "blocked": False})
    with pytest.raises(ValueError):
        needs.ai_parse("老板不发工资", provider_id="deepseek", model="m", api_key="k" + "ey")


def test_ai_blocked_output(tmp_db, monkeypatch):
    monkeypatch.setattr(needs.ai_governor, "chat",
                        lambda *a, **k: {"text": "……", "blocked": True})
    with pytest.raises(ValueError, match="红线"):
        needs.ai_parse("x", provider_id="deepseek", model="m", api_key="k" + "ey")


def test_deterministic_keywords_noise_filtered():
    """D4 回归：度量/数词切分噪声（三个/个月）与域词子串冗余（工资⊂工资支付）不得进入关键词。"""
    from app.needs import deterministic_parse
    p = deterministic_parse("老板拖欠我三个月工资还不给离职证明")
    kws = p["keywords"]
    assert "三个" not in kws and "个月" not in kws, kws
    assert "工资" not in kws, kws  # 是「工资支付」的子串
    assert "劳动报酬" in kws and "工资支付" in kws  # 域词保留且在前
