# -*- coding: utf-8 -*-
"""建议修订块（R440，R437-T3 首批 w:del 修订路由）三面测试。

金标口径（决策 13，审查点金标扩容）：每行 = (条款文本, 审查点, 期望 action,
期望 target 逐字断言, 期望 replacement)；反表 = 触发但不得携带修订（形态不匹配
回退 comment-only）。不变式：target 必须逐字存在于条款原文——逐条钉住。

另钉：加载期形状校验 fail-closed（四种非法形状拒绝加载）、DOCX w:del/w:ins 渲染
（书签区间内、作者=LegalHigh AI、replace 带 → 替换插入）、回传删除态三态可观测
（pending/accepted/rejected）且**不驱动状态机**（状态仍锚定建议 w:ins）。
"""
import io
import re
import sys
import zipfile
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import docx_return, docxgen, review  # noqa: E402
from app import storage  # noqa: E402

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def analyze(text: str) -> dict:
    return review.analyze_contract("测试合同\n第一条 约定\n" + text, "修订金标")


def finding_of(res: dict, cp: str):
    return next((f for f in res["findings"] if f["checkpoint_id"] == cp), None)


# ---- 金标表：修订发射（target 逐字 + replacement 确定性映射）----

GOLD_REVISION_ROWS = [
    # L3 解释权删除（三种表述形态）
    ("本协议最终解释权归甲方所有。", "L3", "delete", "本协议最终解释权归甲方所有", None),
    ("本公司保留对本活动的最终解释权。", "L3", "delete", "保留对本活动的最终解释权", None),
    ("最终解释权归乙方。", "L3", "delete", "最终解释权归乙方", None),
    # F3 定金比例替换（三种记数形态：百分号 / 中文数字 / 双记数括号扩展）
    ("定金为合同总额的 30%。", "F3", "replace", "30%", "20%"),
    ("定金为合同总额的百分之三十。", "F3", "replace", "百分之三十", "百分之二十"),
    ("定金为合同总额的百分之三十（30%）。", "F3", "replace", "百分之三十（30%）", "百分之二十（20%）"),
    # F4 订金术语替换
    ("甲方支付的订金转为定金担保。", "F4", "replace", "订金", "预付款"),
]

GOLD_REVISION_ABSENT_ROWS = [
    # L3 修改权形态：触发但无解释权跨度 → 不得编造修订
    ("甲方有权单方修改本合同条款。", "L3"),
    # F4 混用形态为违约金（无订金字样）→ 无替换跨度
    ("乙方缴纳定金 2 万元；违约金按总价 10% 计算。", "F4"),
]


@pytest.mark.parametrize("text,cp,action,target,replacement", GOLD_REVISION_ROWS)
def test_revision_gold_rows(text, cp, action, target, replacement):
    res = analyze(text)
    f = finding_of(res, cp)
    assert f is not None, f"{cp} 未触发：{text}"
    rev = f.get("revision")
    assert rev is not None, f"{cp} 应携带修订：{text}"
    assert rev["action"] == action
    assert rev["target"] == target, f"跨度漂移：{rev['target']!r} ≠ {target!r}"
    assert rev["replacement"] == replacement
    # 逐字不变式：target 必须逐字存在于该发现所属条款原文（excerpt=条款原文前缀）
    assert rev["target"] in f["excerpt"], f"target 不在条款原文中：{rev['target']!r}"


@pytest.mark.parametrize("text,cp", GOLD_REVISION_ABSENT_ROWS)
def test_revision_gold_absent_rows(text, cp):
    res = analyze(text)
    f = finding_of(res, cp)
    assert f is not None, f"{cp} 未触发（本表前提是触发）：{text}"
    assert not f.get("revision"), f"{cp} 形态不匹配却携带修订：{f.get('revision')}"


def test_revision_gold_rows_count():
    """金标规模门：正表 ≥7 行（三审查点×三形态），反表 ≥2 行。"""
    assert len(GOLD_REVISION_ROWS) >= 7
    assert len(GOLD_REVISION_ABSENT_ROWS) >= 2


# ---- 加载期形状校验 fail-closed ----

def _cp(rev):
    return {"id": "X1", "revision": rev}


def test_validate_revisions_rejects_malformed_shapes():
    with pytest.raises(ValueError, match="delete 不得携带"):
        review._validate_revisions([_cp({"action": "delete", "target_re": "x", "replacement": "y"})])
    with pytest.raises(ValueError, match="replace 缺 replacement"):
        review._validate_revisions([_cp({"action": "replace", "target_re": "x", "replacement": " "})])
    with pytest.raises(ValueError, match="无法编译"):
        review._validate_revisions([_cp({"action": "delete", "target_re": "(["})])
    with pytest.raises(ValueError, match="action"):
        review._validate_revisions([_cp({"action": "swap", "target_re": "x"})])
    with pytest.raises(ValueError, match="全文级"):
        review._validate_revisions([{"id": "L6", "revision": {"action": "delete", "target_re": "x"}}])
    with pytest.raises(ValueError, match="target_re 或 near"):
        review._validate_revisions([_cp({"action": "delete"})])
    # 合法形状（三种）不抛
    review._validate_revisions([
        _cp({"action": "delete", "target_re": "x"}),
        _cp({"action": "replace", "target_re": "x", "replacement": "y"}),
        _cp({"action": "replace", "near": "定金", "replacement": "20%"}),
    ])


def test_production_checkpoints_load_clean():
    """产线审查点库自检：三个 revision 块全部合法加载。"""
    cps = review.get_checkpoints()
    with_rev = [cp["id"] for cp in cps if cp.get("revision")]
    assert with_rev == ["L3", "F3", "F4"], with_rev


# ---- DOCX 导出：w:del/w:ins 渲染 ----

def _sample_review(tmp_db):
    text = ("第一条 解释：本协议最终解释权归甲方所有。"
            "第二条 定金：定金为合同总额的百分之三十。"
            "第三条 免责：乙方对一切损失概不负责。")
    rid = storage.create_review("修订导出", text, review.analyze_contract(text, "修订导出"))
    return storage.get_review(rid)


def test_docx_renders_tracked_delete_and_replace(tmp_db):
    r = _sample_review(tmp_db)
    with_rev = [f for f in r["result"]["findings"] if f.get("revision")]
    assert {f["checkpoint_id"] for f in with_rev} == {"L3", "F3"}
    xml = zipfile.ZipFile(io.BytesIO(docxgen.generate_review_docx(r))).read("word/document.xml").decode("utf-8")
    for f in with_rev:
        rev = f["revision"]
        # w:del 携带作者与逐字跨度
        dels = re.findall(r'<w:del [^>]*w:author="LegalHigh AI"[^>]*>.*?</w:del>', xml, re.S)
        assert any(rev["target"] in d for d in dels), f"{f['checkpoint_id']} 跨度未进 w:del"
        if rev["replacement"]:
            assert f" → {rev['replacement']}" in xml
    # comment-only 发现（L2）不携带建议修订标签
    l2 = next(f for f in r["result"]["findings"] if f["checkpoint_id"] == "L2")
    assert not l2.get("revision")
    assert "［建议修订·" in xml  # 渲染标签在位（两条带修订）


def test_docx_del_inside_bookmark_range(tmp_db):
    """w:del 必须落在书签区间内（回传可观测的前提）——用 parse 的 ranges 验证。"""
    r = _sample_review(tmp_db)
    data = docxgen.generate_review_docx(r)
    detailed = docx_return.parse_review_docx_detailed(data)
    for f in r["result"]["findings"]:
        if f.get("revision"):
            info = detailed["ranges"][f["id"]]
            assert info["del_present"], f"{f['checkpoint_id']} 的 w:del 不在书签区间"
            assert f["revision"]["target"] in info["del_text"]


# ---- 回传：删除态三态可观测，状态机仍锚定建议 w:ins ----

def _mutate_deletion(data: bytes, fid: str, mode: str) -> bytes:
    """模拟 Word 对 w:del 的接受（删除文本）/拒绝（落普通层）——XML 手术同 D9 回传先例。"""
    from docx import Document
    doc = Document(io.BytesIO(data))
    body = doc.element.body
    open_name = None
    for el in list(body.iterchildren()):
        if el.tag == W + "bookmarkStart" and (el.get(W + "name") or "") == f"LH_{fid}":
            open_name = el.get(W + "name")
            continue
        if open_name and el.tag == W + "bookmarkEnd":
            open_name = None
            continue
        if not open_name:
            continue
        for dele in list(el.iter(W + "del")):
            if mode == "accept":
                dele.getparent().remove(dele)  # 接受删除：文本随 w:del 消失
            else:  # reject：拆包 → 文本落普通层
                parent = dele.getparent()
                idx = list(parent).index(dele)
                for child in list(dele):
                    dele.remove(child)
                    parent.insert(idx, child)
                    idx += 1
                parent.remove(dele)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def test_return_deletion_three_states_and_anchor(tmp_db):
    r = _sample_review(tmp_db)
    data = docxgen.generate_review_docx(r)
    rev_f = next(f for f in r["result"]["findings"] if f.get("revision") and f["revision"]["action"] == "delete")
    fid = rev_f["id"]

    # ① 原样回传：删除 pending，状态 pending
    d = docx_return.parse_review_docx_detailed(data)
    assert d["states"][fid] == "pending"
    summary = docx_return.apply_return(r["id"], d["states"], r, ranges=d["ranges"])
    dec = {x["id"]: x["decision"] for x in summary["deletions"]}
    assert dec[fid] == "pending"

    # ② 仅接受删除（建议 w:ins 未动）：删除 accepted，状态仍 pending（锚定不变）
    d2 = docx_return.parse_review_docx_detailed(_mutate_deletion(data, fid, "accept"))
    assert d2["states"][fid] == "pending"
    assert not d2["ranges"][fid]["del_present"]
    summary2 = docx_return.apply_return(r["id"], d2["states"], r, ranges=d2["ranges"])
    dec2 = {x["id"]: x["decision"] for x in summary2["deletions"]}
    assert dec2[fid] == "accepted"

    # ③ 拒绝删除（文本落普通层）：删除 rejected，状态仍 pending
    d3 = docx_return.parse_review_docx_detailed(_mutate_deletion(data, fid, "reject"))
    assert d3["states"][fid] == "pending"
    assert rev_f["revision"]["target"] in d3["ranges"][fid]["plain"]
    summary3 = docx_return.apply_return(r["id"], d3["states"], r, ranges=d3["ranges"])
    dec3 = {x["id"]: x["decision"] for x in summary3["deletions"]}
    assert dec3[fid] == "rejected"


def test_apply_return_without_ranges_keeps_contract(tmp_db):
    """旧调用形态（不传 ranges）：三态判定与状态机不受影响，deletions 为空表。"""
    r = _sample_review(tmp_db)
    data = docxgen.generate_review_docx(r)
    parsed = docx_return.parse_review_docx(data)
    summary = docx_return.apply_return(r["id"], parsed, r)
    assert summary["pending"] >= 1
    assert summary["deletions"] == []
