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


def test_validate_rejects_non_bool_robots_flag():
    data = source_registry.load_registry()
    src = {**data["sources"][0], "access": {"robots_disallow_all": "yes"}}
    with pytest.raises(ValueError, match="robots_disallow_all"):
        source_registry.validate({**data, "sources": [src]})


def test_validate_rejects_canary_on_robots_blocked_source():
    """loader 层红线：robots_disallow_all=true 的来源配置 canary 即校验失败（LEGAL-006）。"""
    data = source_registry.load_registry()
    src = {**data["sources"][0],
           "access": {"robots_disallow_all": True},
           "canary": {"url": "https://x.example/", "expect": ["官网"]}}
    with pytest.raises(ValueError, match="LEGAL-006"):
        source_registry.validate({**data, "sources": [src]})


def test_npc_flk_robots_redline_data_pinned():
    """数据面 pinning（R181/R198）：flk robots 明文禁止自动化 → canary 必须为 null、标志必须为 true。"""
    sources = source_registry.load_registry()["sources"]
    flk = next(s for s in sources if s["id"] == "npc_flk")
    assert flk["canary"] is None
    assert flk["access"]["robots_disallow_all"] is True
    for s in sources:
        if (s.get("access") or {}).get("robots_disallow_all") is True:
            assert not s.get("canary"), f"{s['id']} robots 禁探却配置 canary"
