# -*- coding: utf-8 -*-
"""法条直查前置层（R501，lawq 法条直查模式的确定性化）产品路径金标。

背景（BM25 实测）：「民法典第1254条说了什么」类直查问法的条文号 bigram 被内容
词稀释——4 问实测 3 miss（1254/264/188 三形态全部落空，仅中文数字形态因条头
词面偶中）。处置=query_citation 确定性引用解析前置层（法名 tier 匹配 + 条号
阿拉伯/中文/之N）→ 语料唯一条文置顶；解析不完整或条文不存在时静默回退纯
BM25（不猜、不部分命中——fail-closed，与 ADR-0005 受控组同一架构位）。

这里钉的是产品路径（qa/needs/search 共用的 orchestrated_search）——raw 层
BM25 金标门不动（词面地板与规则⑲口径分离，同 test_labor_termination_retrieval）。
"""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import query_citation  # noqa: E402
from app.corpus import get_corpus  # noqa: E402
from app.retrieval_terms import orchestrated_search  # noqa: E402

# R501 金标：直查问法在产品路径必须 rank 1（改动 tier 匹配/置顶规则前先跑这里）
GOLD_DIRECT = [
    # (问法, 期望 law_id, 期望 no, 期望 sub)
    ("民法典第1254条说了什么", "civl-2020", 1254, ""),
    ("《民法典》第1254条是什么", "civl-2020", 1254, ""),
    ("民法典188条诉讼时效是多久", "civl-2020", 188, ""),
    ("民法典第一百八十八条内容", "civl-2020", 188, ""),
    ("刑法第264条是什么罪", "cl-2023", 264, ""),
    ("刑法第287条之一是什么罪", "cl-2023", 287, "之一"),
    ("劳动合同法第四十六条内容", "lcl-2012", 46, ""),
    ("劳动合同法82条有什么补偿", "lcl-2012", 82, ""),
    # 常用简称 tier-3 别名
    ("民诉法第122条内容", "pcl-2023", 122, ""),
    ("刑诉法第79条内容", "cpl-2018", 79, ""),
    ("消保法第55条怎么赔", "cl-2013", 55, ""),
    ("个保法第13条依据", "pipl-2021", 13, ""),
    ("民法第188条诉讼时效", "civl-2020", 188, ""),
]

# 回退金标：解析失败/语料外/条文不存在 → 不置顶不报错（fail-closed 回退纯 BM25）
GOLD_FALLBACK = [
    "婚姻法第32条有效吗",        # 法律不在语料（民法典已吸收婚姻法）→ 回退
    "民法典第9999条规定了什么",   # 条文号不存在 → 回退
    "诉讼时效是多久",             # 无引用形态 → 回退（纯 BM25 原行为）
]


@pytest.mark.parametrize("q,law_id,no,sub", GOLD_DIRECT)
def test_direct_lookup_hits_rank1(q, law_id, no, sub):
    c = get_corpus()
    res, meta = orchestrated_search(c, q, top_k=5)
    assert res, f"{q}：检索结果为空"
    top = res[0]
    assert (top["law_id"], top["no"], (top.get("sub") or "")) == (law_id, no, sub), \
        f"{q}：rank1 实测 {(top['law_id'], top['no'], top.get('sub'))} ≠ 期望 {(law_id, no, sub)}"
    # 置顶命中的可观测标记（调用方能说明「这是直查命中」而非 BM25 排序）
    assert meta.get("direct_citation", {}).get("law_id") == law_id


@pytest.mark.parametrize("q", GOLD_FALLBACK)
def test_unresolvable_falls_back_to_bm25(q):
    c = get_corpus()
    res, meta = orchestrated_search(c, q, top_k=5)
    assert res, f"{q}：回退路径检索结果不应为空"
    assert not meta.get("direct_citation"), f"{q}：不得置顶未解析成功的引用"


def test_law_ids_filter_respected():
    """调用方显式限定法域时，直查命中的法不在范围内则不置顶（过滤语义优先）。"""
    c = get_corpus()
    res, meta = orchestrated_search(c, "民法典第188条诉讼时效", top_k=5, law_ids=["lcl-2012"])
    assert not meta.get("direct_citation")
    assert all(h["law_id"] == "lcl-2012" for h in res)


# ---- 解析层单元：形态覆盖与防误报 ----

def test_resolve_forms_and_aliases():
    c = get_corpus()
    cases = {
        "民法典第1254条": ("civl-2020", 1254, ""),
        "《中华人民共和国民事诉讼法》第122条": ("pcl-2023", 122, ""),
        "民事诉讼法第一百九十五条": ("pcl-2023", 195, ""),
        "刑法第287条之二": ("cl-2023", 287, "之二"),
        "个保法第十三条": ("pipl-2021", 13, ""),
    }
    for q, expect in cases.items():
        hit = query_citation.resolve(q, c)
        assert hit is not None, f"{q}：应解析成功"
        assert (hit["law_id"], hit["no"], hit.get("sub") or "") == expect, f"{q}：{hit} ≠ {expect}"


def test_resolve_rejects_nonexistent_and_foreign():
    c = get_corpus()
    assert query_citation.resolve("婚姻法第32条", c) is None      # 法律不在语料
    assert query_citation.resolve("民法典第9999条", c) is None    # 条文不存在
    assert query_citation.resolve("什么情况下可以解除合同", c) is None  # 无引用形态
    assert query_citation.resolve("民法典", c) is None            # 无法条号


def test_resolve_sub_must_exist():
    """子条号解析必须命中真实子条（287 无之十 → 整体回退，不静默降级为基条）。"""
    c = get_corpus()
    assert query_citation.resolve("刑法第287条之十", c) is None


def test_search_api_forwards_direct_citation_meta(tmp_db, monkeypatch):
    """/api/search 透传 direct_citation（R501 对外可观测面）——TestClient 全栈。"""
    from fastapi.testclient import TestClient
    from app import main

    token = "direct-cite-endpoint-token-32-chars!"
    monkeypatch.setenv("LH_ADMIN_TOKEN", token)
    monkeypatch.setenv("LH_ADMIN_PRINCIPAL", "direct-cite-test")
    with TestClient(main.app) as client:
        r = client.get("/api/search", params={"q": "民法典第188条诉讼时效是多久"})
        assert r.status_code == 200
        data = r.json()
        d = data["retrieval_meta"].get("direct_citation")
        assert d and d["law_id"] == "civl-2020" and d["no"] == 188
        assert data["hits"][0]["law_id"] == "civl-2020" and data["hits"][0]["no"] == 188
        # 回退路径不携带
        r2 = client.get("/api/search", params={"q": "诉讼时效是多久"})
        assert "direct_citation" not in r2.json()["retrieval_meta"]
