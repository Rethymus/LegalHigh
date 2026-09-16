# -*- coding: utf-8 -*-
"""MCP HTTP 传输回环测试（v7 S2-T1 补全）：POST /mcp JSON-RPC round-trip。"""
import json

import pytest
from fastapi.testclient import TestClient

from app.main import app  # noqa: E402

client = TestClient(app)


def test_mcp_http_initialize():
    r = client.post("/mcp", json={
        "jsonrpc": "2.0", "id": 1, "method": "initialize",
        "params": {"protocolVersion": "2024-11-05"},
    })
    assert r.status_code == 200
    d = r.json()
    assert d["result"]["protocolVersion"] == "2024-11-05"
    assert "tools" in d["result"]["capabilities"]


def test_mcp_http_search():
    r = client.post("/mcp", json={
        "jsonrpc": "2.0", "id": 2, "method": "tools/call",
        "params": {"name": "search_articles",
                   "arguments": {"query": "诉讼时效", "top_k": 3}},
    })
    assert r.status_code == 200
    d = r.json()
    inner = json.loads(d["result"]["content"][0]["text"])
    assert inner["count"] >= 1
    assert inner["articles"][0]["source_url"].startswith("https://")


def test_mcp_http_unknown_tool():
    r = client.post("/mcp", json={
        "jsonrpc": "2.0", "id": 3, "method": "tools/call",
        "params": {"name": "generate_advice", "arguments": {}},
    })
    assert r.status_code == 200
    d = r.json()
    assert d["result"]["isError"] is True


def test_mcp_http_notification_202():
    r = client.post("/mcp", json={
        "jsonrpc": "2.0", "method": "notifications/initialized",
    })
    assert r.status_code == 202


def test_mcp_http_parse_error():
    r = client.post("/mcp", content="not json", headers={"Content-Type": "application/json"})
    assert r.status_code == 400
    assert r.json()["error"]["code"] == -32700
