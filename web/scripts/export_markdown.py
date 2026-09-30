# 全语料 markdown 导出（v7 S1-T1 开放数据）：与 export_laws 同源（server/data/laws，
# 清洁层已去污染），逐法生成带官方元数据头的 .md 文件，供生态消费与 llms 联动。
# 输出：web/public/data/laws-md/{law_id}.md（Pages 静态可下载）+ 索引 laws-md/README.md
# 用法: python web/scripts/export_markdown.py
# 纪律：S1-T1 开工前已验证导出内容 = 语料原文（清洁层后），不得新增任何改写/截断逻辑。
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "server" / "data" / "laws"
OUT = ROOT / "web" / "public" / "data" / "laws-md"

DISCLAIMER = (
    "> 来源：LegalHigh 语料（{count} 部现行法律，经官方数据库结构核验与独立转录链全量文本比对）。\n"
    "> 本文为法条原文的机器转录，**不构成法律意见**；引用请以官方公报为准。\n"
    "> 检索版本：{gbrq}　施行：{sxrq}　制定机关：{organ}\n"
)


def export_law(path: Path, law_count: int) -> dict:
    d = json.loads(path.read_text(encoding="utf-8"))
    prom = d.get("promulgation") or {}
    lines = [
        f"# {d['title']}",
        "",
        DISCLAIMER.format(
            count=law_count,
            gbrq=prom.get("date", ""), sxrq=d.get("effective_date", ""), organ=prom.get("organ", "")
        ),
        "",
        f"- 状态：{d.get('status', '')}",
        f"- 公布：{prom.get('date', '')}（{prom.get('organ', '')}）",
        f"- 施行：{d.get('effective_date', '')}",
    ]
    if d.get("promulgation_instrument"):
        lines.append(f"- 公布载体：{d['promulgation_instrument']}")
    src = d.get("source") or {}
    if src.get("url"):
        lines.append(f"- 官方来源：{src['url']}")
    if d.get("authority_pointer"):
        lines.append(f"- 权威核对：{d['authority_pointer']}")
    lines.append("")
    for a in d["articles"]:
        sub = a.get("sub") or ""
        label = a["label"]
        lines.append(f"**{label}**　{a['text']}")
        lines.append("")
    return {
        "law_id": d["law_id"],
        "doc": "\n".join(lines).rstrip() + "\n",
        "count": len(d["articles"]),
    }


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((SRC / "manifest.json").read_text(encoding="utf-8"))
    law_count = len(manifest["laws"])
    index = []
    total_articles = 0
    for entry in manifest["laws"]:
        r = export_law(SRC / (entry["law_id"] + ".json"), law_count)
        (OUT / (r["law_id"] + ".md")).write_text(r["doc"], encoding="utf-8", newline="\n")
        d = json.loads((SRC / (entry["law_id"] + ".json")).read_text(encoding="utf-8"))
        index.append({"id": r["law_id"], "title": d["title"], "articles": r["count"]})
        total_articles += r["count"]
    # 陈旧文件清理（R432）：导出曾「只写不清」——法律被新版本替代（如 food-safety-2021
    # →2025）后旧 .md 永久残留，与 laws.json 失同步。导出=镜像，不在当前 manifest 的文件删除。
    current = {f"{it['id']}.md" for it in index} | {"README.md"}
    stale = [p.name for p in OUT.glob("*.md") if p.name not in current]
    for name in stale:
        (OUT / name).unlink()
    lines = [
        "# LegalHigh 语料 · markdown 导出",
        "",
        "每部法律一个文件（{law_id}.md），内容与 `data/laws.json` 同源（清洁层后语料原文，无改写）。",
        "",
        "| law_id | 标题 | 条文数 |",
        "|---|---|---|",
    ]
    for it in index:
        lines.append(f"| [{it['title']}](./{it['id']}.md) | {it['id']} | {it['articles']} |")
    lines += [
        "",
        f"共 {len(index)} 部 {total_articles} 条。法条文本不受著作权保护（著作权法第五条）；",
        "整理成果以 CC0 1.0 Universal 发布（决策 19，2026-09-30；全文见仓库 LICENSES/DATA-CC0-1.0.txt）。",
        "引用请以官方公报为准。本导出不构成法律意见。",
    ]
    (OUT / "README.md").write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
    print(f"exported {len(index)} laws / {total_articles} articles -> {OUT}" + (f" (removed stale: {', '.join(sorted(stale))})" if stale else ""))


if __name__ == "__main__":
    main()
