# -*- coding: utf-8 -*-
"""flk 人工抽查样本生成器（S1-T1；决策 6A 口径：抽查 ≥10% + 字段全量）。

产出一份人工抽查工作单（markdown）：每部法律分层抽首条/末条/金标高频条/确定性
随机条，强制覆盖 pcl-2023 第 300–306 条（末条疑点区，见 build_corpus 注释）。
抽查动作本身必须由人工在浏览器中完成（flk 为 SPA，无开放 API；不自动爬取）。
用法：python scripts/flk_spotcheck_sample.py [--rate 0.1] [--out 路径]
"""
import argparse
import json
import random
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app.corpus import get_corpus  # noqa: E402

GOLD = ROOT / "tests" / "gold" / "gold_retrieval.json"
FLK_HOME = "https://flk.npc.gov.cn"


def gold_cited(law_id: str) -> set[int]:
    cases = json.loads(GOLD.read_text(encoding="utf-8"))["cases"]
    return {e["no"] for c in cases for e in c["expect"] if e["law_id"] == law_id}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--rate", type=float, default=0.10)
    ap.add_argument("--seed", type=int, default=20260913)
    ap.add_argument("--out", default=str(ROOT.parent / "docs" / "qa-evidence" / f"flk-spotcheck-{date.today().isoformat()}.md"))
    args = ap.parse_args()

    corpus = get_corpus()
    rng = random.Random(args.seed)
    lines = [
        "# flk 人工抽查工作单（决策 6A：抽查 ≥10% + 字段级全量对照）",
        "",
        f"- 生成日期：{date.today().isoformat()}；种子：{args.seed}（可复现）",
        f"- 比对源：{FLK_HOME}（人工浏览器逐条打开；flk 为 SPA 且无开放 API，禁止脚本抓取）",
        "- 比对字段：条号、条文全文、章节数归属；结果填「一致 / 不一致（差异摘录）」。",
        "- 字段级全量对照（条数/施行日期/机关）由 corpus_selfcheck 自动覆盖，此处只需核对抽样条目。",
        f"- **强制复核区**：pcl-2023 第 300–306 条——条号序列已经 flk 官方结构树定案（306 条连续无缺，2026-09-15）；第306条附则保留说经 lawtext 第三链收敛（2026-09-21）。本区现为 OFD 原文级【强】加冕性目验（非阻塞）：确认第306条从句与语料一致即可勾销（见 flk-pcl-2023-末条复核-2026-09-13.md 两则附记）。",
        "",
        "| 法规 | 条 | 层 | flk 核对结果（一致/差异） | 核对人/日期 | 备注 |",
        "|---|---|---|---|---|---|",
    ]
    total = 0
    for law_id in sorted(corpus.laws):
        law = corpus.laws[law_id]
        nos = sorted(a["no"] for a in law["articles"])
        n = len(nos)
        need = max(3, round(n * args.rate))
        picks: list[tuple[int, str]] = [(nos[0], "首条"), (nos[-1], "末条")]
        cited = sorted(gold_cited(law_id))
        for no in cited:
            if len([p for p in picks if p[1] == "金标"]) < max(2, need // 3) and no not in [p[0] for p in picks]:
                picks.append((no, "金标"))
        if law_id == "pcl-2023":
            for no in range(300, 307):
                if no in nos and no not in [p[0] for p in picks]:
                    picks.append((no, "疑点复核"))
        rest = [no for no in nos if no not in [p[0] for p in picks]]
        rng.shuffle(rest)
        for no in rest:
            if len([p for p in picks if p[1] == "随机"]) < max(0, need - len(picks)):
                picks.append((no, "随机"))
        picks = picks[: max(need, len(picks) - (0 if law_id != "pcl-2023" else 0))]
        for no, layer in picks:
            lines.append(f"| {law['title']}（{law_id}） | 第{no}条 | {layer} |  |  |  |")
            total += 1
        rate_pct = len(picks) / n * 100
        lines.append(f"<!-- {law_id}: {len(picks)}/{n} = {rate_pct:.1f}% -->")
    lines.append("")
    lines.append(f"抽样合计：**{total} 条**。完成核验后：①把本文件改名归档 `flk-spotcheck-完成-<日期>.md`；②差异项逐条登记 build_corpus 并修复重跑 corpus_selfcheck；③pcl-2023 真实末条确认后按「不臆删→定案」流程更新 build_corpus 注释与 EXPECTED_COUNTS。")
    out = Path(args.out)
    out.write_text("\n".join(lines), encoding="utf-8")
    print(f"工作单：{out}（{total} 条）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
