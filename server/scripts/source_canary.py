# -*- coding: utf-8 -*-
"""Source Drift canary（FLERF 报告 §42；known-gaps 白区 #5 落地，R164）。

对 Source Registry 中配置了 canary 的来源做在线结构指纹检测：
状态 200 + 期望标记齐全 + 粗粒度体积档位与上次相比无突变。
指纹异常 → 如实报 SOURCE_DEGRADED 并停止刷新建议（保留已验证快照），
绝不静默往语料写数据——本脚本只读诊断，不触碰 server/data/laws/。

纪律：
- 只访问 Source Registry 中 approved=true 且配置了 canary 的来源（LEGAL-005）；
- 永不绕过访问控制：被拦/超时/改版一律如实记 degraded（LEGAL-006）；
- 网络走 curl 子进程，Python 侧保持零网络导入（与 ARCH-001 同口径）；
  `--compressed` 为 R49 门户反爬教训（直连壳页先试压缩协商）；
- 显式手动运行，不在 CI 常态化外呼政府站点。

用法：
    python scripts/source_canary.py --all
    python scripts/source_canary.py --source gov_cn
    python scripts/source_canary.py --all --state <path> --report <path>
退出码：0 全部健康；2 任一 degraded；3 配置错误（无 canary 目标/注册表不可读）。
"""
import argparse
import datetime
import json
import pathlib
import subprocess
import sys

SERVER_DIR = pathlib.Path(__file__).resolve().parent.parent
DEFAULT_REGISTRY = SERVER_DIR / "data" / "source_registry.json"
DEFAULT_STATE = SERVER_DIR / "data" / "source_canary_state.json"
DEFAULT_REPORT = SERVER_DIR.parent / "docs" / "qa-evidence" / "source-canary.json"
USER_AGENT = "LegalHigh-canary/1 (prototype; contact: repo issues)"
SIZE_BUCKET = 4096  # 体积按 4KB 分档；健康判定容忍 ±1 档，突变 ≥2 档报 STRUCTURE_DRIFT


def fetch(url: str, timeout: int = 20) -> tuple[int, str]:
    """返回 (http_status, body)。网络错误抛 RuntimeError（由调用方记 degraded）。"""
    cp = subprocess.run(
        ["curl", "-sS", "-L", "--compressed", "-A", USER_AGENT,
         "--max-time", str(timeout), "-w", "\n@@LH_STATUS@@%{http_code}", url],
        capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=timeout + 10,
    )
    body, _, status = cp.stdout.rpartition("@@LH_STATUS@@")
    if not status.isdigit():
        raise RuntimeError(f"curl 失败：{cp.stderr.strip()[:200]}")
    return int(status), body


def fingerprint(html: str, markers: list[str]) -> dict:
    markers_ok = {m: (m in html) for m in markers}
    return {
        "markers_ok": markers_ok,
        "size_bucket": len(html) // SIZE_BUCKET,
        "markers_healthy": all(markers_ok.values()),
    }


def compare_with_previous(previous: dict | None, fp: dict) -> dict:
    drift = None
    if previous and isinstance(previous.get("size_bucket"), int):
        delta = abs(fp["size_bucket"] - previous["size_bucket"])
        if delta > 1:
            drift = f"体积档位突变 {previous['size_bucket']}→{fp['size_bucket']}（STRUCTURE_DRIFT）"
    return {"drift": drift, "healthy": fp["markers_healthy"] and drift is None}


def run_checks(registry: dict, fetch_fn, state: dict) -> tuple[list[dict], bool]:
    """对全部可 canary 来源执行检测，返回 (结果列表, 是否全部健康)。state 原地更新。"""
    results = []
    all_healthy = True
    checked_at = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    for s in registry.get("sources", []):
        canary = s.get("canary")
        if not canary or not (s.get("compliance") or {}).get("approved"):
            continue
        url, markers = canary["url"], canary.get("expect", [])
        try:
            status, html = fetch_fn(url)
            error = None
        except RuntimeError as exc:
            status, html, error = 0, "", str(exc)
        fp = fingerprint(html, markers)
        verdict = compare_with_previous(state.get(s["id"]), fp)
        healthy = status == 200 and verdict["healthy"]
        state[s["id"]] = {"checked_at": checked_at, "url": url,
                          "status": status, "size_bucket": fp["size_bucket"]}
        results.append({
            "source_id": s["id"], "url": url, "checked_at": checked_at,
            "status": status, "markers_ok": fp["markers_ok"],
            "size_bucket": fp["size_bucket"], "drift": verdict["drift"],
            "error": error, "healthy": healthy,
        })
        all_healthy = all_healthy and healthy
    return results, all_healthy


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Source Drift canary（只读诊断）")
    ap.add_argument("--all", action="store_true", help="检测注册表内全部 canary 目标")
    ap.add_argument("--source", action="append", default=[], help="只检测指定来源 id（可多次）")
    ap.add_argument("--registry", type=pathlib.Path, default=DEFAULT_REGISTRY)
    ap.add_argument("--state", type=pathlib.Path, default=DEFAULT_STATE)
    ap.add_argument("--report", type=pathlib.Path, default=DEFAULT_REPORT)
    ap.add_argument("--timeout", type=int, default=20)
    args = ap.parse_args(argv)

    try:
        registry = json.loads(args.registry.read_text(encoding="utf-8"))
    except OSError as exc:
        print(f"注册表不可读：{exc}", file=sys.stderr)
        return 3
    if args.source:
        wanted = set(args.source)
        registry = {**registry, "sources": [s for s in registry["sources"] if s["id"] in wanted]}
        if not registry["sources"]:
            print(f"未找到指定来源：{sorted(wanted)}", file=sys.stderr)
            return 3

    state = {}
    if args.state.exists():
        try:
            state = json.loads(args.state.read_text(encoding="utf-8"))
        except ValueError:
            state = {}  # 状态文件损坏按无历史处理，绝不因账本问题放过一次真实检测

    results, all_healthy = run_checks(registry, lambda u: fetch(u, args.timeout), state)
    args.state.parent.mkdir(parents=True, exist_ok=True)
    args.state.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps({
        "checked_at": results[0]["checked_at"] if results else None,
        "all_healthy": all_healthy, "results": results,
    }, ensure_ascii=False, indent=2), encoding="utf-8")

    for r in results:
        if r["healthy"]:
            print(f"OK       {r['source_id']} ({r['status']}, {r['size_bucket']} 档)")
        else:
            why = r["drift"] or r["error"] or f"标记缺失 {[m for m, ok in r['markers_ok'].items() if not ok]}"
            print(f"DEGRADED {r['source_id']}：{why}（SOURCE_DEGRADED——保留已验证快照，停止刷新并生成 parser repair 任务）")
    return 0 if all_healthy else 2


if __name__ == "__main__":
    sys.exit(main())
