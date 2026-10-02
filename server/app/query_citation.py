# -*- coding: utf-8 -*-
"""法条直查前置层（R501，thu-lawyer/lawq「法条直查」模式的确定性化）。

「民法典第1254条说了什么」类直查问法的条文号 bigram 会被内容词稀释——
BM25 实测 4 问 3 miss（1254/264/188 三种形态全部落空，仅条头含中文数字的
形态偶中）。本层在 BM25 之前做确定性引用解析：

    法名（三层匹配）+ 条号（阿拉伯/中文数字，可选之N 子条号）
      → 语料唯一条文 → 置顶（orchestrated_search 集成）

解析不完整、法名歧义或条文不存在时静默回退纯 BM25——不猜、不部分命中
（fail-closed，与 ADR-0005 受控主题组同一架构位：词法理解在编排层，
raw BM25 与规则⑲金标口径不动）。
"""
import re

from lib.textparse import ART_SUB_IDX, cn_to_int

# 常用简称（tier-3）：不能由「去国号前缀」推导的高频口语法名 → law_id。
# 仅收录无歧义的通行简称；婚姻法/合同法等已废止法名不映射（语料外诚实回退）。
LAW_ALIASES: dict[str, str] = {
    "民法": "civl-2020",            # 口语「民法第X条」指民法典
    "民诉法": "pcl-2023",
    "刑诉法": "cpl-2018",
    "消保法": "cl-2013",
    "个保法": "pipl-2021",
    "个人信息保护法": "pipl-2021",   # 与去前缀形态等价，冗余登记便于直读
    "网安法": "csl-2025",
    "数安法": "dsl-2021",
    "反家暴法": "dv-2015",
    "行诉法": "admin-litigation-2017",
    "道交法": "road-safety-2021",
    "未保法": "minor-2024",
    "合同编通则解释": "htjs-2023",
    "网络消费规定": "wlxf-2022",
}

# 法名捕获：《书名号》或裸名（2–24 字，非标点/空白/书名号），后接可选「第」的
# 条号 + 可选之N。非贪婪名捕获 + 事后三层校验（校验是闸门，正则只负责切出候选）。
_CITATION_RE = re.compile(
    r"(?:《(?P<bn>[^《》]{2,24})》|(?P<name>[^，。；、！？：:\s《》]{2,24}?))"
    r"第?(?P<no>[0-9]{1,4}|[零〇一二三四五六七八九十百千]{1,12})条"
    r"(?:之(?P<sub>[一二三四五六七八九十]{1,2}))?"
)


def _norm_no(raw: str) -> int | None:
    raw = (raw or "").strip()
    if not raw:
        return None
    if raw.isdigit():
        v = int(raw)
        return v if 0 < v <= 9999 else None
    v = cn_to_int(raw)
    return v if v > 0 else None


def _match_law(name: str, titles: list[tuple[str, str]]) -> str | None:
    """三层法名匹配 → 唯一 law_id；零命中或歧义返回 None（不猜）。

    titles: [(law_id, title)]。tier1 全称精确；tier2 去「中华人民共和国」
    前缀精确；tier3 常用简称表。三层各自独立判歧义（同名多法不置顶）。
    """
    if not name:
        return None
    alias = LAW_ALIASES.get(name)
    if alias:
        return alias
    stripped = "中华人民共和国"
    for law_id, title in titles:
        if title == name:
            return law_id
    for law_id, title in titles:
        if title.startswith(stripped) and title[len(stripped):] == name:
            return law_id
    return None


def resolve(query: str, corpus) -> dict | None:
    """从问法中解析法条引用 → 语料条文 dict（含 sub/label/law_title）；失败 None。"""
    q = (query or "").strip()
    if not q or "条" not in q:
        return None
    m = _CITATION_RE.search(q)
    if not m:
        return None
    name = m.group("bn") or m.group("name")
    no = _norm_no(m.group("no"))
    if not name or no is None:
        return None
    titles = [(a["law_id"], a["law_title"]) for a in corpus.articles]
    # titles 每条文一条——先去重成法级清单再匹配
    seen: dict[str, str] = {}
    for law_id, title in titles:
        seen.setdefault(law_id, title)
    law_id = _match_law(name, list(seen.items()))
    if not law_id:
        return None
    sub = ""
    if m.group("sub"):
        # 之N 归一：中文数字 → 之一/之二…（语料 sub 字段的存储形态）
        idx = cn_to_int(m.group("sub"))
        if idx <= 0:
            return None
        sub = f"之{_cn_index_to_text(idx)}"
    # (law_id, no[, sub]) 必须命中真实条文；子条号不存在的整体回退（不降级为基条）
    for a in corpus.articles:
        if a["law_id"] == law_id and a["no"] == no and (a.get("sub") or "") == sub:
            return {**a}
    return None


def _cn_index_to_text(idx: int) -> str:
    """1–10 → 一…十（ART_SUB_IDX 的逆映射；超范围返回占位使其必然不命中）。"""
    for text, v in ART_SUB_IDX.items():
        if v == idx:
            return text[-1]  # 「之一」→「一」
    return "无"
