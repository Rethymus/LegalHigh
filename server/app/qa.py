# -*- coding: utf-8 -*-
"""引用式问答：检索 → 命中条文卡片。原型期回答层是「命中的法条原文」而非自由生成，
天然满足引用不变量；LLM 适配层为后续可选扩展（须逐句通过引用绑定校验）。"""
import re

from .corpus import get_corpus

DISCLAIMER = (
    "本系统为法律信息检索工具，输出内容为法条原文与程序性信息，不构成法律意见，"
    "亦不建立委托关系。重大事项请咨询执业律师或拨打 12348 公共法律服务热线。"
)

# 前提检查规则：检测问题中的错误前提并显式纠正（防迎合性回答，斯坦福 sycophancy 发现）。
# 每条规则的纠正内容都绑定本库语料中真实条文，不做无出处的「常识纠正」。
PREMISE_RULES = [
    {
        "id": "pr-7day",
        "pattern": r"(三十|30)\s*日?无理由退货",
        "warning": "「三十日无理由退货」这一前提不正确：网络等远程购物适用的是七日无理由退货。",
        "law_id": "cl-2013",
        "article_no": 25,
    },
    {
        "id": "pr-probation-12m",
        "pattern": r"试用[期]?[^。？?]{0,12}(一年|十二个月|12个月)",
        "warning": "「试用期一年」这一前提不正确：三年以上固定期限和无固定期限劳动合同，试用期上限为六个月。",
        "law_id": "lcl-2012",
        "article_no": 19,
    },
    {
        "id": "pr-probation-1y-cap",
        "pattern": r"试用期[^。？?]{0,20}(不得超过一年|最长一年)",
        "warning": "「试用期上限一年」这一前提不正确：法律规定的试用期上限为六个月。",
        "law_id": "lcl-2012",
        "article_no": 19,
    },
    {
        "id": "pr-deposit-triple",
        "pattern": r"(定金|订金)[^。？?]{0,16}(三倍|三倍返还|退一赔三)",
        "warning": "定金规则是「双倍返还」而非三倍：收受定金方违约致合同目的不能实现时应双倍返还；「退一赔三」是消费者欺诈惩罚性赔偿，二者不可混用。",
        "law_id": "civl-2020",
        "article_no": 587,
    },
    {
        "id": "pr-limitation-2y",
        "pattern": r"诉讼时效[^。？?]{0,10}(二年|2年|两年)",
        "warning": "「诉讼时效二年」这一前提不正确：向人民法院请求保护民事权利的普通诉讼时效期间为三年（2017 年 10 月起施行的民法典总则编即已改为三年，网络上大量旧文仍写两年）。",
        "law_id": "civl-2020",
        "article_no": 188,
    },
    {
        "id": "pr-id-seizure",
        "pattern": r"(扣押|扣留|收走|扣了?我?的?)[^。？?]{0,8}(身份证|证件|毕业证)",
        "warning": "「扣押证件」不合法：用人单位招用劳动者不得扣押居民身份证和其他证件，也不得要求提供担保或收取财物。",
        "law_id": "lcl-2012",
        "article_no": 9,
    },
]


def check_premise(question: str):
    corpus = get_corpus()
    for rule in PREMISE_RULES:
        if re.search(rule["pattern"], question):
            return {
                "rule_id": rule["id"],
                "warning": rule["warning"],
                "citation": corpus.citation_of(rule["law_id"], rule["article_no"]),
            }
    return None


def ask(question: str, top_k: int = 6):
    corpus = get_corpus()
    premise = check_premise(question)
    hits = corpus.search(question, top_k=top_k)
    cards = [
        {
            "law_id": h["law_id"],
            "law_title": h["law_title"],
            "law_status": h["law_status"],
            "effective_date": h["effective_date"],
            "promulgation_instrument": h["promulgation_instrument"],
            "article_no": h["no"],
            "article_label": h["label"],
            "chapter": h["chapter"],
            "text": h["text"],
            "source_url": h["source_url"],
            "source_kind": h["source_kind"],
            "score": h["score"],
        }
        for h in hits
    ]
    return {
        "question": question,
        "premise_check": premise,
        "answer_cards": cards,
        "no_answer": len(cards) == 0,
        "no_answer_message": (
            f"在本库语料（当前收录 {len(corpus.laws)} 部法律法规，共 {len(corpus.articles):,} 条）"
            "中未检索到与该问题相关的依据。"
            "本系统不会在无依据时生成内容——请更换表述或补充关键词。"
        ) if not cards else None,
        "disclaimer": DISCLAIMER,
        "retrieval_meta": {"method": "bm25-char-bigram", "top_k": top_k, "corpus_size": len(corpus.articles)},
    }
