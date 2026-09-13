# -*- coding: utf-8 -*-
"""法条历史版本注册表（S2-T4 PoC；legislation.gov.uk 版本模型的本地化最小实现）。

范围：本模块只管理「版本注册表」——每个受控规范文件有哪些已入证据库的版本、
各自的公布/施行/条数与证据对象。历史版本**全文**的入库仍走 build_corpus 证据
快照管线（未采集前只有 pending_note，不预填任何事实）。

数据纪律：
- 只登记有仓库内证据的版本；evidence 五字段（kind/grade/url/accessed_at/snapshot）缺一即拒绝加载。
- current 版本的 status/effective_date/promulgation_date 必须与语料元数据一致
  （corpus_selfcheck 与本模块双重校验）——注册表不得比语料「更先进」。
- schema_version 不支持时 fail-closed。
"""
import json
from pathlib import Path

from .corpus import get_corpus

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "law_versions"
SUPPORTED_SCHEMA = 1

_REQUIRED_VERSION_FIELDS = {
    "version_id": str, "label": str, "status": str,
    "promulgation_date": str, "effective_date": str,
    "current": bool,
}
_REQUIRED_EVIDENCE_FIELDS = ("kind", "grade", "url", "accessed_at", "snapshot")


def registry_path(law_id: str) -> Path:
    return DATA_PATH / f"{law_id}.json"


def load_registry(law_id: str) -> dict:
    """加载并校验一个版本注册表；任何 schema/一致性问题都抛 ValueError（fail-closed）。"""
    path = registry_path(law_id)
    if not path.is_file():
        raise FileNotFoundError(f"未建版本注册表：{law_id}")
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("schema_version") != SUPPORTED_SCHEMA:
        raise ValueError(f"版本注册表 schema_version 不受支持：{law_id}")
    if data.get("law_id") != law_id:
        raise ValueError(f"版本注册表 law_id 与文件名不一致：{law_id}")
    versions = data.get("versions")
    if not isinstance(versions, list) or not versions:
        raise ValueError(f"版本注册表 versions 必须为非空数组：{law_id}")
    seen_ids = set()
    current_count = 0
    for v in versions:
        if not isinstance(v, dict):
            raise ValueError(f"版本项不是对象：{law_id}")
        for field, expected in _REQUIRED_VERSION_FIELDS.items():
            if field not in v or not isinstance(v[field], expected):
                raise ValueError(f"版本项缺少字段 {field} 或类型不符：{law_id}")
        if v["version_id"] in seen_ids:
            raise ValueError(f"version_id 重复：{law_id}/{v['version_id']}")
        seen_ids.add(v["version_id"])
        evidence = v.get("evidence")
        if not isinstance(evidence, dict) or any(not evidence.get(f) for f in _REQUIRED_EVIDENCE_FIELDS):
            raise ValueError(f"版本 {v['version_id']} 证据对象缺失必填字段：{law_id}")
        if v.get("article_count") is not None and not isinstance(v["article_count"], int):
            raise ValueError(f"article_count 必须为整数或省略：{law_id}")
        current_count += int(v["current"])
    if current_count != 1:
        raise ValueError(f"必须恰好一个 current 版本（实际 {current_count}）：{law_id}")

    # 与语料元数据对齐：注册表不得比语料更先进
    corpus = get_corpus()
    meta = corpus.laws.get(law_id)
    if meta is None:
        raise ValueError(f"版本注册表对应的法律不在当前语料：{law_id}")
    current = next(v for v in versions if v["current"])
    if current["status"] != meta.get("status"):
        raise ValueError(f"current 版本 status 与语料不一致：{law_id}")
    if current["effective_date"] != meta.get("effective_date"):
        raise ValueError(f"current 版本 effective_date 与语料不一致：{law_id}")
    promulgation = meta.get("promulgation") or {}
    if current["promulgation_date"] != promulgation.get("date"):
        raise ValueError(f"current 版本 promulgation_date 与语料不一致：{law_id}")
    return data


def describe(law_id: str) -> dict:
    """对外形态：只暴露可证字段 + pending 说明；不携带任何未核实占位。"""
    data = load_registry(law_id)
    return {
        "law_id": data["law_id"],
        "title": data["title"],
        "versions": [{
            "version_id": v["version_id"],
            "label": v["label"],
            "status": v["status"],
            "promulgation_date": v["promulgation_date"],
            "promulgation_organ": v.get("promulgation_organ", ""),
            "promulgation_instrument": v.get("promulgation_instrument", ""),
            "effective_date": v["effective_date"],
            "article_count": v.get("article_count"),
            "article_count_note": v.get("article_count_note", ""),
            "current": v["current"],
            "evidence": {f: v["evidence"][f] for f in _REQUIRED_EVIDENCE_FIELDS},
        } for v in data["versions"]],
        "pending_note": data.get("pending_note", ""),
        "scope_note": "版本注册表只登记已入证据库的版本；历史版本全文入库走 build_corpus 证据快照管线。",
    }
