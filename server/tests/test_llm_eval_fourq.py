# -*- coding: utf-8 -*-
"""四问评测 harness 离线件测试（R460）：合同拼装纯函数的确定性/切分/规模，
以及 --fourq 模式的无密钥拒绝路径（默认关闭原则在 harness 层同样成立）。"""
import subprocess
import sys
from pathlib import Path

SERVER = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SERVER))
sys.path.insert(0, str(SERVER / "scripts"))

from llm_eval import build_fourq_contracts  # noqa: E402


def test_build_fourq_contracts_deterministic_and_segmented():
    a = build_fourq_contracts(3)
    b = build_fourq_contracts(3)
    assert [c["id"] for c in a] == ["fourq-1", "fourq-2", "fourq-3"]
    assert [c["id"] for c in a] == [c["id"] for c in b], "固定种子必须可复现"
    for c in a:
        clauses = c["result"]["clauses"]
        numbered = [x for x in clauses if x["label"].startswith("第")]
        assert len(numbered) == 5, "默认每份合同 5 条编号条款（金标正例拼装；前导说明段为未编号段落）"
        assert c["result"]["findings"], "金标正例拼装的合同应触发规则引擎发现"


def test_build_fourq_contracts_respects_n():
    assert len(build_fourq_contracts(1)) == 1
    ids = [c["id"] for c in build_fourq_contracts(0)]
    assert ids == [], "n=0 返回空（--fourq 0=不跑）"


def test_fourq_mode_without_key_exits_nonzero(tmp_path, monkeypatch):
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    r = subprocess.run(
        [sys.executable, str(SERVER / "scripts" / "llm_eval.py"),
         "--provider", "deepseek", "--model", "deepseek-chat", "--sample", "1", "--fourq", "2"],
        capture_output=True, text=True, timeout=120, cwd=str(SERVER))
    assert r.returncode == 1
    assert "密钥" in (r.stdout + r.stderr), "无密钥必须显式拒绝（默认关闭原则）"
