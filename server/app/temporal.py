# -*- coding: utf-8 -*-
"""AS_OF_DATE 时间效力层（R144，known-gaps 首项的 fail-closed 实现）。

设计边界（LEGAL-004）：本地语料只收录各法**现行版本**全文；历史版本仅登记在
版本注册表（law_versions/）不进检索。因此本层不「回答历史上适用哪一版条文」——
它做三件事且只做这三件：

1. 检测：问题中的时间指涉（明确年份 / 当年·那时候等指代词）；
2. 标记：给定 as_of 时，为每条命中计算 `in_force_at_as_of`
   （以语料 effective_date 为现行文本适用起点；法内历次修正导致的文本差异
    不被本标记覆盖——由告知文本显式声明）；
3. 告知：携带 fail-closed 提示——现行文本 ≠ 时间点适用文本，历史适用性
   须查版本注册表与官方原文，本系统不生成「当时是否合法」的断言。
"""
import re

# 明确年份（限定 1949–当前+1，避免「10086 年」类噪声）；当年/当时类指代词只触发检测不解析日期
_YEAR_RE = re.compile(r"((?:19|20)\d{2})\s*年")
_DEICTIC_RE = re.compile(r"当年|那时候|那时的?法|旧法|以前的规定?|当年的规定")
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

CURRENT_YEAR = 2026

TEMPORAL_NOTICE = (
    "您的问题包含时间指涉：本库检索到的是各法【现行版本】条文，其文本可能与所问时间点"
    "适用的版本不同（同一条文可能历经修正）。系统不会据此断言「当时是否合法」——"
    "请结合法条详情页的版本时间线与官方原文核对时间效力；重大事项请咨询执业律师。"
)


def detect_temporal_reference(question: str) -> dict:
    """检测问题中的时间指涉。

    返回 {detected, as_of, expression, granularity}：
    - 明确年份：as_of 取该年 12-31（保守边界），granularity="year"；
    - 指代词（当年/那时候…）：detected=True、as_of=None（无法解析具体时间点）；
    - 均无：detected=False。
    """
    text = question or ""
    m = None
    for m in _YEAR_RE.finditer(text):
        year = int(m.group(1))
        if 1949 <= year <= CURRENT_YEAR + 1:
            return {
                "detected": True,
                "as_of": f"{year}-12-31",
                "expression": m.group(0),
                "granularity": "year",
            }
    if _DEICTIC_RE.search(text):
        return {"detected": True, "as_of": None, "expression": None, "granularity": None}
    return {"detected": False, "as_of": None, "expression": None, "granularity": None}


def in_force_at(effective_date: str | None, as_of: str | None) -> bool | None:
    """现行文本在 as_of 是否已施行。

    以语料 effective_date（快照/官方核验的现行文本适用起点）比较；
    任一侧缺失返回 None（未知，不猜测）。注意：True 只表示「该现行文本
    的适用起点早于 as_of」，不保证 as_of 时点条文内容与现行文本一致
    （其间可能再有修正）——该残余不确定性由 TEMPORAL_NOTICE 显式声明。
    """
    if not as_of or not effective_date:
        return None
    if not _DATE_RE.match(as_of) or not _DATE_RE.match(effective_date):
        return None
    return effective_date <= as_of


def temporal_block(question: str, as_of: str | None = None) -> dict | None:
    """组装响应中的 temporal 块；无时间指涉且未显式传 as_of 时返回 None。"""
    detected = detect_temporal_reference(question)
    explicit = bool(as_of and _DATE_RE.match(as_of))
    if not detected["detected"] and not explicit:
        return None
    block = {
        "reference_detected": detected["detected"],
        "as_of": as_of or detected["as_of"],
        "granularity": detected["granularity"] if not explicit else "explicit",
        "notice": TEMPORAL_NOTICE,
        "limitation": (
            "命中卡随附适用历史版本的「同条号」对照文本（可能经重编号映射定位）；"
            "in_force_at_as_of 仅表示现行文本适用起点与 as_of 的先后关系，"
            "对照不构成对时点适用文本的认定。"
        ),
    }
    return block
