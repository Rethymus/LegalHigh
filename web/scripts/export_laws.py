# 从 server 证据快照语料导出前端静态数据（唯一合法入口；禁止手改 server/data/laws）
# 用法: python web/scripts/export_laws.py
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "server" / "data" / "laws"
OUT = ROOT / "web" / "public" / "data" / "laws.json"  # 前端运行时 fetch 的唯一路径

laws_out = []
manifest = json.loads((SRC / "manifest.json").read_text(encoding="utf-8"))
for entry in manifest["laws"]:
    d = json.loads((SRC / (entry["law_id"] + ".json")).read_text(encoding="utf-8"))
    prom = d.get("promulgation") or {}
    laws_out.append(
        {
            "id": d["law_id"],
            "title": d["title"],
            "status": d.get("status", ""),
            "organ": prom.get("organ", ""),
            "promulgationDate": prom.get("date", ""),
            "instrument": d.get("promulgation_instrument", ""),
            "effectiveDate": d.get("effective_date", ""),
            "effectiveDateEvidence": d.get("effective_date_evidence"),
            "sourceUrl": (d.get("source") or {}).get("url", ""),
            "authority": d.get("authority_pointer", ""),
            "articles": [
                {"no": a["no"], "label": a["label"], "chapter": a.get("chapter", ""), "text": a["text"]}
                for a in d["articles"]
            ],
        }
    )

OUT.write_text(
    json.dumps(
        {
            "builtAt": manifest["built_at"],
            "fetchDate": manifest["fetch_date"],
            "note": "文本来自证据快照语料（server/build_corpus.py 构建）；禁止在前端数据中手写法条。",
            "laws": laws_out,
        },
        ensure_ascii=False,
        separators=(",", ":"),
    ),
    encoding="utf-8",
    newline="\n",
)
print("exported", len(laws_out), "laws ->", OUT, OUT.stat().st_size, "bytes")
