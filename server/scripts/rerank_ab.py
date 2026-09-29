# -*- coding: utf-8 -*-
"""词法鸿沟确定性重排 A/B 实验（R430，规则⑲门：回退超 1% 即不采用）。

背景（R425 调研驱动）：legal-rag-agent 方法论「增强必须过固定评测集证明价值」+
lawyerAgents 重排思路的确定性化——BM25 top-20 候选内按「查询覆盖度」重排：
score = 覆盖的查询 bigram 比例（文章提及用户所问的比例），只调序不改召回。
针对 miss@5 多法同概念歧义案例（正确条文在 top-20 内但排名 >5）。
变体：V1 纯覆盖度 / V2-4 混合 α·BM25 + (1-α)·覆盖度（α=0.3/0.5/0.7）。
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.corpus import get_corpus  # noqa: E402

GOLD = Path(__file__).resolve().parent.parent / "tests" / "gold" / "gold_retrieval.json"


def bigrams(s: str) -> set:
    t = "".join(ch for ch in s if ch.isalnum())
    return {t[i:i+2] for i in range(len(t) - 1)} if len(t) >= 2 else ({t} if t else set())


def metrics(order):
    """order: 每题的 [(law_id, no, sub)] 排序列表（全 20 条），取前 5 口径。"""
    hits = rank1 = 0
    rr = 0.0
    miss = []
    for case, got in order:
        expected = {(e["law_id"], e["no"], e.get("sub", "")) for e in case["expect"]}
        rank = next((i for i, k in enumerate(got[:5], 1) if k in expected), None)
        if rank:
            hits += 1
            rank1 += (rank == 1)
            rr += 1.0 / rank
        else:
            miss.append(case["id"])
    n = len(order)
    return {"hit5": hits / n, "mrr": rr / n, "rank1": rank1 / n, "miss": miss}


def main():
    gold = json.loads(GOLD.read_text(encoding="utf-8"))["cases"]
    corpus = get_corpus()
    res20 = [corpus.search(g["question"], top_k=20) for g in gold]
    variants = {"baseline": [], "V1_pure": [], "V2_a0.3": [], "V3_a0.5": [], "V4_a0.7": []}
    for case, hits in zip(gold, res20):
        if not hits:
            for v in variants.values():
                v.append([])
            continue
        qb = bigrams(case["question"])
        scores = [h["score"] for h in hits]
        mx, mn = max(scores), min(scores)
        def norm(s):
            return (s - mn) / (mx - mn) if mx > mn else 1.0
        keyed = []
        for h in hits:
            cov = len(qb & bigrams(h["text"])) / max(len(qb), 1)
            keyed.append((norm(h["score"]), cov, (h["law_id"], h["no"], h.get("sub") or "")))
        variants["baseline"].append([k[2] for k in keyed])
        variants["V1_pure"].append([k[2] for k in sorted(keyed, key=lambda x: -x[1])])
        for name, a in (("V2_a0.3", 0.3), ("V3_a0.5", 0.5), ("V4_a0.7", 0.7)):
            variants[name].append([k[2] for k in sorted(keyed, key=lambda x: -(a * x[0] + (1 - a) * x[1]))])
    print(f"金标 {len(gold)} 题")
    base = None
    for name, order in variants.items():
        m = metrics(list(zip(gold, order)))
        tag = ""
        if base and name != "baseline":
            d_hit = (m["hit5"] - base["hit5"]) * 100
            d_mrr = (m["mrr"] - base["mrr"]) * 100
            verdict = "可采用" if d_hit > 0 and d_mrr >= -1.0 else ("回退>1%不采用" if d_mrr < -1.0 or d_hit < 0 else "中性")
            tag = f"  Δhit {d_hit:+.2f}pp ΔMRR {d_mrr:+.2f}pp → {verdict}"
        if name == "baseline":
            base = m
        print(f"{name:<11} hit@5={m['hit5']:.4f} MRR={m['mrr']:.4f} rank1={m['rank1']:.4f} miss={len(m['miss'])}{tag}")
        if name == "baseline":
            base_miss = set(m["miss"])
    # 各变体把哪些基线 miss 救回 / 把哪些基线命中打落
    for name in ("V1_pure", "V2_a0.3", "V3_a0.5", "V4_a0.7"):
        m = metrics(list(zip(gold, variants[name])))
        rescued = base_miss - set(m["miss"])
        lost = set(m["miss"]) - base_miss
        print(f"{name}: 救回 {len(rescued)} {sorted(rescued)[:4]} · 打落 {len(lost)} {sorted(lost)[:4]}")


if __name__ == "__main__":
    main()
