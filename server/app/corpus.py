# -*- coding: utf-8 -*-
"""法条语料加载与检索。

数据纪律：只加载 server/data/laws/（由 build_corpus.py 从证据快照生成），
任何文章对象都携带 law 元数据与来源链接——引用不变量的数据底座。
"""
import json
import re
from functools import lru_cache
from pathlib import Path

from rank_bm25 import BM25Okapi

DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "laws"

_WORD_RE = re.compile(r"[a-zA-Z0-9]+")


def tokenize(text: str):
    """中文按二元组切分（无需分词依赖），ASCII 词整词保留——可复现的确定性分词。"""
    tokens = []
    clean = re.sub(r"\s+", "", text)
    for m in _WORD_RE.finditer(clean):
        tokens.append(m.group(0).lower())
    han = re.sub(r"[^\u4e00-\u9fff]", "", clean)
    for i in range(len(han) - 1):
        tokens.append(han[i:i + 2])
    if len(han) == 1:
        tokens.append(han)
    return tokens


class LawCorpus:
    def __init__(self, data_dir: Path = DATA_DIR):
        self.laws = {}
        self.articles = []
        manifest = json.loads((data_dir / "manifest.json").read_text(encoding="utf-8"))
        self.manifest = manifest
        for m in manifest["laws"]:
            law = json.loads((data_dir / (m["law_id"] + ".json")).read_text(encoding="utf-8"))
            self.laws[m["law_id"]] = law
            for a in law["articles"]:
                self.articles.append({
                    "law_id": m["law_id"],
                    "law_title": law["title"],
                    "law_status": law["status"],
                    "effective_date": law.get("effective_date"),
                    "promulgation_instrument": law.get("promulgation_instrument"),
                    "source_url": law["source"]["url"],
                    "source_kind": law["source"]["kind"],
                    "no": a["no"],
                    "label": a["label"],
                    "chapter": a["chapter"],
                    "text": a["text"],
                })
        self._index = None

    @property
    def index(self):
        if self._index is None:
            corpus_tokens = [tokenize(a["label"] + "\n" + (a["chapter"] or "") + "\n" + a["text"]) for a in self.articles]
            self._index = BM25Okapi(corpus_tokens)
        return self._index

    def search(self, query: str, top_k: int = 8, law_id: str | None = None):
        tokens = tokenize(query)
        if not tokens:
            return []
        scores = self.index.get_scores(tokens)
        ranked = sorted(zip(scores, range(len(self.articles))), key=lambda x: -x[0])
        results = []
        seen = set()
        for score, idx in ranked:
            a = self.articles[idx]
            if law_id and a["law_id"] != law_id:
                continue
            if score <= 0:
                break
            key = (a["law_id"], a["no"])
            if key in seen:
                continue
            seen.add(key)
            results.append({**a, "score": round(float(score), 4)})
            if len(results) >= top_k:
                break
        return results

    def get_article(self, law_id: str, no: int):
        for a in self.articles:
            if a["law_id"] == law_id and a["no"] == no:
                return {**a}
        return None

    def citation_of(self, law_id: str, no: int):
        """把 (law_id, no) 解析为完整引用对象（含版本/施行日期/来源），引用不变量在此收口。"""
        a = self.get_article(law_id, no)
        if not a:
            raise KeyError(f"citation not in corpus: {law_id}#{no}")
        return {
            "law_id": law_id,
            "law_title": a["law_title"],
            "article_no": no,
            "article_label": a["label"],
            "chapter": a["chapter"],
            "text": a["text"],
            "status": a["law_status"],
            "effective_date": a["effective_date"],
            "source_url": a["source_url"],
            "source_kind": a["source_kind"],
        }


@lru_cache(maxsize=1)
def get_corpus() -> LawCorpus:
    return LawCorpus()
