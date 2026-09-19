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
import re
import subprocess
import sys

SERVER_DIR = pathlib.Path(__file__).resolve().parent.parent
DEFAULT_REGISTRY = SERVER_DIR / "data" / "source_registry.json"
DEFAULT_STATE = SERVER_DIR / "data" / "source_canary_state.json"
DEFAULT_REPORT = SERVER_DIR.parent / "docs" / "qa-evidence" / "source-canary.json"
DEFAULT_FULLTEXT_DIR = SERVER_DIR / "data" / "law_versions_fulltext"
USER_AGENT = "LegalHigh-canary/1 (prototype; contact: repo issues)"
SIZE_BUCKET = 4096  # 体积按 4KB 分档；健康判定容忍 ±1 档，突变 ≥2 档报 STRUCTURE_DRIFT

sys.path.insert(0, str(SERVER_DIR))
from build_corpus import clean_html_to_text  # noqa: E402  # stdlib-only 模块（CI 可用）


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


def pick_deep_targets(fulltext_dir, sample: int, approved_hosts: set[str] | None = None) -> list[dict]:
    """逐法条页（文档级）canary 目标：历史全文来源页，按 host 轮转确定性抽样。

    抽样纪律：同一 URL 去重；按 (law_id, version_id) 排序后按 host 轮转取样，
    保证一次深检覆盖尽量多的不同来源站点而非同站多页；提供 approved_hosts 时
    未批准 host 在抽样阶段即剔除（不浪费名额），run_deep 仍保留防御性拒绝。
    """
    docs: list[dict] = []
    seen_urls: set[str] = set()
    for p in sorted(pathlib.Path(fulltext_dir).glob("*/*.json")):
        try:
            d = json.loads(p.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        url = (d.get("source") or {}).get("url") or ""
        if not url or url in seen_urls:
            continue
        host = url.split("/")[2] if url.startswith("http") else ""
        if approved_hosts is not None and host not in approved_hosts:
            continue
        seen_urls.add(url)
        docs.append({
            "key": f"deep:{d.get('law_id')}/{d.get('version_id')}",
            "title": d.get("law_title") or "",
            "url": url,
            "host": host,
        })
    if sample <= 0:
        return []
    by_host: dict[str, list[dict]] = {}
    for d in docs:
        by_host.setdefault(d["host"], []).append(d)
    picked: list[dict] = []
    hosts = sorted(by_host)
    while len(picked) < sample and hosts:
        for h in hosts:
            if by_host[h] and len(picked) < sample:
                picked.append(by_host[h].pop(0))
        hosts = [h for h in hosts if by_host[h]]
    return picked


def run_deep(deep_targets: list[dict], registry: dict, fetch_fn, state: dict) -> tuple[list[dict], bool]:
    """文档级指纹：HTTP 200 + 法条标题标记在位。host 必须是注册表 approved 来源。"""
    approved_hosts = {s.get("host") for s in registry.get("sources", [])
                      if (s.get("compliance") or {}).get("approved")}
    results = []
    all_healthy = True
    checked_at = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    for t in deep_targets:
        if t["host"] not in approved_hosts:
            results.append({"source_id": t["key"], "url": t["url"], "checked_at": checked_at,
                            "status": 0, "markers_ok": {}, "size_bucket": None, "drift": None,
                            "error": "host 未在 Source Registry approved 列表——拒绝探测（LEGAL-005）",
                            "healthy": False})
            all_healthy = False
            continue
        try:
            status, html = fetch_fn(t["url"])
            error = None
        except RuntimeError as exc:
            status, html, error = 0, "", str(exc)
        fp = fingerprint(html, [t["title"]] if t["title"] else [])
        healthy = status == 200 and fp["markers_healthy"]
        state[t["key"]] = {"checked_at": checked_at, "url": t["url"],
                           "status": status, "size_bucket": fp["size_bucket"]}
        results.append({
            "source_id": t["key"], "url": t["url"], "checked_at": checked_at,
            "status": status, "markers_ok": fp["markers_ok"],
            "size_bucket": fp["size_bucket"], "drift": None,
            "error": error, "healthy": healthy,
        })
        all_healthy = all_healthy and healthy
    return results, all_healthy


def pick_article_targets(fulltext_dir, sample: int, approved_hosts: set[str] | None = None,
                         positions: str = "middle") -> list[dict]:
    """逐「条」级 canary 目标：从历史全文中确定性抽取具体条文做在线存在性探测。

    positions 抽样位：
    - "middle"：每文档取中位条（避开首条导语与末条附则/尾注）；
    - "ends"：每文档取首条+末条（首条=导语区边界、末条=附则/尾注区边界——
      两端是解析器最易吞并/粘连的位置，R45 教训）；
    文档间按 host 轮转，直至凑满 sample；提供 approved_hosts 时未批准 host 在
    抽样阶段剔除。
    """
    docs: list[dict] = []
    seen_urls: set[str] = set()
    for p in sorted(pathlib.Path(fulltext_dir).glob("*/*.json")):
        try:
            d = json.loads(p.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        url = (d.get("source") or {}).get("url") or ""
        if not url or url in seen_urls:
            continue
        host = url.split("/")[2] if url.startswith("http") else ""
        if approved_hosts is not None and host not in approved_hosts:
            continue
        articles = d.get("articles") or []
        if not articles:
            continue
        seen_urls.add(url)
        if positions == "ends":
            picks = [articles[0], articles[-1]]
        else:
            picks = [articles[len(articles) // 2]]
        for mid in picks:
            docs.append({
                "key": f"deep-art:{d.get('law_id')}/{d.get('version_id')}#{mid['no']}{mid.get('sub') or ''}",
                "title": d.get("law_title") or "",
                "url": url,
                "host": host,
                "law_id": d.get("law_id"), "version_id": d.get("version_id"),
                "no": mid["no"], "sub": mid.get("sub"),
                "probe_text": re.sub(r"[\s\u3000\xa0]+", "", mid["text"])[:80],
            })
    if sample <= 0:
        return []
    by_host: dict[str, list[dict]] = {}
    for d in docs:
        by_host.setdefault(d["host"], []).append(d)
    picked: list[dict] = []
    hosts = sorted(by_host)
    while len(picked) < sample and hosts:
        for h in hosts:
            if by_host[h] and len(picked) < sample:
                picked.append(by_host[h].pop(0))
        hosts = [h for h in hosts if by_host[h]]
    return picked


def run_article_targets(targets: list[dict], registry: dict, fetch_fn, state: dict) -> tuple[list[dict], bool]:
    """逐条指纹：同一 URL 只取一次，用本仓解析器清洗页面后探测条文本是否仍在。"""
    approved_hosts = {s.get("host") for s in registry.get("sources", [])
                      if (s.get("compliance") or {}).get("approved")}
    results = []
    all_healthy = True
    checked_at = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    pages: dict[str, str] = {}
    for t in targets:
        if t["host"] not in approved_hosts:
            results.append({"source_id": t["key"], "url": t["url"], "checked_at": checked_at,
                            "status": 0, "markers_ok": {}, "size_bucket": None, "drift": None,
                            "error": "host 未在 Source Registry approved 列表——拒绝探测（LEGAL-005）",
                            "healthy": False})
            all_healthy = False
            continue
        if t["url"] not in pages:
            try:
                status, html = fetch_fn(t["url"])
                pages[t["url"]] = re.sub(r"[\s\u3000\xa0]+", "", clean_html_to_text(html)) if status == 200 else ""
            except RuntimeError as exc:
                pages[t["url"]] = ""
                results.append({"source_id": t["key"], "url": t["url"], "checked_at": checked_at,
                                "status": 0, "markers_ok": {}, "size_bucket": None, "drift": None,
                                "error": str(exc), "healthy": False})
                all_healthy = False
                continue
        page_norm = pages[t["url"]]
        present = bool(t["probe_text"]) and t["probe_text"] in page_norm
        healthy = present
        state[t["key"]] = {"checked_at": checked_at, "url": t["url"], "present": present}
        results.append({
            "source_id": t["key"], "url": t["url"], "checked_at": checked_at,
            "status": 200, "markers_ok": {f"条文{t['no']}{t['sub'] or ''}在页": present},
            "size_bucket": None, "drift": None, "error": None, "healthy": healthy,
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
    ap.add_argument("--deep", type=int, default=0,
                    help="文档级 canary 抽样数（按 host 轮转取历史全文来源页；0=关闭）")
    ap.add_argument("--deep-articles", type=int, default=0,
                    help="逐条级 canary 抽样数（历史全文来源页内探测具体条文仍在；0=关闭）")
    ap.add_argument("--article-positions", choices=["middle", "ends"], default="middle",
                    help="逐条抽样位：middle=中位条（默认）；ends=首条+末条（解析边界敏感区）")
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
    if args.deep > 0:
        approved = {s.get("host") for s in registry.get("sources", [])
                    if (s.get("compliance") or {}).get("approved")}
        deep = pick_deep_targets(DEFAULT_FULLTEXT_DIR, args.deep, approved)
        deep_results, deep_ok = run_deep(deep, registry, lambda u: fetch(u, args.timeout), state)
        results.extend(deep_results)
        all_healthy = all_healthy and deep_ok
    if args.deep_articles > 0:
        approved = {s.get("host") for s in registry.get("sources", [])
                    if (s.get("compliance") or {}).get("approved")}
        art_targets = pick_article_targets(DEFAULT_FULLTEXT_DIR, args.deep_articles, approved,
                                           positions=args.article_positions)
        art_results, art_ok = run_article_targets(art_targets, registry, lambda u: fetch(u, args.timeout), state)
        results.extend(art_results)
        all_healthy = all_healthy and art_ok
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
