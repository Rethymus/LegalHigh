# -*- coding: utf-8 -*-
"""时点对照机械全时间线系统化扫描（R436，registry-derived property gate）。

背景：as_of 行为此前由 11 项抽查测试钉住（test_as_of_history / test_temporal /
test_as_of 的 renumber 单元）；本门把适用版本解析的性质推广到全部注册表——
108 部注册表 / 301 版本条目 / 300 份双日期齐全，性质从注册表日期**独立派生**，
不与 applicable_version 实现共享判定逻辑（非循环验证）：

  P1 适用下界：日期 d=max(公布日,施行日) 当日，解析结果的 (公布,施行) 序不得早于该版本
              ——同日批次/同键并列视为合法（解析取 max 的确定性语义）。
  P2 生效前不可用：d-1 日，解析结果必须是 None 或严格更早的版本（该版本尚未适用）。
  P3 远期取最新：2099-12-31，解析结果 = 全部带日期版本中 (公布,施行) 字典序最大者。
  P4 对照链路（多版本法全量抽样）：每部多版本法取 (公布,施行) 最新的非现行带全文版本，
              在其适用起点日，historical_for_card 用该版本自身首条条号应返回该版本文本
              （version_id 一致 + text 非空）——即「答案卡历史对照」路径的端到端性质。
"""
import json
from datetime import date, timedelta
from pathlib import Path

from app import version_fulltext as vf
from app import law_versions as lv_mod

RV = Path(__file__).resolve().parent.parent / "data" / "law_versions"
FAR = "2099-12-31"


def _registries():
    for p in sorted(RV.glob("*.json")):
        yield p.stem, json.loads(p.read_text(encoding="utf-8"))


def _dated(vs):
    return [v for v in vs if v.get("promulgation_date") and v.get("effective_date")]


def _key(v):
    return (v["promulgation_date"], v["effective_date"])


def test_applicable_version_properties_sweep():
    """P1+P2+P3：全注册表 × 全带日期版本的解析性质（聚合计数，违规逐条列出）。"""
    n_versions = p1_bad = p2_bad = p3_bad = 0
    problems = []
    for law_id, reg in _registries():
        vs = _dated(reg.get("versions", []))
        n_versions += len(vs)
        for v in vs:
            vid = v.get("version_id", "?")
            d_ready = max(_key(v))
            # P1：适用起点日，解析不得早于 v
            got = vf.applicable_version(law_id, d_ready)
            if got is None:
                p1_bad += 1
                problems.append(f"P1 {law_id}#{vid} @{d_ready}: 解析为 None（应 ≥ 本版本）")
            elif _key(got) < _key(v):
                p1_bad += 1
                problems.append(f"P1 {law_id}#{vid} @{d_ready}: 解析为更早版本 {got.get('version_id')}")
            # P2：起点日前一日，解析不得为 v（也不得为与 v 同键的其他版本之后……取严格更早或 None）
            d_before = (date.fromisoformat(d_ready) - timedelta(days=1)).isoformat()
            got2 = vf.applicable_version(law_id, d_before)
            if got2 is not None and not (_key(got2) < _key(v)):
                p2_bad += 1
                problems.append(f"P2 {law_id}#{vid} @{d_before}: 解析为 {got2.get('version_id')}（本版本尚未适用）")
        # P3：远期取最新
        if vs:
            expect = max(vs, key=_key)
            got3 = vf.applicable_version(law_id, FAR)
            if got3 is None or _key(got3) != _key(expect):
                p3_bad += 1
                problems.append(f"P3 {law_id} @2099: 解析为 {got3 and got3.get('version_id')}（应最新 {expect.get('version_id')}）")
    assert not problems, f"{len(problems)} 项违规（P1×{p1_bad} P2×{p2_bad} P3×{p3_bad}，覆盖 {n_versions} 版本）：\n" + "\n".join(problems[:20])


def test_historical_card_returns_applicable_version_text():
    """P4：多版本法的对照链路——适用历史版本时返回该版本自身条文的文本。"""
    checked = skipped = 0
    problems = []
    for law_id, reg in _registries():
        vs = _dated(reg.get("versions", []))
        if len(vs) < 2:
            continue
        # (公布,施行) 最新的非现行版本 = 该法最近一段历史窗口
        hist = [v for v in vs if not v.get("current")]
        if not hist:
            continue
        v = max(hist, key=_key)
        if not vf.has_fulltext(law_id, v["version_id"]):
            skipped += 1
            continue
        try:
            doc = vf.load(law_id, v["version_id"])
        except (ValueError, FileNotFoundError):
            skipped += 1
            continue
        first_no = doc["articles"][0]["no"]
        d = max(_key(v))
        card = vf.historical_for_card(law_id, d, first_no)
        checked += 1
        if card is None:
            problems.append(f"{law_id}#{v['version_id']} @{d}: 对照返回 None（应返回历史文本）")
        elif card.get("version_id") != v["version_id"]:
            problems.append(f"{law_id} @{d}: 对照版本 {card.get('version_id')} ≠ 适用版本 {v['version_id']}")
        elif not card.get("text"):
            problems.append(f"{law_id}#{v['version_id']} @{d}: 对照文本为空")
    assert not problems, f"{len(problems)} 项违规（P4 检查 {checked} 部 / 跳过 {skipped} 部无全文）：\n" + "\n".join(problems[:20])
    assert checked >= 30, f"P4 覆盖过小：{checked} 部（应 ≥30 部多版本法有全文）"
