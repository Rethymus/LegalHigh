# -*- coding: utf-8 -*-
"""公开数据储备口径：实时派生、只含可公开真值。"""
from fastapi.testclient import TestClient

from app import cases, explains
from app.corpus import get_corpus
from app.main import app


def test_public_inventory_matches_current_sources():
    response = TestClient(app).get("/api/inventory")
    assert response.status_code == 200
    body = response.json()
    corpus = get_corpus()
    assert body == {
        "laws": len(corpus.laws),
        "articles": len(corpus.articles),
        "verified_cases": len(cases.search_cases("", verified_only=True)),
        "approved_explains": sum(
            1 for entry in explains.load_explains()
            if entry.get("status") == "approved" and entry.get("reviewer")
        ),
        "fetched_at": corpus.manifest.get("fetch_date"),
        "basis": "current-controlled-corpus",
    }


def test_public_inventory_never_exposes_user_records(tmp_db):
    response = TestClient(app).get("/api/inventory")
    assert response.status_code == 200
    assert not ({"reviews", "drafts", "audit_log", "complaints"} & set(response.json()))
