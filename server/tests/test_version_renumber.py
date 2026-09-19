# -*- coding: utf-8 -*-
"""跨版本条号重编号映射（known-gaps #1，R170）：确定性对齐的机械检查。

对齐语义（优先级从高到低）：同键身份（同条号即同槽位，text_changed 标记修改）→
文本全同移位 → difflib 模糊移位（阈值 0.85）；其余进 unmatched 两侧如实报告。
纯确定性派生：同输入恒同输出。
"""
import pytest

from app import main, version_renumber


def test_alignment_semantics_on_criminal_law():
    """1979→1997 全面修定（192 条全改写）→ 全部身份映射且 text_changed；1997→2020 基础条号稳定。"""
    m = version_renumber.build_map("cl-2023")
    p79 = next(p for p in m["pairs"] if p["from_version"] == "1979-enacted")
    assert p79["unmatched_from"] == [], "同条号身份映射下 1979 版不得有未匹配出边"
    assert all(x["kind"] == "same" and x["text_changed"] for x in p79["matches"])
    p97 = next(p for p in m["pairs"] if p["from_version"] == "1997-revision")
    assert p97["matches"][0]["to_no"] == p97["matches"][0]["from_no"]
    assert any(x["text_changed"] for x in p97["matches"]), "刑法修正案改动条必须被 text_changed 标记"


def test_chronological_pair_order():
    """注册表数组顺序跨法不一致——版本对必须按公布日升序构造。"""
    m = version_renumber.build_map("pcl-2023")
    order = [p["from_version"] for p in m["pairs"]]
    dates = ["1991", "2007", "2012", "2017"]
    assert order == ["1991-enacted", "2007-amendment", "2012-amendment", "2017-amendment"], \
        "民诉法相邻对必须按时间升序（1991→2007→2012→2017→2021）"


def test_deterministic_repeat():
    a = version_renumber.build_map("minor-2024")
    b = version_renumber.build_map("minor-2024")
    assert a == b


def test_known_sub_article_not_lost():
    """刑法 2020 的 253之一（子条号）必须出现在 1997→2020 对的 unmatched_to（新增）中。"""
    m = version_renumber.build_map("cl-2023")
    p = next(p for p in m["pairs"] if p["to_version"] == "2020-amendment")
    keys = {(no, sub or "") for no, sub in p["unmatched_to"]}
    assert (253, "之一") in keys, "修正案新增的子条号应作为新增条出现在 unmatched_to"


def test_endpoint_matrix():
    """语义对齐 versions 端点（R180）：无 pair → 200 空映射（前端静默降级；
    404 会给每页控制台留错误日志——R176 全站巡检证伪了 404 语义后修正）；
    law 不在语料仍 404。"""
    out = main.law_renumber_map("civl-2020")  # 单版本、无历史全文
    assert out["pair_count"] == 0
    assert out["scope_note"]
    with pytest.raises(Exception) as e2:
        main.law_renumber_map("no-such-law")
    assert getattr(e2.value, "status_code", None) == 404


def test_endpoint_public_shape():
    out = main.law_renumber_map("cl-2023")
    assert out["pair_count"] == 2
    for p in out["pairs"]:
        for x in p["matches"]:
            assert x["kind"] in {"same", "renumbered"}
            if x["kind"] == "same":
                assert isinstance(x["text_changed"], bool)
    assert "确定性对齐" in out["scope_note"]


def test_lookup_exact_pair_only():
    assert version_renumber.lookup("cl-2023", "1997-revision", "2020-amendment", 384) is not None
    # 非相邻版本对不做链式推断
    assert version_renumber.lookup("cl-2023", "1979-enacted", "2020-amendment", 17) is None
