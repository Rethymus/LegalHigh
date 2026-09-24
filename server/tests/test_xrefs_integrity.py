# -*- coding: utf-8 -*-
"""xrefs.json 数据完整性（R322）：构建产物与语料的一致性核验。

每条交叉引用的 from/to 必须指向语料中真实存在的条文条号（构建时已验证，
此测试作为常驻机器门防止后续构建漂移）。
"""
import json
import pathlib
import sys

SERVER = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SERVER))

XREFS_PATH = SERVER.parent / "web" / "public" / "data" / "xrefs.json"


def test_xrefs_file_exists():
    assert XREFS_PATH.is_file(), "xrefs.json 缺失（构建产物断裂）"


def test_xrefs_targets_in_corpus():
    from app.corpus import get_corpus
    corpus = get_corpus()
    data = json.loads(XREFS_PATH.read_text(encoding="utf-8"))
    issues = []
    for law_id, refs in data.items():
        articles = {(a["no"], a.get("sub") or "") for a in corpus.articles if a["law_id"] == law_id}
        for ref in refs:
            # to 字段格式: "123" 或 "123之四"
            to = ref["to"]
            if "之" in to:
                base, sub = to.split("之", 1)
                key = (int(base), "之" + sub)
            else:
                key = (int(to), "")
            if key not in articles:
                issues.append(f"{law_id}: 引用目标 {to} 不在语料")
    assert not issues, "xrefs 目标完整性失败: " + "; ".join(issues[:5])


def test_xrefs_minimal_coverage():
    data = json.loads(XREFS_PATH.read_text(encoding="utf-8"))
    total = sum(len(refs) for refs in data.values())
    assert total >= 500, f"xrefs 覆盖回落：{total} 条（应 ≥500）"
    assert len(data) >= 60, f"xrefs 法律覆盖回落：{len(data)} 部（应 ≥60）"
