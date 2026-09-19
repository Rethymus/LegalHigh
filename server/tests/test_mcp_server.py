# -*- coding: utf-8 -*-
"""MCP Server 子进程回环测试（v7 S2-T1）：协议握手 + 三工具调用 + 红线审计。"""
import json
import subprocess
import sys
from pathlib import Path

SERVER = Path(__file__).resolve().parents[1] / "mcp_server.py"


def _roundtrip(msgs):
    proc = subprocess.run(
        [sys.executable, str(SERVER)],
        input="\n".join(json.dumps(m) for m in msgs) + "\n",
        capture_output=True, text=True, timeout=120,
    )
    lines = [json.loads(l) for l in proc.stdout.split("\n") if l.strip()]
    return lines


def test_initialize_handshake():
    out = _roundtrip([
        {"jsonrpc": "2.0", "id": 1, "method": "initialize",
         "params": {"protocolVersion": "2024-11-05", "capabilities": {},
                    "clientInfo": {"name": "test", "version": "0"}}},
        {"jsonrpc": "2.0", "method": "notifications/initialized"},
    ])
    init = [m for m in out if m.get("id") == 1][0]
    assert init["result"]["protocolVersion"] == "2024-11-05"
    assert "tools" in init["result"]["capabilities"]
    assert init["result"]["serverInfo"]["name"] == "LegalHigh"
    # notification 不产生响应
    assert len(out) == 1


def test_tools_list_red_line_audit():
    """红线审计：MCP 只暴露检索四工具——无任何生成型/AI/文书/审查工具。"""
    out = _roundtrip([
        {"jsonrpc": "2.0", "id": 1, "method": "initialize",
         "params": {"protocolVersion": "2024-11-05"}},
        {"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
    ])
    tools = [m for m in out if m.get("id") == 2][0]["result"]["tools"]
    names = sorted(t["name"] for t in tools)
    assert names == ["get_article", "list_laws", "search_articles", "search_cases", "search_history"], names
    # 每个工具描述都带「不构成法律意见」声明
    for t in tools:
        assert "不构成法律意见" in t["description"], t["name"]


def test_tools_call_search_history():
    out = _roundtrip([
        {"jsonrpc": "2.0", "id": 1, "method": "initialize",
         "params": {"protocolVersion": "2024-11-05"}},
        {"jsonrpc": "2.0", "id": 2, "method": "tools/call",
         "params": {"name": "search_history",
                    "arguments": {"query": "网络安全 等级保护", "law_id": "csl-2025",
                                  "version_id": "2016-enacted", "top_k": 3}}},
    ])
    payload = [m for m in out if m.get("id") == 2][0]["result"]
    text = payload["content"][0]["text"]
    assert "2016-enacted" in text and "等级保护" in text
    assert "非现行" in text


def test_tools_call_search_and_article():
    out = _roundtrip([
        {"jsonrpc": "2.0", "id": 1, "method": "initialize",
         "params": {"protocolVersion": "2024-11-05"}},
        {"jsonrpc": "2.0", "id": 2, "method": "tools/call",
         "params": {"name": "search_articles",
                    "arguments": {"query": "诉讼时效", "top_k": 3}}},
        {"jsonrpc": "2.0", "id": 3, "method": "tools/call",
         "params": {"name": "get_article",
                    "arguments": {"law_id": "civl-2020", "no": 188}}},
        {"jsonrpc": "2.0", "id": 4, "method": "tools/call",
         "params": {"name": "list_laws", "arguments": {}}},
        {"jsonrpc": "2.0", "id": 5, "method": "tools/call",
         "params": {"name": "search_cases",
                    "arguments": {"query": "竞业限制", "top_k": 3}}},
    ])
    by_id = {m.get("id"): m for m in out if m.get("id") is not None}
    search = json.loads(by_id[2]["result"]["content"][0]["text"])
    assert search["count"] >= 1
    hit = search["articles"][0]
    assert hit["law_id"] and hit["text"] and hit["source_url"].startswith("https://")
    assert "不构成法律意见" in search["disclaimer"]

    cases = json.loads(by_id[5]["result"]["content"][0]["text"])
    assert cases["count"] >= 1
    chit = cases["cases"][0]
    assert chit["case_id"].startswith("guidance-")
    assert chit["name"] and chit["source_url"].startswith("https://")

    article = json.loads(by_id[3]["result"]["content"][0]["text"])
    assert article["no"] == 188
    assert "三年" in article["text"]  # 民法典 188 诉讼时效
    assert article["instrument"]  # 令号/公布载体

    laws = json.loads(by_id[4]["result"]["content"][0]["text"])
    assert laws["count"] >= 28
    assert all(l["article_count"] > 0 for l in laws["laws"])

    # 子条号精确取回（R129：get_article sub 参数修复）
    out5 = _roundtrip([
        {"jsonrpc": "2.0", "id": 5, "method": "tools/call",
         "params": {"name": "get_article",
                    "arguments": {"law_id": "cl-2023", "no": 287, "sub": "之一"}}},
    ])
    sub = json.loads([m for m in out5 if m.get("id") == 5][0]["result"]["content"][0]["text"])
    assert sub["sub"] == "之一", sub
    assert "信息网络" in sub["text"]  # 287之一 帮信罪特征用语
    assert sub["text"] != article["text"]  # 与基条 287 是不同条文


def test_tools_call_unknown_tool_is_error():
    out = _roundtrip([
        {"jsonrpc": "2.0", "id": 1, "method": "tools/call",
         "params": {"name": "generate_legal_advice", "arguments": {}}},
    ])
    call = [m for m in out if m.get("id") == 1][0]
    assert call["result"]["isError"] is True


def test_unknown_method_is_jsonrpc_error():
    out = _roundtrip([
        {"jsonrpc": "2.0", "id": 9, "method": "resources/list"},
    ])
    err = [m for m in out if m.get("id") == 9][0]
    assert err["error"]["code"] == -32601
