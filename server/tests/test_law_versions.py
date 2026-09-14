# -*- coding: utf-8 -*-
"""版本注册表契约测试（S2-T4 PoC）：证据纪律 fail-closed + 与语料对齐。"""
import json

import pytest

from app import law_versions  # noqa: E402


def test_pcl_registry_contract():
    d = law_versions.describe("pcl-2023")
    assert d["law_id"] == "pcl-2023"
    # 2026-09-14 S2-T1 后：pcl 时间线含 2021 历史版 + 2023 现行版（恰好一个 current 的
    # 注册表校验由 load_registry 保证）；此处按版本 id 断言而不是写死数量。
    vids = {v["version_id"] for v in d["versions"]}
    assert {"2021-amendment", "2023-revision"} <= vids
    currents = [v for v in d["versions"] if v["current"]]
    assert len(currents) == 1
    v = currents[0]
    assert v["version_id"] == "2023-revision"
    assert v["effective_date"] == "2024-01-01"
    for f in ("kind", "grade", "url", "accessed_at", "snapshot"):
        assert v["evidence"][f], f"证据字段 {f} 缺失"
    assert d["pending_note"], "pending 说明必须存在（历史版本未采集的诚实口径）"
    assert "scope_note" in d


def test_unknown_law_is_404_shape():
    # 2026-09-14 起所有 28 部法律均有注册表；仅测试真正不存在的 law_id。
    with pytest.raises(FileNotFoundError):
        law_versions.describe("no-such-law")


def _write(tmp_path, monkeypatch, payload, law_id="civl-2020"):
    reg = tmp_path / f"{law_id}.json"
    reg.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    monkeypatch.setattr(law_versions, "DATA_PATH", tmp_path)
    return reg


def test_missing_evidence_field_fails_closed(tmp_path, monkeypatch):
    payload = {
        "law_id": "civl-2020", "title": "民法典", "schema_version": 1,
        "versions": [{
            "version_id": "v1", "label": "2020", "status": "现行有效",
            "promulgation_date": "2020-05-28", "effective_date": "2021-01-01",
            "current": True, "evidence": {"kind": "x"},  # 缺 grade/url/accessed_at/snapshot
        }],
    }
    _write(tmp_path, monkeypatch, payload)
    with pytest.raises(ValueError, match="证据对象缺失"):
        law_versions.describe("civl-2020")


def test_double_current_fails_closed(tmp_path, monkeypatch):
    def ver(vid):
        return {
            "version_id": vid, "label": vid, "status": "现行有效",
            "promulgation_date": "2020-05-28", "effective_date": "2021-01-01",
            "current": True,
            "evidence": {"kind": "k", "grade": "强", "url": "u", "accessed_at": "2026-01-01", "snapshot": "s"},
        }
    _write(tmp_path, monkeypatch, {"law_id": "civl-2020", "title": "民法典", "schema_version": 1,
                                   "versions": [ver("a"), ver("b")]})
    with pytest.raises(ValueError, match="恰好一个 current"):
        law_versions.describe("civl-2020")


def test_registry_cannot_be_ahead_of_corpus(tmp_path, monkeypatch):
    """current 版本字段与语料不一致 → 拒绝加载（注册表不得比语料更先进）。"""
    def ver(eff):
        return {
            "version_id": "v1", "label": "x", "status": "现行有效",
            "promulgation_date": "2020-05-28", "effective_date": eff,
            "current": True,
            "evidence": {"kind": "k", "grade": "强", "url": "u", "accessed_at": "2026-01-01", "snapshot": "s"},
        }
    # 民法典施行日为 2021-01-01；错填 2099-01-01 必须被拒
    _write(tmp_path, monkeypatch, {"law_id": "civl-2020", "title": "民法典", "schema_version": 1,
                                   "versions": [ver("2099-01-01")]})
    with pytest.raises(ValueError, match="effective_date 与语料不一致"):
        law_versions.describe("civl-2020")


def test_bad_schema_version_fails_closed(tmp_path, monkeypatch):
    _write(tmp_path, monkeypatch, {"law_id": "civl-2020", "title": "民法典", "schema_version": 99,
                                   "versions": []})
    with pytest.raises(ValueError, match="schema_version 不受支持"):
        law_versions.describe("civl-2020")
