# -*- coding: utf-8 -*-
"""专业解读证据层：来源真实性边界、条文绑定与正确率纪律。"""
from fastapi.testclient import TestClient

from app import commentaries
from app.main import app


def test_registry_is_named_traceable_and_corpus_bound():
    data = commentaries.load_registry()
    assert data["collection_policy"]["accuracy"]
    assert data["commentaries"]
    for item in data["commentaries"]:
        assert item["source_url"].startswith("https://")
        assert item["rights"] == "link-and-original-summary"
        assert item["summary"] and item["scope_note"]
        assert item["authors"]
        for author in item["authors"]:
            assert author["name"] and author["credential"]
            assert author["credential_source_url"].startswith("https://")


def test_analysis_context_never_mislabels_coverage_as_accuracy():
    ctx = commentaries.analysis_context("pipl-2021", 13)
    assert ctx["citation"]["article_no"] == 13
    assert len(ctx["professional_commentaries"]) >= 2
    assert ctx["evidence_coverage"]["not_accuracy"] is True
    assert 0 <= ctx["evidence_coverage"]["score"] <= 100
    assert "不评价观点真伪" in ctx["evidence_coverage"]["method"]
    assert ctx["calibrated_accuracy"] == {
        "status": "unavailable",
        "value": None,
        "reason": ctx["calibrated_accuracy"]["reason"],
    }
    assert "独立法律专业人员" in ctx["calibrated_accuracy"]["reason"]
    assert "不替代执业律师" in ctx["disclaimer"]


def test_analysis_context_endpoint_and_unknown_article():
    with TestClient(app) as client:
        ok = client.get("/api/laws/pipl-2021/articles/13/analysis-context")
        missing = client.get("/api/laws/pipl-2021/articles/999/analysis-context")
    assert ok.status_code == 200
    assert ok.json()["calibrated_accuracy"]["value"] is None
    assert missing.status_code == 404


def test_prompt_context_separates_sources_and_discloses_gaps():
    rich, contexts = commentaries.prompt_context([
        commentaries.analysis_context("pipl-2021", 13)["citation"]
    ])
    assert "【法条原文】" in rich and "【具名专业观点摘要】" in rich
    assert "不得虚构律师、教授、案例或正确率" in rich
    assert contexts[0]["professional_commentaries"]

    sparse, _ = commentaries.prompt_context([
        commentaries.analysis_context("pipl-2021", 1)["citation"]
    ])
    assert "当前登记册没有" in sparse
