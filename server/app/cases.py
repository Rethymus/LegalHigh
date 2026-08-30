# -*- coding: utf-8 -*-
"""案例样本库：加载与关键词检索。

数据纪律：仅收录可公开查证案件；sample=true 为演示「未核实」状态的占位记录，
API 层不拒绝返回但必须携带 verified=false 与 source_note，前端按「未核实」徽章渲染。
M6 接入官方判例库（授权路径）后，本文件由核验流程管理的数据替换。
"""
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


def search_cases(q: str = "", level: str | None = None, verified_only: bool = False) -> list[dict]:
    """关键词检索（名称/案由/摘要/案号/焦点），level 过滤来源层级。"""
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
