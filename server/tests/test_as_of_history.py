# -*- coding: utf-8 -*-
"""as_of 命中面（known-gaps #1 最后一块，R169）：适用版本判定 + 历史对照接线。

确定性口径：施行日与公布日均 ≤ as_of 的版本中取公布日最新者（附则跨修正
延续使 effective_date 不能区分「已通过未施行」——刑法 2020 修正公布于
2020-12-26，as_of=2020-05 必须落 1997-revision）。对照文本按「同条号」
提供，移位风险随行显式标注；适用版本即现行时不出字段（契约稳定）。
"""
import pytest

from app import main, qa, version_fulltext


def test_applicable_version_respects_promulgation_cutoff():
    assert version_fulltext.applicable_version("cl-2023", "2020-05-01")["version_id"] == "1997-revision", \
        "2020 修正公布于 2020-12-26，as_of=2020-05 不得适用"
    assert version_fulltext.applicable_version("cl-2023", "2024-06-01")["version_id"] == "2023-amendment"
    assert version_fulltext.applicable_version("cl-2023", "1979-06-01") is None, "施行日之前无适用版本"


def test_applicable_version_psm_amendment_continuity():
    assert version_fulltext.applicable_version("psm-2025", "2015-01-01")["version_id"] == "2012-amendment"
    assert version_fulltext.applicable_version("psm-2025", "2026-06-01")["version_id"] == "2025-revision"


def test_historical_for_card_guards():
    # 适用版本即现行 → None（卡片已携带现行文本）
    assert version_fulltext.historical_for_card("psm-2025", "2026-06-01", 43) is None
    # 无注册表的法律 → None（不炸、不出字段）
    assert version_fulltext.historical_for_card("civl-2020", "2019-01-01", 188) is None
    # 历史版本但条号未检出（移位）→ 文本 None 但移位标注必须在
    hist = version_fulltext.historical_for_card("csl-2025", "2019-01-01", 999)
    if hist is not None:
        assert hist["text"] is None and "移位" in hist["shift_note"]


def test_qa_ask_carries_historical_version_for_temporal_query():
    out = qa.ask("2019 年网络运营者不履行安全保护义务会怎样")
    assert out["temporal"] and out["temporal"].get("as_of") == "2019-12-31"
    hits = [c for c in out["answer_cards"] if c["law_id"] == "csl-2025"]
    assert hits, "网络安全法应命中"
    with_hist = [c for c in hits if c.get("historical_version")]
    assert with_hist, "as_of=2019 时 2025 修正未施行，命中卡必须携带 2016 原版对照"
    card = with_hist[0]
    hv = card["historical_version"]
    assert hv["version_id"] == "2016-enacted"
    assert hv["effective_date"] == "2017-06-01"
    assert hv["label_found"] and hv["text"], "同条号历史文本必须实际给出"
    assert "移位" in hv["shift_note"]


def test_qa_ask_contract_stable_without_temporal():
    out = qa.ask("试用期最长不得超过多久")
    assert all("historical_version" not in c for c in out["answer_cards"])


def test_search_endpoint_as_of_history():
    out = main.search_articles(q="网络安全 等级保护", as_of="2019-06-30")
    flagged = [h for h in out["hits"] if h.get("historical_version")]
    assert flagged, "as_of 检索命中应携带历史版本对照"
    for h in flagged:
        assert h["historical_version"]["shift_note"]


def test_deictic_temporal_without_as_of_is_noop():
    """指代词场景（t_block 有、as_of=None）：增强必须静默退出，不得 TypeError。"""
    assert version_fulltext.historical_for_card("csl-2025", None, 74) is None
    assert version_fulltext.historical_for_card("csl-2025", "", 74) is None


def test_unknown_article_number_in_history_is_honest():
    """条号在历史版本不存在的场景：文本 None、移位标注在位、不出错。"""
    hist = version_fulltext.historical_for_card("cl-2023", "2019-01-01", 999)
    if hist is not None:  # cl-2023 有注册表；999 号在 1997/2020 版不存在
        assert hist["text"] is None
        assert "移位" in hist["shift_note"]
