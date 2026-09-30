# -*- coding: utf-8 -*-
"""客户版通俗摘要测试（R470，litigation-analysis 三层输出的确定性实施）。"""
import sys
from pathlib import Path

SERVER = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SERVER))

from app import case_analysis  # noqa: E402

# 走真实 analyze_case（claim 模型经 corpus 校验）
TEXT = "2026年3月1日，张某通过银行转账向李某出借人民币五万元，约定一年后归还，到期未还，有借条和转账记录。"


def _analyze():
    ids = [t["id"] for t in __import__("app.legalmodel", fromlist=["TEMPLATES"]).TEMPLATES] \
        if hasattr(__import__("app.legalmodel", fromlist=["TEMPLATES"]), "TEMPLATES") else None
    return ids


def test_plain_summary_in_result_and_deterministic():
    out = case_analysis.analyze_case(TEXT, "测试", "loan_repayment")
    ps = out.get("plain_summary")
    assert ps and "模型" in ps and "12348" in ps
    assert "要件" not in ps, "客户版零术语"
    assert "不构成法律意见" in ps
    again = case_analysis.analyze_case(TEXT, "测试", "loan_repayment")
    assert again["plain_summary"] == ps, "同一输入恒同一输出（确定性）"


def test_plain_summary_counts_match_elements():
    out = case_analysis.analyze_case(TEXT, "测试", "loan_repayment")
    elements = out["claim"]["elements"]
    ok = sum(1 for e in elements if e["status"] == "supported")
    assert f"{ok} 项有材料提到" in out["plain_summary"]
    assert f"{len(elements)} 个问题" in out["plain_summary"]


def test_plain_summary_no_elements_fallback():
    empty = {"claim": {"claim": {"name": "x"}, "elements": []}}
    ps = case_analysis.build_plain_summary(empty)
    assert "没有可用的请求权要件结果" in ps
