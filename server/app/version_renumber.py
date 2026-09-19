# -*- coding: utf-8 -*-
"""跨版本条号重编号映射（known-gaps #1，R170）。

对同一法律的历史版本全文做确定性的条号对齐（difflib）：
- 两级匹配：先按「归一化文本完全一致」精确对齐，再对剩余条文按
  SequenceMatcher 相似度（阈值 0.85）取最佳唯一匹配；
- 键 = (条号, 子条号)——子条号（第二百八十七条之一）是独立条文；
- 输出按注册表版本顺序逐相邻对给出 kind=same|renumbered 的映射与两侧未匹配条号，
  供「历史对照」修正同条号移位、未来版本级检索索引使用。

纯确定性派生（无模型、无随机）：同输入恒同输出；进程内 lru_cache 缓存。
"""
import difflib
import re
from functools import lru_cache

from . import law_versions as law_versions_mod
from . import version_fulltext

RENUMBER_THRESHOLD = 0.85


def _norm(text: str) -> str:
    return re.sub(r"[\s\u3000\xa0]+", "", text or "")


def _key(a: dict) -> tuple[int, str]:
    return (a["no"], a.get("sub") or "")


def _label(a: dict) -> str:
    return a.get("label") or f"第{a['no']}{a.get('sub') or ''}条"


def _align(old_articles: list[dict], new_articles: list[dict]) -> dict:
    """三级对齐（确定性，优先级从高到低）：

    1. **同键身份**：同 (no, sub) 即同槽位——恒映射 kind=same，text_changed
       标记文本是否修改（同号大改如刑法 17 条也属同一条文，不依赖相似度）；
    2. **文本全同移位**：旧文与新文逐字一致但键不同 → renumbered；
    3. **difflib 模糊移位**：剩余条文中取最佳唯一匹配（≥阈值）→ renumbered。
    其余进入 unmatched 两侧如实报告（废止/新增），绝不静默丢条。
    """
    old_by_key = {_key(a): a for a in old_articles}
    new_by_key = {_key(a): a for a in new_articles}
    matches: list[dict] = []
    matched_old: set[tuple[int, str]] = set()
    matched_new: set[tuple[int, str]] = set()

    # ① 同键身份
    for a in old_articles:
        ko = _key(a)
        b = new_by_key.get(ko)
        if b is None:
            continue
        matches.append({"from_no": ko[0], "from_sub": ko[1] or None,
                        "to_no": ko[0], "to_sub": ko[1] or None,
                        "kind": "same", "ratio": 1.0,
                        "text_changed": _norm(a["text"]) != _norm(b["text"]),
                        "label": _label(a)})
        matched_old.add(ko)
        matched_new.add(ko)

    # ② 文本全同移位
    remaining_new = [a for a in new_articles if _key(a) not in matched_new]
    new_by_norm: dict[str, tuple[int, str]] = {}
    for b in remaining_new:
        new_by_norm.setdefault(_norm(b["text"]), _key(b))
    moved_old: list[dict] = []
    for a in old_articles:
        ko = _key(a)
        if ko in matched_old:
            continue
        kn = new_by_norm.get(_norm(a["text"]))
        if kn is None:
            moved_old.append(a)
            continue
        matches.append({"from_no": ko[0], "from_sub": ko[1] or None,
                        "to_no": kn[0], "to_sub": kn[1] or None,
                        "kind": "renumbered", "ratio": 1.0,
                        "text_changed": False, "label": _label(a)})
        matched_old.add(ko)
        matched_new.add(kn)

    # ③ difflib 模糊移位
    remaining_new = [a for a in new_articles if _key(a) not in matched_new]
    new_norms = [(a, _norm(a["text"])) for a in remaining_new]
    for a in moved_old:
        norm_o = _norm(a["text"])
        best, best_ratio = None, 0.0
        for b, norm_b in new_norms:
            if abs(len(norm_o) - len(norm_b)) > max(len(norm_o), len(norm_b)) * (1 - RENUMBER_THRESHOLD):
                continue  # 长度差超阈提前剪枝
            ratio = difflib.SequenceMatcher(None, norm_o, norm_b).ratio()
            if ratio > best_ratio:
                best, best_ratio = b, ratio
        if best is not None and best_ratio >= RENUMBER_THRESHOLD:
            ko, kn = _key(a), _key(best)
            matches.append({"from_no": ko[0], "from_sub": ko[1] or None,
                            "to_no": kn[0], "to_sub": kn[1] or None,
                            "kind": "renumbered", "ratio": round(best_ratio, 3),
                            "text_changed": True, "label": _label(a)})
            matched_old.add(ko)
            matched_new.add(kn)

    matches.sort(key=lambda m: (m["from_no"], m["from_sub"] or ""))
    return {
        "matches": matches,
        "unmatched_from": [list(_key(a)) for a in old_articles if _key(a) not in matched_old],
        "unmatched_to": [list(_key(a)) for a in new_articles if _key(a) not in matched_new],
    }


def _version_order(law_id: str) -> list[str]:
    """时间线顺序（按公布日→施行日升序）中拥有全文的版本 id 列表。

    注册表数组顺序跨法不一致（有的新→旧、有的旧→新）——相邻版本对必须按
    时间升序构造，否则对齐方向颠倒。
    """
    registry = law_versions_mod.load_registry(law_id)
    versions = [v for v in registry.get("versions", [])
                if version_fulltext.has_fulltext(law_id, v["version_id"])]
    versions.sort(key=lambda v: (v.get("promulgation_date") or "", v.get("effective_date") or ""))
    return [v["version_id"] for v in versions]


@lru_cache(maxsize=64)
def build_map(law_id: str) -> dict:
    """相邻版本两两对齐；不足两个全文版本时返回空映射（不报错——诚实无数据）。"""
    order = _version_order(law_id)
    pairs = []
    for older, newer in zip(order, order[1:]):
        old = version_fulltext.load(law_id, older)["articles"]
        new = version_fulltext.load(law_id, newer)["articles"]
        alignment = _align(old, new)
        pairs.append({"from_version": older, "to_version": newer, **alignment})
    renumbered = sum(1 for p in pairs for m in p["matches"] if m["kind"] == "renumbered")
    return {
        "law_id": law_id,
        "pairs": pairs,
        "pair_count": len(pairs),
        "renumbered_count": renumbered,
        "scope_note": "确定性对齐（同键身份+文本全同+difflib 阈值 0.85）；same 条文的 text_changed 标记文本修改——对照以文本为准。",
    }


def lookup(law_id: str, from_version: str, to_version: str, no: int, sub: str | None = None) -> dict | None:
    """查某条在相邻版本对之间的去向；非相邻版本对返回 None（不做链式推断）。"""
    for p in build_map(law_id)["pairs"]:
        if p["from_version"] == from_version and p["to_version"] == to_version:
            for m in p["matches"]:
                if m["from_no"] == no and (m["from_sub"] or "") == (sub or ""):
                    return m
    return None
