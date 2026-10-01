# -*- coding: utf-8 -*-
"""条号纪律（R473，legal-case-analysis 核心原则 10 吸收）测试。

原则 10：「不得凭记忆写出具体法条条号；未经检索时只写规则内容与法律名称，
并标注『条号待检索』」。本项目确定性化：
- ①提示源钉住——系统提示必须携带该指令（源头预防编造条号）；
- ②门语义钉住——「条号待检索」标注形态合法（不出现在 violations 中，整体可通过），
  编造条号仍判越界（不可重试的内容风险信号，R417 两型不变）。
"""
import sys
from pathlib import Path

SERVER = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SERVER))

from app import ai_governor, commentaries  # noqa: E402


def test_policy_carries_citation_number_discipline():
    ctx, _ = commentaries.prompt_context([{"law_id": "civl-2020", "article_no": 188}])
    assert "条号待检索" in ctx and "禁止编造具体条号" in ctx, "系统提示必须携带条号纪律（源头预防）"


def test_marked_form_is_legal_not_a_citation():
    """「（条号待检索）」标注不是可识别引用——置于建议句中整体应合法通过、零违规。"""
    text = ("依据《民法典》第一百八十八条，向人民法院请求保护民事权利的诉讼时效期间为三年。"
            "建议：著作权法关于法定赔偿的规定（条号待检索）可进一步查证。")
    refs = [{"law_title": "中华人民共和国民法典", "article_no": 188}]
    out = ai_governor.gate_citations(text, refs)
    assert out["pass"] is True and out["violations"] == [], \
        f"「条号待检索」标注形态不得产生任何引用违规：{out}"


def test_fabricated_number_still_flags_out_of_set():
    """编造条号仍判越界（不可重试的内容风险信号——纪律不放松）。"""
    text = ("依据《民法典》第一百八十八条，诉讼时效三年。"
            "另见《著作权法》第五十四条的法定赔偿规则。建议进一步核实。")
    refs = [{"law_title": "中华人民共和国民法典", "article_no": 188}]
    out = ai_governor.gate_citations(text, refs)
    assert out["pass"] is False
    assert any("著作权法" in v and "第五十四条" in v for v in out["violations"]), \
        f"编造《著作权法》第54条必须以越界引用形态出现在违规中：{out['violations']}"
