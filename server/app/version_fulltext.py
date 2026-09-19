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
