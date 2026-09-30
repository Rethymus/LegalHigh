# -*- coding: utf-8 -*-
"""审查 AI 框架审阅四问（R460，R437 设计 T2）测试。

三层：①judge_four_questions 纯函数（结构/引用/编造三类违规）；②frame_review 假 client
三态（合规交付/红线扣留/编造条款引用扣留/无密钥 409）；③HTTP 端点（404/422 无条款/
合规 200/审计无合同明文——PIPL 纪律断言）。在线四问评测挂 10-03 配额窗口。
"""
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import review_ai, storage  # noqa: E402
from app.main import app  # noqa: E402

ADMIN_TOKEN = "fourq-admin-token-0123456789-abcdef00"
STUB_KEY = "sk-stub-key-four-questions-0123456789abcdef"

GOOD = (
    "问题一（义务单向性）：第2条仅要求乙方赔付，甲方无对应义务，义务分布单向。依据：第2条。\n"
    "问题二（退出权不对等）：第1条赋予甲方随时解约权且无成本，乙方解约须付违约金。依据：第1条。\n"
    "问题三（虚假前提）：条款未载明资质前提，无法判断，需要补充资质文件。依据：第1条。\n"
    "问题四（违约对称性）：第2条乙方逾期日罚 5%，甲方无违约罚则，责任不对称。依据：第2条。"
)

CONTRACT = (
    "测试合同\n"
    "第一条 甲方有权随时解除本合同，乙方解除须提前六十日并支付月租金两倍违约金。\n"
    "第二条 乙方逾期交付的按日支付合同总价 5% 违约金；甲方逾期无违约责任。"
)


def _headers():
    return {"X-LegalHigh-Admin-Token": ADMIN_TOKEN}


def _setup(monkeypatch):
    monkeypatch.setenv("LH_ADMIN_TOKEN", ADMIN_TOKEN)
    monkeypatch.setenv("LH_ADMIN_PRINCIPAL", "fourq-tester")
    monkeypatch.setenv("DEEPSEEK_API_KEY", STUB_KEY)


# ---- ① judge 纯函数 ----

def test_judge_passes_complete_answer():
    out = review_ai.judge_four_questions(GOOD, {1, 2})
    assert out["pass"], out["violations"]


def test_judge_fails_missing_section():
    broken = GOOD.replace("问题三（虚假前提）：条款未载明资质前提，无法判断，需要补充资质文件。依据：第1条。\n", "")
    out = review_ai.judge_four_questions(broken, {1, 2})
    assert not out["pass"] and any("问题三" in v for v in out["violations"])


def test_judge_fails_section_without_clause_ref():
    broken = GOOD.replace("问题二（退出权不对等）：第1条赋予甲方随时解约权且无成本，乙方解约须付违约金。依据：第1条。",
                          "问题二（退出权不对等）：解除权明显不对等，一方随时可退。")
    out = review_ai.judge_four_questions(broken, {1, 2})
    assert not out["pass"] and any("未引用任何条款" in v for v in out["violations"])


def test_judge_fails_fabricated_clause_ref():
    broken = GOOD.replace("问题四（违约对称性）：第2条", "问题四（违约对称性）：第7条")
    out = review_ai.judge_four_questions(broken, {1, 2})
    assert not out["pass"] and any("清单外" in v for v in out["violations"]), "引用编造条号必须扣留"


def test_judge_supports_cn_numerals():
    cn = GOOD.replace("第2条", "第二条").replace("第1条", "第一条")
    out = review_ai.judge_four_questions(cn, {1, 2})
    assert out["pass"], out["violations"]


# ---- ② frame_review 假 client ----

def _fake_client(monkeypatch, content):
    class FakeMsg:
        def __init__(self):
            self.content = content
    class FakeChoice:
        message = FakeMsg()
    class FakeUsage:
        prompt_tokens = 10
        completion_tokens = 5
    class FakeResp:
        choices = [FakeChoice()]
        usage = FakeUsage()
    class FakeComp:
        @staticmethod
        def create(**kwargs):
            return FakeResp()
    class FakeClient:
        chat = type("C", (), {"completions": FakeComp})()
    from app import ai_governor
    monkeypatch.setattr(ai_governor, "_client", lambda *a, **k: FakeClient())


def _review(tmp_db):
    from app import review as review_mod
    rid = storage.create_review("四问测试", CONTRACT, review_mod.analyze_contract(CONTRACT, "四问测试"))
    return storage.get_review(rid)


def test_frame_delivers_compliant(tmp_db, monkeypatch):
    _setup(monkeypatch)
    _fake_client(monkeypatch, GOOD)
    r = _review(tmp_db)
    out = review_ai.frame_review(r, "deepseek", "deepseek-chat", actor="fourq")
    assert out["blocked"] is False and out["text"] and "不构成法律意见" in out["disclaimer"]


def test_frame_blocks_redline(tmp_db, monkeypatch):
    _setup(monkeypatch)
    _fake_client(monkeypatch, GOOD.replace("问题一", "包赢 guaranteed 问题一"))
    r = _review(tmp_db)
    out = review_ai.frame_review(r, "deepseek", "deepseek-chat", actor="fourq")
    assert out["blocked"] is True and out["output_withheld"] and out["text"] == ""


def test_frame_blocks_fabricated_ref(tmp_db, monkeypatch):
    _setup(monkeypatch)
    _fake_client(monkeypatch, GOOD.replace("第2条乙方逾期", "第9条乙方逾期"))
    r = _review(tmp_db)
    out = review_ai.frame_review(r, "deepseek", "deepseek-chat", actor="fourq")
    assert out["blocked"] is True
    assert any("清单外" in v for v in out["gates"]["four_questions"]["violations"])


def test_frame_empty_output_withheld(tmp_db, monkeypatch):
    _setup(monkeypatch)
    _fake_client(monkeypatch, "")
    r = _review(tmp_db)
    out = review_ai.frame_review(r, "deepseek", "deepseek-chat", actor="fourq")
    assert out["blocked"] is True, "空输出按扣留（R422 语义）"


def test_frame_without_key_409(tmp_db, monkeypatch):
    _setup(monkeypatch)
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    r = _review(tmp_db)
    with pytest.raises(PermissionError):
        review_ai.frame_review(r, "deepseek", "deepseek-chat", actor="fourq")


def test_frame_audit_has_no_contract_text(tmp_db, monkeypatch):
    _setup(monkeypatch)
    _fake_client(monkeypatch, GOOD)
    r = _review(tmp_db)
    review_ai.frame_review(r, "deepseek", "deepseek-chat", actor="fourq")
    entries = storage.list_audit("ai_review_frame", None)
    assert entries and entries[0]["action"] == "generate"
    payload = entries[0]["payload_json"]
    assert "违约金" not in payload and CONTRACT[:20] not in payload, "合同文本不得入审计明文"


# ---- ③ HTTP 端点 ----

def test_endpoint_unknown_review_404(tmp_db, monkeypatch):
    _setup(monkeypatch)
    with TestClient(app) as client:
        res = client.post("/api/reviews/rv_nonexistent/ai-frame", headers=_headers(),
                          json={"provider_id": "deepseek", "model": "deepseek-chat"})
        assert res.status_code == 404


def test_endpoint_happy_path(tmp_db, monkeypatch):
    _setup(monkeypatch)
    _fake_client(monkeypatch, GOOD)
    r = _review(tmp_db)
    with TestClient(app) as client:
        res = client.post(f"/api/reviews/{r['id']}/ai-frame", headers=_headers(),
                          json={"provider_id": "deepseek", "model": "deepseek-chat"})
        assert res.status_code == 200
        body = res.json()
        assert body["blocked"] is False and "问题四（违约对称性）" in body["text"]


def test_endpoint_no_key_409(tmp_db, monkeypatch):
    _setup(monkeypatch)
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    r = _review(tmp_db)
    with TestClient(app) as client:
        res = client.post(f"/api/reviews/{r['id']}/ai-frame", headers=_headers(),
                          json={"provider_id": "deepseek", "model": "deepseek-chat"})
        assert res.status_code == 409


def test_endpoint_extra_forbidden(tmp_db, monkeypatch):
    _setup(monkeypatch)
    r = _review(tmp_db)
    with TestClient(app) as client:
        res = client.post(f"/api/reviews/{r['id']}/ai-frame", headers=_headers(),
                          json={"provider_id": "deepseek", "model": "deepseek-chat", "actor": "spoofed"})
        assert res.status_code == 422, "extra=forbid 拒绝客户端自报 actor"
