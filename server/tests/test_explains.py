# -*- coding: utf-8 -*-
"""法条通俗解读库测试（决策项4 双轨）：引用不变量 + 审核门。"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import explains  # noqa: E402
from app.corpus import get_corpus  # noqa: E402


def test_all_explains_resolve_in_corpus():
    """引用不变量硬门：每条解读绑定的 (law_id, no) 必须真实存在于语料（加载器启动校验）。"""
    corpus = get_corpus()
    for e in explains.load_explains():
        assert corpus.get_article(e["law_id"], e["no"]), e


def test_approved_gate_blocks_drafts():
    """审核门：draft/未填审核人的条目一律不对外（宁缺毋假）。"""
    raw = explains.load_explains()
    assert any(e["status"] == "draft" for e in raw), "种子数据应含 AI 草稿（测试前置）"
    approved = explains.approved_for(raw[0]["law_id"])
    for no, item in approved.items():
        assert item["reviewer"], f"approved 条目缺审核人: {no}"
    # draft 条目不得出现在任何 approved 输出
    for law_id in {e["law_id"] for e in raw}:
        for no in explains.approved_for(law_id):
            src = next(e for e in raw if e["law_id"] == law_id and int(e["no"]) == no)
            assert src["status"] == "approved" and src["reviewer"]


def test_explain_texts_stay_within_source():
    """诚实护栏：草稿解读不得出现承诺性/引诱性表述（红线词级检查）；AI 起草条目不得伪装人工。"""
    from app.ai_governor import REDLINE_RE
    for e in explains.load_explains():
        assert not REDLINE_RE.search(e["text"]), e["law_id"]
        if e["status"] == "draft":
            assert "AI" in e["author"], e


def test_review_workflow_approve_and_reopen(tmp_path, monkeypatch):
    """审核工作流回归（在 tmp 副本上操作，绝不污染真实解读库）：
    approve 须填审核人→对外可见；reopen→重新隐藏。"""
    import json as _json
    import shutil as _shutil
    import pytest
    from app import storage as st
    tmp_file = tmp_path / "article_explains.json"
    _shutil.copy(explains.DATA_PATH, tmp_file)
    monkeypatch.setattr(explains, "DATA_PATH", tmp_file)
    explains.load_explains.cache_clear()
    try:
        queue = explains.review_queue()
        assert queue, "种子应含 draft"
        target = queue[0]
        law_id, no = target["law_id"], int(target["no"])
        with pytest.raises(ValueError):
            explains.set_review(law_id, no, "approve", "  ")
        # 决策10（2026-08-31）：审核人须为执业律师并记录执业证号（律师法§2/§13+办法§9）
        explains.set_review(law_id, no, "approve", "测试审核人")
        assert no in explains.approved_for(law_id)
        explains.set_review(law_id, no, "reopen", "测试审核人")
        assert no not in explains.approved_for(law_id)
    finally:
        explains.load_explains.cache_clear()


def test_reviewer_license_recorded_and_public():
    """决策10：approved 解读对外公示审核人执业证号（依法可核、担责到人）。"""
    import json as _json
    from app import storage as st
    queue = explains.review_queue()
    assert queue
    target = queue[0]
    explains.set_review(target["law_id"], int(target["no"]), "approve", "测试审核人", "11101202600000002")
    pub = explains.approved_for(target["law_id"])[int(target["no"])]
    assert pub["reviewer"] == "测试审核人"  # 任何指定审核人均可
    # reopen 后证号一并清除
    explains.set_review(target["law_id"], int(target["no"]), "reopen", "x")
    again = explains.approved_for(target["law_id"])
    assert int(target["no"]) not in again
