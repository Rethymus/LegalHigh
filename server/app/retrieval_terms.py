# -*- coding: utf-8 -*-
"""生活语言到检索术语的受控映射。

这里只扩展检索词，不生成事实、案由或法律结论。映射同时供求助准备与研究检索使用，
避免两个入口各自维护一套词表后产生排序漂移。
"""
import re

from . import query_citation


def _hoist_direct(hits: list[dict], article: dict, top_k: int) -> list[dict]:
    """直查条文置顶（R501）：精确引用解析强于任何词法匹配——分数取词法最高分
    与 6.0（拒答分界概念值）的较大者 +1，保证跨层语义一致且始终排首。"""
    key = (article["law_id"], article["no"], article.get("sub") or "")
    rest = [h for h in hits if (h["law_id"], h["no"], h.get("sub") or "") != key]
    base = max((hits[0]["score"] if hits else 0.0), 6.0)
    return [{**article, "score": round(float(base) + 1.0, 4),
             "matched_groups": ["direct-citation"]}, *rest][:max(top_k, 1)]


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
            # R435（ADR-0005 模式）：「标价」构词鸿沟——问句「经营者标价有哪些要求」的
            # 「标价」在目标条文中拆为「标明…价格」（crpl-imp-2024#10 原始 BM25 第 179 位，
            # 重排不可及）。组查询=该条文规范词面（组内实测 #1=实施条例#10、#2=价格法#13，
            # 双命中均合法）；when 限定标价类问法，不挤占欺诈/退货问法的轮转位。
            {"id": "consumer-pricing", "when": r"标价|价签|明码标价|计价单位|价格标示",
             "query": "标明商品的品名 价格 计价单位 价签价目齐全"},
        ],
    },
    {
        # known-gaps #9（R166）：「开除/辞退」类口语词面在语料扩张后与证券法
        # 125/147（「被开除…不得招聘」）、治安法等跨法域撞车——金标基线 5 组 4 MISS。
        # 组查询=目标条文的规范词面（组内 #1 实测逐条验证）；主题组只提供查询纪律
        # （名次轮转），排名仍交给 BM25。A/B 全量对比与采纳依据见 docs/adr/0005。
        "id": "labor-termination",
        "pattern": r"开除|辞退|解雇|炒鱿鱼|违法解除|被开了|让我走人|不用来上班",
        "groups": [
            {"id": "termination-illegal", "query": "违反本法规定解除或者终止劳动合同 二倍 赔偿金"},
            {"id": "termination-comp", "query": "经济补偿 每满一年支付一个月工资"},
            {"id": "termination-notice", "query": "额外支付劳动者一个月工资 提前三十日"},
            {"id": "termination-rules", "query": "严重违反用人单位的规章制度"},
            {"id": "termination-probation", "when": r"试用期", "query": "试用期 用人单位不得解除劳动合同"},
        ],
    },
]


def controlled_groups(text: str) -> list[dict]:
    """返回原文实际触发的检索组；不命中时返回空列表。

    组可带 `when`（更细的触发词面）：仅当原文命中时该组激活，且激活的条件组
    排在无条件组之前——特定词面（如「试用期」）出现时其专属条文组优先供位，
    泛化组不挤占其轮转位置（R166 A/B：试用期问法 21 条由 r6 提到 r2）。
    """
    groups: list[dict] = []
    for topic in CONTROLLED_TOPICS:
        if re.search(topic["pattern"], text or "", re.I):
            for group in topic["groups"]:
                when = group.get("when")
                if when and not re.search(when, text or "", re.I):
                    continue
                groups.append({**group, "topic": topic["id"]})
    groups.sort(key=lambda g: 0 if g.get("when") else 1)
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
    # R501 法条直查前置层：「民法典第1254条」类问法确定性置顶（解析失败静默
    # 回退——词法鸿沟里最不该 miss 的一类：条文号就在问句里）。
    direct, direct_meta = None, {}
    cand = query_citation.resolve(query, corpus)
    if cand and (not requested or cand["law_id"] in requested):
        direct = cand
        direct_meta = {"law_id": cand["law_id"], "no": cand["no"],
                       "sub": cand.get("sub") or "", "label": cand["label"],
                       "law_title": cand["law_title"]}
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
        if direct:
            hits = _hoist_direct(hits, direct, top_k)
        meta = {"method": "bm25-char-bigram", "groups": [], "unmatched_groups": []}
        if direct:
            meta["direct_citation"] = direct_meta
        return hits, meta

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
    if direct:
        selected = _hoist_direct(selected, direct, top_k)
    meta = {
        "method": "bm25-controlled-groups",
        "groups": [{"id": group["id"], "query": group["query"], "topic": group["topic"]} for group, _ in ranked_by_group],
        "matched_groups": matched,
        "unmatched_groups": unmatched,
    }
    if direct:
        meta["direct_citation"] = direct_meta
    return selected, meta
