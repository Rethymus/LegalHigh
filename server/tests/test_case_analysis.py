# -*- coding: utf-8 -*-
"""案件分析模块测试：引用启动校验 / 要件矩阵 / 人像 / 行为模式（非心理诊断红线）/
DOCX 交付物 / 端点校验 / 无状态纪律。"""
import inspect
import io
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from docx import Document  # noqa: E402

from app import behavior, case_analysis, case_report, legalmodel, profiling  # noqa: E402
from app.corpus import LawCorpus  # noqa: E402

C = LawCorpus()

# ── 启动校验（import 本模块即断言）：模型库每条引用必须可经语料解析 ──────────
TEMPLATES = legalmodel.get_templates()
for _tpl in TEMPLATES.values():
    for _el in _tpl["elements"]:
        for _lid, _no in _el["citations"]:
            C.citation_of(_lid, _no)  # 不存在即 KeyError

# 借贷样例案情（≥200 字）：借条 / 2024年6月1日 / 转账 50000 元 / 年利率 24% /
# 到期 / 两次催告 / 最后警告！三日内不还就起诉！！
LOAN_CASE = (
    "借款人张三与贷款人李四于2024年6月1日签订借条一份，约定借款金额人民币50000元，"
    "借款期限六个月，年利率 24%，到期一次性归还本息。贷款人当日通过银行转账方式"
    "向借款人支付50000元。借款到期后逾期未还，贷款人分别于2024年12月、2025年1月"
    "两次催告，借款人曾承诺2025年1月底前归还但始终未履行，仅表示愿意分期归还。"
    "2025年2月1日，贷款人发出最后警告：限 5 日内一次性归还全部本息，否则将向人民"
    "法院起诉并申请强制执行。借款人回复称资金困难，48 小时内无法凑齐，且不同意延期"
    "方案。最后警告！三日内不还就起诉！！"
)

# 无任何法律/实体线索的日常文本（≥30 字，触发端点长度校验下限之上）
PLAIN_CASE = (
    "今天天气不错，出门散步透气，路边的花开得很好，中午吃了碗面，下午看书喝茶，"
    "傍晚回家休息，记录一下平淡的一天。"
)

BANNED_WORDS = ("人格", "心理障碍", "精神", "智力", "疾病")
DISCLAIMER_ELEMENTS = ("非心理学诊断", "非医学意见", "不构成对任何自然人的品格评价",
                       "仅基于所提供文本的表层语言模式")


def test_templates_shape_and_citations():
    """四类模板结构完整；引用已在 import 时逐条校验（上文模块级断言）。"""
    assert set(TEMPLATES) == {"loan_repayment", "breach_damage", "consumer_fraud", "wage_claim"}
    for tpl in TEMPLATES.values():
        assert tpl["name"]
        assert tpl["elements"]
        for el in tpl["elements"]:
            assert el["id"] and el["title"] and el["citations"] and el["probes"]
            for lid, no in el["citations"]:
                cit = C.citation_of(lid, no)
                assert cit["text"] and cit["law_title"] and cit["source_url"]


def test_loan_claim_elements_supported_with_real_spans():
    res = legalmodel.analyze_claim(LOAN_CASE, "loan_repayment")
    assert res["claim"] == {"id": "loan_repayment", "name": TEMPLATES["loan_repayment"]["name"]}
    by_id = {e["id"]: e for e in res["elements"]}
    assert len(LOAN_CASE) >= 200
    for eid in ("E1", "E2", "E3", "E4"):
        el = by_id[eid]
        assert el["status"] == "supported", f"{eid} 应有文本支持"
        assert el["evidence_spans"], f"{eid} 应有命中片段"
        for sp in el["evidence_spans"]:
            assert sp["excerpt"] in LOAN_CASE, "excerpt 必须是原文子串"
            assert LOAN_CASE.find(sp["excerpt"]) == max(0, sp["start"] - 40)
            assert 0 <= sp["start"] < len(LOAN_CASE)
        for cit in el["citations"]:
            assert cit == C.citation_of(cit["law_id"], cit["article_no"])
    assert res["summary"]["supported"] >= 4  # E1-E5 全部有文本线索
    assert res["summary"]["supported"] + res["summary"]["unverified"] == len(res["elements"])
    assert res["disclaimer"]


def test_claim_unverified_on_plain_text():
    res = legalmodel.analyze_claim(PLAIN_CASE, "loan_repayment")
    assert all(e["status"] == "unverified" for e in res["elements"])
    assert all(e["evidence_spans"] == [] for e in res["elements"])
    assert res["summary"]["supported"] == 0
    assert res["summary"]["unverified"] == len(res["elements"])
    assert "0 项要件有文本支持" in res["summary"]["overall"]
    # 引用卡仍完整（依据条文与文本命中无关）
    assert res["references"] and all(r["kind"] == "statute" for r in res["references"])
    keys = [(r["law_id"], r["article_no"]) for r in res["references"]]
    assert len(keys) == len(set(keys)), "references 不得重复"


def test_claim_unknown_id_raises():
    for bad in ("", "nonexistent", "loan"):
        try:
            legalmodel.analyze_claim(LOAN_CASE, bad)
        except ValueError:
            pass
        else:
            raise AssertionError(f"未知 claim_id={bad!r} 应抛 ValueError")


def test_behavior_indicators_hit_and_disclaimer():
    res = behavior.analyze_behavior(LOAN_CASE)
    levels = {i["id"]: i["level"] for i in res["indicators"]}
    assert levels["B1"] != "absent" and levels["B2"] != "absent"
    assert levels["B3"] != "absent" and levels["B5"] == "high"
    for elem in DISCLAIMER_ELEMENTS:
        assert elem in res["fixed_disclaimer"]
    for ind in res["indicators"]:
        blob = ind["title"] + ind["note"] + ind["advice"]
        for w in BANNED_WORDS:
            assert w not in blob, f"行为文案触碰红线词：{w}"
        assert ind["level"] in ("high", "medium", "low", "absent")
        if ind["level"] != "absent":
            # B5 可由感叹号密度单独触发（特判），其余指标必须由 probe 命中驱动
            if ind["id"] == "B5":
                assert ind["hits"] >= 1 or ind.get("exclaim_count", 0) >= 2
            else:
                assert ind["hits"] >= 1
            for sp in ind["spans"]:
                assert sp["excerpt"] in LOAN_CASE
    assert res["references"] and all(r["kind"] == "text_span" for r in res["references"])


def test_behavior_absent_on_plain_text():
    res = behavior.analyze_behavior(PLAIN_CASE)
    assert all(i["level"] == "absent" for i in res["indicators"])
    assert res["references"] == []


def test_profile_parties_and_timeline():
    p = profiling.build_profile(LOAN_CASE)
    roles = {x["role"] for x in p["parties"]}
    assert {"借款人", "贷款人"} <= roles
    assert p["timeline"], "应抽到至少 1 条日期"
    assert any(t["date_hint"].startswith("2024年6月1日") for t in p["timeline"])
    for party in p["parties"]:
        for m in party["mentions"]:
            assert m["excerpt"] in LOAN_CASE
        for b in party["behaviors"]:
            assert b["type"] in ("主张", "抗辩", "承诺", "违约行为")
            assert b["excerpt"] in LOAN_CASE
        assert len(party["mentions"]) <= 3
    assert any(party["behaviors"] for party in p["parties"]), "样例文本应抽到行为动词"


def test_profile_empty_on_plain_text():
    p = profiling.build_profile(PLAIN_CASE)
    assert p["parties"] == [] and p["timeline"] == []
    assert p["references"][0]["count"] == 0


def test_analyze_case_composition_and_dedup():
    a = case_analysis.analyze_case(LOAN_CASE, title="借贷纠纷样例", claim_id="loan_repayment")
    assert a["title"] == "借贷纠纷样例"
    assert a["generated_at"]
    assert a["summary"]["profile_parties"] >= 2
    assert a["summary"]["claim_supported"] >= 4
    assert a["summary"]["claim_unverified"] >= 0
    statute_keys = [(r["law_id"], r["article_no"]) for r in a["references"] if r["kind"] == "statute"]
    assert len(statute_keys) == len(set(statute_keys)), "statute 引用合并去重"
    assert any(r["kind"] == "text_span" for r in a["references"])
    # 默认 claim_id 与免责声明合并（含行为模块固定附言）
    a2 = case_analysis.analyze_case(LOAN_CASE)
    assert a2["claim"]["claim"]["id"] == "loan_repayment"
    assert behavior.FIXED_DISCLAIMER in a2["disclaimers"]
    try:
        case_analysis.analyze_case(LOAN_CASE, claim_id="bad_id")
    except ValueError:
        pass
    else:
        raise AssertionError("未知 claim_id 应抛 ValueError")


def test_case_docx_report():
    a = case_analysis.analyze_case(LOAN_CASE, title="借贷纠纷样例")
    data = case_report.generate_case_docx(a)
    assert len(data) > 5000
    assert data[:2] == b"PK", "DOCX 应为 zip 包（PK 魔数）"
    doc = Document(io.BytesIO(data))
    joined = "\n".join(p.text for p in doc.paragraphs)
    assert "案件分析报告" in joined
    assert "非心理" in joined  # 固定非诊断声明全文转载
    for elem in DISCLAIMER_ELEMENTS:
        assert elem in joined
    assert "分析草稿 · 非法律意见 · 不作心理诊断" in joined  # 顶部红字横幅
    # 无实体文本也应诚实生成（空值如实呈现，不推测）
    data2 = case_report.generate_case_docx(case_analysis.analyze_case(PLAIN_CASE))
    assert len(data2) > 5000 and data2[:2] == b"PK"


def test_modules_are_stateless():
    """无状态纪律：五个模块源码不得引用存储层或本地库关键字。"""
    for mod in (legalmodel, profiling, behavior, case_analysis, case_report):
        src = inspect.getsource(mod)
        assert "import storage" not in src, f"{mod.__name__} 引用了存储层"
        assert "sqlite" not in src.lower(), f"{mod.__name__} 出现本地库关键字"


def test_endpoints_validation_and_docx():
    from fastapi.testclient import TestClient

    from app.main import app

    client = TestClient(app)
    r = client.post("/api/case/analyze",
                    json={"title": "借贷纠纷", "case_text": LOAN_CASE, "claim_id": "loan_repayment"})
    assert r.status_code == 200
    body = r.json()
    assert body["summary"]["claim_supported"] >= 4
    assert body["claim"]["summary"]["overall"]

    # 文本为空 / 过短 → 422
    for bad_text in ("", "   ", "太短了"):
        r2 = client.post("/api/case/analyze", json={"case_text": bad_text})
        assert r2.status_code == 422, "空或 <30 字文本应 422"

    # 未知 claim_id → 422
    r3 = client.post("/api/case/analyze", json={"case_text": LOAN_CASE, "claim_id": "nope"})
    assert r3.status_code == 422

    # report → DOCX 附件
    r4 = client.post("/api/case/report", json={"case_text": LOAN_CASE})
    assert r4.status_code == 200
    assert r4.content[:2] == b"PK" and len(r4.content) > 5000
    assert "case_analysis_" in r4.headers["content-disposition"]
    assert r4.headers["content-disposition"].endswith('.docx"')
    r5 = client.post("/api/case/report", json={"case_text": "太短了"})
    assert r5.status_code == 422
