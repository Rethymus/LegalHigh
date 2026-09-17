# -*- coding: utf-8 -*-
"""案例库：只加载公开可核验且带直接来源链接的真实案件。"""
import json
from functools import lru_cache
from pathlib import Path

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "cases.json"


@lru_cache(maxsize=1)
def load_cases() -> list[dict]:
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    return data["cases"]


def get_case(case_id: str) -> dict | None:
    for c in load_cases():
        if c["id"] == case_id:
            return c
    return None


# R146 字段权重（section-aware retrieval，known-gaps 次项）：案例检索按字段加权——
# 「类似案情」问法走 facts 偏向（Facts↔Facts 比对），「为什么这么判」走 reasoning
# 偏向（Holding/Result 主导）；默认均衡。权重经确定性 bigram 存在性×字段权重计分，
# 排序稳定（同分按 id），不引入新引擎。
_FIELD_WEIGHTS = {
    "balanced": {"name": 1, "no": 2, "cause": 2, "focus": 2, "summary": 2, "facts": 2, "holding": 2, "result": 1},
    # 「类似案情」：只比 Facts↔Facts——holding/result 零权重（防止裁判理由词面挤占事实相似度）
    "facts": {"name": 1, "no": 1, "cause": 2, "focus": 2, "summary": 1, "facts": 4, "holding": 0, "result": 0},
    # 「为什么这么判」：Holding/Result 主导——facts 零权重（报告 §14 的权重分野）
    "reasoning": {"name": 1, "no": 1, "cause": 1, "focus": 2, "summary": 1, "facts": 0, "holding": 4, "result": 3},
}
BIAS_OPTIONS = tuple(_FIELD_WEIGHTS)


def _bigrams(text: str) -> set[str]:
    t = "".join(ch for ch in (text or "") if not ch.isspace())
    return {t[i:i + 2] for i in range(len(t) - 1)} if len(t) >= 2 else ({t} if t else set())


def _case_field_text(c: dict, field: str) -> str:
    v = c.get(field)
    if isinstance(v, list):
        return " ".join(str(x) for x in v)
    return str(v or "")


def _field_weighted_score(query_bigrams: set[str], c: dict, weights: dict[str, int]) -> int:
    score = 0
    for field, weight in weights.items():
        if weight <= 0:
            continue
        fgrams = _bigrams(_case_field_text(c, field))
        score += weight * len(query_bigrams & fgrams)
    return score


def search_cases(q: str = "", level: str | None = None, verified_only: bool = True,
                 bias: str = "balanced") -> list[dict]:
    """案例检索（R146 字段加权）：候选=查询 bigram 命中任一索引字段；排序=字段权重计分。

    - 召回比旧子串过滤宽（facts/holding/result 入索引——「案情相似」类问法可命中）；
      精确案号/名称子串命中仍排最前（exact boost）。
    - bias：balanced（默认）/facts（类似案情）/reasoning（裁判理由）——同一查询
      不同偏向可改变排名（确定性，无随机性）。
    """
    query = (q or "").strip()
    bias = bias or "balanced"
    if bias not in _FIELD_WEIGHTS:
        raise ValueError(f"bias 须为 {BIAS_OPTIONS} 之一")
    weights = _FIELD_WEIGHTS[bias]
    ql = query.lower()
    qbigrams = _bigrams(query)
    out: list[tuple[int, int, str, dict]] = []
    for c in load_cases():
        if verified_only and not c["verified"]:
            continue
        if level and c["level"] != level:
            continue
        if not query:
            out.append((0, 0, c["id"], c))
            continue
        hay_all = " ".join(_case_field_text(c, f) for f in weights).lower()
        exact = 1 if ql in hay_all else 0  # 子串命中（案号/全名）保底最优先
        score = _field_weighted_score(qbigrams, c, weights) if qbigrams else 0
        if exact or score > 0:
            out.append((exact, score, c["id"], c))
    out.sort(key=lambda t: (-t[0], -t[1], t[2]))
    return [c for _, _, _, c in out]
