# -*- coding: utf-8 -*-
"""文书家族测试（M7-T2）：新增模板（民事答辩状/授权委托书）生成、必填校验、DOCX 落地。"""
import io
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest  # noqa: E402

from app import docxgen, storage  # noqa: E402
from app.drafting import TEMPLATES, generate  # noqa: E402

ANSWER_FILL = {
    "defendant": "某公司", "plaintiff": "某人", "case_no": "（2026）某民初1号",
    "court": "某市某区人民法院",
    "answer_points": "一、答辩人不存在违约行为\n二、原告主张的损失缺乏依据",
    "facts": "双方合同履行情况如下。",
    "legal_basis": [{"law_id": "civl-2020", "article_no": 577}],
}
POA_FILL = {
    "principal": "某人", "agent": "某律师", "firm": "某律师事务所", "license_no": "111012026000000",
    "authority_scope": ["一般授权（代为出庭、陈述、答辩）", "代收法律文书"], "term": "自委托之日起至本案审结止",
}
LETTER_FILL = {
    "firm": "某律师事务所", "lawyer": "某律师", "license_no": "1110120XX00000000",
    "client": "某公司", "recipient": "另一公司", "subject": "催告双倍返还定金",
    "facts": "乙方依约支付定金后甲方拒绝签订正式合同。",
    "legal_basis": [{"law_id": "civl-2020", "article_no": 586}],
    "demands": "于本函发出之日起七日内双倍返还定金", "deadline": "本函发出之日起七日内",
}
OPINION_FILL = {
    "recipient": "某公司", "matter": "服务合同履行风险",
    "background": "使用者提供的背景材料。",
    "analysis_points": ["先核对合同文本", "再对照语料条文"],
    "risk_notes": ["事实材料仍需补充"],
    "legal_basis": [{"law_id": "civl-2020", "article_no": 577}],
    "firm": "某记录主体",
}
PRESERVATION_FILL = {
    "applicant": "某公司", "respondent": "某人", "case_info": "合同纠纷仲裁案",
    "court": "某市某区人民法院", "property_desc": ["某银行账户", "某处房产"],
    "reason": "存在需要由申请人核实的紧急情况。", "guarantee": "申请人提供自有财产担保",
}


def test_new_templates_registered():
    """M7-T2：答辩状与授权委托书进入模板库（文书家族 3→5）。"""
    assert {"civil_answer", "power_of_attorney", "legal_opinion", "preservation_application"} <= set(TEMPLATES)
    assert len(TEMPLATES) == 7


def test_generate_civil_answer():
    g = generate("civil_answer", ANSWER_FILL)
    secs = g["content"]["sections"]
    kinds = [s["type"] for s in secs]
    assert kinds[0] == "title" and "signature" in kinds, "标题与落款必备"
    assert g["content"]["citations"], "法律依据应解析为语料条文"
    assert "答辩人" in secs[1]["lines"][0]


def test_generate_power_of_attorney():
    g = generate("power_of_attorney", POA_FILL)
    secs = g["content"]["sections"]
    joined = "\n".join(s.get("text", "") for s in secs)
    assert "授权委托书" in secs[0]["text"]
    assert "一般授权" in joined and "转委托" in joined


def test_new_templates_required_validation():
    """必填缺失必须拒绝（generate 层校验与 server 422 同源）。"""
    with pytest.raises(ValueError):
        generate("civil_answer", {k: v for k, v in ANSWER_FILL.items() if k != "court"})
    with pytest.raises(ValueError):
        generate("power_of_attorney", {k: v for k, v in POA_FILL.items() if k != "term"})


def test_textarea_list_accepts_string_and_list():
    """textarea_list 归一化（r27 全流程 E2E 发现）：前端契约=多行字符串原样提交、
    server 按行切分；客户端直接提交字符串列表同样优雅接收——畸形输入不得 500。"""
    from app.drafting import generate
    as_list = dict(LETTER_FILL, demands=["第一项催告要求", "第二项催告要求"])
    as_str = dict(LETTER_FILL, demands="第一项催告要求\n第二项催告要求")
    g_list = generate("lawyer_letter", as_list)
    g_str = generate("lawyer_letter", as_str)
    def demands_of(g):
        return [s["text"] for s in g["content"]["sections"] if s.get("type") == "numbered"]
    assert demands_of(g_list) == ["第一项催告要求", "第二项催告要求"]
    assert demands_of(g_list) == demands_of(g_str)


def test_all_textarea_list_builders_accept_list_payloads_and_boundaries_are_explicit():
    """三类曾直接 splitlines 的模板必须容忍列表输入，并避免无来源的固定期限/法律断言。"""
    answer = generate("civil_answer", dict(ANSWER_FILL, claims_response=["逐项回应原告诉请"]))
    opinion = generate("legal_opinion", OPINION_FILL)
    preservation = generate("preservation_application", PRESERVATION_FILL)

    answer_text = "\n".join(s.get("text", "") for s in answer["content"]["sections"])
    opinion_text = "\n".join(s.get("text", "") for s in opinion["content"]["sections"])
    preservation_text = "\n".join(s.get("text", "") for s in preservation["content"]["sections"])
    assert "逐项回应原告诉请" in answer_text
    assert "15日" not in answer["content"]["gate_note"]
    assert "法律研究备忘录（工作草稿）" in opinion_text
    assert "本所基于" not in opinion_text
    assert "不构成法律意见" in opinion_text
    assert "特依据《中华人民共和国民事诉讼法》有关规定" not in preservation_text
    assert "受理法院" in preservation["content"]["gate_note"]


def test_legal_research_memo_docx_finalized_keeps_tool_disclaimer(tmp_db):
    """finalized 只表示使用者定稿，DOCX 仍须保留工具生成与未核验声明。"""
    generated = generate("legal_opinion", OPINION_FILL)
    did = storage.create_draft(
        "legal_opinion", OPINION_FILL, generated["content"], generated["content"]["citations"], generated["snapshot"]
    )
    storage.transition_draft(did, "review", "本机使用者")
    storage.transition_draft(did, "finalize", "本机使用者", responsibility_confirmed=True)
    data = docxgen.generate_docx(storage.get_draft(did))
    xml = zipfile.ZipFile(io.BytesIO(data)).read("word/document.xml").decode("utf-8")
    assert "法律研究备忘录（工作草稿）" in xml
    assert "工具生成" in xml
    assert "使用者已确认定稿" in xml
    assert "未经平台核验身份" in xml
    assert "不构成法律意见" in xml


def test_new_templates_docx_export(tmp_db):
    """新模板生成草稿后走同一 docxgen，产物为合法 DOCX 且含状态横幅口径。"""
    for tpl_id, fill in (("civil_answer", ANSWER_FILL), ("power_of_attorney", POA_FILL)):
        g = generate(tpl_id, fill)
        did = storage.create_draft(tpl_id, fill, g["content"], g["content"]["citations"], g["snapshot"])
        data = docxgen.generate_docx(storage.get_draft(did))
        assert data[:2] == b"PK"
        xml = zipfile.ZipFile(io.BytesIO(data)).read("word/document.xml").decode("utf-8")
        assert "未经人工核验定稿" in xml  # draft 状态水印横幅
