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


# ---- 租赁类（T4 首批，R441：R1/R2）----

def test_r1_lease_term_over_twenty_years():
    assert "R1" in fired("租赁期限为三十年，租金每年一万元。")
    assert "R1" in fired("租期50年。")
    assert "R1" not in fired("租赁期限为二十年。"), "二十年=法定上限本身，不得触发"
    assert "R1" not in fired("租期3年，租金押一付三。")


def test_r2_termination_for_rent_arrears_without_notice():
    assert "R2" in fired("乙方拖欠租金的，甲方有权立即解除合同并收回房屋。")
    ids = fired("乙方拖欠租金经书面催告后十日内仍未支付的，甲方可以解除合同。")
    assert "R2" not in ids, "已设催告宽限，不触发"
    assert "R2" not in fired("拖欠租金的每日加收滞纳金。"), "无解除表述不触发"


# ---- 劳动类（T4 首批，R441：W1/W2）----

def test_w1_non_compete_without_compensation():
    assert "W1" in fired("乙方离职后两年内不得从事同类业务（竞业限制）。")
    ids = fired("乙方竞业限制两年，甲方在限制期内按月支付竞业限制经济补偿。")
    assert "W1" not in ids, "已约定补偿，不触发"


def test_w2_probation_wage_below_floor():
    assert "W2" in fired("试用期工资为约定工资的 70%。")
    assert "W2" not in fired("试用期工资为约定工资的 80%。"), "80%=法定下限本身，不得触发"
    assert "W2" not in fired("试用期工资为约定工资的 85%。")
    assert "W2" not in fired("试用期三个月。"), "无比例表述无从判断，不触发"


# ---- 买卖类（T4 续批，R443：S1/S2）----

def test_s1_retention_of_title_without_registration():
    assert "S1" in fired("货款付清前，设备所有权保留归卖方所有。")
    ids = fired("所有权保留并已在动产融资统一登记公示系统办理登记。")
    assert "S1" not in ids, "已办理登记，不触发"
    assert "S1" not in fired("货物所有权自交付时转移给买方。")


def test_s2_installment_acceleration_without_statutory_guard():
    assert "S2" in fired("价款分十二期支付；买受人任何一期未按期支付的，未付款项视为全部到期，卖方有权解除合同。")
    ids = fired("分期付款的，买受人未付到期价款达全部价款五分之一且经催告后仍未支付的，出卖人可以解除合同。")
    assert "S2" not in ids, "已含五分之一+催告法定条件，不触发"
    assert "S2" not in fired("价款分期支付，每期金额相同。"), "无加速/解除表述不触发"
    assert "S2" not in fired("设备租赁分三期支付租金。"), "分期但无加速/解除表述不触发"


# ---- 物业/建设工程类（T4 续批二波，R445：P1/P2/G1）----

def test_p1_property_fee_without_disclosure():
    assert "P1" in fired("物业服务费按每月每平方米 3 元收取。")
    ids = fired("物业费每月 500 元，物业人应按季度公示收费标准与使用情况。")
    assert "P1" not in ids, "已有公示安排，不触发"
    assert "P1" not in fired("租金每月 3000 元。"), "非物业服务合同不触发"


def test_p2_restricting_owner_termination_right():
    assert "P2" in fired("合同期内业主不得解聘物业服务企业。")
    assert "P2" in fired("业主无权解除本物业服务合同。")
    ids = fired("业主按法定程序共同决定解聘的，提前六十日书面通知后可解除本合同。")
    assert "P2" not in ids, "保留法定解除权仅约定程序，不触发"


def test_g1_use_before_acceptance():
    assert "G1" in fired("工程完工后未经竣工验收即可交付使用。")
    assert "G1" in fired("未经验收擅自入住的，视为验收合格。")
    assert "G1" not in fired("工程竣工经验收合格后交付使用。"), "验收合格后交付=法定正常形态"


# ---- 中介/技术服务类（T4 续批三波，R446：M1/M2/T1）----

def test_m1_fee_payable_regardless_of_deal():
    assert "M1" in fired("无论是否成交，乙方均应支付全额中介费。")
    assert "M1" in fired("交易不成的，甲方仍应支付佣金。")
    ids = fired("中介人促成合同成立的，委托人支付佣金。")
    assert "M1" not in ids, "已绑定促成条件，不触发"


def test_m2_intermediary_truthfulness_disclaimer():
    assert "M2" in fired("中介对第三方提供的信息真实性概不负责。")
    assert "M2" in fired("房源信息真实性由买方自行核实的，中介不核实。")
    ids = fired("中介人应当如实报告与订立合同有关的重要事项。")
    assert "M2" not in ids, "如实报告义务在位，不触发"


def test_t1_development_ip_ownership_unspecified():
    assert "T1" in fired("委托开发本项目管理系统。")
    ids = fired("委托开发的发明创造，申请专利的权利归委托人所有。")
    assert "T1" not in ids, "已约定专利权归属，不触发（含「专利」表述的归属安排不因语序漏配）"
    assert "T1" not in fired("房屋租赁期限为三十年。"), "非技术开发合同不触发"


def test_gold_review_checkpoints_count():
    """金标规模门：审查点引擎 28 个（16 通用 + T4 租赁/劳动/买卖/物业·建设工程/中介·技术服务各波），判定用例 ≥50 组（含正反例）。"""
    assert len(review.get_checkpoints()) == 28
    # 本文件内的测试函数数（每组正反例算一组）
    import test_review_gold as _self  # noqa: PLC0415
    n = sum(1 for name in dir(_self) if name.startswith("test_"))
    assert n >= 23, n


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
    # R1 租期超限（T4 首批，R441）
    ("租赁期限为三十年，租金每年一万元。", "R1", True),
    ("租期50年。", "R1", True),
    ("租赁期限为二十年。", "R1", False),
    ("租期3年，租金押一付三。", "R1", False),
    # R2 欠租解除无宽限
    ("乙方拖欠租金的，甲方有权立即解除合同并收回房屋。", "R2", True),
    ("乙方拖欠租金经书面催告后十日内仍未支付的，甲方可以解除合同。", "R2", False),
    # W1 竞业限制无补偿（全文级）
    ("乙方离职后两年内不得从事同类业务（竞业限制）。", "W1", True),
    ("乙方竞业限制两年，甲方在限制期内按月支付竞业限制经济补偿。", "W1", False),
    # W2 试用期工资低于下限
    ("试用期工资为约定工资的 70%。", "W2", True),
    ("试用期工资为约定工资的 80%。", "W2", False),
    ("试用期工资为约定工资的 85%。", "W2", False),
    ("试用期三个月。", "W2", False),
    # S1 所有权保留未提示登记（T4 续批，R443）
    ("货款付清前，设备所有权保留归卖方所有。", "S1", True),
    ("所有权保留并已在动产融资统一登记公示系统办理登记。", "S1", False),
    ("货物所有权自交付时转移给买方。", "S1", False),
    # S2 分期付款加速/解除缺法定条件
    ("价款分十二期支付；买受人任何一期未按期支付的，未付款项视为全部到期，卖方有权解除合同。", "S2", True),
    ("分期付款的，买受人未付到期价款达全部价款五分之一且经催告后仍未支付的，出卖人可以解除合同。", "S2", False),
    ("价款分期支付，每期金额相同。", "S2", False),
    ("设备租赁分三期支付租金。", "S2", False),
    # P1 物业收费未约定公示（全文级，T4 续批二波 R445）
    ("物业服务费按每月每平方米 3 元收取。", "P1", True),
    ("物业费每月 500 元，物业人应按季度公示收费标准与使用情况。", "P1", False),
    ("租金每月 3000 元。", "P1", False),
    # P2 限制业主解除权
    ("合同期内业主不得解聘物业服务企业。", "P2", True),
    ("业主无权解除本物业服务合同。", "P2", True),
    ("业主按法定程序共同决定解聘的，提前六十日书面通知后可解除本合同。", "P2", False),
    # G1 未经验收即交付使用
    ("工程完工后未经竣工验收即可交付使用。", "G1", True),
    ("未经验收擅自入住的，视为验收合格。", "G1", True),
    ("工程竣工经验收合格后交付使用。", "G1", False),
    # M1 未促成仍付报酬（T4 续批三波 R446）
    ("无论是否成交，乙方均应支付全额中介费。", "M1", True),
    ("交易不成的，甲方仍应支付佣金。", "M1", True),
    ("中介人促成合同成立的，委托人支付佣金。", "M1", False),
    # M2 中介信息真实性免责
    ("中介对第三方提供的信息真实性概不负责。", "M2", True),
    ("房源信息真实性由买方自行核实的，中介不核实。", "M2", True),
    ("中介人应当如实报告与订立合同有关的重要事项。", "M2", False),
    # T1 委托开发知识产权归属未约定（全文级）
    ("委托开发本项目管理系统。", "T1", True),
    ("委托开发的发明创造，申请专利的权利归委托人所有。", "T1", False),
    ("房屋租赁期限为三十年。", "T1", False),
]


def test_gold_review_rows_data_driven():
    """M6-T5 审查点金标：数据驱动判定表逐行校验（期望/实际不符即失败并给出全文）。"""
    assert len(GOLD_REVIEW_ROWS) >= 40
    for text, cp, should in GOLD_REVIEW_ROWS:
        ids = fired(text)
        assert (cp in ids) == should, f"{cp} 期望{'触发' if should else '不触发'}，实际 {sorted(ids)}：{text}"
