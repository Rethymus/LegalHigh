# -*- coding: utf-8 -*-
"""语料级时点诚实性不变量（R477，legal-skills/trademark-assistant 时点门禁吸收）。

原则：「生效日期在未来的法律，其 status 必须让使用者一眼看出尚未生效」——
status 必须包含施行日期本身或「尚未生效」字样，二者居其一即合规。
防止未来某次扩张把未生效法标成「现行有效」级别的含糊表述（如仅写「已公布」）。

同轮钉住 temporal.in_force_at 对未来日期的 False 判定（时点门禁的机器面）。
"""
import json
import sys
from datetime import date
from pathlib import Path

SERVER = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SERVER))

from app import temporal  # noqa: E402
from app.corpus import get_corpus  # noqa: E402


def test_future_effective_laws_status_carries_honest_marker():
    """生效日期 > 今天的法律，status 必须含施行日期或「尚未生效」。"""
    corpus = get_corpus()
    today = date.today().isoformat()
    future = []
    for a in corpus.articles:
        ed = a.get("effective_date") or ""
        if ed and ed > today:
            future.append(a)
    assert future, "语料中应存在未来生效法律（当前 trademark-2026 / medical-insurance-2027）；如已全部生效请更新本测试的前置假设"
    checked = set()
    for a in future:
        lid = a["law_id"]
        if lid in checked:
            continue
        checked.add(lid)
        status = a.get("law_status") or ""
        ed = a.get("effective_date") or ""
        assert (ed in status) or ("尚未生效" in status) or ("未生效" in status), \
            f"{lid}: effective_date={ed} 但 status={status!r} 未传达「尚未生效」"
    assert checked >= {"trademark-2026"}, f"至少应覆盖 trademark-2026；实际 {checked}"


def test_in_force_at_future_law_returns_false_before_effective():
    """时点门禁机器面：未来生效法律在施行日前 in_force_at 必须返回 False。"""
    corpus = get_corpus()
    today = date.today().isoformat()
    for a in corpus.articles:
        ed = a.get("effective_date") or ""
        if ed and ed > today:
            assert temporal.in_force_at(ed, today) is False, \
                f"{a['law_id']}: 施行日 {ed} > 今天 {today}，in_force_at 应为 False"
            return  # 一部即足够（钉机制而非穷举）
    raise AssertionError("未找到未来生效法律——前置假设失效，请更新测试")
