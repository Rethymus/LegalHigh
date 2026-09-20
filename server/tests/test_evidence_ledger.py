# -*- coding: utf-8 -*-
"""Evidence Ledger 强类型收口（FLERF 报告 §19/§23，R164 建账 → R174 §19 完整形态）。

独立 evidence_ledger 表（append-only，无更新/删除通道）；五条链路（qa/研究/
审查/要件/起草）统一写入 §19 VerifiedEvidence 强类型快照：
- 逐条证据携带 canonical_document_id/canonical_unit_id、content_hash（条文精确
  文本 sha256）、document_hash（证据快照文档级 sha256）、source_id（注册表来源）、
  verification 四项核验状态；
- 账本只留问题哈希、绝不留用户输入原文（LEGAL-009）；
- 拒答（no_answer）同样留痕——「当时没有依据」本身也是可证明的事实。
"""
import hashlib
import json

from app import evidence, main, storage


def _ledger_rows(entity_type: str | None = None):
    return storage.list_evidence(entity_type)


def _payload(row):
    return json.loads(row["snapshot_json"])


def test_ask_writes_typed_evidence_snapshot(tmp_db):
    out = main.ask(main.AskBody(question="试用期最长不得超过多久"))
    rows = _ledger_rows("qa")
    assert len(rows) == 1
    row = rows[0]
    assert row["action"] == "evidence_snapshot"
    payload = _payload(row)

    cards = out["answer_cards"]
    assert payload["evidence_count"] == len(cards) > 0
    for card, ev in zip(cards, payload["evidence"]):
        assert ev["evidence_id"] == f"{card['law_id']}#{card['article_no']}"
        assert ev["canonical_unit_id"] == f"{card['law_id']}#{card['article_no']}{('-' + card['sub']) if card.get('sub') else ''}"
        assert ev["content_hash"] == hashlib.sha256(card["text"].encode("utf-8")).hexdigest()
        assert ev["exact_text"] == card["text"]
        assert ev["effective_from"] == card["effective_date"]
        assert ev["verification"]["source_verified"] is True
        assert ev["document_hash"], "§19 要求文档级哈希（快照 SHA-256）"


def test_ledger_never_stores_user_input(tmp_db):
    question = "我是张三，身份证 110101199001011234，公司能扣我证件吗"
    main.ask(main.AskBody(question=question))
    raw = _payload(_ledger_rows("qa")[0])
    dumped = json.dumps(raw, ensure_ascii=False)
    assert question not in dumped
    assert "110101199001011234" not in dumped
    assert len(raw["question_sha256"]) == 12


def test_no_answer_also_recorded(tmp_db):
    out = main.ask(main.AskBody(question="zzqq vvveoo xkcdq"))
    assert out["no_answer"] is True
    payload = _payload(_ledger_rows("qa")[0])
    assert payload["no_answer"] is True
    assert payload["evidence_count"] == 0
    assert payload["evidence"] == []


def test_temporal_answer_snapshot_carries_as_of_flag(tmp_db):
    out = main.ask(main.AskBody(question="2018 年的时候诉讼时效是几年", as_of="2018-06-30"))
    payload = _payload(_ledger_rows("qa")[0])
    assert out["temporal"], "时间问法必须有 temporal 告知块"
    assert any("in_force_at_as_of" in ev for ev in payload["evidence"]), \
        "时间上下文下的快照必须携带时点适用标记"


def test_research_memo_also_recorded(tmp_db):
    out = main.research_memo(main.ResearchBody(question="试用期最长不得超过多久"))
    rows = [r for r in _ledger_rows(None) if r["entity_type"] == "research"]
    assert len(rows) == 1
    payload = _payload(rows[0])
    assert payload["evidence_count"] == len(out["cards"])
    for card, ev in zip(out["cards"], payload["evidence"]):
        assert ev["content_hash"] == hashlib.sha256(card["text"].encode("utf-8")).hexdigest()
    assert "question" not in payload


def test_verified_evidence_strong_type_fields():
    """§19 强类型：canonical id/文档级哈希/注册表来源/核验四项全部在位。"""
    cit = main.get_corpus().citation_of("civl-2020", 577)
    ve = evidence.verified_evidence(cit)
    assert ve is not None
    assert ve["canonical_document_id"] == "civl-2020@2021-01-01"
    assert ve["canonical_unit_id"] == "civl-2020#577"
    law = main.get_corpus().laws["civl-2020"]
    assert ve["document_hash"] == law["source"]["sha256"]
    assert ve["content_hash"] == hashlib.sha256(cit["text"].encode("utf-8")).hexdigest()
    assert ve["document_type"] == "STATUTE" and ve["jurisdiction"] == "CN"
    assert ve["authority_class"] in {"OFFICIAL_PRIMARY", "OFFICIAL_REPRINT",
                                     "COMMUNITY_TRANSCRIPTION", "REFERENCE_ONLY", "FOREIGN_OFFICIAL"}
    assert all(ve["verification"].values())


def test_unregistered_host_rejected(monkeypatch):
    """来源 host 不在注册表 → fail-closed 返回 None，不为账本编造来源。"""
    monkeypatch.setattr(evidence, "_host_to_source", lambda: {})
    cit = {"law_id": "civl-2020", "article_no": 577, "text": "条文",
           "source_url": "https://unregistered.example/law", "effective_date": "2021-01-01"}
    assert evidence.verified_evidence(cit) is None


def test_review_analyze_dry_writes_typed_ledger_without_contract_text(tmp_db):
    """审查 dry-run：statute 依据条目入账；合同文本与指引类依据不入账。"""
    marker = "青云电子科技 peculiar-marker-7741"
    contract = (
        "第一条 费用与押金\n乙方应向甲方支付押金五千元，合同期满后押金不予退还。\n"
        f"第二条 违约责任\n乙方提前解约的，应支付违约金五万元。{marker}\n"
        "第三条 争议解决\n本合同未尽事宜，甲方拥有最终解释权。"
    )
    out = main.analyze(main.AnalyzeBody(title="t", contract_text=contract))
    rows = _ledger_rows("review")
    assert len(rows) == 1
    payload = _payload(rows[0])
    statute_units = {f"{f['citation']['law_id']}#{f['citation']['article_no']}"
                     for f in out["findings"] if (f.get("citation") or {}).get("text")}
    assert {e["canonical_unit_id"] for e in payload["evidence"]} == statute_units
    assert payload["canonical_documents"], "§19 文档级 id 必须汇总在快照中"
    assert marker not in json.dumps(payload, ensure_ascii=False), "合同文本不得入账"


def test_create_review_ledger_uses_persistent_rid(tmp_db):
    body = main.AnalyzeBody(title="审查台账", contract_text="甲方未按约定支付费用，且收取押金后未退还，主张违约责任与押金返还。")
    principal = main.AdminPrincipal(name="reviewer-x")
    out = main.create_review(body, admin=principal)
    rows = [r for r in _ledger_rows("review") if r["entity_id"] == out["review_id"]]
    assert rows and all(r["action"] == "evidence_snapshot" for r in rows)


def test_case_analyze_ledger_no_user_trace(tmp_db):
    """要件分析入账但零用户痕迹：uuid 实体互不相同、案情文本不入 payload。"""
    markers = ["云梯小区 peculiar-aaa-9182", "临江商贸 peculiar-bbb-7733"]
    ids = []
    for marker in markers:
        main.case_analyze(main.CaseBody(
            case_text=f"{marker} 用人单位拖欠劳动报酬，劳动者主张支付令与经济补偿，事实经过需结合证据认定。",
            claim_id="wage_claim", title="t"))
        ids.append([r for r in _ledger_rows("case")][0]["entity_id"])
    assert ids[0] != ids[1], "实体 id 不得由案情派生"
    for row in _ledger_rows("case"):
        raw = row["snapshot_json"]
        for marker in markers:
            assert marker not in raw
        payload = json.loads(raw)
        assert payload["evidence_count"] > 0
        for ev in payload["evidence"]:
            assert ev["content_hash"] and ev["official_url"]


def test_case_core_does_not_write_ledger(tmp_db):
    """核心分析函数保持无状态红线：不写库（报告下载路径复用 core，不产生账本行）。"""
    before = len(storage.list_evidence(None))
    main._case_analyze_core(main.CaseBody(
        case_text="用人单位拖欠劳动报酬，劳动者主张支付令，事实需结合证据认定，年限与工资待核。",
        claim_id="wage_claim", title="t"))
    assert len(storage.list_evidence(None)) == before


def test_pipl_export_includes_ledger(tmp_db):
    main.ask(main.AskBody(question="试用期最长不得超过多久"))
    out = main.privacy_export(admin=main.AdminPrincipal(name="p"))
    import json as _json
    data = _json.loads(out.body.decode("utf-8"))
    assert "evidence_ledger" in data and data["evidence_ledger"], "PIPL 导出必须包含证据账本"


def test_evidence_endpoint_http_matrix(tmp_db):
    """/api/evidence 管理门行为：无令牌 401 或 503（fail-closed）、有令牌 200。"""
    main.ask(main.AskBody(question="试用期最长不得超过多久"))
    entries = main.evidence_ledger(limit=10, admin=main.AdminPrincipal(name="x"))
    assert entries["entries"], "有账本数据时应返回非空"

    # 无令牌 → 401 或 503（取决于环境是否配置了令牌；两种都是 fail-closed）
    import pytest as _pytest
    from app.main import require_admin
    with _pytest.raises(Exception) as exc_info:
        require_admin(supplied_token=None)
    assert getattr(exc_info.value, "status_code", None) in (401, 403, 503)


def test_ai_chat_writes_ledger(tmp_db, monkeypatch):
    """AI 生成链路（第六条）入账：依据条目=服务端证据的 citation 对象。"""
    from app import ai_governor

    def fake_chat(provider_id, model, messages, *, api_key=None, base_url_override=None,
                  allowed_refs=None, temperature=0.3, actor=None):
        cit = main.get_corpus().citation_of("civl-2020", 577)
        return {
            "provider_id": provider_id, "model": model,
            "text": "依据《民法典》第577条……", "output_withheld": False, "blocked": False,
            "citations": [cit],
        }

    monkeypatch.setattr(ai_governor, "chat", fake_chat)
    body = main.AiChatBody(provider_id="deepseek", model="deepseek-chat",
                           messages=[{"role": "user", "content": "q"}],
                           allowed_refs=[{"law_title": "中华人民共和国民法典", "article_no": 577}])
    out = main.ai_chat(body, admin=main.AdminPrincipal(name="ai-x"))
    rows = [r for r in storage.list_evidence("ai_chat")]
    assert len(rows) == 1
    assert rows[0]["entity_id"] == "deepseek/deepseek-chat"
    payload = json.loads(rows[0]["snapshot_json"])
    assert payload["evidence_count"] == 1
    ev = payload["evidence"][0]
    assert ev["canonical_unit_id"] == "civl-2020#577"
    assert ev["content_hash"] == hashlib.sha256(out["citations"][0]["text"].encode("utf-8")).hexdigest()
    assert payload["blocked"] is False


def test_ai_chat_blocked_still_records_evidence(tmp_db, monkeypatch):
    """生成被扣留（blocked）也留痕——「请求依据了哪些证据」与产出无关。"""
    from app import ai_governor

    def fake_chat(provider_id, model, messages, **kw):
        cit = main.get_corpus().citation_of("lcl-2012", 19)
        return {"provider_id": provider_id, "model": model, "text": "",
                "output_withheld": True, "blocked": True, "citations": [cit]}

    monkeypatch.setattr(ai_governor, "chat", fake_chat)
    main.ai_chat(main.AiChatBody(provider_id="deepseek", model="deepseek-chat",
                                 messages=[{"role": "user", "content": "q"}]),
                 admin=main.AdminPrincipal(name="ai-x"))
    payload = json.loads(storage.list_evidence("ai_chat")[0]["snapshot_json"])
    assert payload["blocked"] is True and payload["evidence_count"] == 1
