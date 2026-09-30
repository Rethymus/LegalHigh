# -*- coding: utf-8 -*-
"""QA 证据收据测试（R467，verification-gate staged-receipt 模式实施）。

钉四个口径：①各工件形状的诚实解析（shots/a11y/narrow/selfcheck → pass/fail）；
②确定性（同工件集同哈希，工件变化→哈希变化）；③strict 口径——missing/fail 均判败
（证据缺失≠通过）；④端到端：真实 docs/qa-evidence 工件在仓库内应全 pass（本仓现状）。
"""
import json
import sys
from pathlib import Path

SERVER = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SERVER))
sys.path.insert(0, str(SERVER / "scripts"))

from qa_receipt import build_receipt, main  # noqa: E402


def _mk(evidence: Path, **files):
    evidence.mkdir(parents=True, exist_ok=True)
    for name, content in files.items():
        (evidence / name).write_text(json.dumps(content, ensure_ascii=False), encoding="utf-8")
    return evidence


def test_receipt_parses_all_four_gates(tmp_path):
    ev = _mk(tmp_path / "ev",
             **{"report.json": [{"name": "01", "consoleErrors": [], "pageErrors": [], "failedRequests": []}],
                "qa-a11y-report.json": [{"route": "r1", "smallTargets": [], "obscuredFocus": []}],
                "qa-narrow-report.json": {"routes": [{"name": "n1", "violations": []}]},
                "corpus_selfcheck_2026-10-01.json": {"problems": []}})
    r = build_receipt(ev)
    assert [g["status"] for g in r["gates"]] == ["pass"] * 4
    assert r["gates"][0]["routes"] == 1


def test_receipt_reports_failures_honestly(tmp_path):
    ev = _mk(tmp_path / "ev",
             **{"report.json": [{"name": "01", "consoleErrors": ["x"], "pageErrors": [], "failedRequests": []}],
                "qa-a11y-report.json": [{"route": "r1", "smallTargets": ["btn"], "obscuredFocus": []}]})
    r = build_receipt(ev)
    st = {g["gate"]: g["status"] for g in r["gates"]}
    assert st["browser_sweep"] == "fail" and st["a11y"] == "fail"
    assert st["narrow"] == "missing" and st["corpus_selfcheck"] == "missing", "缺工件=missing，不冒充通过"


def test_receipt_deterministic_and_sensitive(tmp_path):
    ev = _mk(tmp_path / "ev", **{"report.json": [{"name": "01", "consoleErrors": [], "pageErrors": [], "failedRequests": []}]})
    a = build_receipt(ev)
    b = build_receipt(ev)
    assert a["receipt_sha256"] == b["receipt_sha256"]
    (ev / "qa-a11y-report.json").write_text(json.dumps([{"route": "r", "smallTargets": ["x"], "obscuredFocus": []}]), encoding="utf-8")
    assert build_receipt(ev)["receipt_sha256"] != a["receipt_sha256"], "工件变化必须反映到哈希"


def test_strict_semantics_missing_is_not_pass(tmp_path):
    """strict 口径：missing/unknown 与 fail 同判（证据缺失≠通过）。"""
    ev = _mk(tmp_path / "ev", **{"report.json": [{"name": "01", "consoleErrors": [], "pageErrors": [], "failedRequests": []}]})
    r = build_receipt(ev)
    non_pass = [g for g in r["gates"] if g["status"] != "pass"]
    assert non_pass and all(g["status"] == "missing" for g in non_pass), "只有 report 时其余门应为 missing"
    # main 的 strict 判定式与该口径一致：任一非 pass 即退出 1
    assert any(g["status"] != "pass" for g in r["gates"])


def test_repo_evidence_receipt_all_pass():
    """仓库现态：最近一次全量 QA 的工件应全部 pass（作为常驻健康钉子）。"""
    ev = SERVER.parent / "docs" / "qa-evidence"
    if not (ev / "report.json").exists():
        return  # 无证据目录的精简环境跳过
    r = build_receipt(ev)
    non_pass = [g for g in r["gates"] if g["status"] != "pass"]
    assert not non_pass, f"仓库 QA 工件存在非 pass 门：{non_pass}"
