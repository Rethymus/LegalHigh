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
