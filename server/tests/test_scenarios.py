# -*- coding: utf-8 -*-
"""场景化法律路径测试。"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import scenarios  # noqa: E402


def test_scenarios_load_and_validate():
    """加载器硬校验：所有 statute_refs 的法条编号都必须真实存在于语料。"""
    from app.corpus import get_corpus
    corpus = get_corpus()
    all_sc = scenarios.load_scenarios()
    assert len(all_sc) >= 5
    for sc in all_sc:
        for ref in sc.get("statute_refs", []):
            assert corpus.get_article(ref["law_id"], int(ref["no"])), f"{sc['id']}: {ref}"


def test_match_by_keywords():
    """关键词匹配：拖欠工资→wage-arrears，退货→online-return。"""
    matches = scenarios.match_scenarios("老板拖欠工资三个月")
    assert matches and matches[0]["id"] == "wage-arrears"
    matches = scenarios.match_scenarios("网购东西要退货")
    assert matches and matches[0]["id"] == "online-return"
