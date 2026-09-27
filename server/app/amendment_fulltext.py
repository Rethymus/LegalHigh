# -*- coding: utf-8 -*-
"""修正决定快照原文查阅（R384）。

从版本注册表的 amendments 数组读取决定条目，按其 evidence.snapshot 读快照、
清洗 HTML 后返回决定正文（含通过/施行日期与来源证据）。只读、零落盘。

纪律：
- 决定条目必须已在注册表登记（先登记后可读——与版本全文同序）；
- snapshot 文件名走 SAFE_FILE 白名单 + 目录逃逸校验（与 build_version_fulltext 同款）；
- 清洗复用 build_corpus.clean_html_to_text（导航/页脚噪声剥离同源）；
- 不解析决定为结构化条目（一、二、三…保持原文形态，避免二次解析引入讹误）。
"""
from __future__ import annotations

import re
from pathlib import Path

from . import law_versions

SERVER_DIR = Path(__file__).resolve().parent.parent
EVIDENCE_DIR = (SERVER_DIR.parent / "docs" / "research" / "evidence").resolve()
SAFE_FILE = re.compile(r"^[\w][\w.\-（）()]*\.(html|json)$")

# 快照页正文边界：维基文库渲染页的正文自第一个 @@H1@@（页面标题）起；
# 段内 @@H2/H3@@ 与「[编辑]」为章节/编辑链接标记，粗滤去除
_NOISE_PATTERNS = [
    re.compile(r"@@H[123]@@\s*"),
    re.compile(r"\[编辑\]"),
    re.compile(r"姊妹计划[:：]?[^\n]*"),
]


def _read_snapshot(name: str) -> bytes:
    if not SAFE_FILE.match(name):
        raise ValueError(f"unsafe snapshot filename: {name!r}")
    path = (EVIDENCE_DIR / name).resolve()
    if path.parent != EVIDENCE_DIR:
        raise ValueError("snapshot escapes evidence dir")
    return path.read_bytes()


def amendment_fulltext(law_id: str, no: int) -> dict:
    """返回某法第 no 次修正决定的可读正文。条目未登记→KeyError（路由层转 404）。"""
    registry = law_versions.load_registry(law_id)
    entry = next((a for a in registry.get("amendments", []) if a.get("no") == no), None)
    if entry is None:
        raise KeyError(f"{law_id} 注册表无第 {no} 次修正决定条目")

    ev = entry.get("evidence") or {}
    snap = (ev.get("snapshot") or "").split("/")[-1]
    if not snap:
        raise ValueError(f"{law_id}#{no} 决定条目缺 evidence.snapshot")
    raw = _read_snapshot(snap)
    # R393 修复：R390 重构时丢失 _clean_html_text——原始 HTML 直传 _clean_decree_text
    # 产出 3.2 万字符含标签残渣（既有断言在原始 HTML 上也通过，测试太弱未拦住）
    text = _clean_decree_text(_clean_html_text(raw.decode("utf-8", errors="replace")))

    return {
        "law_id": law_id,
        "no": no,
        "title": entry.get("title", ""),
        "passed_date": entry.get("passed_date", ""),
        "effective": entry.get("effective", ""),
        "text": text,
        "scope_note": "修正决定快照原文（维基文库转录清洗后全文）；「改了什么」的一手文本，与版本页「改后结果」对照阅读。",
        "source": {f: ev.get(f) for f in ("kind", "grade", "url", "accessed_at", "snapshot")},
    }


def _clean_html_text(raw: str) -> str:
    """HTML→文本（build_corpus 清洗管线包装，供前身法等复用）。"""
    from build_corpus import clean_html_to_text  # 延迟导入（避免环）
    return clean_html_to_text(raw)


def _clean_decree_text(whole: str) -> str:
    """决定/法律快照的正文定位与滤噪（R390 抽出供前身法复用）。"""
    m_start = re.search(r"（\d{4}年\d{1,2}月\d{1,2}日[^）]{0,80}通过[^）]{0,400}）", whole)
    start = m_start.start() if m_start else whole.find("@@H1@@")
    text = whole[start:] if start and start > 0 else whole
    if not m_start:
        # R411：无括注页（1988 审计条例形态）——标题行与正文首锚（章/条）之间是
        # 语言/导航/沿革侧栏整块；仅当该间隙确有 chrome 签名时剥除，保标题行。
        anchor = re.search(r"@@H2@@|第[一二三四五六七八九十百零]+章|第[一二三四五六七八九十百零]+条", text)
        chrome = re.search(r"添加语言|添加链接|不转换|維基文庫|维基文库", text)
        if anchor and chrome and chrome.start() < anchor.start():
            first_nl = text.find("\n")
            text = (text[:first_nl] if first_nl > 0 else "") + "\n\n" + text[anchor.start():]
    for mark in ("分类：", "本作品来自", "隐藏\n分类", "打印/导出", "导航菜单", "\n分类\n"):
        idx = text.find(mark)
        if idx > 200:
            text = text[:idx]
            break
    for pat in _NOISE_PATTERNS:
        text = pat.sub("", text)
    tail = re.search(
        r"\n编辑链接\n|\n查看历史\n|\n取自[“\"]https?://|\n\u4e0d\u8f6c\u6362\n"
        r"|\n本作品来自中华人民共和国|\n依据《中华人民共和国著作权法》|\n本作品不适用于|\n本模板所指的决定包括|\nPublic domain",
        text,
    )
    if tail and tail.start() > 200:
        text = text[:tail.start()]
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    return text

