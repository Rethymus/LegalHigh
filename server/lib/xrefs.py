# -*- coding: utf-8 -*-
"""法内交叉引用构建（唯一实现，export_laws.py 与测试共用）。

从法律条目列表提取「本法第X条[之N]」引用，生成 xrefs.json 数据：
- from/to 均为完整条目键（基条 "287" / 子条 "287之一"，与前端 artParam 同构）
- 目标必须存在于本法条目键集合（引用不变量：不生成指向不存在条文的链接）
- 同条对同目标的重复引用只保留首次（与初版产物行为一致）
- ctx = 引用点前后各 10 字符

历史教训（2026-10-11 审计）：初版产物由一次性脚本生成，其私有数字转换器
对「零X」形态解析错位（1063→1013 类），25 条错误目标因恰好存在而逃过
存在性测试。本模块转换器与 R501 直查层同源（lib.textparse.cn_to_int，
21 组金标锤炼）；test_xrefs_freshness 以本模块输出逐字节锁定产物。
"""
import re

from .textparse import cn_to_int

_XREF_RE = re.compile(r"本法第([零〇一二三四五六七八九十百千]{1,12})条(?:之([一二三四五六七八九十]{1,2}))?")


def build_xrefs(laws: list[dict]) -> dict[str, list[dict]]:
    """laws: export_laws 形态的法条列表（articles 含 no/sub/text）。"""
    xrefs: dict[str, list[dict]] = {}
    for law in laws:
        keys = {f"{a['no']}{a.get('sub') or ''}" for a in law["articles"]}
        refs: list[dict] = []
        seen: set[tuple[str, str]] = set()
        for art in law["articles"]:
            from_key = f"{art['no']}{art.get('sub') or ''}"
            for m in _XREF_RE.finditer(art["text"]):
                to_key = f"{cn_to_int(m.group(1))}" + (f"之{m.group(2)}" if m.group(2) else "")
                if to_key not in keys or (from_key, to_key) in seen:
                    continue
                seen.add((from_key, to_key))
                refs.append(
                    {
                        "from": from_key,
                        "to": to_key,
                        "ctx": art["text"][max(0, m.start() - 10): m.end() + 10],
                    }
                )
        if refs:
            xrefs[law["id"]] = refs
    return xrefs
