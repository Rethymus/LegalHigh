# -*- coding: utf-8 -*-
"""案件分析编排：人像 + 行为模式 + 请求权要件矩阵 → 单份可溯源分析结果。

数据纪律：
- 完全无状态：不使用任何存储层、不写任何数据库/文件；case_text 只在内存中被
  正则扫描，产出仅保留原文切片（excerpt）。
- 输出中的每条依据要么是语料内 statute 引用卡（由 legalmodel 经 citation_of
  逐条校验），要么是用户文本切片（text_span，附计数）；references 合并去重。
- summary 只是各模块结果的程序化串联计数，不加任何观点。
"""
from datetime import date

from . import behavior as behavior_mod
from . import legalmodel, profiling


def _ref_key(ref: dict) -> tuple:
    """去重键：statute 按 (law_id, article_no)，其余按 (kind, label, count)。"""
    if ref.get("kind") == "statute":
        return ("statute", ref.get("law_id"), ref.get("article_no"))
    return (ref.get("kind"), ref.get("label"), ref.get("count"))


def analyze_case(case_text: str, title: str | None = None,
                 claim_id: str | None = None) -> dict:
    """组装案件分析；未知 claim_id 抛 ValueError（由端点转 422）。"""
    if not claim_id:
        raise ValueError("未选择请求权分析模型；不得默认套用借贷模型。")
    claim = legalmodel.analyze_claim(case_text, claim_id)  # 先校验 claim_id
    profile = profiling.build_profile(case_text)
    behavior = behavior_mod.analyze_behavior(case_text)

    references, seen = [], set()
    for ref in claim["references"] + behavior["references"] + profile["references"]:
        key = _ref_key(ref)
        if key not in seen:
            seen.add(key)
            references.append(ref)

    disclaimers = [d for d in (
        claim["disclaimer"],
        profile["disclaimer"],
        behavior["fixed_disclaimer"],
    ) if d]

    behavior_active = sum(1 for i in behavior["indicators"] if i["level"] != "absent")
    return {
        "title": title or "未命名案件",
        "generated_at": date.today().isoformat(),
        "claim_id": claim_id,
        "profile": profile,
        "behavior": behavior,
        "claim": claim,
        "summary": {
            "profile_parties": len(profile["parties"]),
            "behavior_active": behavior_active,
            "claim_supported": claim["summary"]["supported"],
            "claim_unverified": claim["summary"]["unverified"],
        },
        "references": references,
        "disclaimers": disclaimers,
    }
