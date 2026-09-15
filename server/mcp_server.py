# -*- coding: utf-8 -*-
"""LegalHigh MCP Server（v7 S2-T1）：把引用绑定法条检索以 Model Context Protocol
标准暴露给外部 AI 助手。

红线随行：
- 只暴露检索三工具（search_articles / get_article / list_laws）——无任何生成型工具，
  不提供 AI 草稿、文书生成或预测功能（AI 默认关闭红线在 MCP 形态下不变）。
- 输出永远引用绑定：法条原文 + 法规元数据 + 官方来源 URL；工具描述显式声明
  「检索工具，非法律意见」。
- 敏感端点（审查/草稿/审计/隐私导出）不进 MCP。

传输：stdio（换行分隔 JSON-RPC 2.0）。零第三方依赖（纯 stdlib）。
用法：python server/mcp_server.py [--lang-dir server]（MCP 客户端一行配置接入）
"""
import argparse
import json
import sys
from pathlib import Path

SERVER_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(SERVER_ROOT))

from app.corpus import get_corpus  # noqa: E402

PROTOCOL_VERSION = "2024-11-05"
DISCLAIMER = "（检索工具输出为法条原文与元数据，不构成法律意见；引用请以官方公报为准。）"


def tool_search_articles(query: str, top_k: int = 5, law_id: str | None = None) -> dict:
    corpus = get_corpus()
    hits = corpus.search(query, top_k=max(1, min(int(top_k), 20)), law_id=law_id or None)
    items = []
    for h in hits:
        items.append({
            "law_id": h["law_id"],
            "law_title": h["law_title"],
            "article_no": h["no"],
            "sub": h.get("sub"),
            "label": h["label"],
            "chapter": h.get("chapter"),
            "text": h["text"],
            "law_status": h.get("law_status"),
            "effective_date": h.get("effective_date"),
            "source_url": (corpus.laws.get(h["law_id"], {}).get("source") or {}).get("url", ""),
        })
    return {"query": query, "count": len(items), "articles": items, "disclaimer": DISCLAIMER}


def tool_get_article(law_id: str, no: int, sub: str | None = None) -> dict:
    corpus = get_corpus()
    a = corpus.get_article(law_id, int(no))
    if a and sub and a.get("sub") != sub:
        a = None  # 指定了子条号但基条不匹配（MCP 暂不索引子条独立条目）
        return {"error": f"article not found: {law_id} 第{no}条{sub or ''}"}
    law = corpus.laws.get(law_id, {})
    return {
        "law_id": law_id,
        "law_title": law.get("title", ""),
        "no": a["no"],
        "sub": a.get("sub"),
        "label": a["label"],
        "chapter": a.get("chapter"),
        "text": a["text"],
        "law_status": law.get("status", ""),
        "effective_date": law.get("effective_date", ""),
        "promulgation": law.get("promulgation", {}),
        "instrument": law.get("promulgation_instrument", ""),
        "source_url": (law.get("source") or {}).get("url", ""),
        "authority_pointer": law.get("authority_pointer", ""),
        "disclaimer": DISCLAIMER,
    }


def tool_list_laws() -> dict:
    corpus = get_corpus()
    laws = []
    for entry in corpus.manifest["laws"]:
        law = corpus.laws.get(entry["law_id"], {})
        laws.append({
            "law_id": entry["law_id"],
            "title": law.get("title", entry.get("title", "")),
            "status": law.get("status", ""),
            "effective_date": law.get("effective_date", ""),
            "article_count": len(law.get("articles", [])),
        })
    return {"count": len(laws), "laws": laws, "disclaimer": DISCLAIMER}


TOOLS = [
    {
        "name": "search_articles",
        "description": (
            "按关键词全文检索 LegalHigh 受控语料（28 部中国现行法律，4,306 条），"
            "返回法条原文+法规元数据+官方来源 URL。BM25 确定性排序（无 AI 生成）。"
            "输出为法条原文引用，不构成法律意见。"
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "检索关键词或自然语言问句"},
                "top_k": {"type": "integer", "description": "返回条数（默认 5，最大 20）"},
                "law_id": {"type": "string", "description": "限定法律 ID（可选，如 civl-2020）"},
            },
            "required": ["query"],
        },
    },
    {
        "name": "get_article",
        "description": "按法律 ID + 条号取单条法条原文与完整元数据（公布/施行/令号/来源）。输出为法条原文引用，不构成法律意见。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "law_id": {"type": "string", "description": "法律 ID（如 civl-2020）"},
                "no": {"type": "integer", "description": "条号（如 188）"},
                "sub": {"type": "string", "description": "子条号（可选，如 之一）"},
            },
            "required": ["law_id", "no"],
        },
    },
    {
        "name": "list_laws",
        "description": "列出受控语料全部法律（ID/标题/状态/施行日期/条数）。输出为元数据列表，不构成法律意见。",
        "inputSchema": {"type": "object", "properties": {}},
    },
]


def dispatch(name: str, args: dict):
    if name == "search_articles":
        return tool_search_articles(
            args.get("query", ""), args.get("top_k", 5), args.get("law_id")
        )
    if name == "get_article":
        return tool_get_article(args.get("law_id", ""), args.get("no", 0), args.get("sub"))
    if name == "list_laws":
        return tool_list_laws()
    raise KeyError(f"unknown tool: {name}")


def handle(msg: dict) -> dict | None:
    method = msg.get("method", "")
    msg_id = msg.get("id")
    is_request = msg_id is not None

    if method == "initialize":
        return _result(msg_id, {
            "protocolVersion": PROTOCOL_VERSION,
            "capabilities": {"tools": {}},
            "serverInfo": {"name": "LegalHigh", "version": "1.1.0"},
        })
    if method == "notifications/initialized":
        return None
    if method == "tools/list":
        return _result(msg_id, {"tools": TOOLS})
    if method == "tools/call":
        params = msg.get("params") or {}
        name = params.get("name", "")
        args = params.get("arguments") or {}
        try:
            data = dispatch(name, args)
            text = json.dumps(data, ensure_ascii=False, indent=1)
            return _result(msg_id, {
                "content": [{"type": "text", "text": text}],
                "isError": bool(data.get("error")),
            })
        except KeyError as e:
            return _result(msg_id, {
                "content": [{"type": "text", "text": f"unknown tool: {e}"}],
                "isError": True,
            })
        except (ValueError, TypeError, KeyError) as e:
            return _result(msg_id, {
                "content": [{"type": "text", "text": f"工具执行失败: {e}"}],
                "isError": True,
            })
    if is_request:
        return _error(msg_id, -32601, f"method not found: {method}")
    return None


def _result(msg_id, result):
    return {"jsonrpc": "2.0", "id": msg_id, "result": result}


def _error(msg_id, code, message):
    return {"jsonrpc": "2.0", "id": msg_id, "error": {"code": code, "message": message}}


def main():
    ap = argparse.ArgumentParser(description="LegalHigh MCP Server (stdio)")
    ap.parse_args()
    corpus = get_corpus()  # 启动时加载语料（fail-fast：缺数据立即退出）
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            sys.stdout.write(json.dumps(_error(None, -32700, "parse error")) + "\n")
            sys.stdout.flush()
            continue
        resp = handle(msg)
        if resp is not None:
            sys.stdout.write(json.dumps(resp, ensure_ascii=False) + "\n")
            sys.stdout.flush()


if __name__ == "__main__":
    main()
