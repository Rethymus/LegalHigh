# -*- coding: utf-8 -*-
"""前身法文本站内查阅（R390）。

医师法/学位法等「新法明文取代旧法」关系（R373 定案）的前身法全文：注册表
note 已登记关系与快照位置，本模块按 predecessor_snapshot 字段读快照、复用
amendment_fulltext 的清洗管线返回前身法正文。只读、零落盘。

纪律：
- 仅当注册表显式携带 predecessor_snapshot（R373 建制）时可读——无此字段 404；
- 快照白名单与目录逃逸校验同款；
- 不入 versions 时间线（更名边界：非同法版本）。
"""
from __future__ import annotations

import re

from . import amendment_fulltext as _af
from . import law_versions

_PREDECESSOR_SNAPSHOT = re.compile(r"已存证\s*docs/research/evidence/([\w.\-（）()]+\.(?:html|json))")


def _snapshot_from_note(note: str) -> str | None:
    m = _PREDECESSOR_SNAPSHOT.search(note or "")
    return m.group(1) if m else None


def predecessor_fulltext(law_id: str) -> dict:
    """返回某现行法前身法的清洗全文。无前身登记→KeyError（路由层转 404）。"""
    registry = law_versions.load_registry(law_id)
    note = registry.get("note", "") or ""
    snap = _snapshot_from_note(note)
    if not snap:
        raise KeyError(f"{law_id} 无前身法登记（predecessor_snapshot）")

    raw = _af._read_snapshot(snap)
    whole = _af._clean_html_text(raw.decode("utf-8", errors="replace"))
    text = _af._clean_decree_text(whole)

    # 从 note 里取定案句（关系说明回显）
    m = re.search(r"前身关系定案[^。]*。[^。]*。", note)
    relation = m.group(0) if m else ""

    return {
        "law_id": law_id,
        "title": registry.get("title", ""),
        "relation": relation,
        "snapshot": snap,
        "text": text,
        "scope_note": "前身法全文（现行法明文废止的前法，非同法历史版本——不入版本时间线）；仅供沿革对照，不构成法律意见。",
        "source": {"snapshot": snap, "kind": "wikisource-transcription"},
    }
