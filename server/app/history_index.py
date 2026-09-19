# -*- coding: utf-8 -*-
"""历史文本独立检索索引（known-gaps #1，R172）。

对 data/law_versions_fulltext/ 的全部历史条文建独立 BM25 索引（与现行语料
同一引擎、同一分词口径——决策 2 的「单一引擎」指排序引擎一致；历史文本是
独立命名空间，绝不混入现行检索排名）：

- 现行检索（/api/search、/api/qa/ask）永远只查现行语料；
- 本索引服务于「历史文本独立检索」：给定词面，直接命中历史版本条文，
  每条携带 version_id/label 与非现行口径，供对照研究消费。

确定性、惰性构建（进程内缓存）、零网络。历史文本不进金标、不进现行评测。
"""
import json
import pathlib

from functools import lru_cache

from rank_bm25 import BM25Okapi

from .corpus import tokenize

DATA_DIR = pathlib.Path(__file__).resolve().parent.parent / "data"
FULLTEXT_DIR = DATA_DIR / "law_versions_fulltext"

SCOPE_NOTE = ("检索范围为【历史版本文本】（非现行），仅供对照研究；"
              "不构成现行法律依据，现行文本请使用主检索。")


def _records():
    records = []
    for p in sorted(FULLTEXT_DIR.glob("*/*.json")):
        try:
            doc = json.loads(p.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        for a in doc.get("articles", []):
            records.append({
                "law_id": doc["law_id"],
                "version_id": doc["version_id"],
                "version_label": doc.get("label", ""),
                "effective_date": doc.get("effective_date"),
                "no": a["no"],
                "sub": a.get("sub"),
                "label": a.get("label", ""),
                "chapter": a.get("chapter"),
                "text": a["text"],
            })
    return records


@lru_cache(maxsize=1)
def _index():
    records = _records()
    corpus_tokens = [tokenize(r["label"] + "\n" + (r["chapter"] or "") + "\n" + r["text"]) for r in records]
    return BM25Okapi(corpus_tokens), records


def invalidate():
    """语料/全文文件变更后由调用方显式失效（进程内缓存口径，与 /api/evals 一致）。"""
    _index.cache_clear()


def search(q: str, top_k: int = 10, law_id: str | None = None,
           version_id: str | None = None) -> dict:
    """历史条文 BM25 检索；law_id/version_id 过滤后排序（引擎与主检索同源）。"""
    top_k = max(1, int(top_k))
    bm25, records = _index()
    tokens = tokenize(q or "")
    scores = bm25.get_scores(tokens) if tokens else [0.0] * len(records)
    scored = []
    for r, s in zip(records, scores):
        if law_id and r["law_id"] != law_id:
            continue
        if version_id and r["version_id"] != version_id:
            continue
        scored.append((float(s), r))
    scored.sort(key=lambda t: (-t[0], t[1]["law_id"], t[1]["version_id"], t[1]["no"], t[1]["sub"] or ""))
    hits = [{**r, "score": round(s, 3)} for s, r in scored[:top_k]]
    return {
        "query": q,
        "total": len(hits),
        "hits": hits,
        "scope_note": SCOPE_NOTE,
        "index_versions": len({r["version_id"] for r in records}),
        "index_articles": len(records),
    }
