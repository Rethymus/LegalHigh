# -*- coding: utf-8 -*-
"""历史文本独立检索索引（known-gaps #1，R172）+ 起草链路入账（#8 补齐）。

独立命名空间：历史条文可被检索命中，但永不混入现行检索排名；
起草链路的依据条目按 qa 同款快照写入 append-only 账本。
"""
import hashlib
import json

from app import history_index, main, storage


def _payload(row):
    return json.loads(row["snapshot_json"])


def test_history_search_hits_and_scope():
    out = history_index.search("网络运营者 等级保护", top_k=5)
    assert out["total"] == 5
    assert out["index_articles"] > 4000, "37 份历史全文应全部入索引"
    for h in out["hits"]:
        assert h["version_id"] and h["text"].strip()
        assert h["law_id"] and h["no"]
    assert "非现行" in out["scope_note"]


def test_history_search_filters():
    out = history_index.search("网络安全", top_k=60, law_id="csl-2025", version_id="2016-enacted")
    assert out["hits"]
    for h in out["hits"]:
        assert h["law_id"] == "csl-2025" and h["version_id"] == "2016-enacted"


def test_history_search_deterministic():
    assert history_index.search("诉讼时效 三年", top_k=5) == history_index.search("诉讼时效 三年", top_k=5)


def test_history_endpoint_matrix():
    out = main.history_search(q="等级保护")
    assert out["hits"] and "scope_note" in out
    try:
        main.history_search(q="  ")
        raise AssertionError("空检索词必须 422")
    except Exception as e:
        assert getattr(e, "status_code", None) == 422


def test_current_retrieval_untouched():
    """独立命名空间：现行主检索结果绝不混入历史版本（契约稳定）。"""
    out = main.search_articles(q="网络安全 等级保护")
    for h in out["hits"]:
        assert h["law_status"], "主检索命中必须仍是现行语料条目（无 version_id 字段）"
        assert "version_id" not in h


def test_draft_creation_writes_ledger(tmp_db):
    """起草链路（#8 补齐）：文书所引条文的快照入账；用户字段不入账。"""
    marker = "customer-marker-5566"
    body = main.DraftBody(template_id="lawyer_letter", fields={
        "firm": "某律师事务所", "lawyer": "张律师", "license_no": "A0000",
        "client": "委托人甲", "recipient": "某公司", "subject": "欠款催告",
        "facts": f"{marker} 对方拖欠款项至今未付。",
        "legal_basis": [{"law_id": "lcl-2012", "article_no": 30}, {"law_id": "civl-2020", "article_no": 577}],
        "demands": "请于收函后七日内支付全部欠款",
        "deadline": "2026-09-30",
    })
    out = main.create_draft(body, admin=main.AdminPrincipal(name="drafter-x"))
    rows = [r for r in storage.list_evidence("draft") if r["action"] == "evidence_snapshot"]
    assert len(rows) == 1 and rows[0]["entity_id"] == out["draft_id"]
    payload = _payload(rows[0])
    assert payload["evidence_count"] == 2
    citations = {f"{c['law_id']}#{c['article_no']}": c for c in out["content"]["citations"]}
    for ev in payload["evidence"]:
        cit = citations[ev["evidence_id"]]
        assert ev["content_hash"] == hashlib.sha256(cit["text"].encode("utf-8")).hexdigest()
        assert ev["canonical_unit_id"] == ev["evidence_id"]
    assert marker not in json.dumps(payload, ensure_ascii=False), "用户填写字段不得入账"


def test_draft_without_citations_records_empty(tmp_db):
    """无引用模板（授权委托书）诚实记 0 条依据——留痕口径与拒答一致。"""
    body = main.DraftBody(template_id="power_of_attorney", fields={
        "principal": "李四", "agent": "王五", "firm": "某律师事务所",
        "license_no": "A0000", "authority_scope": ["诉讼代理"], "term": "至本案审结止",
    })
    out = main.create_draft(body, admin=main.AdminPrincipal(name="drafter-x"))
    rows = [r for r in storage.list_evidence("draft") if r["action"] == "evidence_snapshot"]
    payload = _payload(rows[0])
    assert payload["evidence_count"] == 0 and payload["evidence"] == []
