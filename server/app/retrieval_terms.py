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


# 每个主题组是一项可解释的检索意图：查询词面由受控组提供（避免口语噪声），
# 但不再限定 law_ids——语料扩至商法/竞争法后，「经营者」一词横跨消保/反垄断/
# 公司法，硬白名单会把商法条文锁出结果（R143 实测：反垄断法第25/26条近原文
# 问法被消保法全占）。主题组只保查询纪律，排名交给 BM25。
CONTROLLED_TOPICS = [
    {
        "id": "consumer",
        "pattern": r"消费者|经营者|商品|假货|退货|网购|欺诈|三无产品|网络交易",
        "groups": [
            {"id": "consumer-fraud", "query": "消费者 欺诈"},
            {"id": "consumer-return", "query": "商品 退货"},
            {"id": "online-platform", "query": "网络交易 平台"},
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
        merged: dict[tuple[str, int], dict] = {}
        # R143：主题组不再限定 law_ids（商法入库后白名单过时）；组查询在全库跑，
        # 调用方显式传 law_ids 时仍收敛到请求范围
        if requested:
            for law_id in sorted(requested):
                for hit in corpus.search(group["query"], top_k=top_k, law_id=law_id):
                    key = (hit["law_id"], hit["no"])
                    if key not in merged or hit["score"] > merged[key]["score"]:
                        merged[key] = hit
        else:
            for hit in corpus.search(group["query"], top_k=top_k):
                key = (hit["law_id"], hit["no"])
                if key not in merged or hit["score"] > merged[key]["score"]:
                    merged[key] = hit
        ranked = sorted(merged.values(), key=lambda h: (-h["score"], h["law_id"], h["no"]))
        ranked_by_group.append((group, ranked))

    # R143：原始查询作为首个检索组参与轮转——受控主题不再「替换」用户词面。
    # 语料扩至竞争法/商法后，「经营者/商品」等词横跨多法域，固定组查询若完全
    # 丢弃原句，商法独有词（搭售/集中/重整）永远到不了 BM25（反垄断法第22条
    # 近原文问法被消费固定组全占的实测）。原句组+受控组轮转合并：既保留主题
    # 纪律（口语噪声不直达），又保证原句独有词参与排名。
    raw_query = (query or "").strip()
    if raw_query:
        merged_raw: dict[tuple[str, int], dict] = {}
        raw_hits = (corpus.search(raw_query, top_k=top_k, law_id=sorted(requested)[0])
                    if requested and len(requested) == 1 else corpus.search(raw_query, top_k=top_k))
        for hit in raw_hits:
            merged_raw[(hit["law_id"], hit["no"])] = hit
        ranked_by_group.insert(0, ({"id": "raw-query", "query": raw_query, "topic": "raw"}, sorted(merged_raw.values(), key=lambda h: (-h["score"], h["law_id"], h["no"]))))

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
