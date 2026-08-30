# -*- coding: utf-8 -*-
"""合同版本对比：复用 Python 标准库 difflib 做行级 diff（不手搓比对算法）。

输出语义（对齐设计板）：added 新增 / deleted 删除 / modified 修改（同位置行被替换）。
纯结构对比——「风险变化 / AI 汇总」由前端 gated AI 或审查点引擎另行提供，本模块不虚构风险结论。
"""
import difflib


def diff_texts(text_a: str, text_b: str) -> dict:
    a = [ln.rstrip() for ln in (text_a or "").replace("\r\n", "\n").split("\n")]
    b = [ln.rstrip() for ln in (text_b or "").replace("\r\n", "\n").split("\n")]
    sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
    ops = []
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            continue
        ops.append({
            "type": tag,                       # replace → modified; delete; insert
            "a_lines": a[i1:i2],
            "b_lines": b[j1:j2],
            "a_range": [i1 + 1, i2],           # 1-based 行号（含端）
            "b_range": [j1 + 1, j2],
        })
    stats = {
        "added": sum(len(o["b_lines"]) for o in ops if o["type"] in ("insert", "replace")),
        "deleted": sum(len(o["a_lines"]) for o in ops if o["type"] in ("delete", "replace")),
        "modified_lines": sum(len(o["a_lines"]) for o in ops if o["type"] == "replace"),
        "op_count": len(ops),
    }
    return {"ops": ops, "stats": stats,
            "disclaimer": "对比为行级结构差异（difflib），不判断法律风险；风险与建议请进入合同审查模块并经执业律师复核。"}
