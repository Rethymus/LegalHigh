# -*- coding: utf-8 -*-
"""安全回归：敏感接口默认关闭，令牌主体而非请求 actor/role 决定授权。"""

from fastapi.testclient import TestClient

from app.main import app


ADMIN_TOKEN = "audit-admin-token-0123456789-abcdef"


def _headers(token: str = ADMIN_TOKEN) -> dict[str, str]:
    return {"X-LegalHigh-Admin-Token": token}


def test_memory_db_mode_is_real_sqlite_memory_database(tmp_db, monkeypatch):
    from app import storage

    if storage._conn is not None:
        storage._conn.close()
    storage._conn = None
    monkeypatch.setattr(storage, "DB_PATH", ":memory:")
    conn = storage.get_conn()
    try:
        assert conn.execute("PRAGMA database_list").fetchone()[2] == ""
        rid = storage.create_review("memory-only", "合同文本", {"findings": [], "summary": {}})
        assert storage.get_review(rid)["title"] == "memory-only"
    finally:
        conn.close()
        storage._conn = None


def test_health_exposes_instance_proof_only_when_desktop_sets_it(tmp_db, monkeypatch):
    monkeypatch.delenv("LH_DESKTOP_INSTANCE_PROOF", raising=False)
    with TestClient(app) as client:
        ordinary = client.get("/api/health")
    assert ordinary.status_code == 200
    assert ordinary.json()["service"] == "LegalHigh"
    assert "instance_proof" not in ordinary.json()

    monkeypatch.setenv("LH_DESKTOP_INSTANCE_PROOF", "one-time-sidecar-proof")
    with TestClient(app) as client:
        desktop = client.get("/api/health")
    assert desktop.status_code == 200
    assert desktop.json()["instance_proof"] == "one-time-sidecar-proof"


def test_sensitive_routes_fail_closed_but_public_search_remains_open(tmp_db, monkeypatch):
    monkeypatch.delenv("LH_ADMIN_TOKEN", raising=False)
    monkeypatch.delenv("LH_ADMIN_PRINCIPAL", raising=False)
    monkeypatch.delenv("LH_ADMIN_ROLE", raising=False)
    monkeypatch.delenv("LH_LAWYER_LICENSE_NO", raising=False)
    with TestClient(app) as client:
        assert client.get("/api/privacy/export").status_code == 503
        assert client.get("/api/reviews").status_code == 503
        assert client.get("/api/drafts").status_code == 503
        assert client.get("/api/complaints").status_code == 503
        assert client.get("/api/audit").status_code == 503
        assert client.get("/api/explains/queue").status_code == 503
        assert client.get("/api/search?q=%E8%AF%89%E8%AE%BC").status_code == 200


def test_missing_and_wrong_token_are_rejected(tmp_db, monkeypatch):
    monkeypatch.setenv("LH_ADMIN_TOKEN", ADMIN_TOKEN)
    monkeypatch.setenv("LH_ADMIN_PRINCIPAL", "configured-reviewer")
    monkeypatch.setenv("LH_ADMIN_ROLE", "运营方")
    with TestClient(app) as client:
        assert client.get("/api/privacy/export").status_code == 401
        assert client.get("/api/privacy/export", headers=_headers("wrong-token")).status_code == 403


def test_short_server_token_is_treated_as_misconfiguration(tmp_db, monkeypatch):
    monkeypatch.setenv("LH_ADMIN_TOKEN", "too-short")
    monkeypatch.setenv("LH_ADMIN_PRINCIPAL", "configured-reviewer")
    with TestClient(app) as client:
        assert client.get("/api/session", headers=_headers("too-short")).status_code == 503


def test_server_principal_overrides_client_actor_and_role(tmp_db, monkeypatch):
    monkeypatch.setenv("LH_ADMIN_TOKEN", ADMIN_TOKEN)
    monkeypatch.setenv("LH_ADMIN_PRINCIPAL", "configured-operator")
    fields = {
        "contract_type": "服务合同", "party_a": "甲方", "party_b": "乙方",
        "subject": "软件服务", "amount": "100000", "payment": "签约后七日内支付",
        "term": "2026年9月1日至2027年8月31日", "dispute": "向合同签订地人民法院起诉",
    }
    with TestClient(app) as client:
        created = client.post("/api/drafts", headers=_headers(), json={"template_id": "contract", "fields": fields})
        assert created.status_code == 200
        did = created.json()["draft_id"]
        # 客户端不能在请求体里自报身份：多余字段被直接拒绝
        rejected_self_report = client.post(
            f"/api/drafts/{did}/review", headers=_headers(),
            json={"actor": "attacker", "role": "执业律师", "note": "client self-report"},
        )
        assert rejected_self_report.status_code == 422
        reviewed = client.post(
            f"/api/drafts/{did}/review", headers=_headers(),
            json={"note": "server principal"},
        )
        assert reviewed.status_code == 200
        assert reviewed.json()["actor"] == "configured-operator"
        # 未确认使用责任不能定稿
        unconfirmed = client.post(f"/api/drafts/{did}/finalize", headers=_headers(), json={})
        assert unconfirmed.status_code == 422
        finalized = client.post(
            f"/api/drafts/{did}/finalize", headers=_headers(),
            json={"responsibility_confirmed": True},
        )
        assert finalized.status_code == 200
        assert finalized.json()["actor"] == "configured-operator"
        exported = client.get("/api/privacy/export", headers=_headers())
        assert exported.status_code == 200
        assert ADMIN_TOKEN not in exported.text
        audit = client.get("/api/audit", headers=_headers()).json()["entries"]
        assert all(ADMIN_TOKEN not in str(row) for row in audit)
        assert any(row["actor"] == "configured-operator" for row in audit)


def test_draft_transitions_require_token_and_prior_review(tmp_db, monkeypatch):
    monkeypatch.setenv("LH_ADMIN_TOKEN", ADMIN_TOKEN)
    monkeypatch.setenv("LH_ADMIN_PRINCIPAL", "configured-operator")
    fields = {
        "contract_type": "服务合同", "party_a": "甲方", "party_b": "乙方",
        "subject": "软件服务", "amount": "100000", "payment": "签约后七日内支付",
        "term": "2026年9月1日至2027年8月31日", "dispute": "向合同签订地人民法院起诉",
    }
    with TestClient(app) as client:
        created = client.post("/api/drafts", headers=_headers(), json={"template_id": "contract", "fields": fields})
        did = created.json()["draft_id"]
        # 无令牌的流转尝试一律 401
        assert client.post(f"/api/drafts/{did}/review", json={}).status_code == 401
        assert client.post(f"/api/drafts/{did}/finalize", json={"responsibility_confirmed": True}).status_code == 401
        # 有令牌但未复核也到此为止：状态门拒绝
        assert client.post(
            f"/api/drafts/{did}/finalize", headers=_headers(), json={"responsibility_confirmed": True},
        ).status_code == 422


def test_session_makes_no_credential_claims(tmp_db, monkeypatch):
    """本机会话只返回审计署名；不得宣称角色、执业资格或任何已核验身份。"""
    monkeypatch.setenv("LH_ADMIN_TOKEN", ADMIN_TOKEN)
    monkeypatch.setenv("LH_ADMIN_PRINCIPAL", "configured-lawyer")
    with TestClient(app) as client:
        response = client.get("/api/session", headers=_headers())
    assert response.status_code == 200
    body = response.json()
    assert set(body.keys()) == {"principal", "assurance"}
    assert body["principal"] == "configured-lawyer"
    # 浏览器安全基线：会话/凭据相关响应不可缓存，且禁止被嵌入框架
    assert response.headers["cache-control"] == "no-store"
    assert "frame-ancestors 'none'" in response.headers["content-security-policy"]
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["referrer-policy"] == "no-referrer"


def test_compliance_statement_matches_local_model(tmp_db, monkeypatch):
    """公开合规声明必须与「本机工具」定位一致：不宣称平台核验执业资格或签发文书。"""
    monkeypatch.delenv("LH_ADMIN_TOKEN", raising=False)
    with TestClient(app) as client:
        response = client.get("/api/compliance")
    assert response.status_code == 200
    body = response.json()
    assert "不提供诉讼代理" in body["positioning"] and "不实施签发" in body["positioning"]
    assert "执业律师人工核验 gate" not in body["positioning"]
    assert body["model_status"]["filing_no"] is None  # 未备案就是未备案，不虚构
    assert any("不以律师名义执业" in line for line in body["red_lines"])


def test_needs_endpoint_rejects_removed_ai_payload(tmp_db, monkeypatch):
    monkeypatch.delenv("LH_ADMIN_TOKEN", raising=False)
    monkeypatch.delenv("LH_ADMIN_PRINCIPAL", raising=False)
    with TestClient(app) as client:
        deterministic = client.post("/api/needs/parse", json={"text": "老板拖欠工资"})
        assert deterministic.status_code == 200
        ai = client.post(
            "/api/needs/parse",
            json={"text": "老板拖欠工资", "ai": {"provider_id": "custom", "model": "m"}},
        )
        assert ai.status_code == 422


def test_docx_return_rejects_bad_mime_bad_zip_and_oversize(tmp_db, monkeypatch):
    from app import storage

    monkeypatch.setenv("LH_ADMIN_TOKEN", ADMIN_TOKEN)
    monkeypatch.setenv("LH_ADMIN_PRINCIPAL", "configured-reviewer")
    rid = storage.create_review("upload", "合同文本", {"findings": [], "summary": {}})
    with TestClient(app) as client:
        wrong_mime = client.post(
            f"/api/reviews/{rid}/docx-return", headers=_headers(),
            files={"file": ("x.txt", b"not-docx", "text/plain")},
        )
        assert wrong_mime.status_code == 415
        bad_zip = client.post(
            f"/api/reviews/{rid}/docx-return", headers=_headers(),
            files={"file": ("x.docx", b"not-docx", "application/octet-stream")},
        )
        assert bad_zip.status_code == 422
        from app.docx_return import MAX_DOCX_BYTES
        too_large = client.post(
            f"/api/reviews/{rid}/docx-return", headers=_headers(),
            files={"file": ("x.docx", b"x" * (MAX_DOCX_BYTES + 1), "application/octet-stream")},
        )
        assert too_large.status_code == 413


def test_spa_fallback_rejects_sibling_directory_traversal(tmp_path, monkeypatch):
    import app.main as main_mod

    dist = tmp_path / "dist"
    sibling = tmp_path / "dist-demo"
    dist.mkdir()
    sibling.mkdir()
    (dist / "index.html").write_text("SAFE", encoding="utf-8")
    (sibling / "secret.txt").write_text("SECRET", encoding="utf-8")
    monkeypatch.setattr(main_mod, "WEB_DIST", dist)
    assert main_mod._static_file_candidate("..\\/dist-demo/secret.txt") is None
    assert main_mod._static_file_candidate("..\\dist-demo\\secret.txt") is None
    with TestClient(app) as client:
        response = client.get("/safe")
    assert response.status_code == 200 and response.text == "SAFE"
