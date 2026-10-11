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
    """红线审计：MCP 只暴露检索类工具——无任何生成型/AI/文书/审查工具。"""
    out = _roundtrip([
        {"jsonrpc": "2.0", "id": 1, "method": "initialize",
         "params": {"protocolVersion": "2024-11-05"}},
        {"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
    ])
    tools = [m for m in out if m.get("id") == 2][0]["result"]["tools"]
    names = sorted(t["name"] for t in tools)
    assert names == ["get_amendments", "get_article", "get_predecessor", "get_xrefs", "list_laws",
                     "resolve_citation", "search_articles", "search_cases", "search_history"], names
    # 每个工具描述都带「不构成法律意见」声明
    for t in tools:
        assert "不构成法律意见" in t["description"], t["name"]


def test_tools_call_get_predecessor():
    """get_predecessor（R391/R412）：单前身 + 多前身 idx + 普通法无前身说明。"""
    out = _roundtrip([
        {"jsonrpc": "2.0", "id": 1, "method": "initialize",
         "params": {"protocolVersion": "2024-11-05"}},
        {"jsonrpc": "2.0", "id": 2, "method": "tools/call",
         "params": {"name": "get_predecessor", "arguments": {"law_id": "physicians-2021"}}},
        {"jsonrpc": "2.0", "id": 3, "method": "tools/call",
         "params": {"name": "get_predecessor", "arguments": {"law_id": "pcl-2023"}}},
        {"jsonrpc": "2.0", "id": 4, "method": "tools/call",
         "params": {"name": "get_predecessor", "arguments": {"law_id": "civl-2020", "idx": 5}}},
        {"jsonrpc": "2.0", "id": 5, "method": "tools/call",
         "params": {"name": "get_predecessor", "arguments": {"law_id": "civl-2020"}}},
    ])
    by_id = {m.get("id"): m for m in out}
    pred = by_id[2]["result"]["content"][0]["text"]
    assert "执业医师" in pred and "前身关系定案" in pred and "1998年6月26日" in pred
    none = by_id[3]["result"]["content"][0]["text"]
    assert "无前身法登记" in none
    multi = by_id[4]["result"]["content"][0]["text"]
    assert "合同法" in multi and "1999年3月15日" in multi
    oor = by_id[5]["result"]["content"][0]["text"]
    assert "索引越界" in oor and "idx" in oor


def test_tools_call_get_amendments():
    """get_amendments（R385）：清单形态 + 决定全文形态（与版本注册表/快照管线一致）。"""
    out = _roundtrip([
        {"jsonrpc": "2.0", "id": 1, "method": "initialize",
         "params": {"protocolVersion": "2024-11-05"}},
        {"jsonrpc": "2.0", "id": 2, "method": "tools/call",
         "params": {"name": "get_amendments", "arguments": {"law_id": "pcl-2023"}}},
        {"jsonrpc": "2.0", "id": 3, "method": "tools/call",
         "params": {"name": "get_amendments", "arguments": {"law_id": "pcl-2023", "no": 1}}},
    ])
    by_id = {m.get("id"): m for m in out}
    listing = by_id[2]["result"]["content"][0]["text"]
    assert '"count": 5' in listing and "usage" in listing
    full = by_id[3]["result"]["content"][0]["text"]
    assert "作如下修改" in full and "一手文本" in full


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


def test_tools_call_resolve_citation():
    """法条直查（R503）：引用问句确定性解析；未解析如实返回不猜测。"""
    out = _roundtrip([
        {"jsonrpc": "2.0", "id": 1, "method": "initialize",
         "params": {"protocolVersion": "2024-11-05"}},
        {"jsonrpc": "2.0", "id": 2, "method": "tools/call",
         "params": {"name": "resolve_citation",
                    "arguments": {"query": "民法典第1254条说了什么"}}},
        {"jsonrpc": "2.0", "id": 3, "method": "tools/call",
         "params": {"name": "resolve_citation",
                    "arguments": {"query": "婚姻法第32条有效吗"}}},
    ])
    by_id = {m.get("id"): m for m in out if m.get("id") is not None}
    hit = json.loads(by_id[2]["result"]["content"][0]["text"])
    assert hit["resolved"] is True
    assert (hit["law_id"], hit["no"]) == ("civl-2020", 1254)
    assert hit["text"] and hit["source_url"]
    assert "不构成法律意见" in hit["disclaimer"]
    miss = json.loads(by_id[3]["result"]["content"][0]["text"])
    assert miss["resolved"] is False and miss["note"]
    assert by_id[3]["result"]["isError"] is False  # 诚实未命中不是工具错误


def _roundtrip_raw(lines: list[str]):
    """按原始行发送（不经 json.dumps）——测非对象 JSON 与畸形消息。"""
    proc = subprocess.run(
        [sys.executable, str(SERVER)],
        input="\n".join(lines) + "\n",
        capture_output=True, text=True, timeout=120,
    )
    return proc, [json.loads(l) for l in proc.stdout.split("\n") if l.strip()]


def test_non_object_json_does_not_kill_server():
    """R508 MCP 健壮性：合法 JSON 但非对象（数组/字符串）此前 AttributeError 击穿
    stdio 主循环（单条 `[1,2,3]` 即崩溃，实测复现）——现返回 -32600 且服务存活。"""
    proc, out = _roundtrip_raw([
        "[1,2,3]",
        '"plain string"',
        "42",
        json.dumps({"jsonrpc": "2.0", "id": 7, "method": "tools/list"}),
    ])
    assert proc.returncode == 0, f"服务器被击穿：stderr={proc.stderr[:300]}"
    codes = [m.get("error", {}).get("code") for m in out if m.get("id") is None]
    assert codes.count(-32600) == 3, f"三条非对象消息应各返回 -32600：{out}"
    alive = [m for m in out if m.get("id") == 7][0]
    assert "tools" in alive["result"]  # 坏消息之后服务仍在应答


def test_bad_params_shape_is_jsonrpc_error_not_crash():
    """params/arguments 非对象 → -32602，服务存活。"""
    proc, out = _roundtrip_raw([
        json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": [1, 2]}),
        json.dumps({"jsonrpc": "2.0", "id": 2, "method": "tools/call",
                    "params": {"name": "list_laws", "arguments": "not-an-object"}}),
        json.dumps({"jsonrpc": "2.0", "id": 3, "method": "tools/list"}),
    ])
    assert proc.returncode == 0, proc.stderr[:200]
    by_id = {m.get("id"): m for m in out}
    assert by_id[1]["error"]["code"] == -32602
    assert by_id[2]["error"]["code"] == -32602
    assert "tools" in by_id[3]["result"]


def test_unexpected_tool_exception_returns_internal_error():
    """dispatch 未预期异常 → JSON-RPC -32603 信封（进程内直接调 handle 验证
    catch-all 路径；stdio 层由前两测的存活断言覆盖）。"""
    import mcp_server as M

    resp = M.handle({"jsonrpc": "2.0", "id": 5, "method": "tools/call",
                     "params": {"name": "search_articles",
                                "arguments": {"query": None, "top_k": "3"}}})
    # search_articles(query=None) 走 ValueError 分支或 catch-all，都不得抛出
    assert resp is not None and (resp.get("result") is not None or resp.get("error") is not None)

    def _boom(*a, **k):
        raise RuntimeError("boom")

    orig = M.dispatch
    M.dispatch = _boom
    try:
        resp = M.handle({"jsonrpc": "2.0", "id": 6, "method": "tools/call",
                         "params": {"name": "search_articles", "arguments": {"query": "x"}}})
    finally:
        M.dispatch = orig
    assert resp["error"]["code"] == -32603
    assert "RuntimeError" in resp["error"]["message"]
