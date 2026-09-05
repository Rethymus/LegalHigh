# -*- coding: utf-8 -*-
"""官方解读关联层（决策项15）：法条 → 对应的司法解释条文。

数据纪律与 explains 同款：加载时逐条经 corpus 校验（law 与 ref 条文都必须存在），
不存在即启动报错。链接关系由人工从解释原文逐条核实后录入。
"""
import json
from functools import lru_cache
from pathlib import Path

from .corpus import get_corpus

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "article_links.json"


@lru_cache(maxsize=1)
def load_links() -> dict[str, list[dict]]:
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    corpus = get_corpus()
    out: dict[str, list[dict]] = {}
    for key, refs in data["links"].items():
        law_id, no_raw = key.split(":")
        no = int(no_raw)
        if not corpus.get_article(law_id, no):
            raise KeyError(f"links 源法条不存在: {key}")
        cleaned = []
        for r in refs:
            cit = corpus.citation_of(r["law_id"], int(r["no"]))  # 不存在即 KeyError
            cleaned.append({"law_id": r["law_id"], "no": int(r["no"]), "label": cit["article_label"],
                            "text": cit["text"], "note": r.get("note", ""),
                            # 关联解释也是对外引用，不能只给标题/正文而丢失版本、
                            # 生效日期与快照来源字段。
                            "ref_title": cit["law_title"], "ref_status": cit["status"],
                            "ref_effective_date": cit["effective_date"],
                            "ref_promulgation_instrument": cit["promulgation_instrument"],
                            "ref_source_url": cit["source_url"],
                            "ref_source_kind": cit["source_kind"]})
        out.setdefault(law_id, {})[no] = cleaned
    return out


def links_for(law_id: str, no: int) -> list[dict]:
    return load_links().get(law_id, {}).get(no, [])
