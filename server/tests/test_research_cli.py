# -*- coding: utf-8 -*-
"""研究 CLI 证据收据测试（R464，opencaselaw research-CLI 模式实施）。

钉三个口径：①收据结构完整（schema/编排元数据/命中含来源 URL 与施行日期）；
②确定性——同库同查询两次构建 SHA-256 一致（壁钟时间只入信封不参与哈希）；
③subprocess 端到端——收据文件落盘且自述哈希=文件内容重算哈希。
"""
import hashlib
import json
import subprocess
import sys
from pathlib import Path

SERVER = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SERVER))
sys.path.insert(0, str(SERVER / "scripts"))

from research_cli import build_receipt  # noqa: E402


def test_receipt_structure_and_citations():
    r = build_receipt("定金能退吗", 8, None)
    assert r["schema"] == "legalhigh-research-receipt/1"
    assert r["hits"], "口语查询应命中条文"
    for h in r["hits"]:
        assert h["source_url"], "命中行必须携带官方来源 URL（引用不变量）"
        assert h["effective_date"] is not None and h["status"], "版本/施行字段随行"
    assert r["retrieval_meta"]["method"] in ("bm25-char-bigram", "bm25-controlled-groups")


def test_receipt_deterministic_same_query_same_hash():
    a = build_receipt("试用期工资不得低于多少", 5, "2020-06-01")
    b = build_receipt("试用期工资不得低于多少", 5, "2020-06-01")
    assert a["receipt_sha256"] == b["receipt_sha256"], "同库同查询两次运行哈希必须一致"
    assert a["generated_at"] != b["generated_at"], "壁钟时间在信封中但不参与哈希"


def test_receipt_subprocess_end_to_end(tmp_path):
    r = subprocess.run(
        [sys.executable, str(SERVER / "scripts" / "research_cli.py"),
         "--query", "试用期被开除有补偿吗", "--top-k", "5", "--out", str(tmp_path)],
        capture_output=True, text=True, timeout=180, cwd=str(SERVER))
    assert r.returncode == 0, r.stderr[-300:]
    files = list(tmp_path.glob("receipt-*.json"))
    assert len(files) == 1
    receipt = json.loads(files[0].read_text(encoding="utf-8"))
    # 自述哈希=按哈希口径重算（剔除信封字段 receipt_sha256 与 generated_at 后重算正文哈希）
    body = {k: v for k, v in receipt.items() if k not in ("receipt_sha256", "generated_at")}
    digest = hashlib.sha256(json.dumps(body, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()
    assert digest == receipt["receipt_sha256"], "收据哈希必须与内容自洽"


def test_empty_query_fails(tmp_path):
    r = subprocess.run(
        [sys.executable, str(SERVER / "scripts" / "research_cli.py"), "--query", "  ", "--out", str(tmp_path)],
        capture_output=True, text=True, timeout=120, cwd=str(SERVER))
    assert r.returncode == 2
