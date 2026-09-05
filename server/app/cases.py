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


def search_cases(q: str = "", level: str | None = None, verified_only: bool = True) -> list[dict]:
    """关键词检索（名称/案由/摘要/案号/焦点）；生产数据均须已核实。"""
    query = (q or "").strip().lower()
    out = []
    for c in load_cases():
        if verified_only and not c["verified"]:
            continue
        if level and c["level"] != level:
            continue
        if query:
            hay = " ".join([c["name"], c["cause"], c["summary"], c["no"], c["court"], *c["focus"]]).lower()
            if query not in hay:
                continue
        out.append(c)
    return out
