# -*- coding: utf-8 -*-
"""g15 召回缺失收口（R435，ADR-0005 模式）：标价类问法的受控检索组钉住。

「标价」构词鸿沟：问句「经营者标价有哪些要求」的复合词「标价」在目标条文中拆为
「标明…价格」（crpl-imp-2024#10），原始 BM25 第 179 位、重排不可及（R435 诊断）。
处置=consumer-pricing 受控组（组查询=该条文规范词面，组内实测 #1=实施条例#10、
#2=价格法#13，双命中均合法答案）；when 限定标价类词面，不挤占欺诈/退货问法。

这里钉的是产品路径（qa/needs/search 共用的 orchestrated_search）——
raw 层词面地板由 test_gold_retrieval_gate 聚合阈值守护，两层口径分离。
"""
import pytest

from app import retrieval_terms as rt
from app.corpus import get_corpus

# R435 实测锚：标价类问法在编排层的名次（改动组词面/轮转规则前先跑这里）
QUESTIONS = [
    "经营者标价有哪些要求？",
    "经营者标价有哪些要求",
    "商品价签要写什么",
]
TARGET = ("crpl-imp-2024", 10)
# raw 组原句头部（价格法#13 明码标价）与本组（实施条例#10）同为合法答案——
# 受控组供位后 crpl#10 稳定在第 2 位（raw-query #1 之后）。
EXPECTED_RANK = 2


def test_pricing_words_trigger_consumer_pricing_group_first():
    groups = rt.controlled_groups("经营者标价有哪些要求")
    ids = [g["id"] for g in groups]
    assert "consumer-pricing" in ids
    assert ids.index("consumer-pricing") < ids.index("consumer-fraud"), \
        "条件组（标价类）必须排在无条件组之前优先供位"


def test_consumer_query_without_pricing_words_does_not_activate():
    ids = [g["id"] for g in rt.controlled_groups("网购假货想退货")]
    assert "consumer-pricing" not in ids, "无标价类词面时定价组不得激活"


@pytest.mark.parametrize("q", QUESTIONS)
def test_product_path_hits_crpl10(q):
    """R435 数据钉：标价类问法在产品路径（编排层）命中 crpl-imp-2024#10，名次不得漂移。"""
    c = get_corpus()
    res, meta = rt.orchestrated_search(c, q, top_k=5)
    got = [(h["law_id"], h["no"]) for h in res]
    rank = next((i for i, k in enumerate(got, 1) if k == TARGET), None)
    assert rank == EXPECTED_RANK, f"crpl#10 名次漂移：实测 r{rank}，R435 锚 r{EXPECTED_RANK}"
    assert "consumer-pricing" in [g["id"] for g in meta["groups"]]


def test_answer_cards_carry_pricing_article():
    """端到端：qa 答案卡必须携带实施条例#10；价格法#13（raw 组原句贡献）同样保留。"""
    from app import qa
    out = qa.ask("经营者标价有哪些要求？")
    nos = [(c["law_id"], c["article_no"]) for c in out["answer_cards"]]
    assert ("crpl-imp-2024", 10) in nos
    assert ("price-1997", 13) in nos  # raw 组原句贡献保留（R143 纪律：原句组参与轮转）
