# -*- coding: utf-8 -*-
"""AI 模型插件层测试：目录密钥纪律 / 合规 gate / 无密钥拒绝（默认关闭）。"""
import pytest

from app import ai_governor, storage  # noqa: E402

# 测试桩密钥：拼接构造，非真实凭据（凭据纪律：源码不含可用密钥字面量）
STUB_KEY = "ut-" + "stub-key"


def test_catalog_no_key_literals():
    """目录零密钥纪律：任何 provider 不得包含密钥字面量字段（硬约束）。"""
    for p in ai_governor.load_catalog():
        assert "api_key" not in json_keys(p), f"{p['id']} 含 api_key 字段"
        blob = str(p).lower()
        assert "sk-" not in blob, f"{p['id']} 疑似含密钥字面量"


def json_keys(obj) -> set:
    keys = set()
    if isinstance(obj, dict):
        for k, v in obj.items():
            keys.add(k)
            keys |= json_keys(v)
    elif isinstance(obj, list):
        for v in obj:
            keys |= json_keys(v)
    return keys


def test_list_providers_masks_keys():
    for p in ai_governor.list_providers():
        assert "api_key" not in p
        assert isinstance(p["env_key_set"], bool)


def test_redline_gate():
    ok = ai_governor.gate_redline("本案可能涉及违约责任，建议进一步确认证据。")
    assert ok["pass"] is True
    bad = ai_governor.gate_redline("委托我们包赢，胜诉率92%，法院会判定对方赔偿。")
    assert bad["pass"] is False and len(bad["hits"]) >= 2


def test_citation_gate_binding():
    allowed = [{"law_title": "中华人民共和国民法典", "article_no": 585}]
    ok = ai_governor.gate_citations("依据《民法典》第585条……", allowed)
    assert ok["pass"] is True
    bad = ai_governor.gate_citations("另见《公司法》第71条与《民法典》第1条。", allowed)
    assert bad["pass"] is False and any("公司法" in v for v in bad["violations"])
    no_legal_cite = ai_governor.gate_citations("任意内容", None)
    assert no_legal_cite["pass"] is False
    assert any("依据集合" in v for v in no_legal_cite["violations"])
    assert any("未包含" in v for v in no_legal_cite["violations"])
    missing_refs = ai_governor.gate_citations("依据《虚构法》第999条。", None)
    assert missing_refs["pass"] is False
    fake_refs = ai_governor.gate_citations(
        "依据《虚构法》第999条。", [{"law_title": "虚构法", "article_no": 999}])
    assert fake_refs["pass"] is False


def test_citation_gate_article_number_binding():
    """同名法律、不同条号 → 必须拦截（回归：_cn_to_int_safe 曾因相对导入失败恒返 None，
    导致条号校验被整体旁路——2026-08-30 修复）。"""
    allowed = [{"law_title": "中华人民共和国消费者权益保护法", "article_no": 25}]
    g = ai_governor.gate_citations("依《消费者权益保护法》第55条可主张惩罚性赔偿。", allowed)
    assert g["pass"] is False and any("55" in v for v in g["violations"])
    ok = ai_governor.gate_citations("依《消费者权益保护法》第二十五条享有七日无理由退货。", allowed)
    assert ok["pass"] is True


def test_cn_to_int_safe_works():
    assert ai_governor._cn_to_int_safe("五十八") == 58
    assert ai_governor._cn_to_int_safe("55") == 55
    assert ai_governor._cn_to_int_safe("≌") is None


def test_chat_requires_key(tmp_db):
    with pytest.raises(PermissionError):
        ai_governor.chat("deepseek", "deepseek-chat", [{"role": "user", "content": "hi"}])
    with pytest.raises(ValueError):
        ai_governor.chat("no-such-provider", "x", [])


def _fake_client(monkeypatch, content: str):
    class FakeMsg:
        def __init__(self, c=content):
            self.content = c
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
    monkeypatch.setattr(ai_governor, "_client", lambda *a, **k: FakeClient())


def test_chat_gated_with_stub(tmp_db, monkeypatch):
    """gate 管线测试：注入假 client，红线命中 → blocked；审计留痕不含密钥。"""
    _fake_client(monkeypatch, "建议包赢，另见《公司法》第71条。")
    monkeypatch.setenv("DEEPSEEK_API_KEY", STUB_KEY)
    out = ai_governor.chat(
        "deepseek", "deepseek-chat", [{"role": "user", "content": "q"}],
        allowed_refs=[{"law_title": "中华人民共和国民法典", "article_no": 585}])
    assert out["blocked"] is True
    assert out["output_withheld"] is True and out["text"] == ""
    assert out["gates"]["redline"]["pass"] is False
    assert out["gates"]["citations"]["pass"] is False
    assert STUB_KEY not in str(out)
    entries = storage.list_audit("ai_chat", None)
    assert entries and entries[0]["action"] == "generate"
    assert STUB_KEY not in entries[0]["payload_json"]


def test_chat_clean_output_passes(tmp_db, monkeypatch):
    """合规输出（引用均在依据集合内、无红线词）→ 不拦截。"""
    _fake_client(monkeypatch, "依据《民法典》第585条，约定的违约金过分高于造成的损失的，可以请求适当减少。建议进一步确认实际损失证据。")
    monkeypatch.setenv("DEEPSEEK_API_KEY", STUB_KEY)
    out = ai_governor.chat(
        "deepseek", "deepseek-chat", [{"role": "user", "content": "q"}],
        allowed_refs=[{"law_title": "中华人民共和国民法典", "article_no": 585}])
    assert out["blocked"] is False and out["output_withheld"] is False and out["text"]


def test_chat_withholds_uncited_model_output(tmp_db, monkeypatch):
    _fake_client(monkeypatch, "约定违约金过高时，可以请求适当减少。")
    monkeypatch.setenv("DEEPSEEK_API_KEY", STUB_KEY)
    out = ai_governor.chat(
        "deepseek", "deepseek-chat", [{"role": "user", "content": "q"}],
        allowed_refs=[{"law_title": "中华人民共和国民法典", "article_no": 585}],
    )
    assert out["blocked"] is True and out["text"] == ""
    assert any("未包含" in v for v in out["gates"]["citations"]["violations"])


def test_chat_rejects_empty_reference_set_before_model_call(tmp_db, monkeypatch):
    _fake_client(monkeypatch, "任意文本")
    monkeypatch.setenv("DEEPSEEK_API_KEY", STUB_KEY)
    with pytest.raises(ValueError, match="非空引用集合"):
        ai_governor.chat(
            "deepseek", "deepseek-chat", [{"role": "user", "content": "q"}],
            allowed_refs=None,
        )


def test_custom_endpoint_requires_base_url():
    """OpenAI 协议任意端点（决策7 执行）：custom 必须提供 Base URL；缺失即拒绝。"""
    import pytest
    with pytest.raises(ValueError, match="Base URL"):
        ai_governor.test_connection("custom", "any-model")
    with pytest.raises(ValueError, match="Base URL"):
        ai_governor.chat("custom", "any-model", [{"role": "user", "content": "q"}])


def test_custom_endpoint_rejects_non_public_or_unsafe_urls(monkeypatch):
    """自定义端点不能绕过 HTTPS、公网地址与 URL 用户信息约束。"""
    monkeypatch.setattr(ai_governor, "_client", lambda *a, **k: pytest.fail("unsafe URL reached client"))
    for url in (
        "http://127.0.0.1:9999/v1",
        "https://localhost/v1",
        "https://user:secret@example.com/v1",
        "ftp://example.com/v1",
        "https://example.com/v1?next=http://127.0.0.1",
        "https://192.0.2.1/v1",  # TEST-NET 保留地址，不是公网
    ):
        with pytest.raises(ValueError):
            ai_governor.chat("custom", "m", [{"role": "user", "content": "q"}],
                              api_key="ut-stub", base_url_override=url)


def test_local_provider_ignores_transient_key_and_override():
    local = ai_governor.get_provider("ollama")
    assert local and local["local"] is True
    assert ai_governor._resolve_key(local, "user-secret") == "local"
    assert ai_governor._resolve_endpoint(local, None) == local["base_url"]
    with pytest.raises(ValueError):
        ai_governor._resolve_endpoint(local, "https://example.com/v1")


def test_custom_endpoint_rejects_dns_that_resolves_private(monkeypatch):
    monkeypatch.setattr(
        ai_governor.socket, "getaddrinfo",
        lambda *a, **k: [(0, 0, 0, "", ("10.0.0.7", 443))],
    )
    with pytest.raises(ValueError, match="非公网"):
        ai_governor._public_https_url("https://gateway.example/v1")


def test_custom_endpoint_is_disabled_without_deployment_allowlist(monkeypatch):
    monkeypatch.delenv(ai_governor.CUSTOM_HOSTS_ENV, raising=False)
    monkeypatch.setattr(
        ai_governor.socket, "getaddrinfo",
        lambda *a, **k: [(0, 0, 0, "", ("93.184.216.34", 443))],
    )
    with pytest.raises(ValueError, match="默认关闭"):
        ai_governor._resolve_endpoint(
            ai_governor.get_provider("custom"), "https://gw.example/v1"
        )


def test_custom_endpoint_with_base_url_runs_gates(tmp_db, monkeypatch):
    """custom + Base URL + 瞬态 key：走同一三道 gate 与审计（复用 openai SDK base_url 机制）。"""
    class FakeMsg:
        def __init__(self, c): self.content = c
    class FakeChoice:
        def __init__(self, m): self.message = m
    class FakeResp:
        def __init__(self, ch): self.choices = [ch]; self.usage = None
    class FakeComp:
        def __init__(self, resp): self._resp = resp
        def create(self, **kw): return self._resp
    class FakeClient:
        def __init__(self, resp): self.chat = type("C", (), {"completions": FakeComp(resp)})()
    msg = "依据《民法典》第五百八十五条回答。"
    fake = FakeClient(FakeResp(FakeChoice(FakeMsg(msg))))
    monkeypatch.setattr(ai_governor, "_client", lambda *a, **k: fake)
    # URL 安全门会做 DNS 公网解析；单元测试固定解析结果，避免依赖外网 DNS。
    monkeypatch.setattr(
        ai_governor.socket, "getaddrinfo",
        lambda *a, **k: [(0, 0, 0, "", ("93.184.216.34", 443))],
    )
    monkeypatch.setenv(ai_governor.CUSTOM_HOSTS_ENV, "gw.example")
    out = ai_governor.chat(
        "custom", "any-model", [{"role": "user", "content": "q"}],
        api_key="ut-stub", base_url_override="https://gw.example/v1",
        allowed_refs=[{"law_title": "中华人民共和国民法典", "article_no": 585}], actor="tester")
    assert out["blocked"] is False and out["gates"]["citations"]["pass"] is True
