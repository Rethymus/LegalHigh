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


def test_review_docx_tracked_insertions(tmp_db):
    """D9 前半回归：审查 DOCX 导出含 w:ins 修订插入（作者=LegalHigh AI）与建议文本。"""
    import io as _io
    import re as _re
    import zipfile as _zip
    from app import review as _review, docxgen as _docxgen
    text = "第一条 服务：乙方提供咨询服务。第二条 免责：乙方对一切损失概不负责。"
    rid = storage.create_review("修订导出测试", text, _review.analyze_contract(text, "修订导出测试"))
    r = storage.get_review(rid)
    assert r["result"]["findings"], "样例应至少触发一条审查点"
    data = _docxgen.generate_review_docx(r)
    assert data[:2] == b"PK"
    xml = _zip.ZipFile(_io.BytesIO(data)).read("word/document.xml").decode("utf-8")
    ins = _re.findall(r'<w:ins [^>]*w:author="LegalHigh AI"', xml)
    assert len(ins) == len(r["result"]["findings"]), (len(ins), len(r["result"]["findings"]))
    assert "建议：" in xml


def test_docx_return_roundtrip(tmp_db):
    """D9 后半回归：导出→（模拟律师接受 f1、拒绝 f2）→回传解析→状态机同步→审计。"""
    import io as _io
    import json as _json
    import zipfile as _zip
    from app import docx_return, docxgen, review as _review
    W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"

    text = ("第一条 服务：乙方提供咨询服务。"
            "第二条 违约：任何一方违约的，按合同总价的 30% 支付违约金。"
            "第三条 免责：乙方对一切损失概不负责。")
    rid = storage.create_review("回传验证", text, _review.analyze_contract(text, "回传验证"))
    review = storage.get_review(rid)
    findings = review["result"]["findings"]
    assert len(findings) >= 2
    data = docxgen.generate_review_docx(review)

    # raw 导出：全部 pending
    parsed = docx_return.parse_review_docx(data)
    assert all(v == "pending" for v in parsed.values()) and parsed, parsed

    # 模拟律师在 Word 中：接受 f1（去掉 w:ins 包裹、保留文本）、拒绝 f2（清空文本）
    doc = _review  # noqa: F841
    from docx import Document as _Doc
    document = _Doc(_io.BytesIO(data))
    body = document.element.body
    for fid, keep in (("f1", True), ("f2", False)):
        bs = body.find(f'.//{W}bookmarkStart[@{W}name="LH_{fid}"]')
        assert bs is not None, fid
        be = body.find(f'.//{W}bookmarkEnd[@{W}id="{bs.get(W + "id")}"]')
        # 区间内的 w:ins：keep=True 解包（保留 w:r），keep=False 清空其中的 w:t
        started = False
        for el in body.iterchildren():
            if el is bs:
                started = True
                continue
            if el is be:
                break
            if not started:
                continue
            for ins in list(el.iter(f"{W}ins")):
                if keep:
                    parent = el  # ins 的宿主段落
                    for r_el in list(ins.findall(f"{W}r")):
                        parent.append(r_el)  # 移出修订标记 → 视为接受
                    el.remove(ins)
                else:
                    for t_el in ins.iter(f"{W}t"):
                        t_el.text = ""
    buf = _io.BytesIO()
    document.save(buf)
    returned = buf.getvalue()

    parsed2 = docx_return.parse_review_docx(returned)
    assert parsed2.get("f1") == "accepted", parsed2
    assert parsed2.get("f2") == "rejected", parsed2

    summary = docx_return.apply_return(rid, parsed2, storage.get_review(rid))
    assert summary["accepted"] == ["f1"] and summary["rejected"] == ["f2"], summary
    states = {a["finding_id"]: a["state"] for a in storage.get_review(rid)["annotations"]}
    assert states["f1"] == "adopted" and states["f2"] == "rejected"
    deletes = [e for e in storage.list_audit(None, None, limit=100) if e["action"] in ("adopt", "reject")]
    assert len(deletes) >= 2
