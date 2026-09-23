# -*- coding: utf-8 -*-
"""OpenAPI 快照测试（v7 S3-T1）：钉住 /openapi.json 与 /docs 的发布姿态。

FastAPI 默认生成 OpenAPI 3.1 schema 与 /docs 交互页——若未来任何重构
（如禁用 docs_url/openapi_url、改 title）导致开发者接口丢失，本测试在 CI 第一门直接失败。
"""
import json

from fastapi.testclient import TestClient

from app.main import app  # noqa: E402

client = TestClient(app)


def test_openapi_json_reachable_and_shape():
    r = client.get("/openapi.json")
    assert r.status_code == 200
    spec = r.json()
    assert spec["openapi"].startswith("3.")
    assert spec["info"]["title"] == "LegalHigh 原型 API"
    paths = spec["paths"]
    # 核心公开检索面必须在册（对外 API 契约的锚点）
    for p in ("/api/laws", "/api/search", "/api/cases", "/api/evals",
              "/api/laws/{law_id}/explains", "/api/laws/{law_id}/versions", "/api/compliance"):
        assert p in paths, f"openapi 缺路径: {p}"


def test_docs_page_reachable():
    r = client.get("/docs")
    assert r.status_code == 200
    assert "swagger" in r.text.lower() or "openapi" in r.text.lower()


def test_mcp_server_tools_declared_separately():
    """MCP 工具不进 OpenAPI（stdio 传输独立于 HTTP 面）——钉住边界防混淆。"""
    import sys
    sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parents[1]))
    from mcp_server import TOOLS  # noqa: E402
    names = sorted(t["name"] for t in TOOLS)
    assert names == ["get_article", "get_xrefs", "list_laws", "search_articles", "search_cases", "search_history"]
    # MCP 与 HTTP 是两个独立面：MCP 工具名不等于 HTTP 路径
    for t in TOOLS:
        assert not t["name"].startswith("/api/")
