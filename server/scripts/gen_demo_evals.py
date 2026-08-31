# -*- coding: utf-8 -*-
"""生成演示模式静态评测数据（web/public/data/evals.json）：与 server /api/evals 同算法同金标。
运行：server/.venv/Scripts/python.exe scripts/gen_demo_evals.py（在仓库根执行）"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent  # 仓库根（server/scripts → server → root）
sys.path.insert(0, str(ROOT / "server"))

from app.corpus import get_corpus  # noqa: E402

gold = json.loads((ROOT / "server" / "tests" / "gold" / "gold_retrieval.json").read_text(encoding="utf-8"))
corpus = get_corpus()
items, hits, rr, prec = [], 0, 0.0, 0.0
for g in gold["cases"]:
    res = corpus.search(g["question"], top_k=5)
    got = [(r["law_id"], r["no"]) for r in res]
    exp = [(e["law_id"], e["no"]) for e in g["expect"]]
    rank = next((i for i, k in enumerate(got, 1) if k in exp), None)
    hit = rank is not None
    hits += int(hit)
    rr += (1 / rank) if rank else 0
    prec += (sum(1 for k in got if k in exp) / max(len(got), 1))
    items.append({"id": g["id"], "question": g["question"], "expect": g["expect"], "got": got, "hit": hit, "rank": rank})
n = len(gold["cases"])
out = {"metric_note": "条文级口径（演示快照，与 server /api/evals 同算法同金标）", "case_count": n,
       "hit_at_5": round(hits / n, 4), "mrr": round(rr / n, 4), "precision_at_5": round(prec / n, 4), "cases": items}
out_path = ROOT / "web" / "public" / "data" / "evals.json"
out_path.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
print(f"evals.json: {n} 组 hit@5={out['hit_at_5']} mrr={out['mrr']}")
