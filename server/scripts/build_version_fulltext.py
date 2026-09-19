# -*- coding: utf-8 -*-
"""历史版本全文构建器（known-gaps #1 垂直切片，R167）。

把已采集、已注册的证据快照解析为结构化历史条文文件：
`server/data/law_versions_fulltext/<law_id>/<version_id>.json`。

纪律（fail-closed 全链）：
- 只处理白名单目标；版本必须已登记于 law_versions 注册表，元数据（日期/等级/
  快照路径）一律从注册表 evidence 读取，禁止在本脚本手写日期（R44 教训）；
- 条文数必须与注册表 article_count 逐一相等，否则拒绝落盘；
- 来源 sha256 对快照原始字节计算，corpus_selfcheck 会复算校验；
- 快照尾注污染按标记显式剥离（新华社电头），剥离前必须恰出现一次，绝不静默；
- 历史全文不进现行检索语料、不进金标（金标先行制度），仅供对照查阅。

用法：
    python scripts/build_version_fulltext.py                 # 构建全部白名单目标
    python scripts/build_version_fulltext.py --only csl-2025 2016-enacted
"""
import argparse
import hashlib
import json
import pathlib
import re
import sys

SERVER_DIR = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SERVER_DIR))

from build_corpus import clean_html_to_text, split_articles  # noqa: E402

DATA_DIR = SERVER_DIR / "data"
EVIDENCE_DIR = (SERVER_DIR.parent / "docs" / "research" / "evidence").resolve()
SAFE_FILE = re.compile(r"^[\w][\w.\-（）()]*\.(html|json)$")
OUT_DIR = DATA_DIR / "law_versions_fulltext"

# 白名单目标：(law_id, version_id) -> 快照文件名。新增目标必须先完成：
# ①注册表登记（dates/evidence 齐备）②快照采集入库 ③article_count 人工核对。
TARGETS: dict[tuple[str, str], str] = {
    ("csl-2025", "2016-enacted"): "people_网络安全法2016.html",
}

# 尾注污染标记（剥离前各自必须在全文恰出现一次；R113 先例：标记先核验再上线）
FOOTER_MARKERS = [
    re.compile(r"^[ \t\u3000\xa0]*（新华社北京[^）]*电）.*$", re.M),
    re.compile(r"^[ \t\u3000\xa0]*《[ \xa0]?人民日报[ \xa0]?》[ \xa0]*（[^）]*版）[ \t\u3000\xa0]*$", re.M),
]


def _read_snapshot(name: str) -> bytes:
    if not SAFE_FILE.match(name):
        raise ValueError(f"unsafe snapshot filename: {name!r}")
    path = (EVIDENCE_DIR / name).resolve()
    if path.parent != EVIDENCE_DIR:
        raise ValueError("snapshot escapes evidence dir")
    return path.read_bytes()


def _strip_footers(articles: list[dict]) -> list[dict]:
    """剥离粘在末条上的页面尾注（电头/编辑注），标记必须恰出现一次。"""
    full = "\n".join(a["text"] for a in articles)
    for marker in FOOTER_MARKERS:
        found = marker.findall(full)
        if len(found) != 1:
            raise ValueError(f"尾注标记出现 {len(found)} 次（期望恰 1 次），拒绝静默剥离：{marker.pattern}")
    out = []
    for a in articles:
        text = a["text"]
        for marker in FOOTER_MARKERS:
            text = marker.sub("", text)
        out.append({**a, "text": text.rstrip("\u3000 \xa0\n")})
    return out


def build(law_id: str, version_id: str, snapshot_name: str) -> pathlib.Path:
    registry = json.loads((DATA_DIR / "law_versions" / f"{law_id}.json").read_text(encoding="utf-8"))
    version = next((v for v in registry["versions"] if v["version_id"] == version_id), None)
    if version is None:
        raise ValueError(f"{law_id} 注册表中不存在版本 {version_id}——先登记再构建")

    raw = _read_snapshot(snapshot_name)
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        text = raw.decode("gbk", errors="ignore")
    articles, _expected = split_articles(clean_html_to_text(text))
    articles = _strip_footers(articles)

    expected_count = version.get("article_count")
    if expected_count is None:
        raise ValueError(f"{law_id}/{version_id} 注册表未登记 article_count，拒绝构建")
    if len(articles) != expected_count:
        raise ValueError(f"{law_id}/{version_id} 切分 {len(articles)} 条 ≠ 注册表 {expected_count} 条，拒绝落盘")

    ev = version["evidence"]
    doc = {
        "schema_version": 1,
        "law_id": law_id,
        "law_title": registry["title"],
        "version_id": version_id,
        "label": version["label"],
        "status_note": version["status"],
        "promulgation_date": version["promulgation_date"],
        "promulgation_organ": version.get("promulgation_organ"),
        "effective_date": version["effective_date"],
        "article_count": len(articles),
        "scope_note": "非现行历史文本，仅供对照查阅；不进入现行检索语料，不构成「当时是否合法」的断言依据。",
        "source": {
            "kind": ev["kind"],
            "grade": ev["grade"],
            "url": ev["url"],
            "snapshot": ev["snapshot"],
            "accessed_at": ev["accessed_at"],
            "sha256": hashlib.sha256(raw).hexdigest(),
        },
        "articles": articles,
    }
    out_path = OUT_DIR / law_id / f"{version_id}.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"OK {law_id}/{version_id}: {len(articles)} 条 → {out_path.relative_to(SERVER_DIR)}")
    return out_path


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="构建历史版本全文（fail-closed）")
    ap.add_argument("--only", nargs=2, metavar=("LAW_ID", "VERSION_ID"), action="append", default=[])
    args = ap.parse_args(argv)
    if args.only:
        wanted = {(law, vid) for law, vid in args.only}
        missing = wanted - set(TARGETS)
        if missing:
            print(f"目标不在白名单：{sorted(missing)}", file=sys.stderr)
            return 3
        targets = {k: TARGETS[k] for k in wanted}
    else:
        targets = TARGETS
    for (law, vid), snap in sorted(targets.items()):
        try:
            build(law, vid, snap)
        except (ValueError, OSError, KeyError) as exc:
            print(f"FAILED {law}/{vid}: {exc}", file=sys.stderr)
            return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
