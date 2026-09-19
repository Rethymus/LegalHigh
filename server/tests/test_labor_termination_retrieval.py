# -*- coding: utf-8 -*-
"""known-gaps #9 收口（R166，ADR-0005）：劳动解除受控检索组的机械钉住。

「开除/辞退」类口语词面在 108 部语料中与证券法 125/147 等跨法域撞车
（基线 5 组金标 4 MISS）。处置=labor-termination 受控主题组（组查询=目标条文
规范词面）+ 条件试用期组（when 命中即优先供位）；raw 层金标门（词面地板）不变。

这里钉的是产品路径（qa/needs/search 共用的 orchestrated_search）——
raw 层词面地板由 test_gold_retrieval_gate 聚合阈值守护，两层口径分离。
"""
import pytest

from app import retrieval_terms as rt
from app.corpus import get_corpus

# R166 ADR-0005 实测锚：5 组新增金标的编排层名次（改动组词面/轮转规则前先跑这里）
EXPECTED_RANKS = {
    "gold-labor-fired-comp": 2,
    "gold-labor-fired-notice": 2,
    "gold-labor-severe-rules": 5,
    "gold-labor-severance-calc": 1,
    "gold-labor-probation-fired": 2,
}
QUESTIONS = {
    "gold-labor-fired-comp": "公司突然把我开除了有没有赔偿",
    "gold-labor-fired-notice": "被公司辞退没有提前一个月通知合法吗",
    "gold-labor-severe-rules": "上班迟到几次公司能开除我吗",
    "gold-labor-severance-calc": "被辞退应该补我几个月工资",
    "gold-labor-probation-fired": "试用期被开除有补偿吗",
}
EXPECTS = {
    "gold-labor-fired-comp": [("lcl-2012", 87), ("lcl-2012", 47)],
    "gold-labor-fired-notice": [("lcl-2012", 40), ("lcl-2012", 87)],
    "gold-labor-severe-rules": [("lcl-2012", 39)],
    "gold-labor-severance-calc": [("lcl-2012", 47), ("lcl-2012", 46)],
    "gold-labor-probation-fired": [("lcl-2012", 21)],
}


def test_firing_questions_trigger_labor_groups():
    groups = rt.controlled_groups("公司突然把我开除了")
    ids = [g["id"] for g in groups]
    assert "termination-illegal" in ids and "termination-comp" in ids
    assert "termination-probation" not in ids, "未提及试用期时条件组不得激活"


def test_probation_group_conditional_and_hoisted():
    groups = rt.controlled_groups("试用期被开除有补偿吗")
    ids = [g["id"] for g in groups]
    assert ids.index("termination-probation") < ids.index("termination-illegal"), \
        "条件命中组必须排在无条件组之前优先供位"
    assert rt.controlled_groups("公司辞退我")[ 0]["id"] != "termination-probation"


def test_consumer_topic_unaffected():
    groups = rt.controlled_groups("网购假货想退货")
    assert groups and all(g["topic"] == "consumer" for g in groups)


@pytest.mark.parametrize("gid", list(QUESTIONS))
def test_product_path_hits_gold_question(gid):
    """ADR-0005 数据钉：5 组问法在产品路径（编排层）全部命中，名次不得漂移。"""
    c = get_corpus()
    res, meta = rt.orchestrated_search(c, QUESTIONS[gid], top_k=5)
    got = [(h["law_id"], h["no"]) for h in res]
    rank = next((i for i, k in enumerate(got, 1) if k in EXPECTS[gid]), None)
    assert rank == EXPECTED_RANKS[gid], f"{gid} 名次漂移：实测 r{rank}，ADR-0005 锚 r{EXPECTED_RANKS[gid]}"


def test_answer_cards_carry_labor_articles_for_badcase():
    """端到端：badcase 原句的答案卡必须携带劳动法域目标条文（证券法可占 raw 首位）。"""
    from app import qa
    out = qa.ask("公司今天突然把我开除了")
    nos = [(c["law_id"], c["article_no"]) for c in out["answer_cards"]]
    assert ("lcl-2012", 87) in nos or ("lcl-2012", 47) in nos
    assert ("securities-2019", 125) in nos  # raw 组原句贡献保留（R143 纪律：原句组参与轮转）
