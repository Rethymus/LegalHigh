# -*- coding: utf-8 -*-
import json
from pathlib import Path
from fastapi.testclient import TestClient

from app.coverage import get_coverage
from app.corpus import get_corpus
from app.main import app


def test_coverage_registry_matches_actual_corpus_and_is_honest_backlog():
    data = get_coverage()
    assert set(data["controlled_instrument_ids"]) == set(get_corpus().laws)
    assert data["national_law_catalog"]["count"] == 310
    assert "不得" in data["national_law_catalog"]["comparison_warning"]
    assert data["priority_backlog"]
    assert all(x["status"] == "official-source-identified-not-imported" for x in data["priority_backlog"])


def test_coverage_endpoint_is_public_and_does_not_claim_backlog_loaded():
    response = TestClient(app).get("/api/corpus/coverage")
    assert response.status_code == 200
    body = response.json()
    assert len(body["controlled_instrument_ids"]) == len(json.loads(Path(__file__).resolve().parent.parent.joinpath("data/corpus_coverage.json").read_text(encoding="utf-8"))["controlled_instrument_ids"])
    assert not (set(x["title"] for x in body["priority_backlog"]) & set(body["controlled_instrument_ids"]))
