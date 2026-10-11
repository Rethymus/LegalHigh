# 从 server 证据快照语料导出前端静态数据（唯一合法入口；禁止手改 server/data/laws）
# 用法: server/.venv/Scripts/python.exe web/scripts/export_laws.py
# 产物：laws.json（法条全文）+ xrefs.json（法内交叉引用，同轮生成保证不漂移）
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "server" / "data" / "laws"
OUT = ROOT / "web" / "public" / "data" / "laws.json"  # 前端运行时 fetch 的唯一路径
XREFS_OUT = ROOT / "web" / "public" / "data" / "xrefs.json"

sys.path.insert(0, str(ROOT / "server"))
from lib.xrefs import build_xrefs  # noqa: E402  唯一实现，测试逐字节锁定（防一次性脚本再蒸发）

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
                {"no": a["no"], "sub": a.get("sub"), "label": a["label"], "chapter": a.get("chapter", ""), "text": a["text"]}
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

# 法内交叉引用：与 laws.json 同轮生成（防止一者更新另一者陈旧——2026-10-11
# 审计实锤：09-23 后入库的法律从未进入 xrefs）。逻辑唯一实现见 lib/xrefs.py。
xrefs = build_xrefs(laws_out)
XREFS_OUT.write_text(
    json.dumps(xrefs, ensure_ascii=False, separators=(",", ":")),
    encoding="utf-8",
    newline="\n",
)
print(
    "exported xrefs:", sum(len(v) for v in xrefs.values()), "refs across",
    len(xrefs), "laws ->", XREFS_OUT, XREFS_OUT.stat().st_size, "bytes",
)
