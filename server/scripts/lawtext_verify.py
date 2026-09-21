# -*- coding: utf-8 -*-
"""lawtext 第三链文本级比对工具（R279）。

将语料某部法律与 lawtext/laws 社区转录快照（flk DOCX 衍生，与 Wikisource 等语料
构建源上游独立）做逐条位置配对比对：条号字符串 + 归一化正文。

方法论（在 civl-2020 1260/1260 全一致上校准）：
  - 位置配对而非条号转换——中文数字形态差异（第十条/第一十条、一百一十/一百十）
    会让任何转换器踩坑；两侧都是顺序枚举，按位置对齐 + 条号字符串互证即可。
  - 正文 = 标题行余文 + 到下一条文标题之间的续行（剔除章节标题行）。
  - 归一化 = 空白剥离 + markdown 强调标记剥离 + 全局枚举前 bullet 剥离
    （lawtext 把（一）（二）渲染成 "-（一）"，且 bullet 不只在行首）。
  - 字符类必须含「千」（一千条以后）与「零」。

用法：python scripts/lawtext_verify.py <law_id> <snapshot.md> [--out 报告.json] [--strict]
  --strict：存在任何不一致退出码 1（可作机器门）。
"""
import argparse
import json
import pathlib
import re
import sys

SERVER = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SERVER))

HEAD = re.compile(r'^- \*\*(第[零一二三四五六七八九十百千]+条(?:之[一二三四五六七八九十]+)?)\*\*(.*)$', re.M)


def norm(t: str) -> str:
    t = re.sub(r'[\s　]+', '', t)
    t = t.replace('**', '').replace('*', '')
    t = re.sub(r'-+(?=[（(0-9一二三四五六七八九十])', '', t)
    t = re.sub(r'-{2,}', '', t)  # 快照侧 markdown 长横线分隔（如 452 附则中的行中 ---）
    t = t.replace('帐', '账')  # 异体字归一（R280：162之一/187 实为 帐/账 变体）
    return t


def verify(law_id: str, snapshot: pathlib.Path) -> dict:
    from app.corpus import get_corpus
    corpus = get_corpus()
    arts = sorted((a for a in corpus.articles if a['law_id'] == law_id), key=lambda a: a['no'])
    s = snapshot.read_text(encoding='utf-8')
    ms = list(HEAD.finditer(s))
    meta = corpus.laws.get(law_id) or {}
    res = {
        'law': f'{law_id}（{meta.get("title") or law_id}）',
        'third_chain': f'lawtext/laws {snapshot.name}（flk DOCX 衍生社区转录，与语料构建源上游独立）',
        'snapshot': str(snapshot),
        'corpus_articles': len(arts),
        'snapshot_headings': len(ms),
        'checked_at': __import__('datetime').date.today().isoformat(),
    }
    if len(ms) != len(arts):
        res['conclusion'] = f'条数不一致：语料 {len(arts)} vs 快照标题 {len(ms)}——位置配对中止'
        if ms:
            res['snapshot_first'] = ms[0].group(1)
            res['snapshot_last'] = ms[-1].group(1)
        return res
    label_bad, body_bad = [], []
    for i, m in enumerate(ms):
        a = arts[i]
        if m.group(1) != norm(a['label']):
            label_bad.append({'pos': i + 1, 'snapshot': m.group(1), 'corpus': norm(a['label'])})
            continue
        end = ms[i + 1].start() if i + 1 < len(ms) else len(s)
        seg = s[m.end():end]
        cont = '\n'.join(l for l in seg.split('\n')
                         if l.strip() and not re.match(r'^\s*#', l) and not re.match(r'^\s*-{3,}\s*$', l))
        if norm(m.group(2)) + norm(cont) != norm(a['text']):
            body_bad.append({'pos': i + 1, 'label': m.group(1),
                             'corpus_head': norm(a['text'])[:70], 'snapshot_head': norm(m.group(2) + cont)[:70]})
    res['label_mismatch_count'] = len(label_bad)
    res['body_mismatch_count'] = len(body_bad)
    res['label_mismatches'] = label_bad[:20]
    res['body_mismatches'] = body_bad[:20]
    if not label_bad and not body_bad:
        res['conclusion'] = f'{len(arts)}/{len(arts)} 条号与正文全一致（第三链文本级核验通过）'
    else:
        res['conclusion'] = f'存在差异：条号 {len(label_bad)}、正文 {len(body_bad)}'
    return res


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('law_id')
    ap.add_argument('snapshot')
    ap.add_argument('--out', default='')
    ap.add_argument('--strict', action='store_true')
    a = ap.parse_args()
    res = verify(a.law_id, pathlib.Path(a.snapshot))
    print(json.dumps({k: v for k, v in res.items() if not k.endswith('mismatches')}, ensure_ascii=False, indent=2))
    if a.out:
        out = pathlib.Path(a.out)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(res, ensure_ascii=False, indent=2), encoding='utf-8')
        print('报告：', out)
    if a.strict and (res.get('label_mismatch_count') or res.get('body_mismatch_count')
                     or '条数不一致' in res.get('conclusion', '')):
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
