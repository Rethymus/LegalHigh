# -*- coding: utf-8 -*-
"""生活语言到检索术语的受控映射。

这里只扩展检索词，不生成事实、案由或法律结论。映射同时供求助准备与研究检索使用，
避免两个入口各自维护一套词表后产生排序漂移。
"""
import re


TOPIC_TERMS: list[tuple[str, list[str]]] = [
    (r"工资|欠薪|不发工资|劳动报酬|加班费", ["劳动报酬", "劳动合同", "工资支付"]),
    (r"押金|租房|房东|承租|转租", ["租赁合同", "押金", "出租人"]),
    (r"消费者|经营者|商品|假货|退货|网购|欺诈|三无产品|网络交易", ["消费者", "经营者", "商品", "欺诈", "网络交易", "退货"]),
    (r"违约金|违约|毁约", ["违约金", "违约责任"]),
    (r"离婚|婚姻|抚养", ["离婚", "抚养"]),
    (r"借款|借.{0,2}钱|借贷|欠钱", ["借款合同", "借贷"]),
    (r"车祸|交通事故|撞", ["交通事故"]),
    (r"格式条款|霸王条款", ["格式条款"]),
    (r"竞业|竞业限制", ["竞业限制"]),
    (r"歧视|区别对待|不公正对待", ["平等就业"]),
]


def domain_terms(text: str) -> list[str]:
    """返回由输入原文触发的规范检索词；顺序稳定、去重、无模型参与。"""
    out: list[str] = []
    for pattern, terms in TOPIC_TERMS:
        if re.search(pattern, text or "", re.I):
            for term in terms:
                if term not in out:
                    out.append(term)
    return out


# 每个主题组是一项可解释的检索意图。消费者主题限定在已收录的消费者/电子商务
# 规范中，避免“欺诈”等普通词把刑事或民事程序条文推到公众结果前列。
CONTROLLED_TOPICS = [
    {
        "id": "consumer",
        "pattern": r"消费者|经营者|商品|假货|退货|网购|欺诈|三无产品|网络交易",
        "groups": [
            {"id": "consumer-fraud", "query": "消费者 欺诈", "law_ids": ["cl-2013", "ecom-2018", "wlxf-2022"]},
            {"id": "consumer-return", "query": "商品 退货", "law_ids": ["cl-2013", "ecom-2018", "wlxf-2022"]},
            {"id": "online-platform", "query": "网络交易 平台", "law_ids": ["cl-2013", "ecom-2018", "wlxf-2022"]},
        ],
    },
]


def controlled_groups(text: str) -> list[dict]:
    """返回原文实际触发的检索组；不命中时返回空列表。"""
    groups: list[dict] = []
    for topic in CONTROLLED_TOPICS:
        if re.search(topic["pattern"], text or "", re.I):
            groups.extend({**group, "topic": topic["id"]} for group in topic["groups"])
    return groups


def orchestrated_search(corpus, query: str, top_k: int = 8, law_ids: list[str] | None = None) -> tuple[list[dict], dict]:
    """共享确定性检索编排。

    命中受控主题时，各主题组按名次轮转贡献结果，不比较不同查询的原始 BM25
    分值；未命中时退回单次原句 BM25。返回值中的 matched_groups/retrieval_meta
    让调用方能够说明检索覆盖与缺口。
    """
    groups = controlled_groups(query)
    top_k = max(1, int(top_k))
    requested = set(law_ids or [])
    if not groups:
        if law_ids:
            merged: dict[tuple[str, int], dict] = {}
            for law_id in law_ids:
                for hit in corpus.search(query, top_k=top_k, law_id=law_id):
                    key = (hit["law_id"], hit["no"])
                    if key not in merged or hit["score"] > merged[key]["score"]:
                        merged[key] = hit
            hits = sorted(merged.values(), key=lambda h: (-h["score"], h["law_id"], h["no"]))[:top_k]
        else:
            hits = corpus.search(query, top_k=top_k)
        return hits, {"method": "bm25-char-bigram", "groups": [], "unmatched_groups": []}

    ranked_by_group: list[tuple[dict, list[dict]]] = []
    for group in groups:
        allowed = [lid for lid in group["law_ids"] if not requested or lid in requested]
        merged: dict[tuple[str, int], dict] = {}
        for law_id in allowed:
            for hit in corpus.search(group["query"], top_k=top_k, law_id=law_id):
                key = (hit["law_id"], hit["no"])
                if key not in merged or hit["score"] > merged[key]["score"]:
                    merged[key] = hit
        ranked = sorted(merged.values(), key=lambda h: (-h["score"], h["law_id"], h["no"]))
        ranked_by_group.append((group, ranked))

    selected: list[dict] = []
    positions = [0] * len(ranked_by_group)
    seen: set[tuple[str, int]] = set()
    while len(selected) < top_k:
        progressed = False
        for i, (group, ranked) in enumerate(ranked_by_group):
            while positions[i] < len(ranked):
                hit = ranked[positions[i]]
                positions[i] += 1
                key = (hit["law_id"], hit["no"])
                if key in seen:
                    continue
                selected.append({**hit, "matched_groups": [group["id"]]})
                seen.add(key)
                progressed = True
                break
            if len(selected) >= top_k:
                break
        if not progressed:
            break

    matched = [group["id"] for group, ranked in ranked_by_group if ranked]
    unmatched = [group["id"] for group, ranked in ranked_by_group if not ranked]
    return selected, {
        "method": "bm25-controlled-groups",
        "groups": [{"id": group["id"], "query": group["query"], "topic": group["topic"]} for group, _ in ranked_by_group],
        "matched_groups": matched,
        "unmatched_groups": unmatched,
    }
