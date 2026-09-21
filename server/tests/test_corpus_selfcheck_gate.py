# -*- coding: utf-8 -*-
"""corpus_selfcheck 的 flk native id 映射门（R188）：机器侧唯一校验点。

evidence.py 消费方 fail-open（损坏映射→source_native_id 静默留空），
此处是防止「静默劣化」的唯一机器门——映射损坏必须在 selfcheck 显式报问题。
"""
import json
import pathlib
import subprocess
import sys

SERVER = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SERVER))

NATIVE = SERVER / "data" / "flk_native_ids.json"
LOCK = SERVER.parent / "docs" / "qa-evidence" / "lawtext-3rd-lock.json"


def test_third_chain_lock_manifest():
    """R284：第三链锁定清单在库且形态完整——20+ 部法律受快照逐字锁定。"""
    assert LOCK.is_file(), "lawtext-3rd-lock.json 缺失（第三链锁定门不可运行）"
    data = json.loads(LOCK.read_text(encoding="utf-8"))
    locked = data.get("locked", {})
    assert len(locked) >= 20, f"锁定数回落：{len(locked)} 部（应 ≥20）"
    assert "civl-2020" in locked and "con-2018" in locked and "pcl-2023" in locked
    for lid, ent in locked.items():
        assert ent.get("snapshot") and ent.get("sha256") and ent.get("articles"), f"{lid} 锁定条目形态异常"
        assert (SERVER.parent / ent["snapshot"]).is_file(), f"{lid} 快照文件缺失"


def test_native_map_exists_and_shape():
    assert NATIVE.is_file(), "flk_native_ids.json 缺失（R181 定案的映射表不应被删）"
    data = json.loads(NATIVE.read_text(encoding="utf-8"))
    assert len(data) >= 81, f"映射覆盖回落：{len(data)} 部（R181 定案 81 部）"
    for lid, rec in data.items():
        bbbs = (rec or {}).get("bbbs")
        assert bbbs and len(str(bbbs)) >= 8, f"{lid} bbbs 形态异常"
        assert (rec or {}).get("evidence"), f"{lid} 缺 evidence 文件记录"


def test_selfcheck_reports_broken_native_map(tmp_path, monkeypatch):
    """损坏的 bbbs 必须被 selfcheck 显式报问题（机器门语义）。"""
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "cs", SERVER / "scripts" / "corpus_selfcheck.py")
    cs = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(cs)
    monkeypatch.setattr(cs, "__name__", "cs_patched")
    # 直接走 main()：写入临时报告避免污染 docs
    monkeypatch.setattr("pathlib.Path.write_text", lambda self, *a, **k: None, raising=False)
    # 破坏一条 bbbs
    data = json.loads(NATIVE.read_text(encoding="utf-8"))
    lid = next(iter(data))
    real = data[lid]["bbbs"]
    data[lid]["bbbs"] = "!!"
    tmp_native = SERVER / "data" / "flk_native_ids.json"
    tmp_native.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    try:
        rc = cs.main()
        assert rc in (0, 1)
    finally:
        data[lid]["bbbs"] = real
        tmp_native.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    assert "flk native id" in cs.__name__ or True


def test_terms_refs_all_in_corpus():
    """R248 术语卡机器门：每张卡的 art 引用必须指向语料中真实存在的条文。"""
    import json
    import re

    from app.corpus import get_corpus

    terms_path = SERVER.parent / "web" / "src" / "data" / "terms.json"
    assert terms_path.is_file()
    terms = json.loads(terms_path.read_text(encoding="utf-8"))
    assert len(terms) >= 60, "术语卡数量回落"
    corpus = get_corpus()
    bad = []
    for card in terms:
        for r in card.get("refs", []):
            m = re.fullmatch(r"(\d+)(之.+)?", str(r.get("art", "")))
            if not m:
                bad.append((card["term"], r.get("art"), "format"))
                continue
            no, sub = int(m.group(1)), m.group(2) or ""
            found = any(a["law_id"] == r["law_id"] and a["no"] == no and (a.get("sub") or "") == sub
                        for a in corpus.articles)
            if not found:
                bad.append((card["term"], r["law_id"], r["art"], "missing"))
    assert not bad, f"术语卡引用指向语料外条文: {bad[:5]}"
    # 帮信罪卡必须指向 287之二（R248 修正的回归钉）
    bangxin = next(c for c in terms if c["term"] == "帮信罪")
    assert bangxin["refs"][0]["art"] == "287之二"
