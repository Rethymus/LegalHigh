# -*- coding: utf-8 -*-
"""flk bbbs 候选批量核验脚本（R286）——业主一次性授权后运行。

背景：lawtext 快照 front matter 的 id 字段即 flk 文档 bbbs（R286 盘点出 21 部现行版
候选 + 4 部旧版本文档）。R181 纪律：bbbs 必须「严格精确相等」经 flfgDetails 核验后才
能进入 flk_native_ids.json（映射喂给 evidence ledger 的 canonical 链接，错值=错链）。
自动化访问 flk 受 robots Disallow: / 与 LEGAL-006 约束——**只有业主明确授权时**才可运行。

用法（业主授权后）：
    LH_FLK_VERIFY_AUTHORIZED=1 python scripts/flk_verify_candidates.py
行为：逐条 GET flfgDetails?bbbs=<候选>（只读），核对返回标题与语料 law 标题一致 →
写入 flk_native_ids.json（evidence 指向候选清单条目）；不一致/接口失败 → 跳过并报告，
绝不写库。无授权环境变量时直接退出（exit 2）。
"""
import json
import os
import pathlib
import sys
import urllib.parse
import urllib.request

SERVER = pathlib.Path(__file__).resolve().parent.parent
CANDIDATES = SERVER.parent / 'docs' / 'qa-evidence' / 'flk-bbbs-candidates.json'
NATIVE = SERVER / 'data' / 'flk_native_ids.json'
sys.path.insert(0, str(SERVER))

DETAIL = 'https://flk.npc.gov.cn/law-search/search/flfgDetails?bbbs='


def main() -> int:
    if os.environ.get('LH_FLK_VERIFY_AUTHORIZED') != '1':
        print('未获授权：flk 自动化访问受 robots 与 LEGAL-006 约束。'
              '业主授权后以 LH_FLK_VERIFY_AUTHORIZED=1 运行。')
        return 2
    batch = json.loads(CANDIDATES.read_text(encoding='utf-8'))
    native = json.loads(NATIVE.read_text(encoding='utf-8'))
    laws = {l['law_id']: l for l in json.loads(
        (SERVER / 'data' / 'laws' / 'manifest.json').read_text(encoding='utf-8'))['laws']}
    ok, skipped = [], []
    for cand in batch['current']:
        lid, bbbs = cand['law_id'], cand['bbbs']
        url = DETAIL + urllib.parse.quote(bbbs)
        try:
            with urllib.request.urlopen(url, timeout=20) as resp:
                detail = json.loads(resp.read().decode('utf-8'))
        except Exception as e:  # noqa: BLE001 网络失败如实跳过
            skipped.append({'law_id': lid, 'reason': f'fetch: {e}'})
            continue
        data = detail.get('data') or detail
        title = (data.get('title') or data.get('name') or '').strip()
        expect = laws.get(lid, {}).get('title', '')
        if title and title.replace(' ', '') == expect.replace(' ', ''):
            native[lid] = {
                'bbbs': bbbs,
                'evidence': (f"docs/qa-evidence/flk-bbbs-candidates.json#{lid}"
                             f"（flfgDetails 只读核验 {title}；lawtext 快照旁证 {cand['snapshot']}）"),
            }
            ok.append(lid)
        else:
            skipped.append({'law_id': lid, 'reason': f'title mismatch: flk=「{title}」 vs 语料=「{expect}」'})
    NATIVE.write_text(json.dumps(native, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'核验通过入映射：{len(ok)} 部 {ok}')
    for s in skipped:
        print('跳过：', s)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
