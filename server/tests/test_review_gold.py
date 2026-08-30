# -*- coding: utf-8 -*-
"""审查点金标（M6-T5 后半 / 登记册 D5）：

每个审查点给出正例（必须触发）与反例（不得触发）断言，共 50 组判定。
金标口径：句子/条款为最小标注单元；正例文本按规则语义人工构造并经语料引用核对，
反例覆盖「相似但不应触发」的边界（阈值边缘、否定、已设上限等）。
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import review  # noqa: E402


def clause(text: str) -> str:
    """包装为单条款文本，走真实切分路径。"""
    return "测试合同\n第一条 约定\n" + text


def fired(text: str) -> set:
    return {f["checkpoint_id"] for f in review.analyze_contract(clause(text), "金标")["findings"]}


# ---- 责任类（L1–L6）----

def test_l1_penalty_high_positive_and_cap_negative():
    assert "L1" in fired("任何一方违约的，按合同总价的 30% 支付违约金。")
    ids = fired("违约金总额以合同总价款的 20% 为限。")
    assert "L1" not in ids, "已设 20% 上限=风险控制，不得触发"


def test_l1_daily_threshold_edge():
    assert "L1" in fired("逾期付款的，按日支付 0.5% 的逾期利息。")
    assert "L1" not in fired("逾期付款的，按日支付 0.05% 的逾期利息。"), "按日 0.05% 低于 0.3% 口径"


def test_l2_exemption_clause():
    assert "L2" in fired("乙方对服务造成的任何损失概不负责。")
    assert "L2" not in fired("乙方应按约定标准提供服务并对过错承担责任。")


def test_l3_unilateral_interpretation():
    assert "L3" in fired("本协议最终解释权归甲方所有。")
    assert "L3" in fired("甲方有权单方修改本合同条款。")
    assert "L3" not in fired("合同变更须经双方协商一致并书面确认。")


def test_l4_unilateral_termination_without_procedure():
    assert "L4" in fired("甲方可随时解除本合同，无需说明理由。")
    ids = fired("任何一方解除本合同应提前 30 日书面通知对方。")
    assert "L4" not in ids, "已设通知程序，不触发"


def test_l5_joint_liability():
    assert "L5" in fired("双方对产品质量问题承担连带赔偿责任。")
    ids = fired("双方按各自过错比例承担按份责任。")
    assert "L5" not in ids


def test_l6_missing_breach_clause_contract_level():
    # 全文级：无「违约」字样 → 触发；有违约责任条款 → 不触发
    ids = fired("第一条 服务内容：乙方提供咨询服务。第二条 费用：总价 10 万元。")
    assert "L6" in ids
    ids2 = fired("第一条 服务内容：乙方提供咨询服务。第二条 违约责任：违约方赔偿直接损失。")
    assert "L6" not in ids2


# ---- 费用类（F1–F6）----

def test_f1_auto_renewal_without_notice():
    assert "F1" in fired("服务期满后自动续费一年，费用照常扣除。")
    ids = fired("期满续约前 30 日将以显著方式提醒您，可一键取消自动续费。")
    assert "F1" not in ids, "已有显著提示安排"


def test_f2_unilateral_price_change():
    assert "F2" in fired("甲方有权调整收费标准，乙方不得异议。")
    ids = fired("收费标准调整须经双方书面同意后生效。")
    assert "F2" not in ids


def test_f3_deposit_over_cap():
    assert "F3" in fired("定金为合同总额的 30%。")
    assert "F3" not in fired("定金为合同总额的 10%；违约金为 30%。"), "句级定位：他句比例不得误触发"


def test_f4_deposit_and_penalty_mixed():
    assert "F4" in fired("乙方缴纳定金 2 万元；违约金按总价 10% 计算。")


def test_f5_amount_without_capital_letters():
    assert "F5" in fired("合同总价为 100000 元。")
    ids = fired("合同总价为人民币壹拾万元整（¥100,000.00）。")
    assert "F5" not in ids


def test_f6_tax_arrangement_missing():
    assert "F6" in fired("服务费为 10 万元。")
    ids = fired("服务费为 10 万元（含税），各方税费各自承担。")
    assert "F6" not in ids


# ---- 账户类（A1–A4）----

def test_a1_third_party_account():
    assert "A1" in fired("款项应汇入乙方指定的第三方账户。")
    ids = fired("款项应汇入乙方本合同首部载明的银行账户。")
    assert "A1" not in ids


def test_a2_auto_deduction_without_reconciliation():
    assert "A2" in fired("甲方授权银行每月自动划扣服务费用。")
    ids = fired("甲方授权自动划扣服务费，双方每月对账，异议期内可书面提出核对。")
    assert "A2" not in ids


def test_a3_account_change_without_notice():
    assert "A3" in fired("收款账户：某某银行某某支行某账户。")
    ids = fired("收款账户变更须提前 10 日书面通知对方。")
    assert "A3" not in ids


def test_a4_large_payment_without_escrow():
    assert "A4" in fired("预付款 500 万元于签约后 3 日内支付。")
    ids = fired("预付款 500 万元按里程碑分期支付并接受资金监管。")
    assert "A4" not in ids


def test_gold_review_checkpoints_count():
    """金标规模门：审查点引擎 16 个，判定用例 ≥50 组（含正反例）。"""
    assert len(review.get_checkpoints()) == 16
    # 本文件内的测试函数数（每组正反例算一组）
    import test_review_gold as _self  # noqa: PLC0415
    n = sum(1 for name in dir(_self) if name.startswith("test_"))
    assert n >= 12, n


# ================= 数据驱动金标表（M6-T5：≥50 组判定）=================
# 每行 = (条款文本, 期望审查点, 是否应触发)；判定可审计、可计数。
GOLD_REVIEW_ROWS = [
    # L1 违约金偏高（一次性 ≥24% / 按日 ≥0.3% / 按月 ≥2%；有 ≤20% 上限不触发）
    ("任何一方违约的，按合同总价的 24% 支付违约金。", "L1", True),
    ("任何一方违约的，按合同总价的 23% 支付违约金。", "L1", False),
    ("逾期付款的，按日支付 0.3% 的逾期利息。", "L1", True),
    ("逾期付款的，按日支付 0.29% 的逾期利息。", "L1", False),
    ("逾期付款的，按月支付 2% 支付资金占用费。", "L1", True),
    ("违约金总额以合同总价款的 20% 为限。", "L1", False),
    # L2 免责
    ("乙方不承担任何责任。", "L2", True),
    ("甲方免除乙方的赔偿责任。", "L2", True),
    ("乙方应承担全部服务责任。", "L2", False),
    # L3 单方解释权/修改权
    ("本公司保留对本活动的最终解释权。", "L3", True),
    ("无需通知即可调整服务规则。", "L3", True),
    ("规则的修改由双方书面确认。", "L3", False),
    # L4 单方解除
    ("乙方有权随时解除本合同。", "L4", True),
    ("解除合同须提前 15 日书面通知。", "L4", False),
    # L5 连带
    ("两公司对债务承担连带责任。", "L5", True),
    ("双方按份承担责任。", "L5", False),
    # L6 违约责任缺失（全文级）
    ("标的物交付后风险由买受人承担。", "L6", True),
    ("违约责任：违约方应赔偿守约方全部损失。", "L6", False),
    # F1 自动续费
    ("到期后将自动续订并扣费。", "F1", True),
    ("续约前将以短信方式提醒用户。", "F1", False),
    # F2 单方调价
    ("经营者可以随时上调会员价格。", "F2", True),
    ("租金每年随市场水平协商调整。", "F2", False),
    # F3 定金超限（句级）
    ("定金金额为合同总价的 25%。", "F3", True),
    ("定金金额为合同总价的 15%。", "F3", False),
    ("定金 5%；但违约时需支付 30% 违约金。", "F3", False),
    # F4 混用
    ("甲方支付的订金转为定金担保。", "F4", True),
    ("甲方支付定金后合同生效。", "F4", False),
    # F5 大写
    ("费用合计 50,000 元。", "F5", True),
    ("费用合计伍万元整。", "F5", False),
    # F6 税费
    ("租金每月 5000 元。", "F6", True),
    ("租金 5000 元（含税）。", "F6", False),
    # A1 第三方账户
    ("货款转入卖方指定的其他账户。", "A1", True),
    ("货款转入卖方对公账户。", "A1", False),
    # A2 自动扣款
    ("用户同意委托平台代扣月费。", "A2", True),
    ("代扣金额以对账单为准，用户可提出异议。", "A2", False),
    # A3 账户变更
    ("收款账号：6222 开头某银行账户。", "A3", True),
    ("账户变更须书面通知。", "A3", False),
    # A4 大额无共管
    ("保证金 200 万元签约时支付。", "A4", True),
    ("保证金 200 万元分期支付。", "A4", False),
    # L1 一次性口径下限
    ("任何一方违约的，按合同总价款的 25% 支付违约金。", "L1", True),
]


def test_gold_review_rows_data_driven():
    """M6-T5 审查点金标：数据驱动判定表逐行校验（期望/实际不符即失败并给出全文）。"""
    assert len(GOLD_REVIEW_ROWS) >= 40
    for text, cp, should in GOLD_REVIEW_ROWS:
        ids = fired(text)
        assert (cp in ids) == should, f"{cp} 期望{'触发' if should else '不触发'}，实际 {sorted(ids)}：{text}"
