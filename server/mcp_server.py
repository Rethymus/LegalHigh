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
    hits = corpus.search(query, top_k=max(1, min(int(top_k), 100)), law_id=law_id or None)
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
    if sub:
        # 子条号是独立语料条目（如 287之一）——按 (law_id, no, sub) 精确匹配
        a = next((a for a in corpus.articles
                  if a["law_id"] == law_id and a["no"] == int(no) and a.get("sub") == sub), None)
    else:
        a = corpus.get_article(law_id, int(no))
    if not a:
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


def tool_search_cases(query: str, top_k: int = 5, level: str | None = None) -> dict:
    """检索已核实的公开案例（15 件：最高法指导案例 + 域外判例比较研究）。"""
    from app import cases as cases_mod

    hits = cases_mod.search_cases(query.strip(), level=level or None)
    items = []
    for c in hits[: max(1, min(int(top_k), 100))]:
        items.append({
            "case_id": c["id"],
            "name": c["name"],
            "no": c.get("no", ""),
            "court": c.get("court", ""),
            "date": c.get("date", ""),
            "cause": c.get("cause", ""),
            "level": c.get("level", ""),
            "summary": c.get("summary", ""),
            "focus": c.get("focus", []),
            "source_url": c.get("source_url", ""),
        })
    return {"query": query, "count": len(items), "cases": items, "disclaimer": DISCLAIMER}


def tool_search_history(query: str, top_k: int = 5, law_id: str | None = None,
                        version_id: str | None = None) -> dict:
    """在历史版本文本（非现行）中检索：独立命名空间，仅供对照研究。"""
    from app import history_index

    out = history_index.search(query.strip(), top_k=max(1, min(int(top_k), 100)),
                               law_id=law_id, version_id=version_id)
    return {
        "query": query,
        "count": len(out["hits"]),
        "hits": [{
            "law_id": h["law_id"], "version_id": h["version_id"],
            "version_label": h["version_label"], "effective_date": h["effective_date"],
            "no": h["no"], "sub": h.get("sub"), "label": h["label"],
            "text": h["text"], "score": h["score"],
        } for h in out["hits"]],
        "scope_note": out["scope_note"],
        "disclaimer": DISCLAIMER,
    }


TOOLS = [
    {
        "name": "search_articles",
        "description": (
            "按关键词全文检索 LegalHigh 受控语料（中国现行法律与规范文件）。"
            "返回法条原文+法规元数据+官方来源 URL。BM25 确定性排序（无 AI 生成）。"
            "输出为法条原文引用，不构成法律意见。"
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "检索关键词或自然语言问句"},
                "top_k": {"type": "integer", "description": "返回条数（默认 5，最大 100）"},
                "law_id": {"type": "string", "description": "限定法律 ID（可选，如 civl-2020）"},
            },
            "required": ["query"],
        },
    },
    {
        "name": "search_history",
        "description": (
            "在【历史版本文本】（非现行）中检索：覆盖已采集的历史版本全文，"
            "独立于现行检索命名空间，仅供对照研究。BM25 确定性排序（无 AI 生成）。"
            "输出为历史条文原文引用，不构成法律意见，不构成对时点适用文本的认定。"
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "检索关键词或自然语言问句"},
                "top_k": {"type": "integer", "description": "返回条数（默认 5，最大 100）"},
                "law_id": {"type": "string", "description": "限定法律 ID（可选）"},
                "version_id": {"type": "string", "description": "限定版本 ID（可选，如 2016-enacted）"},
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
    {
        "name": "search_cases",
        "description": (
            "检索已核实的公开案例（15 件：最高人民法院指导案例与域外经典判例比较研究），"
            "返回裁判要点摘要+法院+来源 URL。确定性关键词匹配（无 AI 生成）。"
            "输出为案例结构化摘要，不构成法律意见。"
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "检索关键词（案由/法院/争议焦点）"},
                "top_k": {"type": "integer", "description": "返回条数（默认 5，最大 100）"},
                "level": {"type": "string", "description": "限定层级（可选：指导性案例/外国判例）"},
            },
            "required": ["query"],
        },
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
    if name == "search_cases":
        return tool_search_cases(
            args.get("query", ""), args.get("top_k", 5), args.get("level")
        )
    if name == "search_history":
        return tool_search_history(
            args.get("query", ""), args.get("top_k", 5),
            args.get("law_id"), args.get("version_id")
        )
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
