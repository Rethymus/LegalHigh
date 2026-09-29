# -*- coding: utf-8 -*-
"""审查立场（stance，R437-T1）契约测试：可选枚举、缺省中立、持久化与 DOCX 头部呈现。

设计边界（docs/plan/合同审查方法论吸收设计-2026-09-29.md §T1）：
立场只做记录与呈现，不改变审查点触发——引擎输出对 stance 无感，
断言重点是「记录-持久化-导出」三段链路与非法值拒绝。
"""
import io
import zipfile

from fastapi.testclient import TestClient

from app.main import app

ADMIN_TOKEN = "stance-admin-token-0123456789-abcdef"  # ≥32 字符（fail-closed 纪律）
CONTRACT = "第一条 费用：甲方应向乙方支付定金人民币五万元（占合同总价百分之三十）。第二条 本协议最终解释权归甲方所有。"


def _headers():
    return {"X-LegalHigh-Admin-Token": ADMIN_TOKEN}


def _setup(monkeypatch):
    monkeypatch.setenv("LH_ADMIN_TOKEN", ADMIN_TOKEN)
    monkeypatch.setenv("LH_ADMIN_PRINCIPAL", "stance-tester")


def test_stance_defaults_to_neutral_and_persists(tmp_db, monkeypatch):
    _setup(monkeypatch)
    with TestClient(app) as client:
        r = client.post("/api/reviews", headers=_headers(), json={"contract_text": CONTRACT})
        assert r.status_code == 200
        rid = r.json()["review_id"]
        assert r.json()["stance"] == "neutral"  # 缺省中立
        got = client.get(f"/api/reviews/{rid}", headers=_headers()).json()
        assert got["result"]["stance"] == "neutral"  # 随 result_json 持久化


def test_stance_optional_enum_roundtrip(tmp_db, monkeypatch):
    _setup(monkeypatch)
    with TestClient(app) as client:
        r = client.post("/api/reviews", headers=_headers(),
                        json={"contract_text": CONTRACT, "stance": "party_b"})
        assert r.status_code == 200 and r.json()["stance"] == "party_b"
        rid = r.json()["review_id"]
        got = client.get(f"/api/reviews/{rid}", headers=_headers()).json()
        assert got["result"]["stance"] == "party_b"


def test_stance_invalid_value_rejected(tmp_db, monkeypatch):
    _setup(monkeypatch)
    with TestClient(app) as client:
        r = client.post("/api/reviews", headers=_headers(),
                        json={"contract_text": CONTRACT, "stance": "lawyer"})
        assert r.status_code == 422  # 枚举外拒绝（extra 校验纪律同 GateBody）


def test_analyze_dry_run_echoes_stance(tmp_db, monkeypatch):
    _setup(monkeypatch)
    with TestClient(app) as client:
        r = client.post("/api/reviews/analyze", json={"contract_text": CONTRACT, "stance": "party_a"})
        assert r.status_code == 200 and r.json()["stance"] == "party_a"
        r2 = client.post("/api/reviews/analyze", json={"contract_text": CONTRACT})
        assert r2.json()["stance"] == "neutral"


def _docx_text(data: bytes) -> str:
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        return z.read("word/document.xml").decode("utf-8")


def test_docx_header_carries_stance_label(tmp_db, monkeypatch):
    _setup(monkeypatch)
    with TestClient(app) as client:
        rid = client.post("/api/reviews", headers=_headers(),
                          json={"contract_text": CONTRACT, "stance": "party_a"}).json()["review_id"]
        data = client.get(f"/api/reviews/{rid}/docx", headers=_headers()).content
    text = _docx_text(data)
    assert "审查立场：代表甲方" in text
    assert "非资格声明" in text  # 诚实边界随行


def test_docx_header_neutral_when_absent(tmp_db, monkeypatch):
    """旧记录（无 stance 字段）导出：中立（未声明），不崩不编造。"""
    _setup(monkeypatch)
    with TestClient(app) as client:
        rid = client.post("/api/reviews", headers=_headers(),
                          json={"contract_text": CONTRACT}).json()["review_id"]
        data = client.get(f"/api/reviews/{rid}/docx", headers=_headers()).content
    assert "中立（未声明）" in _docx_text(data)
