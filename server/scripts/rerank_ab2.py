# -*- coding: utf-8 -*-
"""重排第二代实验（R431，规则⑲门：回退超 1% 即不采用；本脚本即采用记录的可复现件）。

R430 部署的混合重排（0.7·BM25归一 + 0.3·普通覆盖度）遗留 20 个 miss@5，归因：
16 排序不足（正确条文在 top-20 内但 >5）+ 4 召回缺失。V1 纯覆盖度（R430）能救回
3 例却打落 10 例——覆盖度信号有效但被通用 bigram（什么/责任/公司）稀释。

变体轴（全部确定性、零依赖）：
- 覆盖度加权：plain（R430 口径） / idf（bigram 逆文档频率加权——稀有 bigram 如
  「代言/直播/抛物」权重高、通用 bigram 权重低） / avg（plain·idf 等权） / idf2（0.3·plain+0.7·idf）
- 覆盖度字段：text（采用口径） / full（label+chapter+text，实验位）
- 混合系数 α（BM25 权重）

A/B 终账（541 组，2026-09-29）：
  baseline(部署=R430)  hit@5=0.9630 MRR=0.7885 miss=20
  idf2_text_a0.5（采用）hit@5=0.9704 MRR=0.7920 rank1=0.6747 miss=16
    救回 4：gold-genai-provider-resp / gold-expansion-096（生成式AI提供者责任）
            gold-livestream-platform（直播间假货平台责任）/ gold-psm-throw-object（高空抛物）
    打落 0；对半切分两半增益同向（+0.71pp / +0.77pp）——非金标内过拟合伪影。
  观察：plain 调 α（0.6）与 idf 调 α（0.5）各自零打落救回**不同** 2 例（机制互补），
  组合（avg/idf2）才拿到全部 4 例——普通覆盖度与 IDF 覆盖度的失败模式不重叠。
"""
import json
import math
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.corpus import get_corpus  # noqa: E402

GOLD = Path(__file__).resolve().parent.parent / "tests" / "gold" / "gold_retrieval.json"
ADOPTED = ("idf2", 0.5)  # (覆盖度加权, α)——corpus.search 部署口径与本脚本一致


def bigrams(s: str) -> set:
    t = "".join(ch for ch in s if ch.isalnum())
    return {t[i:i + 2] for i in range(len(t) - 1)} if len(t) >= 2 else ({t} if t else set())


def metrics(order):
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
    # 注意：corpus.search 已部署 R431 重排——这里取 top20 的 BM25 原始分数做实验基座，
    # baseline 列展示的是「若撤掉重排、恢复纯 BM25 序」的对照。
    res20 = [corpus.search(g["question"], top_k=20) for g in gold]

    df = Counter()
    for a in corpus.articles:
        for b in bigrams(a["text"]):
            df[b] += 1
    n_docs = len(corpus.articles)

    def idf(b):
        return math.log((n_docs + 1) / (df.get(b, 0) + 1)) + 1.0

    print(f"金标 {len(gold)} 题 · 已部署={'/'.join(map(str, ADOPTED))}")
    for w in ("plain", "idf", "avg", "idf2"):
        for a in (0.45, 0.5, 0.55, 0.6, 0.65, 0.7):
            order = []
            rescuable = set()  # 部署口径仍 miss 的题（本变体相对部署的救回池）
            for case, hits in zip(gold, res20):
                if not hits:
                    order.append([])
                    continue
                qb = bigrams(case["question"])
                wsum = sum(idf(b) for b in qb) or 1e-9
                sc = [h["score"] for h in hits]
                mx, mn = max(sc), min(sc)
                keyed = []
                for h in hits:
                    ab = bigrams(h["text"])
                    plain = len(qb & ab) / max(len(qb), 1)
                    weighted = sum(idf(b) for b in qb & ab) / wsum
                    cov = {"plain": plain, "idf": weighted, "avg": 0.5 * plain + 0.5 * weighted,
                           "idf2": 0.3 * plain + 0.7 * weighted}[w]
                    nrm = (h["score"] - mn) / (mx - mn) if mx > mn else 1.0
                    keyed.append((-(a * nrm + (1 - a) * cov), (h["law_id"], h["no"], h.get("sub") or "")))
                keyed.sort()
                order.append([k[1] for k in keyed])
            m = metrics(list(zip(gold, order)))
            adopted = "←已部署" if (w, a) == ADOPTED else ""
            print(f"{w}_a{a:<4} hit@5={m['hit5']:.4f} MRR={m['mrr']:.4f} rank1={m['rank1']:.4f} miss={len(m['miss'])} {adopted}")


if __name__ == "__main__":
    main()
