# -*- coding: utf-8 -*-
"""lawtext 第三链锁定清单生成器（R284）。

扫描 docs/research/evidence/lawtext-<law_id>-*.md 快照，凡某部法律的全部快照与语料
比对「全一致」，即写入锁定清单（快照文件名 + SHA-256）。corpus_selfcheck 消费该清单：
每次自检对锁定法律复验「语料 ↔ 快照」逐字一致、快照哈希未变——语料文本漂移或快照
被改都在机器门下显式报问题。

非全一结论的法律（版本滞后/快照噪声/句读注记/修十二演进）不入锁定清单，如实不锁。
用法：python scripts/lawtext_lock.py  （重新生成 docs/qa-evidence/lawtext-3rd-lock.json）
"""
import hashlib
import json
import pathlib
import sys

SERVER = pathlib.Path(__file__).resolve().parent.parent
EVIDENCE = SERVER.parent / 'docs' / 'research' / 'evidence'
OUT = SERVER.parent / 'docs' / 'qa-evidence' / 'lawtext-3rd-lock.json'
sys.path.insert(0, str(SERVER))
sys.path.insert(0, str(SERVER / 'scripts'))


def main() -> int:
    from lawtext_verify import verify
    by_law: dict[str, list[pathlib.Path]] = {}
    for p in sorted(EVIDENCE.glob('lawtext-*.md')):
        stem = p.name[len('lawtext-'):]
        lid = stem.rsplit('-', 1)[0]
        # law_id 本身含连字符（如 residents-committee-2025）；按已注册 law_id 匹配
        by_law.setdefault(lid, []).append(p)

    from app.corpus import get_corpus
    corpus = get_corpus()
    known = set(corpus.laws)
    # 把最长匹配交给已知 law_id（residents-committee-2025 等多段 id）
    regrouped: dict[str, list[pathlib.Path]] = {}
    for stem_lid, paths in by_law.items():
        match = [k for k in known if stem_lid == k or stem_lid.startswith(k + '-') or k.startswith(stem_lid)]
        if not match:
            continue
        lid = max(match, key=len)
        regrouped.setdefault(lid, []).extend(paths)

    locked = {}
    for lid in sorted(regrouped):
        paths = regrouped[lid]
        results = [verify(lid, p) for p in paths]
        ok = all(r.get('label_mismatch_count') == 0 and r.get('body_mismatch_count') == 0
                 and '条数不一致' not in r.get('conclusion', '') for r in results)
        if ok:
            for p, r in zip(paths, results):
                locked[lid] = {
                    'snapshot': f'docs/research/evidence/{p.name}',
                    'sha256': hashlib.sha256(p.read_bytes()).hexdigest(),
                    'articles': r['corpus_articles'],
                }
                break  # 一部一条锁定（当前各法仅一份快照）
    OUT.write_text(json.dumps({
        'generated_at': __import__('datetime').date.today().isoformat(),
        'locked_count': len(locked),
        'locked': locked,
    }, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'第三链锁定：{len(locked)} 部（{OUT}）')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
