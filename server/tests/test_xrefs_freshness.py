# -*- coding: utf-8 -*-
"""xrefs.json 新鲜度锁定（2026-10-11 三轮审计）：产物必须与 laws.json 同轮重算
结果完全一致。

背景：xrefs.json 初版由一次性脚本生成（脚本未入库即蒸发），导致 09-23 之后
入库的法律从未进入交叉引用数据；且该脚本的私有数字转换器存在「零X」形态
解析错位（1063→1013 类 25 条错误目标，因目标恰好存在而逃过存在性测试）。
本测试以 lib.xrefs（唯一实现、与直查层同源转换器）从 laws.json 重算并要求
逐项一致——语料更新而未重跑 export_laws.py、或生成逻辑任何漂移，都会在此
失败，而不是静默陈旧/错误地到达用户。
"""
import json
import pathlib
import sys

SERVER = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SERVER))
sys.path.insert(0, str(SERVER.parent / "web" / "scripts"))

DATA = SERVER.parent / "web" / "public" / "data"

from lib.xrefs import build_xrefs  # noqa: E402


def _laws_articles():
    """以 laws.json 的条目形态重算（与 export_laws.py 同一输入面）。"""
    laws = json.loads((DATA / "laws.json").read_text(encoding="utf-8"))["laws"]
    return [
        {
            "id": l["id"],
            "articles": [
                {"no": a["no"], "sub": a.get("sub"), "text": a["text"]}
                for a in l["articles"]
            ],
        }
        for l in laws
    ]


def test_xrefs_fresh_and_exact():
    expected = build_xrefs(_laws_articles())
    actual = json.loads((DATA / "xrefs.json").read_text(encoding="utf-8"))

    stale_laws = sorted(set(expected) - set(actual))
    assert not stale_laws, (
        "xrefs.json 落后于 laws.json（新入库法律未重跑 export_laws.py）: " + str(stale_laws[:5])
    )

    diffs = []
    for law_id in sorted(set(expected) & set(actual)):
        e, a = expected[law_id], actual[law_id]
        if e != a:
            e_pairs = {(r["from"], r["to"]) for r in e}
            a_pairs = {(r["from"], r["to"]) for r in a}
            diffs.append(f"{law_id}: 重算 {len(e)} 条 vs 产物 {len(a)} 条，差集 {sorted(e_pairs ^ a_pairs)[:4]}")
    assert not diffs, "xrefs.json 与 laws.json 重算结果不一致:\n" + "\n".join(diffs[:6])


def test_xrefs_no_duplicate_pairs():
    data = json.loads((DATA / "xrefs.json").read_text(encoding="utf-8"))
    pairs = [(k, r["from"], r["to"]) for k, v in data.items() for r in v]
    assert len(pairs) == len(set(pairs)), "xrefs 出现重复 (from,to) 引用对"
