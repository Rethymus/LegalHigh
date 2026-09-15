# -*- coding: utf-8 -*-
"""rc.1 转正三条件证据收集器（决策 18 / S6-T1，2026-09-15）。

把 2026-09-22 二次核对（计划任务 automation-7dedd1c0）的三条件证据收集脚本化——
单维护者总线因子缓解（v5 风险登记）：核对当天只需跑本脚本 + 人工判断 + 入档。

设计口径：
- 本脚本只**收集证据并标注时点状态**，不代替核对判断；
- 条件 2 未满 14 天时输出「时点未到」防护（防止把本输出当作核对记录提前入档）；
- 全部 stdlib + 可选 gh CLI（缺失时如实标注「需人工核查」）。

用法：server/.venv/Scripts/python server/scripts/release_condition_check.py [--date YYYY-MM-DD]
--date 仅用于演练核对当天流程，真实核对必须省略（使用当天真实日期）。
"""
import argparse
import json
import subprocess
import sys
from datetime import date, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
RC1 = date(2026, 9, 8)
REGRESSION_HINTS = ("revert", "回退", "回归修复", "引入缺陷")


def _git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True).stdout.strip()


def collect(today: date) -> dict:
    elapsed = (today - RC1).days
    ev: dict = {"check_date": today.isoformat(), "rc1": RC1.isoformat(), "day_no": elapsed}

    # 条件 1：flk 人工抽查完成归档
    archives = sorted((ROOT / "docs" / "qa-evidence").glob("flk-spotcheck-完成-*.md"))
    ev["cond1_flk_archives"] = [a.name for a in archives]
    ev["cond1_done"] = bool(archives)

    # 条件 2：两周期限 + rc.1 以来可疑回归线索（消息级扫描，判断留给核对执行者）
    ev["cond2_due"] = elapsed >= 14
    subjects = [s for s in _git("log", "--since", RC1.isoformat(), "--pretty=%s").splitlines() if s.strip()]
    ev["cond2_commits_since_rc1"] = len(subjects)
    ev["cond2_flagged_subjects"] = [s for s in subjects if any(h in s.lower() for h in REGRESSION_HINTS)]

    # 条件 3：云端 CI 连绿（gh CLI 可选）
    try:
        raw = subprocess.run(
            ["gh", "run", "list", "--limit", "30", "--json", "conclusion,createdAt"],
            cwd=ROOT, capture_output=True, text=True, timeout=60,
        )
        runs = json.loads(raw.stdout) if raw.returncode == 0 else []
        failed = [r["createdAt"][:10] for r in runs if r.get("conclusion") not in ("success", None, "")]
        ev["cond3_runs_checked"] = len(runs)
        ev["cond3_failures"] = failed
        ev["cond3_ok"] = bool(runs) and not failed
    except (OSError, subprocess.TimeoutExpired, json.JSONDecodeError):
        ev["cond3_ok"] = None
        ev["cond3_note"] = "gh CLI 不可用——需人工核查 GitHub Actions 页面"
    return ev


def render(ev: dict) -> str:
    due = ev["cond2_due"]
    lines = [
        f"### {ev['check_date']} 第二次核对（rc.1 后第 {ev['day_no']} 天）" if due
        else f"### 【工具自验】{ev['check_date']}（rc.1 后第 {ev['day_no']} 天）——核对时点未到，本输出不得入档",
        "",
        "| # | 条件 | 当日状态 | 结论 |",
        "|---|---|---|---|",
        f"| 1 | M6 遗留清零（flk 抽查归档 + 末条定案） | {'✅ 归档：' + '、'.join(ev['cond1_flk_archives']) if ev['cond1_done'] else '⬜ 无 flk-spotcheck-完成-*.md 归档——业主侧抽查未完成'} | {'满足' if ev['cond1_done'] else '阻塞中（业主输入）'} |",
        f"| 2 | rc.1 起两周零回归 | rc.1={ev['rc1']}，第 {ev['day_no']}/14 天；rc.1 以来提交 {ev['cond2_commits_since_rc1']} 个，消息级回归线索 {len(ev['cond2_flagged_subjects'])} 条{'：' + '；'.join(ev['cond2_flagged_subjects'][:3]) if ev['cond2_flagged_subjects'] else ''} | {'到期（需结合登记册人工判断零回归）' if due else '未到期'} |",
    ]
    if ev["cond3_ok"] is None:
        lines.append(f"| 3 | 云端 CI 连绿 | {ev.get('cond3_note')} | 需人工核查 |")
    else:
        lines.append(f"| 3 | 云端 CI 连绿 | 近 {ev['cond3_runs_checked']} 条运行，失败 {len(ev['cond3_failures'])} 条{'：' + '、'.join(ev['cond3_failures'][:3]) if ev['cond3_failures'] else ''} | {'满足' if ev['cond3_ok'] else '不满足'} |")
    lines.append("")
    if not due:
        lines.append(f"**时点防护**：rc.1 后第 {ev['day_no']} 天，条件 2 的 14 天期限未到——本输出仅证明收集器可用，不得作为核对记录写入第五节。")
    else:
        ready = ev["cond1_done"] and ev["cond3_ok"]
        lines.append("**核对结论**：" + ("三条件齐备，满足转正前提——按第二节发布前核查推进（发布按钮仍留人工 gate）。" if ready
                       else "仍有条件未满足，维持暂不转正；未满足项见上表。"))
    return "\n".join(lines)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", default=None, help="演练用日期（真实核对必须省略）")
    args = ap.parse_args()
    today = date.fromisoformat(args.date) if args.date else datetime.now().date()
    ev = collect(today)
    print(render(ev))
    # 时点防护：未到期时以非零退出提醒调用方本输出不可入档（演练时预期为 1）
    return 0 if ev["cond2_due"] else 1


if __name__ == "__main__":
    sys.exit(main())
