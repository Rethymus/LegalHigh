# -*- coding: utf-8 -*-
"""版本对比（difflib 标准库）与审查记录列表测试。"""
from app import compare, storage  # noqa: E402


def test_diff_texts_ops():
    out = compare.diff_texts(
        "第一条 甲方负责开发。\n第二条 逾期按日支付 5% 违约金。\n第三条 争议由乙方所在地法院管辖。",
        "第一条 甲方负责开发。\n第二条 逾期按日支付 0.05% 违约金。\n第四条 本合同一式两份。",
    )
    assert out["ops"], "存在差异时应产出操作块"
    mod = next(o for o in out["ops"] if o["type"] == "replace")
    assert any("0.05%" in ln for ln in mod["b_lines"])
    assert out["stats"]["added"] >= 1 and out["stats"]["deleted"] >= 1 and out["stats"]["modified_lines"] >= 1


def test_diff_identical(tmp_db=None):
    out = compare.diff_texts("同文", "同文")
    assert out["ops"] == [] and out["stats"]["op_count"] == 0


def test_list_reviews_summary(tmp_db):
    from app import review as review_mod
    result = review_mod.analyze_contract(
        "第一条 违约金：任何一方违约按日支付 30% 违约金。", "列表测试合同")
    rid = storage.create_review(result["title"], "文本", result)
    rows = storage.list_reviews()
    assert rows[0]["id"] == rid and rows[0]["title"] == "列表测试合同"
    assert rows[0]["findings"] >= 1
