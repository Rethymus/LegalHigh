# -*- coding: utf-8 -*-
"""公开语料覆盖边界与更新队列；队列不是已接入数据。"""
import json
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlsplit

from .corpus import get_corpus

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "corpus_coverage.json"


@lru_cache(maxsize=1)
def get_coverage() -> dict:
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    if data.get("schema_version") != 1:
        raise ValueError("语料覆盖登记册 schema 不受支持")
    corpus_ids = set(get_corpus().laws)
    registered = set(data.get("controlled_instrument_ids") or [])
    if registered != corpus_ids:
        raise ValueError(f"语料覆盖登记册与实际 corpus 不一致: missing={corpus_ids-registered}, extra={registered-corpus_ids}")
    catalog = data["national_law_catalog"]
    if int(catalog.get("count") or 0) <= 0 or urlsplit(catalog.get("source_url") or "").scheme != "https":
        raise ValueError("现行法律目录依据不完整")
    for item in data.get("priority_backlog") or []:
        if item.get("status") != "official-source-identified-not-imported":
            raise ValueError("更新队列不得伪装为已接入")
        if urlsplit(item.get("source_url") or "").scheme != "https":
            raise ValueError("更新队列来源不是 HTTPS")
    return data
