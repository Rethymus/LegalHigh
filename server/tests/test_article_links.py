# -*- coding: utf-8 -*-
"""官方解读关联层测试（决策项15）：引用不变量 + 映射真实性。"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import article_links  # noqa: E402
from app.corpus import get_corpus  # noqa: E402


def test_links_resolve_in_corpus():
    """引用不变量：每个映射的 (law_id, no) 都必须真实存在于语料（加载器硬校验）。"""
    links = article_links.load_links()
    corpus = get_corpus()
    for law_id, refs_by_no in links.items():
        assert all(corpus.get_article(law_id, int(no)) for no in refs_by_no), law_id
        for no in refs_by_no:
            assert corpus.get_article(law_id, int(no)), f"源法条缺失: {law_id}#{no}"
            for e in refs_by_no[no]:
                assert corpus.get_article(e["law_id"], e["no"]), e


def test_mapping_targets_are_known():
    """链接映射只收录已核实的条目：当前 5 条引用关系（585/496×2/25×2），宁缺毋假。"""
    n = sum(len(refs) for law in article_links.load_links().values() for refs in law.values())
    assert n >= 5, n


def test_link_target_carries_citation_invariants():
    """关联司法解释不能丢失版本/生效日期/来源字段。"""
    item = article_links.links_for("civl-2020", 496)[0]
    for key in ("ref_status", "ref_effective_date", "ref_promulgation_instrument",
                "ref_source_url", "ref_source_kind"):
        assert key in item
    assert item["ref_effective_date"] and item["ref_source_url"].startswith("http")
