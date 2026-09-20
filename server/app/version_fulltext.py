# -*- coding: utf-8 -*-
"""历史版本全文服务层（known-gaps #1 垂直切片，R167）。

`server/data/law_versions_fulltext/<law_id>/<version_id>.json` 由
`scripts/build_version_fulltext.py` 从已注册证据快照构建（fail-closed）。
本模块只做读取与双重校验：文件自身 schema + 与注册表双向一致
（版本必须已登记；条文数必须与注册表逐一相等——任何一侧超前/落后都拒绝）。

历史全文不进现行检索语料、不进金标；对外必须携带「非现行文本」口径字段。
"""
import json
import re
from pathlib import Path

from . import law_versions as law_versions_mod

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
FULLTEXT_DIR = DATA_DIR / "law_versions_fulltext"
SAFE_ID = re.compile(r"^[\w][\w\-]*$")
_REQUIRED_SOURCE_FIELDS = ("kind", "grade", "url", "snapshot", "accessed_at", "sha256")


def fulltext_path(law_id: str, version_id: str) -> Path:
    if not SAFE_ID.match(law_id) or not SAFE_ID.match(version_id):
        raise ValueError(f"unsafe id: {law_id!r}/{version_id!r}")
    return FULLTEXT_DIR / law_id / f"{version_id}.json"


def has_fulltext(law_id: str, version_id: str) -> bool:
    try:
        return fulltext_path(law_id, version_id).exists()
    except ValueError:
        return False


def load(law_id: str, version_id: str) -> dict:
    """读取并双校验历史全文；任何不一致抛 ValueError（端点呈现 500），
    文件/注册表缺失抛 FileNotFoundError（端点呈现 404）。"""
    path = fulltext_path(law_id, version_id)
    if not path.exists():
        raise FileNotFoundError(f"该版本历史全文尚未采集入库：{law_id}/{version_id}")
    data = json.loads(path.read_text(encoding="utf-8"))

    if data.get("schema_version") != 1:
        raise ValueError(f"schema_version 不支持：{data.get('schema_version')!r}")
    if data.get("law_id") != law_id or data.get("version_id") != version_id:
        raise ValueError("文件内 law_id/version_id 与请求不一致")
    articles = data.get("articles")
    if not isinstance(articles, list) or not articles:
        raise ValueError("articles 缺失或为空")
    for a in articles:
        if not isinstance(a.get("no"), int) or not isinstance(a.get("text"), str) or not a["text"].strip():
            raise ValueError(f"条文字段不合法：{a!r}")
    if data.get("article_count") != len(articles):
        raise ValueError(f"article_count {data.get('article_count')} ≠ 实际 {len(articles)} 条")
    source = data.get("source") or {}
    for f in _REQUIRED_SOURCE_FIELDS:
        if not source.get(f):
            raise ValueError(f"source 缺少 {f}")
    if not data.get("scope_note") or "非现行" not in data["scope_note"]:
        raise ValueError("历史全文必须携带「非现行」口径说明")

    # 与注册表双向一致：版本必须已登记；条数逐一相等（任何一侧超前都拒绝）
    registry = law_versions_mod.load_registry(law_id)
    version = next((v for v in registry["versions"] if v["version_id"] == version_id), None)
    if version is None:
        raise ValueError(f"全文存在但注册表未登记该版本：{law_id}/{version_id}")
    if version.get("article_count") != len(articles):
        raise ValueError(f"条数与注册表不一致：全文 {len(articles)} vs 注册表 {version.get('article_count')}")
    if data.get("effective_date") != version.get("effective_date"):
        raise ValueError("生效日期与注册表不一致")
    return data


def list_available(law_id: str) -> list[str]:
    """该法律下已有全文文件的版本 id 列表（目录不存在返回空）。"""
    if not SAFE_ID.match(law_id):
        raise ValueError(f"unsafe id: {law_id!r}")
    d = FULLTEXT_DIR / law_id
    if not d.exists():
        return []
    return sorted(p.stem for p in d.glob("*.json") if SAFE_ID.match(p.stem))


_SHIFT_NOTE = "历史版本按同条号对照；版本间条文序号可能因修正移位，仅供对照、不自动断言适用。"


def _locate_mapped_ancestor(law_id: str, applicable_vid: str, no: int, sub: str | None):
    """在相邻版本对（前一全文版 → 适用版）中反查卡片条号的映射祖先。

    返回 kind=renumbered 且 to_key=卡片键的条目（from_no=内容在适用版中的
    真实条号）；身份映射（from==to）与无条目返回 None——同条号即祖先。
    延迟导入 version_renumber 防循环（其自身引用本模块）。
    """
    from . import version_renumber  # noqa: PLC0415 延迟导入防循环

    try:
        mapping = version_renumber.build_map(law_id)
    except (ValueError, FileNotFoundError):
        return None
    for p in mapping.get("pairs", []):
        if p["to_version"] != applicable_vid:
            continue
        for e in p.get("matches", []):
            if e["to_no"] == int(no) and (e["to_sub"] or "") == (sub or ""):
                if e["from_no"] != no or (e["from_sub"] or "") != (sub or ""):
                    return e
                return None
    return None


def applicable_version(law_id: str, as_of: str) -> dict | None:
    """注册表口径下的 as_of 适用版本：施行日与公布日均 ≤ as_of 的版本中，公布日最新者。

    （修正版的 effective_date 沿用附则跨修正延续口径，因此公布日是区分
    「已通过但尚未施行」的关键——刑法 2020 修正公布于 2020-12-26，as_of=2020-05
    时不得适用。）无候选（as_of 早于本法施行）返回 None。
    """
    registry = law_versions_mod.load_registry(law_id)
    candidates = [
        v for v in registry.get("versions", [])
        if v.get("effective_date") and v.get("promulgation_date")
        and v["effective_date"] <= as_of and v["promulgation_date"] <= as_of
    ]
    if not candidates:
        return None
    return max(candidates, key=lambda v: (v["promulgation_date"], v["effective_date"]))


def historical_for_card(law_id: str, as_of: str, no: int, sub: str | None = None) -> dict | None:
    """as_of 命中面（known-gaps #1 最后一块）：答案卡/检索命中的历史版本对照。

    适用版本为现行（或该法无注册表/全文未采集/条号未检出）时返回 None——
    命中卡保持原形；命中历史版本时返回版本标识 + 该条号的历史文本 +
    移位风险显式标注。本函数只做增强、不改变既有契约字段。
    """
    if not as_of:
        return None  # 指代词场景：检测到时间语境但无具体时点，不猜
    try:
        version = applicable_version(law_id, as_of)
    except (ValueError, FileNotFoundError):
        return None
    if version is None or version.get("current"):
        return None  # 适用文本即现行文本（卡片已携带）或该法此时尚未施行
    try:
        doc = load(law_id, version["version_id"])
    except (ValueError, FileNotFoundError):
        return None
    article = next((a for a in doc["articles"]
                    if a["no"] == int(no) and (a.get("sub") or "") == (sub or "")), None)
    # 重编号映射接入（R171）：同条号未命中或命中但映射显示该条内容系重编号而来时，
    # 反查映射祖先条号（from_no），返回映射后条号的历史文本并显式标注定位方式。
    mapped_entry = _locate_mapped_ancestor(law_id, version["version_id"], no, sub)
    via = None
    if mapped_entry is not None:
        mapped_key = (mapped_entry["from_no"], mapped_entry["from_sub"] or "")
        candidate = next((a for a in doc["articles"] if (a["no"], a.get("sub") or "") == mapped_key), None)
        if candidate is not None:
            article = candidate
            via = {
                "located_via": "renumber-map",
                "mapped_from_no": mapped_entry["from_no"],
                "mapped_from_sub": mapped_entry["from_sub"] or None,
                "mapped_ratio": mapped_entry["ratio"],
            }
    # 多跳链式兜底（R196）：一跳映射也未命中时，沿时间线从最新全文版反向追踪
    if article is None and via is None:
        from . import version_renumber
        traced = version_renumber.trace_to_target(law_id, version["version_id"], no, sub)
        if traced is not None:
            traced_key = (traced[0], traced[1] or "")
            article = next((a for a in doc["articles"] if (a["no"], a.get("sub") or "") == traced_key), None)
    shift_note = (f"经重编号映射定位（ratio {mapped_entry['ratio']}）；" if via else "") + _SHIFT_NOTE
    return {
        "version_id": version["version_id"],
        "label": version["label"],
        "promulgation_date": version.get("promulgation_date"),
        "effective_date": version.get("effective_date"),
        "text": article["text"] if article else None,
        "label_found": article["label"] if article else None,
        **({"located_via": via["located_via"], "mapped_from_no": via["mapped_from_no"],
            "mapped_from_sub": via["mapped_from_sub"], "mapped_ratio": via["mapped_ratio"]} if via else {}),
        "shift_note": shift_note,
    }
