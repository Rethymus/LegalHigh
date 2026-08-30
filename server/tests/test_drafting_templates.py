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


def test_new_templates_registered():
    """M7-T2：答辩状与授权委托书进入模板库（文书家族 3→5）。"""
    assert {"civil_answer", "power_of_attorney"} <= set(TEMPLATES)
    assert len(TEMPLATES) == 5


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


def test_new_templates_docx_export(tmp_db):
    """新模板生成草稿后走同一 docxgen，产物为合法 DOCX 且含状态横幅口径。"""
    for tpl_id, fill in (("civil_answer", ANSWER_FILL), ("power_of_attorney", POA_FILL)):
        g = generate(tpl_id, fill)
        did = storage.create_draft(tpl_id, fill, g["content"], g["content"]["citations"], g["snapshot"])
        data = docxgen.generate_docx(storage.get_draft(did))
        assert data[:2] == b"PK"
        xml = zipfile.ZipFile(io.BytesIO(data)).read("word/document.xml").decode("utf-8")
        assert "未经人工核验定稿" in xml  # draft 状态水印横幅
