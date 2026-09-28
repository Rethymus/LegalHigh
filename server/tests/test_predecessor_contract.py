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
KNOWN = {"physicians-2021", "academic-degree-2024", "bankruptcy-2006", "food-safety-2025", "psm-2025",
         "id-card-2011", "police-2012", "audit-2021", "anti-drug-2008"}


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
    # R412 起民法典有多前身登记（数组形态），普通法样本改用民诉法
    with pytest.raises(KeyError):
        predecessor_fulltext.predecessor_fulltext("pcl-2023")


def test_multi_predecessor_contract_civl():
    """R412：民法典多前身契约——九部清单精确钉住、快照在库、逐部读取干净。"""
    import json
    import re as _re
    from pathlib import Path as _Path
    reg = json.loads((_Path(__file__).resolve().parents[1] / "data" / "law_versions" / "civl-2020.json").read_text(encoding="utf-8"))
    preds = reg.get("predecessors") or []
    assert [p["title"] for p in preds] == [
        "中华人民共和国婚姻法", "中华人民共和国继承法", "中华人民共和国民法通则", "中华人民共和国收养法",
        "中华人民共和国担保法", "中华人民共和国合同法", "中华人民共和国物权法",
        "中华人民共和国侵权责任法", "中华人民共和国民法总则",
    ]
    for p in preds:
        assert (EVIDENCE / p["snapshot"]).is_file(), p["snapshot"]
        assert p.get("note"), p["title"]
    assert "第1260条" in reg.get("predecessors_relation", "")
    for idx in range(len(preds)):
        d = predecessor_fulltext.predecessor_fulltext("civl-2020", idx)
        assert d["text"] and "相关导览" not in d["text"] and "添加语言" not in d["text"]
