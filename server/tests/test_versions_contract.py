# -*- coding: utf-8 -*-
"""版本条目契约全量钉子（R395）：versions 日期=ISO 或受控空串。

R394 把 amendments 契约钉为注册表级不变量；本测试对称收口 versions 侧——
promulgation_date/effective_date 只允许 ISO 形态或「快照未载如实留空」
（工会法 2009 一例，快照未载修正决定施行日）；current 必须 bool；身份字段必填。
任何日期手写（如 2025年10月28日 通过）立即失败。
"""
import json
import re
from pathlib import Path

REG_DIR = Path(__file__).resolve().parents[1] / "data" / "law_versions"
ISO = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def test_all_versions_iso_or_controlled_empty_dates():
    total = 0
    empties = []
    for f in sorted(REG_DIR.glob("*.json")):
        r = json.loads(f.read_text(encoding="utf-8"))
        vs = r.get("versions", [])
        assert vs, f"{r['law_id']} versions 为空"
        assert sum(1 for v in vs if v["current"]) == 1, f"{r['law_id']} current 数不为 1"
        for v in vs:
            total += 1
            for k in ("promulgation_date", "effective_date"):
                d = v.get(k, "")
                assert ISO.match(d) or d == "", f"{r['law_id']}/{v['version_id']} {k} 非受控形态: {d!r}"
            assert isinstance(v["current"], bool), f"{r['law_id']}/{v['version_id']} current 非 bool"
            assert v.get("version_id") and v.get("label"), f"{r['law_id']}/{v['version_id']} 身份字段缺失"
            if v.get("effective_date", "") == "":
                empties.append(f"{r['law_id']}/{v['version_id']}")
    assert total >= 250, f"版本条目总数 {total} 异常"
    # 空串是「快照未载」的诚实形态——当前唯一一例；新空串须同步扩充本清单并附 note 依据
    assert empties == ["trade-union-2021/2009-amendment"], f"effective 空串清单漂移: {empties}"
