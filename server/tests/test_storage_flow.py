# -*- coding: utf-8 -*-
"""批注状态机 / 文书签发状态机 / 审计日志 / 投诉通道测试。"""
import pytest

from app import review, storage  # noqa: E402


@pytest.fixture()
def review_id(tmp_db):
    result = review.analyze_contract(
        "第一条 违约金：任何一方违约按日支付 30% 违约金。\n"
        "第二条 免责：乙方概不负责。\n"
        "第三条 收款：款项汇入第三方个人账户。",
        "测试合同",
    )
    return storage.create_review(result["title"], "合同文本", result)


def test_annotation_initial_state(review_id):
    r = storage.get_review(review_id)
    assert r["annotations"]
    assert all(a["state"] == "pending" for a in r["annotations"])


def test_annotation_transitions_and_audit(review_id):
    fid = storage.get_review(review_id)["result"]["findings"][0]["id"]
    out = storage.transition_annotation(review_id, fid, "adopt", "王律师")
    assert out["to"] == "adopted"
    # 终态不可再变更
    with pytest.raises(ValueError):
        storage.transition_annotation(review_id, fid, "reject", "王律师")
    # amend 可带修改文本
    fid2 = storage.get_review(review_id)["result"]["findings"][1]["id"]
    storage.transition_annotation(review_id, fid2, "amend", "李律师", amended_text="改为：违约金按日万分之五且以总价 20% 为限")
    r = storage.get_review(review_id)
    ann = next(a for a in r["annotations"] if a["finding_id"] == fid2)
    assert ann["state"] == "amended" and "万分之五" in ann["amended_text"]
    # 非法流转（pending → 待定之外的动作名）
    with pytest.raises(KeyError):
        storage.transition_annotation(review_id, fid2, "bogus", "x")
    # 审计留痕
    entries = storage.list_audit(None, review_id)
    actions = [e["action"] for e in entries]
    assert "create" in actions and "adopt" in actions and "amend" in actions
    adopt = next(e for e in entries if e["action"] == "adopt")
    assert adopt["actor"] == "王律师" and adopt["payload_json"]


def test_draft_gate_requires_lawyer(tmp_db):
    from app import drafting
    gen = drafting.generate("lawyer_letter", {
        "firm": "某某律师事务所", "lawyer": "张三", "license_no": "11101202611111111",
        "client": "甲公司", "recipient": "乙公司", "subject": "催告支付货款",
        "facts": "2026年6月1日双方签订买卖合同，乙公司收货后至今未付款。",
        "legal_basis": [{"law_id": "civl-2020", "article_no": 577}],
        "demands": "于本函发出之日起七日内支付全部拖欠货款",
        "deadline": "本函发出之日起七日内", "contact": "010-12345678",
    })
    did = storage.create_draft("lawyer_letter", gen["fields"], gen["content"], gen["content"]["citations"], gen["snapshot"])
    # 非律师不能核验
    with pytest.raises(ValueError):
        storage.transition_draft(did, "verify", "李助理", role="法务助理")
    # 未核验不能签发
    with pytest.raises(ValueError):
        storage.transition_draft(did, "issue", "张三", role="执业律师")
    # 律师核验 → 签发
    storage.transition_draft(did, "verify", "张三", role="执业律师", note="已核对事实与引用")
    d = storage.get_draft(did)
    assert d["status"] == "verified" and d["verified_role"] == "执业律师"
    storage.transition_draft(did, "issue", "张三", role="执业律师")
    d = storage.get_draft(did)
    assert d["status"] == "issued" and d["issued_by"] == "张三"
    # 已签发是终态
    with pytest.raises(ValueError):
        storage.transition_draft(did, "issue", "张三", role="执业律师")
    # 审计含 verify 与 issue
    actions = [e["action"] for e in storage.list_audit(None, did)]
    assert "verify" in actions and "issue" in actions


def test_docx_generation_watermark_states(tmp_db):
    from app import drafting, docxgen
    gen = drafting.generate("lawyer_letter", {
        "firm": "某某律师事务所", "lawyer": "张三", "license_no": "11101202611111111",
        "client": "甲公司", "recipient": "乙公司", "subject": "催告支付货款",
        "facts": "乙公司拖欠货款 10 万元未付。",
        "legal_basis": [{"law_id": "civl-2020", "article_no": 577}],
        "demands": "七日内付款", "deadline": "本函发出之日起七日内",
    })
    did = storage.create_draft("lawyer_letter", gen["fields"], gen["content"], gen["content"]["citations"], gen["snapshot"])
    d = storage.get_draft(did)
    data_draft = docxgen.generate_docx(d)
    assert len(data_draft) > 5000  # 未签发草稿可导出，但 docxgen 已加红色横幅
    storage.transition_draft(did, "verify", "张三", role="执业律师")
    storage.transition_draft(did, "issue", "张三", role="执业律师")
    d = storage.get_draft(did)
    data_issued = docxgen.generate_docx(d)
    assert len(data_issued) > 5000
    assert data_issued != data_draft


def test_complaint_channel(tmp_db):
    cid = storage.create_complaint("user@example.com", "引用条文有误", "第X条文本与官方库不一致")
    items = storage.list_complaints()
    assert any(c["id"] == cid for c in items)
    entries = storage.list_audit(None, cid)
    assert entries and entries[0]["action"] == "create"


def test_pipl_delete_and_export(tmp_db):
    """D8 回归：删除通道级联批注且审计留痕；导出通道返回全量数据。"""
    import json as _json
    from app import storage as st
    rid = st.create_review("删除测试", "第一条 价格：总价 100 元。", {"findings": [], "summary": {"high": 0, "medium": 0, "low": 0}})
    did = st.create_draft("lawyer_letter", {}, {"sections": [{"type": "title", "text": "律师函"}]}, [], {})
    cid = st.create_complaint(None, "测试投诉", "内容")
    st.delete_review(rid, actor="用户")
    st.delete_draft(did, actor="用户")
    st.delete_complaint(cid, actor="用户")
    assert st.get_review(rid) is None and st.get_draft(did) is None
    data = st.export_all()
    assert data["reviews"] == [] and data["drafts"] == [] and data["complaints"] == []
    deletes = [e for e in st.list_audit(None, None, limit=200) if e["action"] == "delete"]
    assert len(deletes) == 3, deletes
    # 导出含全量审计（append-only 可追溯，含删除痕迹）
    exported_ids = [e["action"] for e in data["audit_log"]]
    assert exported_ids.count("delete") == 3
