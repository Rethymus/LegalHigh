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


import re

LICENSE_NO_RE = re.compile(r"^\d{10,20}$")


def set_review(law_id: str, no: int, action: str, reviewer: str, license_no: str | None = None) -> dict:
    """审核动作：approve（draft→approved，须执业律师真实姓名+执业证号）/ reopen。
    合法性依据（决策10·2026-08-31）：《律师法》第2条——律师是依法取得执业证书、
    为当事人提供法律服务的执业人员，第13条禁止非律师以律师名义执业；《生成式AI办法》
    第9条——内容生产者责任。故面向公众的「人工审核」签发人必须为执业律师，
    姓名与执业证号一并公示（担责可核）。"""
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    for e in data["explains"]:
        if e["law_id"] == law_id and int(e["no"]) == no:
            if action == "approve":
                name = (reviewer or "").strip()
                lic = (license_no or "").strip()
                if not name:
                    raise ValueError("approve 须填写审核人真实姓名（审核责任不可空）")
                if not LICENSE_NO_RE.match(lic):
                    raise ValueError("approve 须填写审核人《律师执业证》证号（10-20 位数字，依法公示可核）")
                e["status"], e["reviewer"] = "approved", name
                e["reviewer_license_no"] = lic
            elif action == "reopen":
                e["status"], e["reviewer"], e["reviewer_license_no"] = "draft", None, None
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
            "reviewer_license_no": e.get("reviewer_license_no"),
            "date": e.get("date"),
            "source_note": e.get("source_note"),
        }
    return out
