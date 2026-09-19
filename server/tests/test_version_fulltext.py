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
    with pytest.raises(Exception) as e2:
        main.law_version_fulltext("lcl-2012", "2007-enacted")
    assert getattr(e2.value, "status_code", None) == 404
    with pytest.raises(Exception) as e3:
        main.law_version_fulltext("no-such-law", "x")
    assert getattr(e3.value, "status_code", None) == 404


def test_endpoint_public_shape():
    out = main.law_version_fulltext("csl-2025", "2016-enacted")
    for key in ("law_id", "version_id", "label", "status_note", "promulgation_date",
                "effective_date", "article_count", "scope_note", "source", "articles"):
        assert key in out
    assert out["status_note"].startswith("已取代")
    # 子条号纪律：2016 原版无子条号（切分器输出与法典演进互证）
    assert all("sub" not in a or a["sub"] is None for a in out["articles"])
