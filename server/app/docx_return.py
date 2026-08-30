# -*- coding: utf-8 -*-
"""律师回传 DOCX 解析（M7-T1 后半）。

回传判定语义（基于导出时的书签 LH_{finding_id} 与 w:ins 状态）：
- 书签区间内建议文本仍在 w:ins（author=LegalHigh AI）中 → pending（律师未处理）
- 文本仍在但已无 w:ins 包裹（Word「接受修订」的产物） → accepted
- 区间内无建议文本（Word「拒绝修订」的产物） → rejected

解析只读；状态流转由 apply_return 走既有批注状态机（非法流转如实记 skipped）。
"""
from io import BytesIO

W_NS = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def parse_review_docx(data: bytes) -> dict[str, str]:
    """解析回传 DOCX → {finding_id: pending|accepted|rejected}。"""
    from docx import Document

    doc = Document(BytesIO(data))
    body = doc.element.body
    result: dict[str, str] = {}

    open_name = None
    captured: list = []
    for el in body.iterchildren():
        tag = el.tag
        if tag == W_NS + "bookmarkStart" and (el.get(W_NS + "name") or "").startswith("LH_"):
            open_name = el.get(W_NS + "name")
            captured = []
            continue
        if open_name and tag == W_NS + "bookmarkEnd":
            fid = open_name[3:]  # LH_f3 -> f3
            # 区分「修订内文本」与「普通文本」：Word 接受修订后建议文本会落入普通层
            ins_text, plain_text = [], []
            for node in iter_all(captured):
                if node.tag == W_NS + "t":
                    target = node.getparent()
                    in_ins = False
                    while target is not None:
                        if target.tag == W_NS + "ins":
                            in_ins = True
                            break
                        target = target.getparent()
                    (ins_text if in_ins else plain_text).append(node.text or "")
            ins_joined, plain_joined = "".join(ins_text), "".join(plain_text)
            if "建议：" in ins_joined:
                result[fid] = "pending"
            elif "建议：" in plain_joined:
                result[fid] = "accepted"
            else:
                result[fid] = "rejected"
            open_name = None
            captured = []
            continue
        if open_name:
            captured.append(el)
    return result


def iter_all(elements):
    """深度优先遍历元素集合（含自身与全部后代）。"""
    for el in elements:
        yield from el.iter()


def apply_return(rid: str, parsed: dict[str, str], review: dict, actor: str = "docx回传") -> dict:
    """把解析结果套用进批注状态机：accepted→adopt、rejected→reject；
    pending 不动；非法流转（如终态再变更）如实记 skipped，不静默丢弃。"""
    from . import storage

    valid_ids = {f["id"] for f in review["result"]["findings"]}
    summary = {"accepted": [], "rejected": [], "pending": 0, "skipped": [], "unknown": []}
    for fid, decision in parsed.items():
        if fid not in valid_ids:
            summary["unknown"].append(fid)
            continue
        if decision == "pending":
            summary["pending"] += 1
            continue
        action = "adopt" if decision == "accepted" else "reject"
        try:
            storage.transition_annotation(rid, fid, action, actor)
            summary[decision].append(fid)
        except (KeyError, ValueError) as e:
            summary["skipped"].append({"id": fid, "decision": decision, "reason": str(e)})
    summary["accepted_n"] = len(summary["accepted"])
    summary["rejected_n"] = len(summary["rejected"])
    return summary
