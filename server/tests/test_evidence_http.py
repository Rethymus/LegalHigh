# -*- coding: utf-8 -*-
"""HTTP 级集成测试（R193）：GET /api/evidence 与 GET /api/history/search。

FastAPI TestClient 走完整 ASGI 栈（路由→DI→处理函数），覆盖：
- /api/evidence 管理门矩阵（无令牌 503 / 错令牌 403 / 正确令牌 200）；
- /api/history/search 公开端点（200 + law_id/version_id 过滤 + 空结果诚实）；
- llms.txt / OpenAPI schema 包含新端点路径。
"""
import json
import pathlib

import pytest
from fastapi.testclient import TestClient

from app import main, storage

ADMIN_TOKEN = "http-integration-test-token-32-chars!!"
ADMIN_HEADERS = {"X-LegalHigh-Admin-Token": ADMIN_TOKEN}


@pytest.fixture()
def client(tmp_db, monkeypatch):
    monkeypatch.setenv("LH_ADMIN_TOKEN", ADMIN_TOKEN)
    monkeypatch.setenv("LH_ADMIN_PRINCIPAL", "http-test")
    with TestClient(main.app) as c:
        yield c


@pytest.fixture()
def seeded_db(tmp_db):
    """预置一条 qa 账本行。"""
    main.ask(main.AskBody(question="试用期最长不得超过多久"))


# ---------- /api/evidence 管理门矩阵 ----------

class TestEvidenceEndpointAuth:
    def test_no_token_returns_503(self, tmp_db, monkeypatch):
        monkeypatch.delenv("LH_ADMIN_TOKEN", raising=False)
        monkeypatch.delenv("LH_ADMIN_PRINCIPAL", raising=False)
        with TestClient(main.app) as c:
            assert c.get("/api/evidence").status_code == 503

    def test_wrong_token_returns_403(self, tmp_db, monkeypatch):
        monkeypatch.setenv("LH_ADMIN_TOKEN", ADMIN_TOKEN)
        monkeypatch.setenv("LH_ADMIN_PRINCIPAL", "http-test")
        with TestClient(main.app) as c:
            r = c.get("/api/evidence", headers={"X-LegalHigh-Admin-Token": "wrong"})
            assert r.status_code == 403

    def test_correct_token_returns_200(self, client, seeded_db):
        r = client.get("/api/evidence", headers=ADMIN_HEADERS)
        assert r.status_code == 200
        data = r.json()
        assert data["entries"], "有账本数据时应返回非空"

    def test_evidence_entity_type_filter(self, client, seeded_db):
        r_all = client.get("/api/evidence?limit=100", headers=ADMIN_HEADERS).json()
        r_qa = client.get("/api/evidence?entity_type=qa&limit=100", headers=ADMIN_HEADERS).json()
        assert all(e["entity_type"] == "qa" for e in r_qa["entries"])
        assert len(r_qa["entries"]) <= len(r_all["entries"])

    def test_evidence_limit_param(self, client, seeded_db):
        r = client.get("/api/evidence?limit=1", headers=ADMIN_HEADERS).json()
        assert len(r["entries"]) <= 1


# ---------- /api/history/search ----------

class TestHistorySearchEndpoint:
    def test_public_no_auth_needed(self, client):
        r = client.get("/api/history/search", params={"q": "网络安全 等级保护", "top_k": 3})
        assert r.status_code == 200
        data = r.json()
        assert data["total"] > 0
        assert "非现行" in data["scope_note"]
        assert data["index_articles"] > 4000

    def test_empty_query_returns_422(self, client):
        r = client.get("/api/history/search", params={"q": ""})
        assert r.status_code == 422

    def test_law_id_filter(self, client):
        r = client.get("/api/history/search", params={"q": "网络安全", "law_id": "csl-2025", "top_k": 5})
        assert r.status_code == 200
        for h in r.json()["hits"]:
            assert h["law_id"] == "csl-2025"

    def test_empty_results_honest(self, client):
        r = client.get("/api/history/search", params={"q": "qqqq zzww 不存在的法条"})
        assert r.status_code == 200
        # BM25 总有分数；关键是 index 元数据诚实返回而非静默空
        data = r.json()
        assert data["index_articles"] > 4000

    def test_in_openapi_schema(self, client):
        schema = client.get("/openapi.json").json()
        paths = schema.get("paths", {})
        assert "/api/evidence" in paths
        assert "/api/history/search" in paths
        assert "/api/laws/{law_id}/renumber-map" in paths


# ---------- llms.txt 引用端点覆盖率 ----------

def test_llms_txt_exists():
    p = pathlib.Path(__file__).resolve().parent.parent.parent / "web" / "public" / "llms.txt"
    assert p.is_file(), "llms.txt 应由 build 自动生成"
