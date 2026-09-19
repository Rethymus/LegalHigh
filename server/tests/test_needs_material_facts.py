# -*- coding: utf-8 -*-
"""关键事实缺失清单（FLERF §8 unknown_material_facts，R165）：

片段事实不得被脑补成中间结论——「迟到两次」推不出「严重违反规章制度」，
缺失的事实只能被提示补充。确定性正则触发，无 AI 参与。
"""
from app import needs


def test_fragment_facts_flag_all_missing():
    """报告 §8 原例：只说「被开除+没提前通知」→ 关键事实全部缺失。"""
    p = needs.parse_needs("公司今天突然把我开除了，也没提前通知")
    groups = p["parse"]["missing_material_facts"]
    assert groups and groups[0]["domain"] == "劳动报酬与劳动关系"
    ids = {m["id"] for m in groups[0]["missing"]}
    assert {"employment-duration", "wage-standard", "written-contract", "termination-reason"} <= ids


def test_rich_description_only_flags_true_gaps():
    """信息较全的描述只应剩真正缺的项（解除事由），不能因为提了工资就全免检。"""
    p = needs.parse_needs("老板拖欠我三个月工资，月薪八千，没签劳动合同，入职两年了")
    groups = p["parse"]["missing_material_facts"]
    ids = {m["id"] for g in groups for m in g["missing"]}
    assert "termination-reason" in ids
    assert "employment-duration" not in ids, "描述里有「入职两年」，年限不应判缺"
    assert "written-contract" not in ids, "描述里有「没签劳动合同」，签约状态不应判缺"


def test_termination_reason_note_guards_against_inference():
    """「迟到两次」型描述必须被提示不足以认定严重违反规章制度。"""
    rules = {f["id"]: f["why"] for g in needs.MATERIAL_FACT_CHECKLISTS for f in g["facts"]}
    assert "严重违反规章制度" in rules["termination-reason"]


def test_unrelated_text_no_checklist():
    p = needs.parse_needs("网上买的手机壳是假货，平台客服一直不处理")
    groups = p["parse"]["missing_material_facts"]
    assert all(g["domain"] != "劳动报酬与劳动关系" for g in groups), "消费类描述不得触发劳动清单"
    # 该描述渠道/商品状态/商家态度齐全 → 消费清单无缺失项也是正确行为（只报缺失）
    assert all(g["domain"] != "消费者权益与网络交易" or g["missing"] for g in groups)


def test_bare_consumer_description_flags_missing():
    p = needs.parse_needs("网购的手机壳有问题，想退款")
    groups = [g for g in p["parse"]["missing_material_facts"] if g["domain"] == "消费者权益与网络交易"]
    assert groups, "极简消费描述应触发缺失提示"
    ids = {m["id"] for m in groups[0]["missing"]}
    assert "purchase-channel" in ids and "merchant-response" in ids
    # 清单口径：只提示补充，不定性
    assert all("不代表案件定性" in g["note"] for g in groups)


def test_checklists_are_declared():
    """每个领域至少 2 个事实项；每项带 detect/why——可解释性硬要求。"""
    for g in needs.MATERIAL_FACT_CHECKLISTS:
        assert len(g["facts"]) >= 2
        for f in g["facts"]:
            assert f["detect"] and f["why"] and f["id"]
