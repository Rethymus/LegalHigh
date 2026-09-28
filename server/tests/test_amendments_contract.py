# -*- coding: utf-8 -*-
"""修正决定契约全量钉子（R394）：全部 amendments 条目 no=整数、日期=ISO。

R393 发现刑法/宪法/网安法修正案 legacy 形态（中文数字/年份字符串/中文全句日期）
与 R384 决定全文端点及 R385 MCP 工具的整数+ISO 契约不匹配——本测试全网钉住，
任何新增 legacy 形态条目立即失败。
"""
import json
import re
from pathlib import Path

REG_DIR = Path(__file__).resolve().parents[1] / "data" / "law_versions"
ISO = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def test_all_amendments_integer_no_and_iso_dates():
    total = 0
    for f in sorted(REG_DIR.glob("*.json")):
        r = json.loads(f.read_text(encoding="utf-8"))
        for a in r.get("amendments", []):
            total += 1
            assert isinstance(a["no"], int), f"{r['law_id']}#{a.get('no')!r} no 非整数"
            assert ISO.match(a.get("passed_date", "")), f"{r['law_id']}#{a['no']} passed_date 非 ISO: {a.get('passed_date')!r}"
            assert ISO.match(a.get("effective", "")), f"{r['law_id']}#{a['no']} effective 非 ISO: {a.get('effective')!r}"
            assert a.get("title"), f"{r['law_id']}#{a['no']} 缺 title"
            ev = a.get("evidence") or {}
            assert ev.get("snapshot"), f"{r['law_id']}#{a['no']} 缺 evidence.snapshot"
    assert total >= 120, f"修正决定总数 {total} 异常（应 ≥120）"


def test_amendment_version_pairing_no_gaps():
    """R413 对称普查钉：每个修正型版本条目必须同年有修正决定登记。

    版本页记录「改后结果」、决定记录「改了什么」——两层证据成对。
    普查起点 19 处缺口已全部闭合（零抓取复用+独立采集）；未来新增
    修正型版本而无决定登记时本测试失败，须有意识补登记或修本测试。
    """
    import json
    import glob
    import os
    reg_dir = os.path.join(os.path.dirname(__file__), "..", "data", "law_versions")
    gaps = []
    for p in sorted(glob.glob(os.path.join(reg_dir, "*.json"))):
        r = json.load(open(p, encoding="utf-8"))
        am_years = {(a.get("passed_date") or "")[:4] for a in (r.get("amendments") or [])}
        for v in r["versions"]:
            if v.get("current") or "修正" not in (v.get("label") or ""):
                continue
            year = (v.get("promulgation_date") or "")[:4]
            if year and year not in am_years:
                gaps.append(f"{r['law_id']}/{v['version_id']}({year})")
    assert gaps == [], f"修正型版本缺同年决定登记: {gaps}"
