# -*- coding: utf-8 -*-
"""法律研究备忘录：多查询 BM25 检索 → 依据聚类 → 诚实缺口。

数据纪律：本模块是纯确定性代码（无 LLM、无网络调用、无凭据）。issue_frame 只做
程序化改写不加观点；framework / cards / references 的每个字段都来自 app.corpus
语料，且 references 在构建时经 corpus.citation_of 逐条解析校验（引用不存在会抛
KeyError——这是期望的保护行为）。检索弱时只输出 gaps 提示，绝不推断。
"""
from .corpus import get_corpus, tokenize
from .qa import DISCLAIMER
from .retrieval_terms import domain_terms, orchestrated_search

# 停用词表（确定性常量）：语气助词 / 疑问泛指词 / 与「法律依据」同义的泛称词。
# 「依据/法律/规定」在关键词里保留亦无害，此处按保守口径滤除，保证可测试。
STOPWORDS = {
    "的", "了", "吗", "呢", "吧", "啊", "请", "问", "什么", "怎么", "如何",
    "是", "有", "没有", "我", "他", "她", "它", "的什么", "依据", "法律", "规定",
    "可以", "哪些", "现行", "法条", "核对", "请问", "相关",
}

# 单字停用词：任何包含这些字的词项（中文二元组）都不进入关键词。
_STOP_CHARS = {w for w in STOPWORDS if len(w) == 1}
# 多字停用词：词项等于或内含于这些短语的不进入关键词。
_STOP_PHRASES = {w for w in STOPWORDS if len(w) > 1}

KEYWORD_LIMIT = 8


def _is_stop_token(token: str) -> bool:
    if any(ch in _STOP_CHARS for ch in token):
        return True
    if token in _STOP_PHRASES:
        return True
    return any(token in phrase for phrase in _STOP_PHRASES)


def extract_keywords(question: str, limit: int = KEYWORD_LIMIT) -> list[str]:
    """关键词提取：复用 corpus.tokenize（中文二元组 / ASCII 整词），去停用词后
    按出现频次取前 limit 个；频次相同按首次出现顺序排序——结果确定可测。"""
    counts: dict[str, int] = {}
    first_pos: dict[str, int] = {}
    for pos, tok in enumerate(tokenize(question or "")):
        if _is_stop_token(tok):
            continue
        counts[tok] = counts.get(tok, 0) + 1
        first_pos.setdefault(tok, pos)
    ranked = sorted(counts, key=lambda t: (-counts[t], first_pos[t]))
    return ranked[:limit]


def _run_query(corpus, query: str, top_k: int, law_ids):
    """跑一组查询（复用 corpus.search 的 BM25）。law_ids 非空时逐部法律检索，
    利用 search 自带的单法过滤，保证范围限定在检索层生效。"""
    if law_ids:
        hits = []
        for lid in law_ids:
            hits.extend(corpus.search(query, top_k=top_k, law_id=lid))
        return hits
    return corpus.search(query, top_k=top_k)


def build_research_memo(question: str, law_ids: list[str] | None = None, top_k: int = 12) -> dict:
    """受控生活语言命中时使用规范术语检索；否则以原句、关键词与首条命中章节
    执行多查询。随后按 (law_id, no) 合并去重、排序，并逐条 citation_of 校验。"""
    corpus = get_corpus()
    question = (question or "").strip()
    top_k = max(1, int(top_k))

    # law_ids 范围过滤：未知法律编号直接报错（ValueError），不静默忽略
    if law_ids:
        clean_ids = [lid for lid in law_ids if lid]
        unknown = [lid for lid in clean_ids if lid not in corpus.laws]
        if unknown:
            raise ValueError(f"未收录的法律编号：{'、'.join(unknown)}")
        law_ids = clean_ids or None
    else:
        law_ids = None

    domains = domain_terms(question)
    raw_keywords = extract_keywords(question)
    keywords = domains + [token for token in raw_keywords if token not in domains and not any(token in term for term in domains)]
    keywords = keywords[:KEYWORD_LIMIT]
    # 命中受控生活语言映射时，用规范术语作为主查询，避免“可以/哪些/现行法条”等问句
    # 套话凭高词频把无关条文推到前面。原问题仍原样保留在 issue_frame，绝不改写事实。
    primary_query = " ".join(keywords) if domains else question
    queries = [primary_query]
    if not domains and keywords and primary_query != " ".join(keywords):
        queries.append(" ".join(keywords))

    merged: dict[tuple, dict] = {}  # (law_id, no) -> 得分最高的命中

    def merge(hits):
        for h in hits:
            key = (h["law_id"], h["no"])
            if key not in merged or h["score"] > merged[key]["score"]:
                merged[key] = h

    controlled_hits, retrieval = orchestrated_search(corpus, question, top_k=top_k, law_ids=law_ids)
    first_hits = controlled_hits if domains else _run_query(corpus, queries[0], top_k, law_ids)
    merge(first_hits)
    if len(queries) > 1:
        merge(_run_query(corpus, queries[1], top_k, law_ids))

    # 第三组查询：用首次 top 命中条文的 chapter 标题扩展原问题重查一次
    # （chapter 在语料 schema 中可为 None——防御性兜底，扩空串等价于不扩展）
    seed_pool = first_hits or (sorted(merged.values(), key=lambda h: -h["score"]) if merged else [])
    # 受控领域词已经完成语义扩展时，不再用首条的编章标题二次扩展；否则较长的标题
    # 查询会产生不可与原查询直接比较的更大 BM25 原始分，并把同一章节整批挤到前列。
    if seed_pool and not domains:
        expanded = question + " " + (seed_pool[0]["chapter"] or "").replace(">", " ")
        queries.append(expanded)
        merge(_run_query(corpus, expanded, top_k, law_ids))

    ranked = sorted(merged.values(), key=lambda h: (-h["score"], h["law_id"], h["no"]))
    cards = [
        {
            "law_id": h["law_id"],
            "law_title": h["law_title"],
            "law_status": h["law_status"],
            "effective_date": h["effective_date"],
            "promulgation_instrument": h["promulgation_instrument"],
            "article_no": h["no"],
            "article_label": h["label"],
            "chapter": h["chapter"],
            "text": h["text"],
            "source_url": h["source_url"],
            "source_kind": h["source_kind"],
            "score": h["score"],
        }
        for h in ranked[:top_k]
    ]

    # 引用不变量收口：references 与 cards 一一对应，逐条经 citation_of 解析校验
    references = []
    for c in cards:
        cit = corpus.citation_of(c["law_id"], c["article_no"])  # 不存在即 KeyError
        references.append({
            "kind": "statute",
            "law_id": cit["law_id"],
            "article_no": cit["article_no"],
            "article_label": cit["article_label"],
            "law_title": cit["law_title"],
            "status": cit["status"],
            "effective_date": cit["effective_date"],
            "source_url": cit["source_url"],
            "text": cit["text"],
        })

    # 法律框架：按法律聚类；编章取自命中条文 chapter 字段去重，不新增事实
    by_law: dict[str, list] = {}
    for c in cards:
        by_law.setdefault(c["law_id"], []).append(c)
    framework = []
    for lid, group in by_law.items():
        chapters = []
        for c in group:
            if c["chapter"] and c["chapter"] not in chapters:
                chapters.append(c["chapter"])
        framework.append({
            "law_id": lid,
            "law_title": group[0]["law_title"],
            "chapters": chapters,
            "hit_count": len(group),
        })
    framework.sort(key=lambda f: (-f["hit_count"], f["law_id"]))

    # 诚实缺口：命中 0 条如实声明不作推断；命中过少提示依据薄弱
    gaps = []
    if len(cards) == 0:
        gaps.append(
            f"本库语料（{len(corpus.laws)} 部法规，共 {len(corpus.articles):,} 条）"
            "未检索到与该问题相关的依据，本备忘录不作任何推断。"
        )
    elif len(cards) <= 2:
        gaps.append(
            f"本次检索仅命中 {len(cards)} 条依据，依据较少，"
            "建议补充关键词或扩大检索范围后再行研究。"
        )
    if domains and retrieval.get("unmatched_groups"):
        gaps.append(
            "以下受控主题组未在当前检索范围中找到直接依据："
            + "、".join(retrieval["unmatched_groups"])
            + "。系统不会用其他主题的偶然词法命中替代。"
        )

    return {
        "question": question,
        "scope": {"law_ids": law_ids, "top_k": top_k},
        "issue_frame": {
            "restate": f"就『{question}』在现行法规语料中的依据检索",
            "keywords": keywords,
        },
        "framework": framework,
        "cards": cards,
        "gaps": gaps,
        "references": references,
        "disclaimer": DISCLAIMER,
        "meta": {
            "method": (retrieval["method"] if retrieval.get("groups") else "bm25-controlled-terms") if domains else "bm25-multiquery",
            "queries": [group["query"] for group in retrieval.get("groups", [])] if domains else queries,
            "matched_groups": retrieval.get("matched_groups", []),
            "unmatched_groups": retrieval.get("unmatched_groups", []),
            "corpus_size": len(corpus.articles),
        },
    }
