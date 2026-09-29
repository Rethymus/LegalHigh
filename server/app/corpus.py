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


def _q_bigrams(s: str) -> set:
    """查询/正文 bigram 集（R430 重排用；与 BM25 的 tokenize 独立，纯字符级）。"""
    t = "".join(ch for ch in s if ch.isalnum())
    return {t[i:i + 2] for i in range(len(t) - 1)} if len(t) >= 2 else ({t} if t else set())

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
                    "effective_date_evidence": law.get("effective_date_evidence"),
                    "promulgation_instrument": law.get("promulgation_instrument"),
                    "source_url": law["source"]["url"],
                    "source_kind": law["source"]["kind"],
                    "no": a["no"],
                    "sub": a.get("sub"),
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
            key = (a["law_id"], a["no"], a.get("sub", ""))  # 子条号（之一/之二）是独立条文，不得被基条去重
            if key in seen:
                continue
            seen.add(key)
            results.append({**a, "score": round(float(score), 4)})
            if len(results) >= max(top_k, 20):
                break
        # R430 确定性重排（规则⑲ A/B 全量金标实证采用）：top-20 候选内按
        # 0.7*BM25 归一 + 0.3*查询覆盖度（文章 bigram 覆盖查询 bigram 的比例）混合
        # 重排——只调序不改召回；A/B（541 组）救回 1、零打落，hit@5 0.9612→0.9630、
        # MRR 0.7811→0.7885、rank1 0.6654→0.6728（纯提升无回退，脚本 scripts/rerank_ab.py）。
        if len(results) > 1:
            qb = _q_bigrams(query)
            if qb:
                sc = [r["score"] for r in results]
                mx, mn = max(sc), min(sc)
                def _norm(v):
                    return (v - mn) / (mx - mn) if mx > mn else 1.0
                results = sorted(
                    results,
                    key=lambda r: -(0.7 * _norm(r["score"]) + 0.3 * (len(qb & _q_bigrams(r["text"])) / len(qb))),
                )
        return results[:top_k]

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
            "effective_date_evidence": a["effective_date_evidence"],
            "promulgation_instrument": a["promulgation_instrument"],
            "source_url": a["source_url"],
            "source_kind": a["source_kind"],
        }


@lru_cache(maxsize=1)
def get_corpus() -> LawCorpus:
    return LawCorpus()
