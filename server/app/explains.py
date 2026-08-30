# -*- coding: utf-8 -*-
"""法条通俗解读库（决策项4·双轨，2026-08-30 决议）。

结构：AI 起草 → 法律专业人员人工审核（status: draft → approved + reviewer）→ API 对外。
铁律：approved 之前一律不对外展示（宁缺毋假）；每条须可溯源（source_note 指向官方原文）；
(law_id, no) 必须存在于语料——加载时经 corpus 校验，不存在即启动报错（与审查点同款硬门）。
"""
import json
from functools import lru_cache
from pathlib import Path

from .corpus import get_corpus

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "article_explains.json"


@lru_cache(maxsize=1)
def load_explains() -> list[dict]:
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    corpus = get_corpus()
    for e in data["explains"]:
        # 引用不变量硬门：解读绑定的条文必须真实存在（与 review.build_checkpoints 同款）
        corpus.citation_of(e["law_id"], int(e["no"]))
    return data["explains"]


def review_queue() -> list[dict]:
    """待审核队列（draft 条目，供审核工作台）。"""
    return [e for e in load_explains() if e.get("status") != "approved" or not e.get("reviewer")]


def set_review(law_id: str, no: int, action: str, reviewer: str) -> dict:
    """审核动作：approve（draft→approved，须填真实审核人）/ reopen（approved→draft 重新审核）。
    写入 article_explains.json 的同时，审核责任字段（reviewer）落库——双轨的「人工」一环。"""
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    for e in data["explains"]:
        if e["law_id"] == law_id and int(e["no"]) == no:
            if action == "approve":
                if not reviewer.strip():
                    raise ValueError("approve 须填写真实审核人姓名（审核责任不可空）")
                e["status"], e["reviewer"] = "approved", reviewer.strip()
            elif action == "reopen":
                e["status"], e["reviewer"] = "draft", None
            else:
                raise ValueError(f"未知审核动作: {action}")
            DATA_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            load_explains.cache_clear()
            return e
    raise KeyError(f"explain not found: {law_id}#{no}")


def approved_for(law_id: str) -> dict[int, dict]:
    """指定法律的已审核解读（key=条号）。draft/缺 reviewer 的条目一律不返回。"""
    out: dict[int, dict] = {}
    for e in load_explains():
        if e["law_id"] != law_id or e.get("status") != "approved" or not e.get("reviewer"):
            continue
        out[int(e["no"])] = {
            "text": e["text"],
            "author": e["author"],
            "reviewer": e["reviewer"],
            "date": e.get("date"),
            "source_note": e.get("source_note"),
        }
    return out
