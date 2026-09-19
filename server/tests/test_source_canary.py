# -*- coding: utf-8 -*-
"""Source Drift canary（FLERF §42，R164）：指纹/比对/编排纯逻辑的离线测试。

网络函数 fetch 不在测试中触网——以假 fetch 注入 run_checks，
断言 degraded 判定、状态文件更新与退出码语义。
"""
import importlib.util
import json
import pathlib

SERVER_DIR = pathlib.Path(__file__).resolve().parent.parent
_spec = importlib.util.spec_from_file_location(
    "source_canary", SERVER_DIR / "scripts" / "source_canary.py")
canary = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(canary)


REGISTRY = {
    "schema_version": 1,
    "sources": [
        {"id": "ok_src", "host": "a.example", "authority_class": "OFFICIAL_PRIMARY",
         "compliance": {"approved": True},
         "canary": {"url": "https://a.example/", "expect": ["标题在", "备案号在"]}},
        {"id": "drift_src", "host": "b.example", "authority_class": "OFFICIAL_PRIMARY",
         "compliance": {"approved": True},
         "canary": {"url": "https://b.example/", "expect": ["官网"]}},
        {"id": "blocked_src", "host": "c.example", "authority_class": "OFFICIAL_PRIMARY",
         "compliance": {"approved": True},
         "canary": {"url": "https://c.example/", "expect": ["官网"]}},
        {"id": "no_canary", "host": "d.example", "authority_class": "OFFICIAL_PRIMARY",
         "compliance": {"approved": True}},
        {"id": "unapproved_canary", "host": "e.example", "authority_class": "OFFICIAL_PRIMARY",
         "compliance": {"approved": False},
         "canary": {"url": "https://e.example/", "expect": ["官网"]}},
    ],
}


def _fake_fetch(responses: dict):
    def _fetch(url, timeout=20):
        if url not in responses:
            raise RuntimeError(f"连接失败：{url}")
        return responses[url]
    return _fetch


def test_fingerprint_markers_and_bucket():
    html = "x" * (canary.SIZE_BUCKET * 5) + " 标题在 备案号在"
    fp = canary.fingerprint(html, ["标题在", "备案号在"])
    assert fp["markers_healthy"] and fp["size_bucket"] == 5
    bad = canary.fingerprint("只有 标题在", ["标题在", "备案号在"])
    assert not bad["markers_healthy"]


def test_compare_detects_bucket_jump_only():
    assert canary.compare_with_previous(None, {"markers_healthy": True, "size_bucket": 3})["healthy"]
    assert canary.compare_with_previous({"size_bucket": 4}, {"markers_healthy": True, "size_bucket": 5})["healthy"]
    verdict = canary.compare_with_previous({"size_bucket": 3}, {"markers_healthy": True, "size_bucket": 12})
    assert not verdict["healthy"] and "STRUCTURE_DRIFT" in verdict["drift"]


def test_run_checks_end_to_end(tmp_path):
    state_path = tmp_path / "state.json"
    responses = {
        "https://a.example/": (200, "标题在 备案号在"),
        "https://b.example/": (200, "官网 " + "z" * (canary.SIZE_BUCKET * 30)),
        # c.example 故意不在 responses → 连接失败
    }
    state = {"drift_src": {"size_bucket": 1}}  # 预置旧档位，制造体积突变
    results, all_healthy = canary.run_checks(REGISTRY, _fake_fetch(responses), state)

    by_id = {r["source_id"]: r for r in results}
    # 只检测 approved 且配置 canary 的来源（no_canary/unapproved 不触网）
    assert set(by_id) == {"ok_src", "drift_src", "blocked_src"}
    assert by_id["ok_src"]["healthy"]
    assert not by_id["drift_src"]["healthy"] and "STRUCTURE_DRIFT" in by_id["drift_src"]["drift"]
    assert not by_id["blocked_src"]["healthy"] and by_id["blocked_src"]["status"] == 0
    assert not all_healthy

    # 状态文件素材已更新（写入由 main 负责，这里断言 state 原地更新）
    assert state["ok_src"]["status"] == 200
    assert "drift_src" in state


def test_run_checks_all_healthy_path(tmp_path):
    responses = {s["canary"]["url"]: (200, "官网 标题在 备案号在")
                 for s in REGISTRY["sources"] if "canary" in s}
    results, all_healthy = canary.run_checks(REGISTRY, _fake_fetch(responses), {})
    assert all_healthy and all(r["healthy"] for r in results)
