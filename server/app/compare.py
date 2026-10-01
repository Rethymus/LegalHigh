# -*- coding: utf-8 -*-
"""合同版本对比：复用 Python 标准库 difflib 做行级 diff + 替换行内字符级精确定位。

输出语义（对齐设计板）：added 新增 / deleted 删除 / modified 修改（同位置行被替换）。
R498：replace 操作附加 char_diffs——行内字符级 SequenceMatcher 精确定位哪些字符
被插入/删除（法律条款常为长段，整行替换看不出改了哪个词——字符级 diff 是
「改了哪个词」的直接回答）。纯结构对比——不虚构风险结论。
"""
import difflib


def _char_diff(line_a: str, line_b: str) -> list[dict]:
    """单行对内的字符级差异（R498）：返回 [{op, a_text, b_text}] 序列。"""
    sm = difflib.SequenceMatcher(None, line_a, line_b, autojunk=False)
    out = []
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            continue
        out.append({"op": tag, "a_text": line_a[i1:i2], "b_text": line_b[j1:j2]})
    return out


def diff_texts(text_a: str, text_b: str) -> dict:
    a = [ln.rstrip() for ln in (text_a or "").replace("\r\n", "\n").split("\n")]
    b = [ln.rstrip() for ln in (text_b or "").replace("\r\n", "\n").split("\n")]
    sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
    ops = []
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            continue
        op = {
            "type": tag,                       # replace → modified; delete; insert
            "a_lines": a[i1:i2],
            "b_lines": b[j1:j2],
            "a_range": [i1 + 1, i2],           # 1-based 行号（含端）
            "b_range": [j1 + 1, j2],
        }
        if tag == "replace":
            # R498：替换行内的字符级精确定位（同位置行逐对，行数不等时短侧补空）
            n = max(len(op["a_lines"]), len(op["b_lines"]))
            cd = []
            for k in range(n):
                la = op["a_lines"][k] if k < len(op["a_lines"]) else ""
                lb = op["b_lines"][k] if k < len(op["b_lines"]) else ""
                if la != lb:
                    cd.append({"line": k, "a": la[:80], "b": lb[:80], "diffs": _char_diff(la, lb)})
            op["char_diffs"] = cd
        ops.append(op)
    stats = {
        "added": sum(len(o["b_lines"]) for o in ops if o["type"] in ("insert", "replace")),
        "deleted": sum(len(o["a_lines"]) for o in ops if o["type"] in ("delete", "replace")),
        "modified_lines": sum(len(o["a_lines"]) for o in ops if o["type"] == "replace"),
        "op_count": len(ops),
    }
    return {"ops": ops, "stats": stats,
            "disclaimer": "对比为行级+行内字符级结构差异（difflib），不判断法律风险；风险与建议请进入合同审查模块并经执业律师复核。"}
