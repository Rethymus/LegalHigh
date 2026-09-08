# -*- coding: utf-8 -*-
"""语料完整性测试：不编造的硬门——条数、连续性、关键条文内容断言。"""
import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.corpus import LawCorpus  # noqa: E402

EXPECTED = {
    "civl-2020": 1260,
    "cl-2013": 63,
    "lcl-2012": 98,
    "ll-2017": 60,
    "ecom-2018": 89,
    "pcl-2023": 306,
    "crpl-imp-2024": 53,
    "genai-2023": 24,
    "pipl-2021": 74,
    "legal-aid-2021": 71,
    "admin-review-2023": 90,
    "admin-litigation-2017": 103,
}


def make_corpus():
    return LawCorpus()


def test_corpus_shape():
    c = make_corpus()
    assert len(c.laws) == 14
    assert len(c.articles) == 2380
    for law_id, n in EXPECTED.items():
        got = sum(1 for a in c.articles if a["law_id"] == law_id)
        assert got == n, f"{law_id}: {got} != {n}"


def test_pcl_key_articles():
    """民诉法关键条文内容锚点（协议管辖）——新增语料的内容断言。"""
    c = make_corpus()
    a35 = c.get_article("pcl-2023", 35)
    assert a35 and "书面协议" in a35["text"] and "管辖" in a35["text"]
    assert a35["law_status"] and a35["effective_date"] == "2024-01-01" and a35["source_url"]
    assert "现行有效" in a35["law_status"]


def test_articles_contiguous_and_cited_metadata():
    c = make_corpus()
    for law_id, n in EXPECTED.items():
        nos = [a["no"] for a in c.articles if a["law_id"] == law_id]
        assert nos == list(range(1, n + 1)), f"{law_id} 编号不连续"
        assert all(a["source_url"] for a in c.articles if a["law_id"] == law_id)
        assert all(a["law_status"] for a in c.articles if a["law_id"] == law_id)


def test_key_articles_content():
    """关键条文内容断言（内容均来自证据快照抽取，禁止漂移）。"""
    c = make_corpus()
    a585 = c.get_article("civl-2020", 585)
    assert "过分高于造成的损失" in a585["text"] and "适当减少" in a585["text"]
    a25 = c.get_article("cl-2013", 25)
    assert "七日内退货" in a25["text"] and "无需说明理由" in a25["text"]
    a10 = c.get_article("crpl-imp-2024", 10)
    assert "自动展期、自动续费" in a10["text"] and "显著方式提请消费者注意" in a10["text"]
    a13 = c.get_article("ll-2017", 13)
    assert "不得以律师名义" in a13["text"]
    a19 = c.get_article("lcl-2012", 19)
    assert "试用期不得超过六个月" in a19["text"]


def test_citation_object_carries_invariants():
    c = make_corpus()
    cite = c.citation_of("civl-2020", 497)
    for k in ("law_title", "article_no", "article_label", "text", "status", "effective_date", "effective_date_evidence", "source_url"):
        assert k in cite and cite[k]
    assert cite["effective_date_evidence"]["url"].startswith("https://")
    assert cite["effective_date_evidence"]["grade"] in {"强", "中"}
    try:
        c.citation_of("civl-2020", 99999)
        assert False, "越界条文应报错"
    except KeyError:
        pass


def test_manifest_snapshot_and_output_hashes_match():
    """构建清单绑定当前证据快照与生成 JSON，防止静默替换数据。"""
    root = Path(__file__).resolve().parents[2]
    manifest = json.loads((root / "server" / "data" / "laws" / "manifest.json").read_text(encoding="utf-8"))
    evidence_root = (root / "docs" / "research" / "evidence").resolve()
    for item in manifest["laws"]:
        snapshot = (root / item["snapshot"]).resolve()
        assert snapshot.is_relative_to(evidence_root)
        assert len(item["snapshot_sha256"]) == 64
        actual_snapshot = hashlib.sha256(snapshot.read_bytes()).hexdigest()
        assert actual_snapshot == item["snapshot_sha256"]
        law_path = root / "server" / "data" / "laws" / f"{item['law_id']}.json"
        assert hashlib.sha256(law_path.read_bytes()).hexdigest() == item["output_sha256"]
        law = json.loads(law_path.read_text(encoding="utf-8"))
        assert law["source"]["sha256"] == item["snapshot_sha256"]
        assert law["source"]["fetched_at"] == item["fetched_at"]
        evidence = law.get("effective_date_evidence") or {}
        # 日期依据可能在快照抓取后再次人工复核；两者语义不同，均须如实保留，
        # 但不能武断要求 accessed_at 早于 fetched_at。
        assert evidence.get("accessed_at")
    assert manifest["fetch_date"] == max(item["fetched_at"] for item in manifest["laws"])
