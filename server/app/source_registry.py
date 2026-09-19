# -*- coding: utf-8 -*-
"""Legal Source Registry 服务层（FLERF 报告 §6/§7；R138 建表，R164 接线 /api/sources）。

`server/data/source_registry.json` 是全部外部来源的唯一登记处：任何未来的抓取/核验
只允许访问本表 compliance.approved=true 的来源；REFERENCE_ONLY 来源只作交叉核验、
禁止作为构建源（LEGAL-005，机械检查见 test_architecture_invariants）。

本模块 fail-closed：schema 版本不明、来源缺字段、权威等级越出枚举、ID 重复——
任何一项不满足即抛 ValueError（端点呈现 500，绝不带病降级返回半份数据）。
"""
import json
import pathlib

REGISTRY_PATH = pathlib.Path(__file__).resolve().parent.parent / "data" / "source_registry.json"

# 权威等级枚举（与 registry note 口径一致）：
# OFFICIAL_PRIMARY=官方一手；OFFICIAL_REPRINT=官方媒体受权转载；
# COMMUNITY_TRANSCRIPTION=社区转录（证据等级降为【中】）；
# REFERENCE_ONLY=只读参照（禁止作构建源）；FOREIGN_OFFICIAL=域外官方法源（比较研究）。
AUTHORITY_CLASSES = {
    "OFFICIAL_PRIMARY",
    "OFFICIAL_REPRINT",
    "COMMUNITY_TRANSCRIPTION",
    "REFERENCE_ONLY",
    "FOREIGN_OFFICIAL",
}

AUTHORITY_CLASS_LABELS = {
    "OFFICIAL_PRIMARY": "官方一手",
    "OFFICIAL_REPRINT": "官方媒体受权转载",
    "COMMUNITY_TRANSCRIPTION": "社区转录【中】",
    "REFERENCE_ONLY": "只读参照（不作构建源）",
    "FOREIGN_OFFICIAL": "域外官方法源（比较研究）",
}


def validate(data: dict) -> dict:
    if data.get("schema_version") != 1:
        raise ValueError(f"source_registry schema_version 不支持：{data.get('schema_version')!r}")
    sources = data.get("sources")
    if not isinstance(sources, list) or not sources:
        raise ValueError("source_registry 缺少非空 sources 列表")
    seen: set[str] = set()
    for s in sources:
        sid = s.get("id")
        if not sid or not isinstance(sid, str):
            raise ValueError(f"来源缺少字符串 id：{s!r}")
        if sid in seen:
            raise ValueError(f"来源 id 重复：{sid}")
        seen.add(sid)
        for field in ("name", "host"):
            if not s.get(field) or not isinstance(s[field], str):
                raise ValueError(f"来源 {sid} 缺少 {field}")
        if s["authority_class"] not in AUTHORITY_CLASSES:
            raise ValueError(f"来源 {sid} authority_class 越出枚举：{s['authority_class']!r}")
        approved = (s.get("compliance") or {}).get("approved")
        if not isinstance(approved, bool):
            raise ValueError(f"来源 {sid} compliance.approved 必须为布尔（fail-closed，不允许缺省）")
    return data


def load_registry() -> dict:
    return validate(json.loads(REGISTRY_PATH.read_text(encoding="utf-8")))
