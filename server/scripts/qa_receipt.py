# -*- coding: utf-8 -*-
"""QA 证据收据（R467，legal-skills/verification-gate「staged receipt」模式实施）。

把一次全量 QA 的各工件（qa_shots report.json / a11y / narrow / corpus_selfcheck /
final_verify 结果）聚合为**一份机器可消费的分层收据**：每道门一行 status（pass /
fail / missing / unknown），整体 SHA-256。核心口径沿用 verification-gate：
「编译过 ≠ 功能可用」「证据缺失 ≠ 通过」——missing/unknown 的门在 --strict 下照常失败，
不靠沉默过关。

确定性：同工件集 → 同哈希（壁钟时间只入信封）。
用法：
    python server/scripts/qa_receipt.py [--evidence docs/qa-evidence] [--strict]
退出码：--strict 下任一门非 pass → 1；否则 0（非 strict 恒 0，收据如实标注）。
"""
import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCHEMA = "legalhigh-qa-receipt/1"


def _load(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001 — 损坏/缺失工件如实标注，不猜
        return None


def _shots_status(report) -> dict:
    if report is None:
        return {"gate": "browser_sweep", "status": "missing"}
    if not isinstance(report, list) or not report:
        return {"gate": "browser_sweep", "status": "unknown", "detail": "report.json 结构异常"}
    bad = [it.get("name", "?") for it in report
           if it.get("consoleErrors") or it.get("pageErrors") or it.get("failedRequests")]
    n = len(report)
    return {"gate": "browser_sweep", "status": "pass" if not bad else "fail",
            "routes": n, "failed_routes": bad[:6]}


def _a11y_status(report) -> dict:
    if report is None:
        return {"gate": "a11y", "status": "missing"}
    if not isinstance(report, list) or not report:
        return {"gate": "a11y", "status": "unknown", "detail": "结构异常"}
    bad = [it.get("route", "?") for it in report if it.get("smallTargets") or it.get("obscuredFocus")]
    return {"gate": "a11y", "status": "pass" if not bad else "fail",
            "routes": len(report), "violated_routes": bad[:6]}


def _narrow_status(report) -> dict:
    if report is None:
        return {"gate": "narrow", "status": "missing"}
    routes = (report or {}).get("routes")
    if routes is None:
        return {"gate": "narrow", "status": "unknown", "detail": "结构异常"}
    bad = [it.get("name", "?") for it in routes if it.get("violations")]
    return {"gate": "narrow", "status": "pass" if not bad else "fail",
            "routes": len(routes), "violated_routes": bad[:6]}


def _selfcheck_status(latest_path: Path | None) -> dict:
    if latest_path is None:
        return {"gate": "corpus_selfcheck", "status": "missing"}
    data = _load(latest_path)
    if data is None:
        return {"gate": "corpus_selfcheck", "status": "unknown", "detail": "结构异常"}
    problems = data.get("problems")
    if not isinstance(problems, list):
        return {"gate": "corpus_selfcheck", "status": "unknown", "detail": "problems 字段缺失"}
    return {"gate": "corpus_selfcheck", "status": "pass" if not problems else "fail",
            "problems": len(problems)}


def build_receipt(evidence: Path) -> dict:
    gates = []
    report = _load(evidence / "report.json")
    gates.append(_shots_status(report))
    gates.append(_a11y_status(_load(evidence / "qa-a11y-report.json")))
    gates.append(_narrow_status(_load(evidence / "qa-narrow-report.json")))
    selfchecks = sorted(evidence.glob("corpus_selfcheck_*.json"))
    gates.append(_selfcheck_status(selfchecks[-1] if selfchecks else None))
    body = {"schema": SCHEMA, "evidence_dir": str(evidence), "gates": gates}
    digest = hashlib.sha256(json.dumps(body, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()
    return {"receipt_sha256": digest,
            "generated_at": datetime.now(timezone.utc).isoformat(), **body}


def main() -> int:
    ap = argparse.ArgumentParser(description="聚合 QA 工件为分层证据收据")
    ap.add_argument("--evidence", default=str(ROOT / "docs" / "qa-evidence"))
    ap.add_argument("--strict", action="store_true", help="任一门非 pass 即退出 1")
    args = ap.parse_args()
    receipt = build_receipt(Path(args.evidence))
    out = Path(args.evidence) / "qa-receipt.json"
    out.write_text(json.dumps(receipt, ensure_ascii=False, indent=1), encoding="utf-8", newline="\n")
    for g in receipt["gates"]:
        print(f"  [{g['status']:>7}] {g['gate']}"
              + (f" —— {g.get('detail', '')}" if g.get("detail") else "")
              + (f"（失败：{', '.join(g['failed_routes'])}）" if g.get("failed_routes")
                 else (f"（违规：{', '.join(g['violated_routes'])}）" if g.get("violated_routes") else "")))
    print(f"收据：{out}　SHA-256：{receipt['receipt_sha256'][:16]}…")
    failed = [g for g in receipt["gates"] if g["status"] != "pass"]
    if args.strict and failed:
        print(f"STRICT 门失败：{len(failed)} 道门非 pass（missing/unknown 也算失败——证据缺失≠通过）")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
