# -*- coding: utf-8 -*-
"""前身法登记契约钉子（R396）：note「已存证 X」的快照必须在库且关系句在位。

R390 前身法全文端点从 note 解析快照名——本测试钉住登记契约：
note 含「已存证 docs/research/evidence/X.html」的法律，X 必须真实在库；
登记清单变更（新增/移除前身法）须同步扩充本清单。
"""
import re
from pathlib import Path

from app import predecessor_fulltext

REG_DIR = Path(__file__).resolve().parents[1] / "data" / "law_versions"
EVIDENCE = REG_DIR.parents[2] / "docs" / "research" / "evidence"  # data/law_versions 上三级=仓库根（tests 侧对齐 test_predecessor_fulltext 的写法）
KNOWN = {"physicians-2021", "academic-degree-2024", "bankruptcy-2006"}


def test_predecessor_registrations_complete_and_snapshots_present():
    found = set()
    for f in sorted(REG_DIR.glob("*.json")):
        text = f.read_text(encoding="utf-8")
        for m in re.finditer(r"已存证 docs/research/evidence/([\w.\-（）()]+\.html)", text):
            law_id = f.stem
            found.add(law_id)
            assert (EVIDENCE / m.group(1)).is_file(), f"{law_id} 前身快照不在库: {m.group(1)}"
    assert found == KNOWN, f"前身登记清单漂移: {found}"
    # 每个登记法的前身全文端点可读
    for law_id in KNOWN:
        d = predecessor_fulltext.predecessor_fulltext(law_id)
        assert d["text"] and "<ul" not in d["text"]


def test_predecessor_endpoint_404_for_ordinary():
    import pytest
    with pytest.raises(KeyError):
        predecessor_fulltext.predecessor_fulltext("civl-2020")
