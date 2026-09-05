# -*- coding: utf-8 -*-
"""律师回传 DOCX 解析（M7-T1 后半）。

回传判定语义（基于导出时的书签 LH_{finding_id} 与 w:ins 状态）：
- 书签区间内建议文本仍在 w:ins（author=LegalHigh AI）中 → pending（律师未处理）
- 文本仍在但已无 w:ins 包裹（Word「接受修订」的产物） → accepted
- 区间内无建议文本（Word「拒绝修订」的产物） → rejected

解析只读；状态流转由 apply_return 走既有批注状态机（非法流转如实记 skipped）。
"""
from io import BytesIO
from pathlib import PurePosixPath
from zipfile import BadZipFile, ZipFile

W_NS = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"

# 回传文件来自不可信客户端：先限制容器大小/条目数/解压总量，再交给
# python-docx 解析，避免把任意 ZIP/XML 当作无限制输入。
MAX_DOCX_BYTES = 10 * 1024 * 1024
MAX_ZIP_MEMBERS = 512
MAX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024
MAX_COMPRESSION_RATIO = 100
ALLOWED_MIME_TYPES = frozenset({
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/zip",
    "application/octet-stream",
})


def _validate_docx_container(data: bytes) -> None:
    if len(data) < 4 or data[:4] not in (b"PK\x03\x04", b"PK\x05\x06", b"PK\x07\x08"):
        raise ValueError("文件不是有效的 DOCX 压缩包。")
    if len(data) > MAX_DOCX_BYTES:
        raise ValueError("DOCX 文件超过 10 MiB 大小限制。")
    try:
        with ZipFile(BytesIO(data)) as package:
            infos = package.infolist()
            if not infos or len(infos) > MAX_ZIP_MEMBERS:
                raise ValueError("DOCX 压缩包条目数量超出限制。")
            total_uncompressed = 0
            total_compressed = 0
            for info in infos:
                name = info.filename.replace("\\", "/")
                parts = PurePosixPath(name).parts
                if name.startswith("/") or ".." in parts:
                    raise ValueError("DOCX 压缩包包含非法路径。")
                if name.lower().endswith(("vbaproject.bin", ".exe", ".dll")):
                    raise ValueError("不支持含宏或可执行内容的 DOCX。")
                total_uncompressed += max(info.file_size, 0)
                total_compressed += max(info.compress_size, 1)
                if total_uncompressed > MAX_UNCOMPRESSED_BYTES:
                    raise ValueError("DOCX 解压后大小超出限制。")
            if total_uncompressed / max(total_compressed, 1) > MAX_COMPRESSION_RATIO:
                raise ValueError("DOCX 压缩比异常，已拒绝可能的压缩炸弹。")
            names = {info.filename for info in infos}
            if "[Content_Types].xml" not in names or "word/document.xml" not in names:
                raise ValueError("文件缺少 DOCX 必需部件。")
    except BadZipFile as exc:
        raise ValueError("文件不是有效的 DOCX 压缩包。") from exc


def parse_review_docx(data: bytes) -> dict[str, str]:
    """解析回传 DOCX → {finding_id: pending|accepted|rejected}。"""
    _validate_docx_container(data)
    from docx import Document

    doc = Document(BytesIO(data))
    body = doc.element.body
    result: dict[str, str] = {}

    open_name = None
    captured: list = []
    for el in body.iterchildren():
        tag = el.tag
        if tag == W_NS + "bookmarkStart" and (el.get(W_NS + "name") or "").startswith("LH_"):
            open_name = el.get(W_NS + "name")
            captured = []
            continue
        if open_name and tag == W_NS + "bookmarkEnd":
            fid = open_name[3:]  # LH_f3 -> f3
            # 区分「修订内文本」与「普通文本」：Word 接受修订后建议文本会落入普通层
            ins_text, plain_text = [], []
            for node in iter_all(captured):
                if node.tag == W_NS + "t":
                    target = node.getparent()
                    in_ins = False
                    while target is not None:
                        if target.tag == W_NS + "ins":
                            in_ins = True
                            break
                        target = target.getparent()
                    (ins_text if in_ins else plain_text).append(node.text or "")
            ins_joined, plain_joined = "".join(ins_text), "".join(plain_text)
            if "建议：" in ins_joined:
                result[fid] = "pending"
            elif "建议：" in plain_joined:
                result[fid] = "accepted"
            else:
                result[fid] = "rejected"
            open_name = None
            captured = []
            continue
        if open_name:
            captured.append(el)
    return result


def iter_all(elements):
    """深度优先遍历元素集合（含自身与全部后代）。"""
    for el in elements:
        yield from el.iter()


def apply_return(rid: str, parsed: dict[str, str], review: dict, actor: str = "docx回传") -> dict:
    """把解析结果套用进批注状态机：accepted→adopt、rejected→reject；
    pending 不动；非法流转（如终态再变更）如实记 skipped，不静默丢弃。"""
    from . import storage

    valid_ids = {f["id"] for f in review["result"]["findings"]}
    summary = {"accepted": [], "rejected": [], "pending": 0, "skipped": [], "unknown": []}
    for fid, decision in parsed.items():
        if fid not in valid_ids:
            summary["unknown"].append(fid)
            continue
        if decision == "pending":
            summary["pending"] += 1
            continue
        action = "adopt" if decision == "accepted" else "reject"
        try:
            storage.transition_annotation(rid, fid, action, actor)
            summary[decision].append(fid)
        except (KeyError, ValueError) as e:
            summary["skipped"].append({"id": fid, "decision": decision, "reason": str(e)})
    summary["accepted_n"] = len(summary["accepted"])
    summary["rejected_n"] = len(summary["rejected"])
    return summary
