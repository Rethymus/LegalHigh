# -*- coding: utf-8 -*-
"""场景化法律路径（第十六轮）：高频真实场景的端到端指引。

将需求解析→法条→司法解释→文书模板→时效提醒按场景串联。
每个场景的法条编号从语料原文逐条核实后才录入（宁缺毋假）。
"""
import json
from functools import lru_cache
from pathlib import Path

from .corpus import get_corpus

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "scenarios.json"


@lru_cache(maxsize=1)
def load_scenarios() -> list[dict]:
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    corpus = get_corpus()
    for sc in data["scenarios"]:
        for ref in sc.get("statute_refs", []):
            corpus.get_article(ref["law_id"], int(ref["no"]))  # 不存在即报错
    return data["scenarios"]


def match_scenarios(text: str) -> list[dict]:
    """按关键词匹配场景（按命中关键词数降序）。"""
    text_lower = (text or "").lower()
    scored = []
    for sc in load_scenarios():
        hits = sum(1 for kw in sc["keywords"] if kw in text_lower)
        if hits > 0:
            scored.append((hits, sc))
    scored.sort(key=lambda x: -x[0])
    return [sc for _, sc in scored]
