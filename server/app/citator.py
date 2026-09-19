# -*- coding: utf-8 -*-
"""Citator 种子（FLERF 报告 §26；R165）。

「被引用于」反查：从已核实案例的 research_refs（case→law_id+no(+sub) 精确引用）
统计某部法律被哪些案例引用、哪些条文被引用最多。只做精确匹配——邻近/语义相似
都不是引用，不得混入；子条号（如刑法第253条之一）参与精确匹配（引用不变量）。
Shepard's/KeyCite 式「负面历史检查」（后续案例如何对待本条）的数据源暂不存在，
如实登记不提供、不推测。

权威分级沿用案例库口径：指导性案例（最高法「应当参照」）/ 外国判例（比较研究，
永不呈现为中国拘束性权威，LEGAL-003）。
"""
from . import cases as cases_mod

_LEVEL_ORDER = {"指导性案例": 0, "外国判例": 1}


def _ref_key(r: dict) -> tuple[int, str] | None:
    no = r.get("no")
    if no is None:
        return None
    try:
        return (int(no), str(r.get("sub") or ""))
    except (TypeError, ValueError):
        return None


def cited_by(law_id: str) -> dict:
    """law 级聚合：被引案例清单（精确 law_id 匹配）+ 逐条文被引计数。"""
    matches: list[dict] = []
    article_counts: dict[tuple[int, str], int] = {}
    for c in cases_mod.load_cases():
        if not c.get("verified"):
            continue
        keys = []
        for r in (c.get("research_refs") or []):
            if r.get("law_id") != law_id:
                continue
            k = _ref_key(r)
            if k:
                keys.append(k)
        if not keys:
            continue
        cited = sorted(set(keys))
        matches.append({
            "id": c["id"], "name": c["name"], "case_no": c.get("no"),
            "court": c.get("court"), "date": c.get("date"),
            "level": c.get("level"), "kind": c.get("kind"),
            "cited_articles": [{"no": no, "sub": sub or None} for no, sub in cited],
        })
        for k in set(keys):
            article_counts[k] = article_counts.get(k, 0) + 1

    matches.sort(key=lambda c: ((c.get("date") or ""), _LEVEL_ORDER.get(c.get("level") or "", 9)),
                 reverse=True)
    by_level: dict[str, int] = {}
    for c in matches:
        by_level[c["level"]] = by_level.get(c["level"], 0) + 1

    return {
        "law_id": law_id,
        "case_count": len(matches),
        "by_level": by_level,
        "articles": [{"no": no, "sub": sub or None, "case_count": n}
                     for (no, sub), n in sorted(article_counts.items(), key=lambda kv: (-kv[1], kv[0]))],
        "cases": matches,
        "negative_history_note": "负面历史检查（后续案例/修法如何对待本条）暂无数据源，本系统不提供、不推测。",
        "scope_note": "只统计已核实案例 research_refs 中的精确引用；不冒充全国裁判文书层面的引用全景。",
    }


def cited_by_article(law_id: str, no: int, sub: str | None = None) -> list[dict]:
    """article 级：精确引用本条（law_id+no(+sub)）的案例清单。"""
    key = (int(no), sub or "")
    out = []
    for c in cited_by(law_id)["cases"]:
        keys = {(a["no"], a.get("sub") or "") for a in c["cited_articles"]}
        if key in keys:
            out.append(c)
    return out
