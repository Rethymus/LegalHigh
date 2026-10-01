# -*- coding: utf-8 -*-
"""研究 CLI 历史模式测试（R496）。"""
import json
import sys
from pathlib import Path

SERVER = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SERVER))
sys.path.insert(0, str(SERVER / "scripts"))

from research_cli import build_history_receipt  # noqa: E402


def test_history_receipt_structure():
    r = build_history_receipt("高空抛物", 5, None)
    assert r["schema"] == "legalhigh-research-receipt/1" and r["kind"] == "history"
    assert r["hits"], "历史版本检索应命中"
    for h in r["hits"]:
        assert h["law_id"] and h["version_id"], "历史行必须携带 law_id + version_id"
        assert h["version_label"] is not None, "版本标签随行"
        assert h["effective_date"] is not None, "施行日期随行"


def test_history_receipt_deterministic_and_filtered():
    a = build_history_receipt("高空抛物", 5, None)
    b = build_history_receipt("高空抛物", 5, None)
    assert a["receipt_sha256"] == b["receipt_sha256"]
    # law_id 过滤
    c = build_history_receipt("高空抛物", 5, "psm-2025")
    for h in c["hits"]:
        assert h["law_id"] == "psm-2025"


def test_history_receipt_top_k():
    r = build_history_receipt("合同", 3, None)
    assert len(r["hits"]) <= 3
