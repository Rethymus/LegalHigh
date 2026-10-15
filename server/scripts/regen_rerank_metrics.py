# -*- coding: utf-8 -*-
"""服务端指标刷新脚本：orchestrated_search 全金标跑分 → rerank_gold_metrics.json

gate8-C2 的数据源；检索指标变更后必须重跑本脚本并同步 README hub 四元组（R588）。
用法：server/.venv/Scripts/python.exe scripts/regen_rerank_metrics.py
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.corpus import get_corpus
from app.retrieval_terms import orchestrated_search

def main():
    root = Path(__file__).resolve().parent.parent
    gold = json.loads((root / 'tests' / 'gold' / 'gold_retrieval.json').read_text(encoding='utf-8'))['cases']
    corpus = get_corpus()
    h5 = ll = r1 = 0
    mrr = 0.0
    for g in gold:
        exp_ids = {e['law_id'] for e in g['expect']}
        exp = [(e['law_id'], e['no'], e.get('sub')) for e in g['expect']]
        got = orchestrated_search(corpus, g['question'], top_k=5)[0]
        keys = [(h['law_id'], h['no'], h.get('sub')) for h in got]
        pos = next((i for i, k in enumerate(keys) if k in exp), None)
        if pos is not None:
            h5 += 1
            mrr += 1 / (pos + 1)
            if pos == 0:
                r1 += 1
        if any(k[0] in exp_ids for k in keys):
            ll += 1
    n = len(gold)
    out = {
        'description': '编排层检索指标（orchestrated_search 全金标）——gate8-C2 数据源；检索变更后重跑本脚本并同步 README hub 四元组',
        'generated_at': __import__('datetime').date.today().isoformat(),
        'gold_count': n,
        'hit_at_5': round(h5 / n, 4),
        'law_level': round(ll / n, 4),
        'rank1': round(r1 / n, 4),
        'mrr': round(mrr / n, 4),
    }
    out_path = root / 'scripts' / 'rerank_gold_metrics.json'
    out_path.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'rerank_gold_metrics.json 已刷新: hit@5 {out["hit_at_5"]} | 法律级 {out["law_level"]} | rank1 {out["rank1"]} | MRR {out["mrr"]}（{n} 组）')

if __name__ == '__main__':
    main()
