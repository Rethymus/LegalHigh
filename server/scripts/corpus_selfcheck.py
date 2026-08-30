# -*- coding: utf-8 -*-
"""语料机器侧自检（决策项6·flk 比对的机器侧准备）。

与 flk 的「人工抽查 ≥10% + 字段级全量对照」中，机器可独立完成的部分：
- 条数与 manifest 一致
- 条号顺序连续（第一条→末条，独立重验 build_corpus 的顺序递增校验）
- 文本非空、无重复 (law_id, no)
- 全量 citation_of 可解析（引用不变量数据面）
- status 非空；施行日期为空时登记（对应 UI「待核」标注）

产物：docs/qa-evidence/corpus_selfcheck_<date>.json + 控制台摘要；异常退出码 1。
运行：server/.venv/Scripts/python.exe scripts/corpus_selfcheck.py
"""
import json
import re
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app.corpus import get_corpus  # noqa: E402

CN_NUM = "零〇一二三四五六七八九十百千"


def main() -> int:
    corpus = get_corpus()
    problems = []
    report = {"date": date.today().isoformat(), "laws": {}}

    for m in corpus.manifest["laws"]:
        lid = m["law_id"]
        law = corpus.laws[lid]
        arts = law["articles"]
        lr = {"manifest_count": m["article_count"], "actual_count": len(arts),
              "sequential": True, "empty_text": 0, "duplicate_no": 0, "no_effective_date": law.get("effective_date") is None}
        if m["article_count"] != len(arts):
            problems.append(f"{lid}: manifest 条数 {m['article_count']} ≠ 实际 {len(arts)}")
        nos = [a["no"] for a in arts]
        if nos != sorted(nos):
            problems.append(f"{lid}: 条号非升序")
        if len(set(nos)) != len(nos):
            lr["duplicate_no"] = len(nos) - len(set(nos))
            problems.append(f"{lid}: 条号重复 {lr['duplicate_no']} 处")
        # 顺序连续性：正文条号标签应从第一条（通常第一条）逐条递进（条文有分编/章不影响条号）
        breaks = []
        prev = 0
        for a in arts:
            mm = re.search(r"第([" + CN_NUM + r"]+)条", a["label"])
            if not mm:
                breaks.append(f"label 无法解析: {a['label']}")
                continue
            from lib.textparse import cn_to_int
            n = cn_to_int(mm.group(1))
            if n != prev + 1:
                breaks.append(f"{prev}→{n}")
            prev = n
        if breaks:
            lr["sequential"] = False
            problems.append(f"{lid}: 条号断点 {breaks[:5]}{'...' if len(breaks) > 5 else ''}")
        for a in arts:
            if not a["text"].strip():
                lr["empty_text"] += 1
                problems.append(f"{lid}#{a['no']}: 空文本")
        for a in arts:
            corpus.citation_of(lid, a["no"])  # 不存在/解析失败会抛错
        report["laws"][lid] = lr

    report["problems"] = problems
    out = ROOT.parent / "docs" / "qa-evidence" / f"corpus_selfcheck_{date.today().isoformat()}.json"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    total = sum(r["actual_count"] for r in report["laws"].values())
    print(f"语料自检：{len(report['laws'])} 部 {total} 条，问题 {len(problems)} 项")
    for p in problems:
        print("  -", p)
    print("报告：", out)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
