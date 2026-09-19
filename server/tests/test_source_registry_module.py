# -*- coding: utf-8 -*-
"""Source Registry 服务层（FLERF §6/§7，R164 接线）：
fail-closed 校验 + 公开只读端点 /api/sources。"""
import pytest

from app import main, source_registry


def test_load_registry_valid():
    data = source_registry.load_registry()
    assert data["schema_version"] == 1
    assert len(data["sources"]) >= 10
    assert len({s["id"] for s in data["sources"]}) == len(data["sources"])


def test_sources_endpoint_public_readonly():
    out = main.sources()
    assert isinstance(out, dict) and out.get("sources")
    for s in out["sources"]:
        assert s["authority_class"] in source_registry.AUTHORITY_CLASSES
        assert isinstance(s["compliance"]["approved"], bool)
        assert s["host"]


def test_validate_rejects_unknown_authority_class():
    data = source_registry.load_registry()
    bad = {**data, "sources": [{**data["sources"][0], "authority_class": "SUPER_TRUSTED"}]}
    with pytest.raises(ValueError, match="authority_class"):
        source_registry.validate(bad)


def test_validate_rejects_duplicate_id():
    data = source_registry.load_registry()
    first = data["sources"][0]
    bad = {**data, "sources": [first, {**first}]}
    with pytest.raises(ValueError, match="重复"):
        source_registry.validate(bad)


def test_validate_rejects_missing_approval_bool():
    data = source_registry.load_registry()
    bad = {**data, "sources": [{k: v for k, v in data["sources"][0].items() if k != "compliance"}]}
    with pytest.raises(ValueError, match="approved"):
        source_registry.validate(bad)


def test_canary_targets_are_approved_and_wellformed():
    """canary 配置只允许出现在 approved 来源上，且带 url+expect；null=曾配置后禁用（合规停用）。"""
    for s in source_registry.load_registry()["sources"]:
        if s.get("canary"):
            assert s["compliance"]["approved"] is True, f"{s['id']} 未批准却配置 canary"
            assert s["canary"]["url"].startswith("https://")
            assert isinstance(s["canary"].get("expect"), list) and s["canary"]["expect"]
