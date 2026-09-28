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


def predecessor_fulltext(law_id: str, idx: int | None = None) -> dict:
    """返回某现行法前身法的清洗全文。无前身登记→KeyError（路由层转 404）。

    R412 双形态：
    - note 形态（一法一快照，R373 建制）：从 note 的「已存证 X」解析快照，idx 忽略；
    - predecessors 数组形态（多前身并列，民法典九法）：idx 选择条目，越界→IndexError。
    """
    registry = law_versions.load_registry(law_id)
    preds = registry.get("predecessors") or []
    if preds:
        if idx is None or not (0 <= idx < len(preds)):
            raise IndexError(f"{law_id} 前身法索引越界：idx={idx}（共 {len(preds)} 部，0 起）")
        entry = preds[idx]
        snap = entry.get("snapshot") or ""
        relation = registry.get("predecessors_relation", "")
        pred_title, note = entry.get("title", ""), entry.get("note", "")
    else:
        note = registry.get("note", "") or ""
        snap = _snapshot_from_note(note)
        if not snap:
            raise KeyError(f"{law_id} 无前身法登记（predecessor_snapshot）")
        m = re.search(r"前身关系定案[^。]*。[^。]*。", note)
        relation = m.group(0) if m else ""
        pred_title = ""

    if not _af.SAFE_FILE.match(snap or ""):
        raise ValueError(f"{law_id} 前身条目缺合法 evidence.snapshot")

    raw = _af._read_snapshot(snap)
    whole = _af._clean_html_text(raw.decode("utf-8", errors="replace"))
    text = _af._clean_decree_text(whole)

    return {
        "law_id": law_id,
        "title": pred_title or registry.get("title", ""),
        "relation": relation,
        "predecessor_note": note,
        "index": idx,
        "predecessors": [p.get("title", "") for p in preds] if preds else None,
        "snapshot": snap,
        "text": text,
        "scope_note": "前身法全文（现行法明文废止的前法，非同法历史版本——不入版本时间线）；仅供沿革对照，不构成法律意见。",
        "source": {"snapshot": snap, "kind": "wikisource-transcription"},
    }
