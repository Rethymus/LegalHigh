# -*- coding: utf-8 -*-
"""合同审查引擎测试：规则触发、引用有效性、风险分级。"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import review  # noqa: E402
from app.corpus import get_corpus  # noqa: E402

RISKY = """服务合同
甲方：某某科技有限公司
乙方：某某工作室
第一条 服务内容：乙方为甲方提供软件开发服务。
第二条 费用与支付：合同总价款人民币 100000 元。乙方逾期交付的，每逾期一日按合同总价的 5% 支付违约金。甲方有权单方调整收费标准，无需通知乙方。
第三条 支付账户：甲方应将款项汇入乙方指定的第三方个人账户（户主为乙方负责人亲属）。
第四条 免责条款：乙方对服务造成的任何损失概不负责；本协议最终解释权归甲方所有。
第五条 自动续费：服务期满后自动续费一年，费用照常扣除。
第六条 定金：本合同签订时甲方支付定金，金额为合同总价的 30%。"""

CLEAN = """服务合同
甲方：某某科技有限公司
乙方：某某信息技术有限公司
第一条 服务内容：乙方为甲方提供软件运维服务，具体范围以附件一为准。
第二条 价款与支付：合同总价款人民币壹拾万元整（¥100,000.00，含税）。甲方于每月 5 日前按季度支付上季度服务费。
第三条 履行期限：自 2026 年 9 月 1 日起至 2027 年 8 月 31 日止。
第四条 违约责任：任何一方违约的，应赔偿对方因此遭受的直接损失；双方另有约定的从其约定，违约金总额以合同总价款的百分之二十为限。
第五条 争议解决：因本合同发生争议，双方协商解决；协商不成的，向合同签订地人民法院起诉。"""


def test_segment_clauses_numbered():
    clauses = review.segment_clauses(RISKY)
    # 1 个未编号标题段 + 6 个编号条款
    assert len(clauses) == 7
    assert clauses[1]["label"] == "第一条" and "软件开发" in clauses[1]["text"]


def test_risky_contract_findings():
    out = review.analyze_contract(RISKY, "测试高风险合同")
    ids = {f["checkpoint_id"] for f in out["findings"]}
    assert "L1" in ids, "违约金过高（5% 日罚）应触发"
    assert "L2" in ids, "概不负责应触发"
    assert "L3" in ids, "最终解释权应触发"
    assert "F1" in ids, "自动续费未提提示义务应触发"
    assert "F2" in ids, "单方调价权应触发"
    assert "F3" in ids, "定金 30% 应触发"
    assert "A1" in ids, "第三方个人账户应触发"
    assert out["summary"]["high"] >= 4
    assert out["summary"]["by_category"]["fee"] >= 2


def test_clean_contract_has_no_high_risk():
    out = review.analyze_contract(CLEAN, "测试干净合同")
    assert out["summary"]["high"] == 0, f"干净合同不应有高风险项: {[f['checkpoint_id'] for f in out['findings']]}"
    ids = {f["checkpoint_id"] for f in out["findings"]}
    assert "L1" not in ids and "L2" not in ids and "L3" not in ids


def test_every_statute_citation_resolves_in_corpus():
    out = review.analyze_contract(RISKY)
    for f in out["findings"]:
        if f["basis_kind"] == "statute":
            cite = f["citation"]
            art = get_corpus().get_article(cite["law_id"], cite["article_no"])
            assert art, f"引用不存在于语料: {cite}"
            assert cite["text"] == art["text"]
        else:
            assert f["citation"] is None and "实务" in f["detail"]


def test_checkpoint_library_startup_validation():
    cps = review.build_checkpoints()
    assert len(cps) >= 14
    corpus = get_corpus()
    for cp in cps:
        if cp["citation"]:
            corpus.citation_of(*cp["citation"])


MIXED_PCT = """服务合同
第一条 担保与违约
乙方缴纳定金为合同总额的 10%；任何一方违约的，违约金为合同总额的 30%。"""


def test_f3_deposit_threshold_is_sentence_scoped():
    """定金超限判定为句级定位：以「定金」所在句的比例为准，条款内其他比例不参与。"""
    r = review.analyze_contract(MIXED_PCT, "混合比例")
    ids = [f["checkpoint_id"] for f in r["findings"]]
    assert "F3" not in ids, f"F3 误触发：{ids}"
    assert "L1" in ids, "违约金 30% 仍应触发 L1"


def test_f3_fires_when_deposit_itself_exceeds():
    text = """服务合同
第一条 担保
定金为合同总额的 30%。"""
    r = review.analyze_contract(text, "定金超标")
    assert "F3" in [f["checkpoint_id"] for f in r["findings"]]


def test_first_unnumbered_line_not_duplicated():
    """首个未编号段落的首行在条款正文中只出现一次。"""
    clauses = review.segment_clauses(MIXED_PCT)
    c1 = clauses[0]
    assert c1["text"].count("服务合同") == 1, repr(c1["text"])
    full = "\n".join(c["text"] for c in clauses)
    assert full.count("第一条") == 1  # heading 行保留在条款正文（切条口径），仅一次


def test_placeholder_regex_covers_fullwidth_underscore():
    """A6 回归：中文合同惯用全角下划线「＿＿＿＿」，占位检查不得漏检。"""
    from app.validation import PLACEHOLDER_RE
    assert PLACEHOLDER_RE.search("人民币（大写）＿＿＿＿＿＿元")
    assert PLACEHOLDER_RE.search("金额 ____ 元")
    assert not PLACEHOLDER_RE.search("人民币壹拾万元整（¥100,000.00）")
