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


def test_renumber_map_relocates_when_same_no_missing(monkeypatch):
    """重编号映射接入（R171）：同条号未命中时经映射祖先条号取历史文本。

    合成映射（真实语料条号稳定，无 renumbered 对——见 test_version_renumber）：
    适用版 1997 中「第384条」的内容系由前一版「第177条」重编号而来，卡片条号
    384 未在 1997 出现 → 反查映射得 177，返回 177 的文本并标注定位方式。
    """
    from app import version_renumber
    fake_map = {"law_id": "cl-2023", "pair_count": 1, "renumbered_count": 1, "pairs": [{
        "from_version": "1979-enacted", "to_version": "1997-revision",
        "matches": [{"from_no": 177, "from_sub": None, "to_no": 384, "to_sub": None,
                     "kind": "renumbered", "ratio": 0.91, "text_changed": False, "label": "第一百七十七条"}],
        "unmatched_from": [], "unmatched_to": [],
    }]}
    monkeypatch.setattr(version_renumber, "build_map", lambda law_id: fake_map)
    hist = version_fulltext.historical_for_card("cl-2023", "2020-05-01", 384)
    assert hist is not None and hist["text"], "映射命中必须给出历史文本"
    assert hist["located_via"] == "renumber-map"
    assert hist["mapped_from_no"] == 177 and hist["mapped_ratio"] == 0.91
    assert "经重编号映射定位（ratio 0.91）" in hist["shift_note"]


def test_renumber_map_identity_does_not_override(monkeypatch):
    """身份映射（from==to）不得改动同条号结果，也不得附带 located_via。"""
    from app import version_renumber
    fake_map = {"law_id": "cl-2023", "pair_count": 1, "renumbered_count": 0, "pairs": [{
        "from_version": "1979-enacted", "to_version": "1997-revision",
        "matches": [{"from_no": 17, "from_sub": None, "to_no": 17, "to_sub": None,
                     "kind": "same", "ratio": 1.0, "text_changed": True, "label": "第十七条"}],
        "unmatched_from": [], "unmatched_to": [],
    }]}
    monkeypatch.setattr(version_renumber, "build_map", lambda law_id: fake_map)
    hist = version_fulltext.historical_for_card("cl-2023", "2020-05-01", 17)
    assert hist is not None and hist["text"]
    assert "located_via" not in hist


def test_real_pair_identity_stays_plain(monkeypatch):
    """真实数据（条号稳定，零 renumbered）：cl-2023 对照卡不得出现 located_via。"""
    out = qa.ask("2019 年网络运营者不履行安全保护义务会怎样")
    for c in out["answer_cards"]:
        hv = c.get("historical_version")
        if hv:
            assert "located_via" not in hv


def test_unknown_article_number_in_history_is_honest():
    """条号在历史版本不存在的场景：文本 None、移位标注在位、不出错。"""
    hist = version_fulltext.historical_for_card("cl-2023", "2019-01-01", 999)
    if hist is not None:  # cl-2023 有注册表；999 号在 1997/2020 版不存在
        assert hist["text"] is None
        assert "移位" in hist["shift_note"]
