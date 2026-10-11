# -*- coding: utf-8 -*-
"""引号逐字一致性门（R506，lawgent「quotation round-trip」模式本地化）测试。

引用不变量第三层：citations 核验指向（法名+条号在依据集合内）、R168 数值核验
抓数字编造（数值+单位必须出现在被引条文）、本门抓「定性转述冒充原文引用」——
紧邻法条引用的引号内容必须是被引条文的去空白子串。
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import ai_governor  # noqa: E402
from app.corpus import get_corpus  # noqa: E402


def _art_text(law_id: str, no: int) -> str:
    for a in get_corpus().articles:
        if a["law_id"] == law_id and a["no"] == no and not a.get("sub"):
            return a["text"]
    raise LookupError(f"{law_id}#{no}")


_ALLOWED = [{"law_title": "中华人民共和国民法典", "article_no": 188}]


def test_verbatim_quote_adjacent_to_citation_passes():
    text = "依据《民法典》第188条：「向人民法院请求保护民事权利的诉讼时效期间为三年」。"
    g = ai_governor.gate_quote_integrity(text, _ALLOWED)
    assert g["pass"] is True, g["violations"]


def test_paraphrased_quote_adjacent_to_citation_fails():
    # 编造式转述：条号正确、引号内措辞与原文不一致（无数字可抓——数值核验的盲区）
    text = "依据《民法典》第188条：「诉讼时效一律为五年，从合同签订日起算」。"
    g = ai_governor.gate_quote_integrity(text, _ALLOWED)
    assert g["pass"] is False and any("不一致" in v for v in g["violations"])


def test_quote_far_from_citation_not_checked():
    # 远离婚引的引号（免责声明等）不声称是法条原文，不校验
    text = "依据《民法典》第188条，诉讼时效为三年。另请注意本回答「不构成法律意见，仅供参考」。"
    g = ai_governor.gate_quote_integrity(text, _ALLOWED)
    assert g["pass"] is True, g["violations"]


def test_whitespace_inside_quote_tolerated():
    # 条文原文含换行；模型引用时可能折行——去空白比较
    raw = _art_text("civl-2020", 188)[:24]
    broken = raw[:10] + "\n" + raw[10:16] + " " + raw[16:]
    text = f"《民法典》第188条规定：「{broken}」。"
    g = ai_governor.gate_quote_integrity(text, _ALLOWED)
    assert g["pass"] is True, g["violations"]


def test_quote_from_other_allowed_article_lenient_within_set():
    # 引号内容来自依据集合内另一条文：张冠李戴由 citations 门按指向拦截，
    # 本门只管「逐字」——集合内一致即放行（宽限口径钉住）
    allowed = _ALLOWED + [{"law_title": "中华人民共和国民法典", "article_no": 585}]
    raw = _art_text("civl-2020", 585)[:20]
    text = f"依据《民法典》第188条：「{raw}」。"
    g = ai_governor.gate_quote_integrity(text, allowed)
    assert g["pass"] is True, g["violations"]


def test_empty_refs_skips_quote_check():
    # 无可核验依据集合时跳过（由 citations 门兜底阻断），不重复拦截
    g = ai_governor.gate_quote_integrity("依据《民法典》第188条：「任意编造内容」。", None)
    assert g["pass"] is True


def test_gates_dict_includes_quote_integrity():
    # chat() 的门集合必须包含 quote_integrity（接线钉子——R505 教训：模块级测试
    # 全绿 ≠ 端点接线完成，门集合用签名断言钉住）
    import inspect

    src = inspect.getsource(ai_governor)
    assert src.count('"quote_integrity": gate_quote_integrity(') == 2, (
        "chat 首轮与重试轮的门集合都应包含 quote_integrity"
    )
