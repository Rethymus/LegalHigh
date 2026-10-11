# -*- coding: utf-8 -*-
"""laws.json 导出新鲜度钉子（2026-10-11 三轮审计·派生数据全链核查）。

背景：laws.json↔语料「全对齐」历来靠人工轮核查，从未制度化。失效模式：
build_corpus.py 更新语料后未重跑 export_laws.py → 前端整站陈旧法条，且
xrefs 新鲜度测试无法捕获（laws.json 与 xrefs.json 一起陈旧时两者仍一致）。

本测试钉三个口径：built_at 时间戳一致、法 id 集一致、逐部条数一致。
语料任何变更后忘了导出，在这里失败，而不是静默到达用户。
"""
import json
from pathlib import Path

SERVER = Path(__file__).resolve().parent.parent
MANIFEST = SERVER / "data" / "laws" / "manifest.json"
LAWS_JSON = SERVER.parent / "web" / "public" / "data" / "laws.json"


def test_laws_json_built_at_matches_manifest():
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    exported = json.loads(LAWS_JSON.read_text(encoding="utf-8"))
    assert exported["builtAt"] == manifest["built_at"], (
        f"laws.json 陈旧：built_at {exported['builtAt']} ≠ 语料 {manifest['built_at']}"
        "——重跑 web/scripts/export_laws.py"
    )


def test_laws_json_id_set_and_counts_match_manifest():
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    exported = json.loads(LAWS_JSON.read_text(encoding="utf-8"))["laws"]
    expect_counts = {m["law_id"]: m["article_count"] for m in manifest["laws"]}
    actual_counts = {l["id"]: len(l["articles"]) for l in exported}
    assert set(actual_counts) == set(expect_counts), (
        f"法 id 集漂移：多出 {sorted(set(actual_counts) - set(expect_counts))[:4]}"
        f" 缺少 {sorted(set(expect_counts) - set(actual_counts))[:4]}"
    )
    drift = [
        f"{k}: {actual_counts[k]}≠{expect_counts[k]}"
        for k in expect_counts
        if actual_counts[k] != expect_counts[k]
    ]
    assert not drift, "逐部条数漂移（导出未跟语料）: " + "; ".join(drift[:6])
