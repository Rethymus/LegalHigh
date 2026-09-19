# -*- coding: utf-8 -*-
"""历史版本全文垂直切片（known-gaps #1，R167）：构建物/服务层/端点矩阵。

fail-closed 全链：构建脚本（条数≠注册表即拒、尾注标记恰一次才剥）、
服务层双向校验（文件↔注册表条数/生效日一致）、端点 404 语义分层。
"""
import hashlib
import json
import pathlib

import pytest

from app import main, version_fulltext

DATA_DIR = pathlib.Path(__file__).resolve().parent.parent / "data"
FT = DATA_DIR / "law_versions_fulltext" / "csl-2025" / "2016-enacted.json"


def test_fulltext_file_exists_and_clean():
    assert FT.exists(), "垂直切片构建物缺失：先跑 scripts/build_version_fulltext.py"
    d = json.loads(FT.read_text(encoding="utf-8"))
    assert d["schema_version"] == 1
    assert d["article_count"] == len(d["articles"]) == 79
    # 尾注剥离后的洁净断言
    for a in d["articles"]:
        assert "新华社" not in a["text"] and "人民日报" not in a["text"]
        assert a["text"].strip()
    assert d["articles"][-1]["text"].endswith("本法自2017年6月1日起施行。")
    assert d["articles"][0]["chapter"].startswith("第一章")
    # 非现行口径必须显式
    assert "非现行" in d["scope_note"]


def test_fulltext_source_hash_matches_snapshot():
    d = json.loads(FT.read_text(encoding="utf-8"))
    snap = pathlib.Path(__file__).resolve().parent.parent.parent / d["source"]["snapshot"]
    assert snap.is_file()
    assert hashlib.sha256(snap.read_bytes()).hexdigest() == d["source"]["sha256"]


def test_registry_consistency_bidirectional():
    reg = json.loads((DATA_DIR / "law_versions" / "csl-2025.json").read_text(encoding="utf-8"))
    v = next(x for x in reg["versions"] if x["version_id"] == "2016-enacted")
    d = json.loads(FT.read_text(encoding="utf-8"))
    assert v["article_count"] == d["article_count"] == 79
    assert v["effective_date"] == d["effective_date"] == "2017-06-01"
    # describe 携带 has_fulltext（前端不死按钮的依据）
    out = main.law_versions("csl-2025")
    flags = {x["version_id"]: x["has_fulltext"] for x in out["versions"]}
    assert flags == {"2016-enacted": True, "2025-amendment": False}


def test_load_tampered_count_rejected(tmp_path, monkeypatch):
    d = json.loads(FT.read_text(encoding="utf-8"))
    d["article_count"] = 78  # 算改条数
    bad_dir = tmp_path / "law_versions_fulltext" / "csl-2025"
    bad_dir.mkdir(parents=True)
    (bad_dir / "2016-enacted.json").write_text(json.dumps(d, ensure_ascii=False), encoding="utf-8")
    monkeypatch.setattr(version_fulltext, "FULLTEXT_DIR", tmp_path / "law_versions_fulltext")
    with pytest.raises(ValueError, match="article_count"):
        version_fulltext.load("csl-2025", "2016-enacted")


def test_load_registry_lag_rejected(tmp_path, monkeypatch):
    """全文存在但注册表落后（版本被删）→ 拒绝：注册表不得比全文落后。"""
    d = json.loads(FT.read_text(encoding="utf-8"))
    bad_dir = tmp_path / "law_versions_fulltext" / "csl-2025"
    bad_dir.mkdir(parents=True)
    (bad_dir / "2016-enacted.json").write_text(json.dumps(d, ensure_ascii=False), encoding="utf-8")
    monkeypatch.setattr(version_fulltext, "FULLTEXT_DIR", tmp_path / "law_versions_fulltext")
    real_load = version_fulltext.law_versions_mod.load_registry

    def fake_registry(law_id):
        reg = real_load(law_id)
        reg = {**reg, "versions": [v for v in reg["versions"] if v["version_id"] != "2016-enacted"]}
        return reg

    monkeypatch.setattr(version_fulltext.law_versions_mod, "load_registry", fake_registry)
    with pytest.raises(ValueError, match="注册表未登记"):
        version_fulltext.load("csl-2025", "2016-enacted")


def test_endpoint_404_matrix():
    with pytest.raises(Exception) as e1:
        main.law_version_fulltext("csl-2025", "nope")
    assert getattr(e1.value, "status_code", None) == 404
    with pytest.raises(Exception) as e3:
        main.law_version_fulltext("no-such-law", "x")
    assert getattr(e3.value, "status_code", None) == 404


def test_endpoint_500_on_inconsistent_file(tmp_path, monkeypatch):
    """全文文件与注册表不一致 → 端点 500（fail-closed，不降级返回半份数据）。"""
    d = json.loads(FT.read_text(encoding="utf-8"))
    d["article_count"] = 1
    bad_dir = tmp_path / "law_versions_fulltext" / "csl-2025"
    bad_dir.mkdir(parents=True)
    (bad_dir / "2016-enacted.json").write_text(json.dumps(d, ensure_ascii=False), encoding="utf-8")
    monkeypatch.setattr(version_fulltext, "FULLTEXT_DIR", tmp_path / "law_versions_fulltext")
    with pytest.raises(Exception) as e:
        main.law_version_fulltext("csl-2025", "2016-enacted")
    assert getattr(e.value, "status_code", None) == 500


def test_endpoint_public_shape():
    out = main.law_version_fulltext("csl-2025", "2016-enacted")
    for key in ("law_id", "version_id", "label", "status_note", "promulgation_date",
                "effective_date", "article_count", "scope_note", "source", "articles"):
        assert key in out
    assert out["status_note"].startswith("已取代")
    # 子条号纪律：2016 原版无子条号（切分器输出与法典演进互证）
    assert all("sub" not in a or a["sub"] is None for a in out["articles"])


def test_all_fulltext_files_bidirectionally_valid():
    """滚动采集（R168）后：每份全文文件都必须通过服务层双校验 + 洁净断言。

    与 corpus_selfcheck 同口径的 pytest 钉（selfcheck 是脚本门，这里是 CI 测试门）。
    """
    files = sorted((DATA_DIR / "law_versions_fulltext").glob("*/*.json"))
    assert len(files) >= 37, "历史全文文件数异常回落"
    for ft in files:
        law_id, vid = ft.parent.name, ft.stem
        d = version_fulltext.load(law_id, vid)  # 双向校验：任一不一致抛 ValueError
        assert d["article_count"] == len(d["articles"])
        assert "非现行" in d["scope_note"]
        for a in d["articles"]:
            assert a["text"].strip()
            assert "新华社" not in a["text"] and "责任编辑" not in a["text"]


def test_registry_versions_fully_covered():
    """注册表里每个非现行版本都必须有全文文件（known-gaps #1 滚动采集收口不变式）。"""
    missing = []
    for reg in sorted((DATA_DIR / "law_versions").glob("*.json")):
        registry = json.loads(reg.read_text(encoding="utf-8"))
        for v in registry.get("versions", []):
            if v.get("current"):
                continue
            if not version_fulltext.has_fulltext(registry["law_id"], v["version_id"]):
                missing.append(f"{registry['law_id']}/{v['version_id']}")
    assert not missing, f"非现行版本缺历史全文：{missing}"


def test_derive_targets_matches_registry_count():
    """构建器枚举（注册表即白名单）覆盖全部非现行版本，无 SKIP。"""
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "bvf", pathlib.Path(__file__).resolve().parent.parent / "scripts" / "build_version_fulltext.py")
    bvf = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(bvf)
    targets, skipped = bvf.derive_targets()
    total_noncurrent = sum(
        1 for reg in (DATA_DIR / "law_versions").glob("*.json")
        for v in json.loads(reg.read_text(encoding="utf-8")).get("versions", [])
        if not v.get("current"))
    assert len(targets) == total_noncurrent
    assert skipped == []
