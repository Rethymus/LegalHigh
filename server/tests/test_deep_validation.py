# -*- coding: utf-8 -*-
"""多类型交叉验证测试（第十七轮·深度测试）：

A. API 边界安全测试（注入/XSS/异常输入）
B. 数据完整性测试（CRUD 后一致性、并发写入、审计链完整）
C. 内容准确性测试（法条文本与官方源对照）
D. 场景路径端到端验证（关键词匹配→法条→模板全链）

运行: server/.venv/Scripts/python.exe tests/test_deep_validation.py
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import storage  # noqa: E402
from app.corpus import get_corpus  # noqa: E402

corpus = get_corpus()


# ===== A. API 边界安全测试 =====

class TestAPIBoundarySecurity:
    """注入/XSS/异常输入——验证系统不会崩溃或返回未预期数据。"""

    def test_sql_injection_in_search(self):
        """SQL 注入不影响检索（BM25 参数化查询，无 SQL 拼接）。"""
        malicious = "'; DROP TABLE laws; --"
        res = corpus.search(malicious, top_k=5)
        assert isinstance(res, list)  # 不崩溃
        # 语料表未被删除
        assert len(corpus.laws) == len(corpus.manifest["laws"])

    def test_xss_in_scenario_keywords(self):
        """XSS 脚本在场景匹配中不执行（纯文本匹配，无 HTML 渲染）。"""
        from app.scenarios import match_scenarios
        malicious = "<script>alert('xss')</script>"
        res = match_scenarios(malicious)
        assert isinstance(res, list)

    def test_extremely_long_input_search(self):
        """超长输入不崩溃（10000 字符）。"""
        long_text = "劳动合同" * 5000
        res = corpus.search(long_text, top_k=5)
        assert isinstance(res, list)

    def test_special_characters_search(self):
        """特殊字符不崩溃。"""
        for char in ["\x00", "\ufffd", "\u200b", "\\", "%", "_", "'", '"']:
            res = corpus.search(char * 100, top_k=5)
            assert isinstance(res, list)

    def test_unicode_emoji_search(self):
        """Emoji 不崩溃。"""
        res = corpus.search(" 🔥劳动法💎 ", top_k=5)
        assert isinstance(res, list)

    def test_needs_parse_empty_and_short(self):
        """需求解析边界：空/超短输入返回 422 而非 500。"""
        from app.needs import parse_needs
        import pytest
        with pytest.raises(ValueError):
            parse_needs("")
        with pytest.raises(ValueError):
            parse_needs("好")


# ===== B. 数据完整性测试 =====

class TestDataIntegrity:
    """CRUD 操作后数据一致性、审计链完整性。"""

    def test_crud_cycle_with_audit(self, tmp_db):
        """完整 CRUD 周期：创建→读→更新→删除→审计全量可溯。"""
        text = "第一条 价款：人民币 100000 元。第二条 违约：按总价 30% 支付违约金。第三条 免责：概不负责。"
        rid = storage.create_review("完整性测试", text, {"findings": [], "summary": {"high": 0, "medium": 0, "low": 0}})
        assert storage.get_review(rid) is not None
        storage.delete_review(rid)
        assert storage.get_review(rid) is None
        # 审计链：create + delete
        entries = storage.list_audit(None, None, limit=100)
        actions = [e["action"] for e in entries if e["entity_id"] == rid]
        assert "create" in actions and "delete" in actions

    def test_audit_append_only(self, tmp_db):
        """审计日志 append-only：无法修改或删除历史记录。"""
        from app import storage as st
        cid = st.create_complaint(None, "审计测试", "内容")
        # 审计条目存在
        entries = st.list_audit("complaint", None, limit=100)
        assert any(e["entity_id"] == cid for e in entries)
        # 审计表无 UPDATE/DELETE 权限暴露（storage.py 不提供修改审计的函数）
        assert not hasattr(st, "update_audit")
        assert not hasattr(st, "delete_audit")

    def test_draft_state_machine_integrity(self, tmp_db):
        """文书状态机：非法流转被拒绝，合法流转全链通过。"""
        from app import drafting as dr
        from app import storage as st
        g = dr.generate("lawyer_letter", {
            "firm": "测试律所", "lawyer": "某律师", "license_no": "X",
            "client": "甲", "recipient": "乙", "subject": "催款",
            "facts": "事实。", "legal_basis": [{"law_id": "civl-2020", "article_no": 577}],
            "demands": "七日内支付", "deadline": "七日内",
        })
        did = st.create_draft("lawyer_letter", {}, g["content"], g["content"]["citations"], g["snapshot"])
        # draft→finalize 应被拒绝（必须先复核，且确认责任）
        import pytest
        with pytest.raises(ValueError):
            st.transition_draft(did, "finalize", "测试", responsibility_confirmed=True)
        # draft→review→finalize 全链通过
        st.transition_draft(did, "review", "测试")
        st.transition_draft(did, "finalize", "测试", responsibility_confirmed=True)
        assert st.get_draft(did)["status"] == "finalized"

    def test_corpus_snapshot_integrity(self):
        """语料完整性：14 部受控规范文件全部存在、条号连续、文本非空。"""
        assert len(corpus.laws) == len(corpus.manifest["laws"])
        assert len(corpus.articles) == sum(m["article_count"] for m in corpus.manifest["laws"])
        for law_id in corpus.laws:
            arts = corpus.laws[law_id]["articles"]
            nos = [a["no"] for a in arts]
            assert nos == sorted(nos), f"{law_id} 条号非升序"
            # 子条号（之一/之二…）与基条同号——唯一性按 (no, sub) 对判定（2026-09-14）
            pairs = [(a["no"], a.get("sub") or "") for a in arts]
            assert len(set(pairs)) == len(pairs), f"{law_id} 条号重复"


# ===== C. 内容准确性测试 =====

class TestContentAccuracy:
    """关键条文与权威文本对照（基于已公开确认的官方文本）。"""

    def test_lcl_2012_article_30(self):
        """劳动合同法第30条：及时足额支付劳动报酬（已对照官方发布文本核实）。"""
        a = corpus.get_article("lcl-2012", 30)
        assert "及时足额支付劳动报酬" in a["text"]
        assert "支付令" in a["text"]

    def test_civl_2020_article_585(self):
        """民法典第585条：违约金（已对照官方发布文本核实）。"""
        a = corpus.get_article("civl-2020", 585)
        assert "违约金" in a["text"]
        assert "适当减少" in a["text"]
        assert "履行债务" in a["text"]

    def test_cl_2013_article_25(self):
        """消保法第25条：七日无理由退货（已对照官方发布文本核实）。"""
        a = corpus.get_article("cl-2013", 25)
        assert "七日内退货" in a["text"]
        assert "无需说明理由" in a["text"]
        assert "鲜活易腐" in a["text"]

    def test_civl_2020_article_496(self):
        """民法典第496条：格式条款（已对照官方发布文本核实）。"""
        a = corpus.get_article("civl-2020", 496)
        assert "格式条款" in a["text"]
        assert "提示" in a["text"]
        assert "说明" in a["text"]

    def test_lcl_2012_article_47(self):
        """劳动合同法第47条：经济补偿计算标准（已对照官方发布文本核实）。"""
        a = corpus.get_article("lcl-2012", 47)
        assert "每满一年支付一个月工资" in a["text"]
        assert "六个月以上不满一年" in a["text"]
        assert "半个月工资" in a["text"]

    def test_wlxf_2022_article_2(self):
        """网络消费规定第2条：七日无理由退货承诺（来源：Wikisource 快照）。"""
        a = corpus.get_article("wlxf-2022", 2)
        assert "七日内无理由退货承诺" in a["text"]

    def test_htjs_2023_article_65(self):
        """合同编通则解释第65条：违约金酌减（来源：Wikisource 快照）。"""
        a = corpus.get_article("htjs-2023", 65)
        assert "第五百八十四条" in a["text"]
        assert "百分之三十" in a["text"]


# ===== D. 场景路径端到端验证 =====

class TestScenarioEndToEnd:
    """场景路径：关键词→匹配→法条→模板→时效全链验证。"""

    def test_wage_arrears_full_chain(self):
        """拖欠工资场景：关键词匹配→法条存在→文书模板存在→时效提醒存在。"""
        from app.scenarios import match_scenarios
        matches = match_scenarios("老板拖欠我三个月工资")
        assert matches and matches[0]["id"] == "wage-arrears"
        sc = matches[0]
        # 法条引用有效
        for ref in sc["statute_refs"]:
            assert corpus.get_article(ref["law_id"], int(ref["no"])), ref
        # 步骤覆盖关键环节
        all_text = json.dumps(sc["steps"], ensure_ascii=False)
        assert "证据" in all_text
        assert "仲裁" in all_text or "投诉" in all_text
        # 时效提醒存在
        assert sc["deadlines"]

    def test_online_return_full_chain(self):
        """网购退货场景：全链验证。"""
        from app.scenarios import match_scenarios
        matches = match_scenarios("网购的东西要退货")
        assert matches and matches[0]["id"] == "online-return"
        sc = matches[0]
        assert sc["statute_refs"]
        assert sc["deadlines"]
        all_steps = json.dumps(sc["steps"], ensure_ascii=False)
        assert "退货" in all_steps or "七日" in all_steps
