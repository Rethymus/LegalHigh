# -*- coding: utf-8 -*-
"""问答与检索测试 + 金标评测 gate（阈值见文件尾，达标线即回归门）。"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import qa  # noqa: E402
from app.corpus import LawCorpus  # noqa: E402

C = LawCorpus()


def test_retrieval_hits_key_articles():
    r1 = C.search("网络购物七日无理由退货", top_k=5)
    assert any(h["law_id"] == "cl-2013" and h["no"] == 25 for h in r1[:3])
    r2 = C.search("约定的违约金过分高于造成的损失可以减少吗", top_k=5)
    assert any(h["law_id"] == "civl-2020" and h["no"] == 585 for h in r2[:3])
    r3 = C.search("自动续费需要提前提醒消费者吗", top_k=5)
    assert any(h["law_id"] == "crpl-imp-2024" and h["no"] == 10 for h in r3[:3])


def test_ask_carries_citations_and_disclaimer():
    out = qa.ask("定金最多可以约定多少？")
    assert out["answer_cards"], "应有命中"
    for card in out["answer_cards"]:
        assert card["law_title"] and card["article_label"] and card["source_url"]
        assert card["law_status"] and card["text"]
    assert out["disclaimer"]
    assert out["no_answer"] is False


def test_premise_check_corrects_wrong_premise():
    out = qa.ask("网络购物可以三十日无理由退货吗？")
    assert out["premise_check"], "错误前提应被纠正"
    assert out["premise_check"]["citation"]["article_no"] == 25
    assert out["premise_check"]["citation"]["law_id"] == "cl-2013"

    out2 = qa.ask("试用期可以约定一年吗？")
    assert out2["premise_check"] and out2["premise_check"]["citation"]["article_no"] == 19


def test_no_answer_is_honest():
    out = qa.ask("qqqqqq zzzzzz 12345!!")
    assert out["no_answer"] is True or all(c["score"] < 6.0 for c in out["answer_cards"])
    if out["no_answer"]:
        assert "未检索到" in out["no_answer_message"]


def test_gold_retrieval_gate():
    gold_path = Path(__file__).resolve().parent / "gold" / "gold_retrieval.json"
    gold = json.loads(gold_path.read_text(encoding="utf-8"))
    hits = 0
    rr = 0.0
    for g in gold["cases"]:
        res = C.search(g["question"], top_k=5)
        got = [(h["law_id"], h["no"]) for h in res]
        expected = [(e["law_id"], e["no"]) for e in g["expect"]]
        rank = next((i for i, k in enumerate(got, 1) if k in expected), None)
        hits += int(rank is not None)
        rr += (1 / rank) if rank else 0.0
    n = len(gold["cases"])
    hit_rate = hits / n
    mrr = rr / n
    # 回归门：金标 30 组，hit@5 与 MRR 阈值经实际运行标定（见 docs/ 开发计划 §四）
    assert hit_rate >= 0.90, f"hit@5={hit_rate:.2f} 低于阈值 0.90"
    assert mrr >= 0.70, f"MRR={mrr:.2f} 低于阈值 0.70"


def test_no_answer_message_uses_live_corpus_size():
    """无答案文案必须携带语料实时规模（与字面量脱钩）。"""
    out = qa.ask("zzqq vvveoo xkcdq")  # 语料外无意义词：任何真实语料扩张都不应命中
    assert out["no_answer"] is True
    msg = out["no_answer_message"]
    assert f"{len(C.laws)} 部" in msg and f"{len(C.articles):,} 条" in msg


def test_premise_rules_expanded():
    """D5 增量：前提核查规则 4→6（诉讼时效二年→三年挂 188 条；扣押证件挂劳动合同法9条）。
    每条规则都必须绑定真实语料条文（premise 纠错本身不得无出处）。"""
    r1 = qa.ask("别人欠我钱超过诉讼时效二年了还能起诉吗")
    assert r1["premise_check"] and r1["premise_check"]["rule_id"] == "pr-limitation-2y"
    assert r1["premise_check"]["citation"]["article_no"] == 188
    r2 = qa.ask("公司扣押身份证三个月怎么办")
    assert r2["premise_check"] and r2["premise_check"]["rule_id"] == "pr-id-seizure"
    assert r2["premise_check"]["citation"]["law_id"] == "lcl-2012"
    # 每条规则的引用必须真实存在于语料（结构性硬约束）
    from app.corpus import LawCorpus
    c = LawCorpus()
    for rule in qa.PREMISE_RULES:
        assert c.get_article(rule["law_id"], rule["article_no"]), rule["id"]
