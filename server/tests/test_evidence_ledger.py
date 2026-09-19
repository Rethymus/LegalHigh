# -*- coding: utf-8 -*-
"""Evidence Ledger 最小闭环（FLERF 报告 §19/§23，R164）。

/api/qa/ask 每次作答都把「所依据证据」的哈希快照写入 append-only 审计账本：
- 快照逐条携带条文精确文本的 sha256 + 版本/生效字段 + 官方来源 URL；
- 账本只留问题哈希、绝不留问题原文（LEGAL-009 卫生纪律）；
- 拒答（no_answer）同样留痕——「当时没有依据」本身也是可证明的事实。
"""
import hashlib
import json

from app import main, storage


def _ledger_rows():
    return storage.list_audit("qa")


def test_ask_writes_evidence_snapshot(tmp_db):
    out = main.ask(main.AskBody(question="试用期最长不得超过多久"))
    rows = _ledger_rows()
    assert len(rows) == 1
    row = rows[0]
    assert row["action"] == "evidence_snapshot"
    assert row["entity_type"] == "qa"
    payload = json.loads(row["payload_json"])

    cards = out["answer_cards"]
    assert payload["evidence_count"] == len(cards) > 0
    assert payload["no_answer"] is False
    # 逐条核对：快照哈希=作答时刻实际送达的条文文本
    for card, ev in zip(cards, payload["evidence"]):
        assert ev["evidence_id"] == f"{card['law_id']}#{card['article_no']}"
        assert ev["text_sha256"] == hashlib.sha256(card["text"].encode("utf-8")).hexdigest()
        assert ev["law_status"] and ev["effective_date"]
        assert ev["source_url"].startswith("https://")
    # 版本/时间上下文字段如出现必须为布尔形态（时间问法才带）
    assert all("in_force_at_as_of" not in ev or isinstance(ev["in_force_at_as_of"], bool)
               for ev in payload["evidence"])


def test_ledger_never_stores_raw_question(tmp_db):
    question = "我是张三，身份证 110101199001011234，公司能扣我证件吗"
    main.ask(main.AskBody(question=question))
    raw = json.dumps(_ledger_rows()[0]["payload_json"], ensure_ascii=False)
    assert question not in raw
    assert "110101199001011234" not in raw
    payload = json.loads(_ledger_rows()[0]["payload_json"])
    assert len(payload["question_sha256"]) == 12
    # entity_id 与问题指纹一致：同题可追溯
    assert _ledger_rows()[0]["entity_id"] == payload["question_sha256"]


def test_no_answer_also_recorded(tmp_db):
    out = main.ask(main.AskBody(question="zzqq vvveoo xkcdq"))
    assert out["no_answer"] is True
    payload = json.loads(_ledger_rows()[0]["payload_json"])
    assert payload["no_answer"] is True
    assert payload["evidence_count"] == 0
    assert payload["evidence"] == []


def test_temporal_answer_snapshot_carries_as_of_flag(tmp_db):
    out = main.ask(main.AskBody(question="2018 年的时候诉讼时效是几年", as_of="2018-06-30"))
    payload = json.loads(_ledger_rows()[0]["payload_json"])
    assert out["temporal"], "时间问法必须有 temporal 告知块"
    assert any("in_force_at_as_of" in ev for ev in payload["evidence"]), \
        "时间上下文下的快照必须携带时点适用标记"


def test_research_memo_also_recorded(tmp_db):
    """Evidence Ledger 覆盖研究备忘录：与 qa 同账本，「当时依据了哪些条文」可证。"""
    out = main.research_memo(main.ResearchBody(question="试用期最长不得超过多久"))
    rows = [r for r in storage.list_audit(None) if r["entity_type"] == "research"]
    assert len(rows) == 1
    payload = json.loads(rows[0]["payload_json"])
    assert payload["evidence_count"] == len(out["cards"]) > 0
    for card, ev in zip(out["cards"], payload["evidence"]):
        assert ev["text_sha256"] == hashlib.sha256(card["text"].encode("utf-8")).hexdigest()
    assert "question" not in payload


def test_review_analyze_dry_writes_ledger_without_contract_text(tmp_db):
    """审查 dry-run：statute 依据条目入账；合同文本与指引类依据（无条文文本）不入账。"""
    marker = "青云电子科技 peculiar-marker-7741"
    contract = (
        "第一条 费用与押金\n乙方应向甲方支付押金五千元，合同期满后押金不予退还。\n"
        f"第二条 违约责任\n乙方提前解约的，应支付违约金五万元。{marker}\n"
        "第三条 争议解决\n本合同未尽事宜，甲方拥有最终解释权。"
    )
    out = main.analyze(main.AnalyzeBody(title="t", contract_text=contract))
    rows = [r for r in storage.list_audit(None) if r["entity_type"] == "review"]
    assert len(rows) == 1
    payload = json.loads(rows[0]["payload_json"])
    statute_ids = {f"{f['citation']['law_id']}#{f['citation']['article_no']}"
                   for f in out["findings"] if (f.get("citation") or {}).get("text")}
    assert statute_ids, "测试文本必须触发至少一个 statute 审查点"
    assert {e["evidence_id"] for e in payload["evidence"]} == statute_ids
    for ev in payload["evidence"]:
        cit = next(f["citation"] for f in out["findings"]
                   if f.get("citation") and f["citation"].get("text")
                   and f"{f['citation']['law_id']}#{f['citation']['article_no']}" == ev["evidence_id"])
        assert ev["text_sha256"] == hashlib.sha256(cit["text"].encode("utf-8")).hexdigest()
    assert marker not in json.dumps(payload, ensure_ascii=False), "合同文本不得入账"
    assert rows[0]["entity_id"] != "t"


def test_create_review_ledger_uses_persistent_rid(tmp_db):
    body = main.AnalyzeBody(title="审查台账", contract_text="甲方未按约定支付费用，且收取押金后未退还，主张违约责任与押金返还。")
    principal = main.AdminPrincipal(name="reviewer-x")
    out = main.create_review(body, admin=principal)
    rows = [r for r in storage.list_audit(None, out["review_id"])]
    actions = {r["action"] for r in rows}
    assert {"evidence_snapshot"} <= actions
    snap_rows = [r for r in rows if r["action"] == "evidence_snapshot"]
    assert all(r["entity_id"] == out["review_id"] for r in snap_rows)


def test_case_analyze_ledger_no_user_trace(tmp_db):
    """要件分析入账但零用户痕迹：uuid 实体互不相同、案情文本不入 payload。"""
    markers = ["云梯小区 peculiar-aaa-9182", "临江商贸 peculiar-bbb-7733"]
    ids = []
    for marker in markers:
        main.case_analyze(main.CaseBody(
            case_text=f"{marker} 用人单位拖欠劳动报酬，劳动者主张支付令与经济补偿，事实经过需结合证据认定。",
            claim_id="wage_claim", title="t"))
        ids.append([r for r in storage.list_audit(None) if r["entity_type"] == "case"][0]["entity_id"])
    assert ids[0] != ids[1], "实体 id 不得由案情派生"
    for row in [r for r in storage.list_audit(None) if r["entity_type"] == "case"]:
        raw = row["payload_json"]
        for marker in markers:
            assert marker not in raw
        payload = json.loads(raw)
        assert payload["evidence_count"] > 0
        for ev in payload["evidence"]:
            assert ev["text_sha256"] and ev["source_url"]


def test_case_core_does_not_write_ledger(tmp_db):
    """核心分析函数保持无状态红线：不写库（报告下载路径复用 core，不产生账本行）。"""
    before = len(storage.list_audit(None))
    main._case_analyze_core(main.CaseBody(
        case_text="用人单位拖欠劳动报酬，劳动者主张支付令，事实需结合证据认定，年限与工资待核。",
        claim_id="wage_claim", title="t"))
    assert len(storage.list_audit(None)) == before
