# -*- coding: utf-8 -*-
"""lawtext 第三链批量拉取+比对驱动（R282；与 lawtext_verify.py 配套）。

对一批语料法律：gh code search 按 LinkTitle 线索定位 lawtext/laws 仓库文件 →
front matter 验证标题 → git blob base64 字节安全拉取存档 → lawtext_verify 位置配对比对。

用法：python scripts/lawtext_fetch.py <批次json> [--sleep 2.2]
批次 json 形态：[{"law_id","category","hint","title","alt_hints":[]},…]
  category = 法律|宪法|行政法规|司法解释（仓库目录名）；hint = LinkTitle 年份形态线索。
依赖 gh 已登录；code search API 限速 30/min，--sleep 控制节奏。
"""
import argparse
import base64
import json
import pathlib
import subprocess
import sys
import time
import urllib.parse

SERVER = pathlib.Path(__file__).resolve().parent.parent
EVIDENCE = SERVER.parent / 'docs' / 'research' / 'evidence'
REPORTS = SERVER.parent / 'docs' / 'qa-evidence'
sys.path.insert(0, str(SERVER))
sys.path.insert(0, str(SERVER / 'scripts'))


def gh(args: str) -> str:
    r = subprocess.run(['gh', 'api', args], capture_output=True, text=True)
    if r.returncode != 0:
        return ''
    return r.stdout.strip()


def fetch_blob(path: str, dest: pathlib.Path) -> bool:
    enc = urllib.parse.quote(path)
    meta = gh(f'repos/lawtext/laws/contents/{enc}')
    if not meta:
        return False
    try:
        sha = json.loads(meta)['sha']
    except (ValueError, KeyError):
        return False
    b = gh(f'repos/lawtext/laws/git/blobs/{sha}')
    if not b:
        return False
    data = json.loads(b).get('content', '').replace('\n', '')
    dest.write_bytes(base64.b64decode(data))
    return True


def front_meta(path: str) -> tuple[str, str]:
    enc = urllib.parse.quote(path)
    raw = gh(f'repos/lawtext/laws/contents/{enc}')
    if not raw:
        return '', ''
    try:
        content = base64.b64decode(json.loads(raw)['content'].replace('\n', '')).decode('utf-8')
    except (ValueError, KeyError, UnicodeDecodeError):
        return '', ''
    title = link = ''
    for line in content.split('\n')[:12]:
        if line.startswith('title:') and not title:
            title = line.split(':', 1)[1].strip()
        if line.startswith('LinkTitle:') and not link:
            link = line.split(':', 1)[1].strip()
    return title, link


def search_candidates(hint: str, category: str) -> list[str]:
    q = urllib.parse.quote(f'repo:lawtext/laws {hint}')
    raw = gh(f'search/code?q={q}')
    if not raw:
        return []
    try:
        items = json.loads(raw).get('items', [])
    except ValueError:
        return []
    want = f'content/{category}/'
    return [i['path'] for i in items if i['path'].startswith(want)]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('batch')
    ap.add_argument('--sleep', type=float, default=2.2)
    a = ap.parse_args()
    batch = json.loads(pathlib.Path(a.batch).read_text(encoding='utf-8'))
    from lawtext_verify import verify

    summary = []
    for i, law in enumerate(batch):
        lid, cat, title = law['law_id'], law['category'], law['title']
        hints = [law['hint']] + law.get('alt_hints', [])
        path, picked_link = '', ''
        for h in hints:
            for cand in search_candidates(h, cat):
                t, link = front_meta(cand)
                # 标题须精确匹配法名（排除修改决定类）；LinkTitle 含年份线索者优先
                if t == title:
                    if not path or (h in link):
                        path, picked_link = cand, link
                time.sleep(a.sleep)
            time.sleep(a.sleep)
            if path:
                break
        if not path:
            summary.append({'law_id': lid, 'result': 'NOT-LOCATED'})
            print(f'[{i+1}/{len(batch)}] {lid}: 未定位（hints={hints}）')
            continue
        uuid = pathlib.Path(path).stem
        dest = EVIDENCE / f'lawtext-{lid}-{uuid}.md'
        if not dest.exists() and not fetch_blob(path, dest):
            summary.append({'law_id': lid, 'result': 'FETCH-FAILED', 'path': path})
            print(f'[{i+1}/{len(batch)}] {lid}: 拉取失败')
            continue
        res = verify(lid, dest)
        res['snapshot'] = f'docs/research/evidence/{dest.name}'
        out = REPORTS / f'lawtext-verify-3rd-{lid}.json'
        out.write_text(json.dumps(res, ensure_ascii=False, indent=2), encoding='utf-8')
        summary.append({'law_id': lid, 'result': res['conclusion'], 'report': str(out)})
        print(f'[{i+1}/{len(batch)}] {lid}: {res["conclusion"]}')
        time.sleep(a.sleep)

    (REPORTS / 'lawtext-verify-3rd-batch.json').write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
    print('批次汇总 →', REPORTS / 'lawtext-verify-3rd-batch.json')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
