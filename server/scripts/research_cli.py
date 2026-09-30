# -*- coding: utf-8 -*-
"""研究 CLI（R464，opencaselaw「research CLI + 证据保全」模式的本项目实施）。

把一次检索的全过程固化为**可复核的证据收据**：查询词、时间点、命中条文（含官方
来源 URL/施行日期/版本状态）、受控组编排元数据与整份收据的 SHA-256——检索不是
一次性对话，而是可归档、可引用、可事后审计的证据事件。

设计纪律：
- 走产品检索路径（orchestrated_search，R143/R166 同一编排）——CLI 看到的就是产品给的；
- 收据确定性：同库同查询两次运行 SHA-256 一致（壁钟时间只入 meta 字段、不参与哈希）；
- 只读：不写任何业务库，收据落 docs/qa-evidence/research-cli/（QA 证据目录惯例）。

用法：
    python server/scripts/research_cli.py --query "定金能退吗" [--top-k 8] [--as-of 2020-06-01] [--out DIR]
"""
import argparse
import hashlib
import json
import sys
from datetime import date, datetime, timezone
from pathlib import Path

SERVER = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SERVER))

from app import cases as cases_mod  # noqa: E402
from app import retrieval_terms  # noqa: E402
from app import temporal as temporal_mod  # noqa: E402
from app import version_fulltext as version_fulltext_mod  # noqa: E402
from app.corpus import get_corpus  # noqa: E402

DEFAULT_OUT = SERVER.parent / "docs" / "qa-evidence" / "research-cli"


def build_case_receipt(query: str, top_k: int, level: str | None, bias: str) -> dict:
    """案例证据收据（R469）：指导性案例等可公开核验案例的检索固化。

    引用不变量同法条收据：每行携带来源 URL（source_url）与核验时间（source_accessed_at）；
    bias 影响排序不影响召回集（确定性，无随机）。"""
    hits = cases_mod.search_cases(query, level=level, bias=bias)[: max(1, int(top_k))]
    rows = [{
        "case_id": h["id"],
        "name": h["name"],
        "court": h["court"],
        "level": h["level"],
        "doc_type": h.get("doc_type") or "",
        "holding_excerpt": (h.get("holding") or "")[:200],
        "cause": h.get("cause") or "",
        "source_url": h.get("source_url"),
        "source_accessed_at": h.get("source_accessed_at"),
    } for h in hits]
    body = {
        "schema": "legalhigh-research-receipt/1",
        "kind": "cases",
        "query": query,
        "top_k": int(top_k),
        "level": level,
        "bias": bias,
        "hits": rows,
    }
    digest = hashlib.sha256(json.dumps(body, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()
    return {"receipt_sha256": digest,
            "generated_at": datetime.now(timezone.utc).isoformat(), **body}


def build_receipt(query: str, top_k: int, as_of: str | None) -> dict:
    """构造证据收据（纯函数主体；same corpus+query+as_of → same receipt body）。

    as_of 与产品端点 /api/search 同口径（R144/R465 对齐）：temporal 告知块 +
    逐命中 in_force_at_as_of 标记 + 适用历史版本「同条号对照」——只标记不排名，
    不冒充历史文本；CLI 收据与产品响应的时点语义保持一致。"""
    corpus = get_corpus()
    hits, meta = retrieval_terms.orchestrated_search(corpus, query, top_k=max(1, int(top_k)))
    t_block = temporal_mod.temporal_block(query, as_of)
    as_of_ref = t_block.get("as_of") if t_block else None
    rows = []
    for h in hits:
        row = {
            "law_id": h["law_id"],
            "law_title": h["law_title"],
            "no": h["no"],
            "sub": h.get("sub") or "",
            "label": h["label"],
            "excerpt": h["text"][:200],
            "status": h["law_status"],
            "effective_date": h.get("effective_date"),
            "source_url": h.get("source_url"),
            "score": h.get("score"),
            "matched_groups": h.get("matched_groups") or [],
        }
        if t_block:
            # 时间上下文存在才带标记（契约与 /api/search 一致）
            row["in_force_at_as_of"] = temporal_mod.in_force_at(h.get("effective_date"), as_of_ref)
            hist = version_fulltext_mod.historical_for_card(h["law_id"], as_of_ref, h["no"], h.get("sub"))
            if hist:
                row["historical_version"] = hist
        rows.append(row)
    body = {
        "schema": "legalhigh-research-receipt/1",
        "query": query,
        "top_k": int(top_k),
        "as_of": as_of,
        "corpus": {"laws": len(corpus.laws), "articles": len(corpus.articles)},
        "retrieval_meta": meta,
        "temporal": t_block,
        "hits": rows,
    }
    digest = hashlib.sha256(json.dumps(body, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()
    # 壁钟时间只入信封、不参与哈希——同库同查询两次运行哈希一致（可复核性优先）
    return {"receipt_sha256": digest, "generated_at": datetime.now(timezone.utc).isoformat(), **body}


def main() -> int:
    ap = argparse.ArgumentParser(description="LegalHigh 研究 CLI：检索并固化证据收据")
    ap.add_argument("--query", required=True, help="检索查询（口语或法言法语均可）")
    ap.add_argument("--top-k", type=int, default=8)
    ap.add_argument("--as-of", default=None, help="时点查证日期（YYYY-MM-DD，可选，仅 statutes 模式）")
    ap.add_argument("--mode", choices=["statutes", "cases"], default="statutes")
    ap.add_argument("--level", default=None, help="案例层级过滤（cases 模式，如 指导性案例）")
    ap.add_argument("--bias", default="balanced", help="案例排序偏向（cases 模式：balanced/facts/reasoning）")
    ap.add_argument("--out", default=None, help="收据输出目录（默认 docs/qa-evidence/research-cli）")
    args = ap.parse_args()

    query = (args.query or "").strip()
    if not query:
        print("错误：--query 不能为空。")
        return 2
    if args.mode == "cases":
        receipt = build_case_receipt(query, args.top_k, args.level, args.bias)
    else:
        receipt = build_receipt(query, args.top_k, args.as_of)
    out_dir = Path(args.out) if args.out else DEFAULT_OUT
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = date.today().isoformat()
    slug = hashlib.sha256(query.encode("utf-8")).hexdigest()[:10]
    path = out_dir / f"receipt-{stamp}-{slug}.json"
    path.write_text(json.dumps(receipt, ensure_ascii=False, indent=1), encoding="utf-8", newline="\n")

    hits = receipt["hits"]
    print(f"收据：{path}")
    print(f"查询：{query}　命中 {len(hits)} 条（模式：{receipt.get('kind', 'statutes')}）")
    for h in hits[:5]:
        if "law_title" in h:
            print(f"  {h['law_title']} {h['label']}　{h['status']}　{h['source_url']}")
        else:
            print(f"  {h['name']}　{h['level']}　{h['court']}　{h['source_url']}")
    print(f"SHA-256：{receipt['receipt_sha256']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
