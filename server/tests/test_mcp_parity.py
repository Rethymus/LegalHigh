# -*- coding: utf-8 -*-
"""MCP 与 HTTP API 同源一致性测试（R128）：同一查询经两个通道必须返回相同检索结果。

契约：MCP search_articles 与 GET /api/search 使用同一 BM25 语料单例——任何
一边的检索逻辑漂移（分词/评分/过滤差异）都会在此测试直接失败。
"""
import json
import subprocess
import sys
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app  # noqa: E402

SERVER = Path(__file__).resolve().parents[1] / "mcp_server.py"


def _mcp_search(query: str, top_k: int) -> list[dict]:
    msgs = [
        {"jsonrpc": "2.0", "id": 1, "method": "initialize",
         "params": {"protocolVersion": "2024-11-05"}},
        {"jsonrpc": "2.0", "id": 2, "method": "tools/call",
         "params": {"name": "search_articles",
                    "arguments": {"query": query, "top_k": top_k}}},
    ]
    proc = subprocess.run(
        [sys.executable, str(SERVER)],
        input="\n".join(json.dumps(m) for m in msgs) + "\n",
        capture_output=True, text=True, timeout=120,
    )
    lines = [json.loads(l) for l in proc.stdout.split("\n") if l.strip()]
    by_id = {m.get("id"): m for m in lines if m.get("id") is not None}
    return json.loads(by_id[2]["result"]["content"][0]["text"])["articles"]


def test_mcp_http_search_parity():
    client = TestClient(app)
    for query in ("诉讼时效 三年", "竞业限制 补偿", "正当防卫"):
        r = client.get("/api/search", params={"q": query, "top_k": 5})
        http_hits = [
            (h["law_id"], h["no"], h.get("sub") or "")
            for h in r.json()["hits"]
        ]
        mcp_hits = [
            (h["law_id"], h["article_no"], h.get("sub") or "")
            for h in _mcp_search(query, 5)
        ]
        assert http_hits == mcp_hits, f"两通道结果不一致 @ {query}: {http_hits} vs {mcp_hits}"


def test_mcp_http_case_parity():
    """search_cases 与 /api/cases 同源：同一关键词命中同一批 case_id。"""
    client = TestClient(app)
    r = client.get("/api/cases", params={"q": "竞业限制"})
    http_ids = sorted(c["id"] for c in r.json()["cases"])
    msgs = [
        {"jsonrpc": "2.0", "id": 1, "method": "tools/call",
         "params": {"name": "search_cases",
                    "arguments": {"query": "竞业限制", "top_k": 100}}},
    ]
    proc = subprocess.run(
        [sys.executable, str(SERVER)],
        input="\n".join(json.dumps(m) for m in msgs) + "\n",
        capture_output=True, text=True, timeout=120,
    )
    lines = [json.loads(l) for l in proc.stdout.split("\n") if l.strip()]
    mcp_ids = sorted(
        c["case_id"]
        for c in json.loads(lines[0]["result"]["content"][0]["text"])["cases"]
    )
    assert http_ids == mcp_ids, f"案例两通道不一致: {http_ids} vs {mcp_ids}"
