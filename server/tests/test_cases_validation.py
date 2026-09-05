# -*- coding: utf-8 -*-
"""案例样本库数据纪律 + 文书交付前校验引擎测试。"""
import pytest

from app import cases as cases_mod  # noqa: E402
from app import drafting, storage, validation  # noqa: E402


# ---------- 案例样本库 ----------

def test_cases_data_discipline():
    """案例必须是真实记录，并有可直接打开的来源与核验日期。"""
    cases = cases_mod.load_cases()
    assert len(cases) >= 5
    for c in cases:
        assert c.get("source_note"), f"缺少来源说明: {c['id']}"
        assert c.get("source_title"), f"缺少来源标题: {c['id']}"
        assert c.get("source_url", "").startswith("https://"), f"缺少 HTTPS 来源: {c['id']}"
        assert c.get("source_accessed_at") == "2026-09-01", f"来源核验日期异常: {c['id']}"
        assert c.get("kind") in ("case", "foreign", "law", "academic", "ai")
        assert c.get("sample") is not True, f"生产案例库禁止示例占位: {c['id']}"
        assert c["verified"] is True and c["no"], f"真实案例缺案号: {c['id']}"


def test_cases_search_and_get():
    hits = cases_mod.search_cases("违约")
    assert isinstance(hits, list)
    c = cases_mod.get_case("guidance-24")
    assert c and c["level"] == "指导性案例"
    assert cases_mod.get_case("nonexistent") is None
    lv = cases_mod.search_cases(level="外国判例")
    assert lv and all(x["kind"] == "foreign" for x in lv)
    assert all(c["verified"] and not c.get("sample") for c in cases_mod.search_cases())
    assert cases_mod.search_cases(verified_only=False) == cases_mod.search_cases()


# ---------- 交付前校验 ----------

LETTER_FIELDS = {
    "firm": "北京某某律师事务所（示例）", "lawyer": "张律师（示例）",
    "license_no": "1110120XX00000000（示例）", "client": "星辰装备制造有限公司（示例）",
    "recipient": "某某贸易有限公司（示例）", "subject": "催告支付拖欠货款",
    "facts": "2026年6月交付设备并通过验收，货款尚未支付。",
    "legal_basis": [{"law_id": "civl-2020", "article_no": 579}],
    "demands": "于本函发出之日起七日内支付全部拖欠款项",
    "deadline": "本函发出之日起七日内", "contact": "",
}


@pytest.fixture()
def draft_id(tmp_db):
    gen = drafting.generate("lawyer_letter", LETTER_FIELDS)
    return storage.create_draft("lawyer_letter", LETTER_FIELDS, gen["content"], gen["content"]["citations"], gen["snapshot"])


def test_validation_not_ready_before_finalize(draft_id):
    d = storage.get_draft(draft_id)
    v = validation.validate_draft(d)
    assert v["need_review"] is False  # 要素齐备的草稿核心检查应全过
    assert v["ready"] is False        # 未定稿 → 不可对外交付
    gate = next(c for c in v["checks"] if c["id"] == "v9")
    assert gate["pass"] is False and "人工复核" in gate["detail"]
    # 引用不变量：579 条必须被解析为现行有效
    cite = next(c for c in v["checks"] if c["id"] == "v5")
    assert cite["pass"] is True


def test_validation_ready_after_finalize(draft_id):
    storage.transition_draft(draft_id, "review", "李律师（示例）")
    storage.transition_draft(draft_id, "finalize", "李律师（示例）", responsibility_confirmed=True)
    v = validation.validate_draft(storage.get_draft(draft_id))
    assert v["ready"] is True and v["status"] == "finalized"


def test_validation_detects_missing_party(draft_id):
    d = storage.get_draft(draft_id)
    # 篡改字段：收函对象与正文不一致 → 主体一致性应失败
    d["fields"] = {**d["fields"], "recipient": "另一个不相干公司（示例）"}
    v = validation.validate_draft(d)
    v3 = next(c for c in v["checks"] if c["id"] == "v3")
    assert v3["pass"] is False and v["need_review"] is True


def test_list_drafts(tmp_db, draft_id):
    rows = storage.list_drafts()
    assert rows and rows[0]["id"] == draft_id and rows[0]["status"] == "draft"
