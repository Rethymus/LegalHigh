# -*- coding: utf-8 -*-
"""沟通行为模式分析：表层语言模式识别（谈判策略参考，非心理红线模块）。

心理红线（硬纪律）：
- 本模块输出是「文本模式识别 + 谈判策略参考」，固定附言 fixed_disclaimer 必含
  四要素：非心理学诊断 / 非医学意见 / 不构成对任何自然人的品格评价 /
  仅基于所提供文本的表层语言模式。
- 指标标题、note、advice 禁用「人格 / 心理障碍 / 精神 / 智力 / 疾病」类词汇，
  只描述表层语言事实（出现什么词、多少次）。
- 等级仅由命中次数阈值（thresholds 常量）决定，确定性可测；B5 感叹号单独特判。
- 所有 excerpt 一律为原文切片（text.find 断言保护）。本模块无状态、无 LLM、无网络。
"""
import re

INDICATORS = [
    {"id": "B1", "title": "威胁/施压语言",
     "probes": [r"起诉", r"报警", r"投诉", r"上报", r"追究.{0,6}责任", r"申请(强制)?执行"],
     "note": "文本中出现诉诸法律程序或问责渠道的表述（如起诉、报警、投诉、申请执行）。",
     "advice": "把对方主张按「事实—依据—期限」整理成书面回应并留存记录；涉及诉讼程序时建议咨询执业律师。",
     "thresholds": {"medium": 1, "high": 2}},
    {"id": "B2", "title": "升级倾向与最后通牒",
     "probes": [r"最后(警告|通牒)", r"限.{0,4}(内|前)", r"再次催告", r"多次催", r"第[一二三]次"],
     "note": "文本出现最后通牒、再次/多次催告等逐级施压的表述，沟通呈升级趋势。",
     "advice": "梳理各次催告的时间与内容记录，判断是否仍存在协商窗口；避免在压力峰值即时答复。",
     "thresholds": {"medium": 1, "high": 2}},
    {"id": "B3", "title": "时间压力设定",
     "probes": [r"\d+\s*(日|天|小时|工作日)内", r"期限届满前"],
     "note": "文本设定了明确的履约期限表达（如X日内、期限届满前）。",
     "advice": "核对期限的起算点与是否届满，评估期限内可采取的补救（部分履行、书面异议、协商展期）。",
     "thresholds": {"medium": 1, "high": 2}},
    {"id": "B4", "title": "合作信号",
     "probes": [r"协商", r"分期", r"和解", r"调解", r"延期", r"宽限"],
     "note": "文本出现协商、分期、和解、调解、延期、宽限等留有余地的表述。",
     "advice": "可趁合作窗口提出书面和解或分期方案并固定双方合意，避免仅口头约定。",
     "thresholds": {"medium": 1, "high": 2}},
    {"id": "B5", "title": "情绪强度",
     "probes": [r"欺人太甚", r"无法无天", r"忍无可忍", r"简直"],
     "note": "文本感叹号密度较高或出现极端用词，语言张力较大（仅描述表层文字特征）。",
     "advice": "建议改用事实与期限驱动的书面表达，避免情绪化措辞使冲突升级。",
     "thresholds": {"medium": 1, "high": 2}},
    {"id": "B6", "title": "履行承诺记录",
     "probes": [r"承诺", r"保证", r"已(支付|归还|履行)"],
     "note": "文本记录了承诺、保证或已履行行为，可作为履约诚意/履约历史的线索。",
     "advice": "整理承诺与履行的时间线及凭证（转账记录、书面确认），作为后续沟通或诉讼证据。",
     "thresholds": {"medium": 1, "high": 2}},
]

# 固定附言（心理红线，四要素缺一不可）
FIXED_DISCLAIMER = (
    "本分析为非心理学诊断、非医学意见，不构成对任何自然人的品格评价；"
    "仅基于所提供文本的表层语言模式，供谈判策略参考。"
)

_EXCLAIM_RE = re.compile(r"[！!]")
_SPAN_PAD = 20
_SPAN_LIMIT = 5

# 红线词表：指标标题/说明/建议中不得出现（启动时自检，违反即 AssertionError）
_BANNED_WORDS = ("人格", "心理障碍", "精神", "智力", "疾病")


def _check_discipline():
    """红线自检：INDICATORS 文案与固定附言不得触碰禁用词。"""
    for ind in INDICATORS:
        blob = ind["title"] + ind["note"] + ind["advice"]
        for w in _BANNED_WORDS:
            if w in blob:
                raise AssertionError(f"行为指标文案触碰红线词：{w}（{ind['id']}）")


_check_discipline()


def _slice_span(text: str, start: int, end: int, pad: int = _SPAN_PAD) -> dict:
    """断言式截取：excerpt 必须是原文切片（text.find(excerpt)==ctx_start）。"""
    ctx_start = max(0, start - pad)
    ctx_end = min(len(text), end + pad)
    excerpt = text[ctx_start:ctx_end]
    if not excerpt or text.find(excerpt) != ctx_start:
        raise AssertionError("excerpt 必须是原文切片（引用不变量被破坏）")
    return {"excerpt": excerpt, "start": start}


def _level_by_hits(hits: int, thresholds: dict) -> str:
    """0 → absent；≥high 阈值 → high；≥medium 阈值 → medium；否则 low。"""
    if hits <= 0:
        return "absent"
    if hits >= thresholds["high"]:
        return "high"
    if hits >= thresholds["medium"]:
        return "medium"
    return "low"


def analyze_behavior(case_text: str) -> dict:
    """六条表层语言指标：命中次数 → 等级；spans 为原文切片。"""
    text = case_text or ""
    indicators = []
    references = []
    for ind in INDICATORS:
        hits, span_hits, seen = [], [], set()
        for probe in ind["probes"]:
            for m in re.finditer(probe, text, re.IGNORECASE):
                key = (m.start(), m.end())
                if key not in seen:
                    seen.add(key)
                    hits.append(key)
                    span_hits.append(key)
        if ind["id"] == "B5":
            # 感叹号单独特判：密度 ≥2 → high；恰好 1 个 → medium（与极端词命中叠加取高）。
            # exclaim_count 一并输出、感叹号位置进入 spans（仅展示，不计入 hits），保证等级可复核。
            hits.sort()
            count = len(hits)
            for m in _EXCLAIM_RE.finditer(text):
                key = (m.start(), m.end())
                if key not in seen:
                    seen.add(key)
                    span_hits.append(key)
            exclam = len(_EXCLAIM_RE.findall(text))
            if count >= ind["thresholds"]["high"] or exclam >= 2:
                level = "high"
            elif count >= ind["thresholds"]["medium"] or exclam == 1:
                level = "medium"
            else:
                level = "absent"
            extra = {"exclaim_count": exclam}
        else:
            hits.sort()
            count = len(hits)
            level = _level_by_hits(count, ind["thresholds"])
            extra = {}
        span_hits.sort()
        spans = [_slice_span(text, s, e) for s, e in span_hits[:_SPAN_LIMIT]]
        indicators.append({
            "id": ind["id"],
            "title": ind["title"],
            "level": level,
            "hits": count,
            "spans": spans,
            "note": ind["note"],
            "advice": ind["advice"],
            **extra,
        })
        if level != "absent":
            references.append({
                "kind": "text_span",
                "label": f"行为指标 {ind['id']} {ind['title']}",
                "count": count,
                "source": "user_provided_text",
            })
    return {
        "indicators": indicators,
        "fixed_disclaimer": FIXED_DISCLAIMER,
        "references": references,
    }
