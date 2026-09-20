# -*- coding: utf-8 -*-
"""VerifiedEvidence 强类型（FLERF 报告 §19；known-gaps #8 收口，R174）。

把各链路（qa/研究/审查/要件/起草）的依据条目升格为报告 §19 完整强类型快照：
- canonical_document_id/canonical_unit_id：文档与条文的规范 id（子条号参与）；
- document_hash：证据快照的文档级 SHA-256（corpus source 携带，selfcheck 复算）；
- content_hash：条文精确文本 SHA-256（引用不变量的数据面）；
- source_id：host → Source Registry 来源 id（未注册 host 拒绝生成——fail-closed）；
- verification 四项：来源/版本/时效/法域核验状态，缺一项即显式 False，不冒充。

只读公共语料构造；不携带任何用户输入。
"""
import hashlib
import json
import pathlib
from functools import lru_cache
from urllib.parse import urlparse

from pydantic import BaseModel, ConfigDict

from . import source_registry as source_registry_mod
from .corpus import get_corpus

_DOCUMENT_TYPE = "STATUTE"  # 原型只收录成文法条文（判例为引用卡依据，不入本类型）


class VerifiedEvidence(BaseModel):
    model_config = ConfigDict(extra="forbid")

    evidence_id: str
    source_id: str
    source_native_id: str | None
    canonical_document_id: str
    canonical_unit_id: str
    document_type: str
    jurisdiction: str
    authority_class: str
    title: str
    exact_text: str
    location: dict
    official_url: str
    published_at: str | None
    effective_from: str | None
    effective_until: str | None
    fetched_at: str | None
    content_hash: str
    document_hash: str | None
    in_force_at_as_of: bool | None = None
    verification: dict


@lru_cache(maxsize=1)
def _host_to_source() -> dict[str, dict]:
    out = {}
    for s in source_registry_mod.load_registry()["sources"]:
        out[s["host"]] = s
    return out


@lru_cache(maxsize=1)
def _native_ids() -> dict[str, dict]:
    """flk flfgDetails 官方接口核验记录（R133 起管线标准）→ law_id → {bbbs, evidence}。

    无文件或文件损坏返回空 dict（source_native_id 诚实留空，绝不编造）。
    """
    path = pathlib.Path(__file__).resolve().parent.parent / "data" / "flk_native_ids.json"
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def _host(url: str) -> str:
    try:
        return (urlparse(url).hostname or "").lower()
    except ValueError:
        return ""


def verified_evidence(cit: dict) -> dict | None:
    """citation_of 条目 → §19 VerifiedEvidence；无条文文本/缺关键字段返回 None。"""
    text = cit.get("text") or ""
    law_id = cit.get("law_id")
    no = cit.get("article_no")
    if not text or not law_id or no is None:
        return None

    corpus = get_corpus()
    law = corpus.laws.get(law_id)
    if law is None:
        return None
    src = law.get("source") or {}
    src_entry = _host_to_source().get(_host(src.get("url") or cit.get("source_url") or ""))
    if src_entry is None:
        return None  # host 未注册：fail-closed，不为账本编造来源

    sub = cit.get("sub")
    effective = cit.get("effective_date") or law.get("effective_date")
    unit_hash = hashlib.sha256(text.encode("utf-8")).hexdigest()
    published = law.get("promulgation_instrument")

    ve = {
        "evidence_id": f"{law_id}#{no}",
        "source_id": src_entry["id"],
        "source_native_id": _native_ids().get(law_id, {}).get("bbbs"),  # flk 官方 native id（未核验法诚实留空）
        "canonical_document_id": f"{law_id}@{effective or '未核'}",
        "canonical_unit_id": f"{law_id}#{no}{('-' + sub) if sub else ''}",
        "document_type": _DOCUMENT_TYPE,
        "jurisdiction": "CN",
        "authority_class": src_entry["authority_class"],
        "title": cit.get("law_title") or law["title"],
        "exact_text": text,
        "location": {"article": no, "sub": sub, "chapter": cit.get("chapter")},
        "official_url": cit.get("source_url") or "",
        "published_at": published,
        "effective_from": effective,
        "effective_until": None,
        "fetched_at": src.get("fetched_at"),
        "content_hash": unit_hash,
        "document_hash": src.get("sha256"),
        "verification": {
            "source_verified": True,   # 快照+SHA-256 经 corpus_selfcheck 校验
            "version_verified": bool(effective),
            "temporal_verified": bool(effective),
            "jurisdiction_verified": src_entry.get("jurisdiction") == "CN",
        },
    }
    if "in_force_at_as_of" in cit:  # 时间问法的时点适用标记随行入账（R144 语义）
        ve["in_force_at_as_of"] = cit["in_force_at_as_of"]
    return ve


def snapshot_from_citations(citations: list[dict]) -> dict:
    """依据条目批量升格为 VerifiedEvidence 快照（按 canonical_unit_id 去重）。"""
    by_unit: dict[str, dict] = {}
    for cit in citations or []:
        ve = verified_evidence(cit)
        if ve is None:
            continue
        by_unit[ve["canonical_unit_id"]] = ve
    evidence = list(by_unit.values())
    documents = sorted({e["canonical_document_id"] for e in evidence})
    return {
        "evidence_count": len(evidence),
        "evidence": evidence,
        "canonical_documents": documents,
    }
