# -*- coding: utf-8 -*-
"""证据快照索引生成器（R301）。

为 docs/research/evidence/ 生成 INDEX.md：按快照类型前缀分组，登记文件名/大小，
供备案材料溯源与人工导航。可重复运行（每次全量重建）。
用法：python scripts/evidence_index.py
"""
import pathlib
from datetime import date

SERVER = pathlib.Path(__file__).resolve().parent.parent
EVIDENCE = SERVER.parent / 'docs' / 'research' / 'evidence'
OUT = EVIDENCE / 'INDEX.md'

GROUPS = [
    ('指导案例官方快照（court.gov.cn）', 'court_'),
    ('flk 官方接口证据（业主授权只读抽查）', 'flk'),
    ('lawtext 第三链快照（flk DOCX 衍生社区转录）', 'lawtext'),
    ('Wikisource 转录快照', 'ws_'),
    ('官方公报/门户转载快照（gov.cn / 人民网 / 网信办等）', None),
    ('flk_ 其余 detail 快照', 'flk_'),
]


def classify(name: str) -> int:
    for i, (_, prefix) in enumerate(GROUPS):
        if prefix and name.startswith(prefix):
            return i
    # 法律/大写形态的 lawtext 命名（lawtext_宪法…）归第三链
    if name.startswith('lawtext'):
        return 2
    return 4


def main() -> int:
    files = sorted(p for p in EVIDENCE.iterdir() if p.is_file() and p.name != 'INDEX.md')
    buckets: dict[int, list[pathlib.Path]] = {i: [] for i in range(len(GROUPS))}
    other: list[pathlib.Path] = []
    for p in files:
        idx = classify(p.name)
        if idx == 4 and not (GROUPS[4][1] and p.name.startswith(tuple(GROUPS[4][1].split('/')))):
            # 组 4 只收官方公报类；无法归类的进「其他」
            if not any(p.name.startswith((g[1] or '\0')) for _, g in [(0, 'court_'), (1, 'flk'), (2, 'lawtext'), (3, 'ws_')]):
                other.append(p)
                continue
        buckets[idx].append(p)

    lines = [
        '# 证据快照索引（自动生成）',
        '',
        f'生成日期：{date.today().isoformat()} · 文件总数：{len(files)} · 由 `server/scripts/evidence_index.py` 生成，勿手改。',
        '',
        '用途：备案材料溯源与人工导航。每份快照的核验口径（快照自证/逐字比对/等级）见其引用方',
        '（语料构建 `server/build_corpus.py`、案例库 `server/data/cases.json` source_note、版本注册表）。',
        '',
    ]
    for i, (title, _) in enumerate(GROUPS):
        ps = buckets.get(i, [])
        if not ps:
            continue
        lines.append(f'## {title}（{len(ps)} 份）')
        lines.append('')
        for p in ps:
            lines.append(f'- `{p.name}`（{p.stat().st_size:,} B）')
        lines.append('')
    if other:
        lines.append(f'## 其他（{len(other)} 份）')
        lines.append('')
        for p in other:
            lines.append(f'- `{p.name}`（{p.stat().st_size:,} B）')
        lines.append('')
    OUT.write_text('\n'.join(lines), encoding='utf-8', newline='\n')
    print(f'索引生成：{len(files)} 份快照 → {OUT}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
