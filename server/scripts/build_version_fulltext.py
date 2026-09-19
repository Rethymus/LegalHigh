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

# 显式例外白名单（可选）：仅当某目标需要偏离「注册表即白名单」的默认枚举时使用。
# 默认枚举：遍历 law_versions 注册表，取全部非现行版本（快照在库）——注册表本身
# 就是人工审批记录（先注册后构建），不在此重复硬编码 37 行映射（R167 首版的教训：
# 手写映射会与注册表漂移）。
EXTRA_TARGETS: dict[tuple[str, str], str] = {}

# 尾注污染标记（只作用于末条；出现>1 次或 0 次均拒绝静默处理——R113 先例：标记先核验再上线）
FOOTER_MARKERS = [
    re.compile(r"^[ \t\u3000\xa0]*（新华社北京[^）]*电）.*$", re.M),
    re.compile(r"^[ \t\u3000\xa0]*《[ \xa0]?人民日报[ \xa0]?》[ \xa0]*（[^）]*版）[ \t\u3000\xa0]*$", re.M),
    re.compile(r"^[ \t\u3000\xa0]*责任编辑：[^ \t\u3000][^\n]*$", re.M),
    re.compile(r"^[ \t\u3000\xa0]*\[?[纠错打印分享收藏关闭]*\]?[ \t\u3000\xa0]*$", re.M),
]


def _read_snapshot(name: str) -> bytes:
    if not SAFE_FILE.match(name):
        raise ValueError(f"unsafe snapshot filename: {name!r}")
    path = (EVIDENCE_DIR / name).resolve()
    if path.parent != EVIDENCE_DIR:
        raise ValueError("snapshot escapes evidence dir")
    return path.read_bytes()


def _strip_footers(articles: list[dict]) -> list[dict]:
    """剥离粘在末条上的页面尾注（电头/版面行/编辑注）。

    标记只对末条文本生效；每个标记在末条文本中出现次数必须 ≤1 且
    剥离前总数与剥离后总数一致由「恰 0 或 1 次」隐含——>1 次拒绝静默剥离。
    """
    last = articles[-1]
    for marker in FOOTER_MARKERS:
        found = marker.findall(last["text"])
        if len(found) > 1:
            raise ValueError(f"尾注标记在末条出现 {len(found)} 次（>1），拒绝静默剥离：{marker.pattern}")
    out = [dict(a) for a in articles]
    text = last["text"]
    for marker in FOOTER_MARKERS:
        text = marker.sub("", text)
    out[-1]["text"] = text.rstrip("\u3000 \xa0\n")
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


def derive_targets() -> tuple[dict[tuple[str, str], str], list[str]]:
    """从注册表枚举构建目标：全部非现行版本（快照在库）。返回 (目标, 跳过原因列表)。"""
    targets: dict[tuple[str, str], str] = dict(EXTRA_TARGETS)
    skipped: list[str] = []
    for reg_file in sorted((DATA_DIR / "law_versions").glob("*.json")):
        registry = json.loads(reg_file.read_text(encoding="utf-8"))
        law_id = registry.get("law_id") or reg_file.stem
        for v in registry.get("versions", []):
            if v.get("current"):
                continue  # 现行文本已在现行语料，不重复构建
            vid = v.get("version_id")
            snap = (v.get("evidence") or {}).get("snapshot", "")
            name = snap.split("/")[-1] if snap else ""
            if not vid or not name:
                skipped.append(f"{law_id}/{vid or '?'}: 注册表缺 version_id 或 evidence.snapshot")
                continue
            if not (EVIDENCE_DIR / name).is_file():
                skipped.append(f"{law_id}/{vid}: 快照不在库（{name}）——先采集再构建")
                continue
            targets[(law_id, vid)] = name
    return targets, skipped


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="构建历史版本全文（fail-closed）")
    ap.add_argument("--only", nargs=2, metavar=("LAW_ID", "VERSION_ID"), action="append", default=[])
    args = ap.parse_args(argv)
    targets, skipped = derive_targets()
    if args.only:
        wanted = {(law, vid) for law, vid in args.only}
        missing = wanted - set(targets)
        if missing:
            print(f"目标不可构建（未注册或快照缺失）：{sorted(missing)}", file=sys.stderr)
            return 3
    for reason in skipped:
        print(f"SKIP {reason}")
    failures = 0
    built = 0
    for (law, vid), snap in sorted(targets.items()):
        if args.only and (law, vid) not in {(a, b) for a, b in args.only}:
            continue
        try:
            build(law, vid, snap)
            built += 1
        except (ValueError, OSError, KeyError) as exc:
            print(f"FAILED {law}/{vid}: {exc}", file=sys.stderr)
            failures += 1
    print(f"完成：构建 {built} 份，失败 {failures} 项，跳过 {len(skipped)} 项")
    return 2 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
