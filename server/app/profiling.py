# -*- coding: utf-8 -*-
"""当事人人像：确定性结构化抽取（角色 / 线索 / 行为动词 / 时间线）。

数据纪律：
- 只做正则级抽取，不做推断：抽不到的字段就是空数组 / None，绝不推测。
- 所有 excerpt 一律是原文切片（text[ctx_start:ctx_end]，text.find 断言保护），
  不拼接、不改写；timeline 为全局日期线索（不挂角色）。
- 本模块完全无状态：不写库、不落盘、无 LLM、无网络调用；也不输出对任何
  自然人的评价——只有文本里实际出现的表述。
"""
import re

# 角色词表（确定性常量，按此顺序扫描，结果顺序稳定可测）
ROLE_PATTERNS = [
    "甲方", "乙方", "原告", "被告", "上诉人", "被上诉人", "申请人", "被申请人",
    "贷款人", "借款人", "出借人", "买方", "卖方", "劳动者", "用人单位",
    "消费者", "经营者", "委托人", "受托人",
]

# 行为动词四类（type 与正则一一对应；「同意」加负向后顾，避免「不同意」误入承诺类）
BEHAVIOR_PATTERNS = [
    ("主张", re.compile(r"要求|请求|主张")),
    ("抗辩", re.compile(r"辩称|反驳|不同意")),
    ("承诺", re.compile(r"承诺|(?<!不)同意|保证|愿意")),
    ("违约行为", re.compile(r"未按|逾期|拒绝|拖欠")),
]

# 日期（全局时间线）：20XX年/月/-分隔 或「X月X日」
DATE_RE = re.compile(r"20\d\d[年/-]\d{1,2}[月/-]\d{1,2}日?|\d{1,2}月\d{1,2}日")

# 切句：按 。！？与换行（规格口径），分段保留原文偏移
_SENT_RE = re.compile(r"[^。！？\n]+")

# name_hint：角色词后 0-20 字窗口，截到标点后取开头连续中文串，再于常见虚词处截断
_NAME_STOP = "，。！？；：、,.!?;: \t“”‘’\"'（）()【】[]《》〈〉「」『』…—·/\\|"
_NAME_PARTICLE = "于在与和及已向因从将并为的了称是就对由被把该本次其又或但"

DISCLAIMER = (
    "当事人人像为确定性文本抽取结果，只摘录文本中实际出现的表述，不作任何推断，"
    "不构成对任何自然人的品格评价；线索为空即表示文本中未抽到，不代表不存在。"
)

_MENTION_LIMIT = 3      # 每个角色最多展示 3 处出现
_BEHAVIOR_LIMIT = 5     # 每个角色每类行为最多记录 5 条
_SPAN_PAD = 20          # 片段上下文半径（字）


def _slice_span(text: str, start: int, end: int, pad: int = _SPAN_PAD) -> dict:
    """断言式截取：excerpt 必须是原文切片（text.find(excerpt)==ctx_start）。"""
    ctx_start = max(0, start - pad)
    ctx_end = min(len(text), end + pad)
    excerpt = text[ctx_start:ctx_end]
    if not excerpt or text.find(excerpt) != ctx_start:
        raise AssertionError("excerpt 必须是原文切片（引用不变量被破坏）")
    return {"excerpt": excerpt, "start": start}


def _name_hint(text: str, end: int) -> str | None:
    """角色词后 0-20 字内的中文串（截到标点；再于首个常见虚词处截断），可为 None。"""
    window = text[end:end + 20]
    cut = len(window)
    for i, ch in enumerate(window):
        if ch in _NAME_STOP:
            cut = i
            break
    run = re.match(r"[\u4e00-\u9fff]+", window[:cut])
    if not run:
        return None
    cand = run.group(0)
    for j, ch in enumerate(cand):
        if ch in _NAME_PARTICLE and j > 0:
            return cand[:j]
    return cand or None


def _sentences(text: str) -> list:
    """按 。！？\n 切句，返回 [(start, end)]，偏移对应原文。"""
    return [m.span() for m in _SENT_RE.finditer(text)]


def build_profile(case_text: str) -> dict:
    """确定性抽取当事人角色、邻近线索、行为动词与全局时间线；抽不到即空。"""
    text = case_text or ""
    sents = _sentences(text)

    parties = []
    total_spans = 0
    for role in ROLE_PATTERNS:
        occurrences = [m for m in re.finditer(re.escape(role), text)]
        if not occurrences:
            continue
        mentions = [_slice_span(text, *m.span()) for m in occurrences[:_MENTION_LIMIT]]
        behaviors = []
        seen_bh = set()
        for s, e in sents:
            seg = text[s:e]
            if role not in seg:
                continue
            for btype, pat in BEHAVIOR_PATTERNS:
                for m in pat.finditer(seg):
                    span = _slice_span(text, s + m.start(), s + m.end())
                    key = (btype, span["excerpt"])
                    if key in seen_bh:
                        continue
                    seen_bh.add(key)
                    behaviors.append({"type": btype, **span})
        behaviors = behaviors[:_BEHAVIOR_LIMIT]
        total_spans += len(mentions) + len(behaviors)
        parties.append({
            "role": role,
            "name_hint": _name_hint(text, occurrences[0].end()),
            "mentions": mentions,
            "behaviors": behaviors,
        })

    timeline = [_slice_span(text, *m.span(), pad=15) | {"date_hint": m.group(0)}
                for m in DATE_RE.finditer(text)]
    total_spans += len(timeline)

    return {
        "parties": parties,
        "timeline": timeline,
        "references": [{
            "kind": "text_span",
            "label": "当事人人像（角色/行为/时间线片段）",
            "count": total_spans,
            "source": "user_provided_text",
        }],
        "disclaimer": DISCLAIMER,
    }
