# -*- coding: utf-8 -*-
"""纯文本解析工具：中文数字、wiki/HTML 文本清洗、法条顺序切分。无任何 I/O，便于测试。"""
import html as html_mod
import re

CN_DIGIT = {"零": 0, "〇": 0, "一": 1, "二": 2, "三": 3, "四": 4, "五": 5,
            "六": 6, "七": 7, "八": 8, "九": 9}
CN_UNIT = {"十": 10, "百": 100, "千": 1000}
ART_RE = re.compile(r"第([零〇一二三四五六七八九十百千]+)条(之[一二三四五六七八九十])?")
ART_SUB_IDX = {"之一": 1, "之二": 2, "之三": 3, "之四": 4, "之五": 5,
               "之六": 6, "之七": 7, "之八": 8, "之九": 9, "之十": 10}
HEAD_BIAN_RE = re.compile(r"第[一二三四五六七八九十]+编[^\n，,。;；]{0,24}")
HEAD_ZHANG_RE = re.compile(r"第[一二三四五六七八九十]+章[^\n，,。;；]{0,24}")


def cn_to_int(s: str) -> int:
    """中文数字 → 整数（支持 零〇一二三四五六七八九十百千 组合），非法返回 -1。"""
    total, num = 0, 0
    for ch in s:
        if ch in CN_DIGIT:
            num = CN_DIGIT[ch]
        elif ch in CN_UNIT:
            unit = CN_UNIT[ch]
            if num == 0:
                num = 1
            total += num * unit
            num = 0
        else:
            return -1
    return total + num


def _strip_templates(wt: str) -> str:
    out = []
    depth = 0
    i = 0
    while i < len(wt):
        if wt.startswith("{{", i):
            depth += 1
            i += 2
            continue
        if wt.startswith("}}", i) and depth:
            depth -= 1
            i += 2
            continue
        if depth == 0:
            out.append(wt[i])
        i += 1
    text = "".join(out)
    text = re.sub(r"<!--[\s\S]*?-->", "", text)
    text = re.sub(r"<ref[^>/]*/>", "", text)
    text = re.sub(r"<ref[\s\S]*?</ref>", "", text)
    return text


def wikilink_text(s: str) -> str:
    s = re.sub(r"\[\[[^\]|]+\|([^\]]+)\]\]", r"\1", s)
    s = re.sub(r"\[\[([^\]]+)\]\]", r"\1", s)
    return s


def clean_wikitext(wt: str) -> str:
    text = _strip_templates(wt)
    text = text.replace("'''", "").replace("''", "")
    text = re.sub(r"<br\s*/?>", "\n", text)
    text = re.sub(r"<[^>]+>", "", text)
    text = wikilink_text(text)
    return text


def strip_tags(s: str) -> str:
    s = re.sub(r"<[^>]+>", "", s)
    return html_mod.unescape(s).strip()


def clean_html_to_text(html: str) -> str:
    html = re.sub(r"<script[\s\S]*?</script>|<style[\s\S]*?</style>", " ", html, flags=re.I)
    html = re.sub(
        r"<h([1-6])[^>]*>([\s\S]*?)</h\1>",
        lambda m: "\n\n@@H" + m.group(1) + "@@ " + strip_tags(m.group(2)) + "\n",
        html, flags=re.I,
    )
    html = re.sub(r"<p[^>]*>", "\n", html, flags=re.I)
    html = re.sub(r"</p>", "\n", html, flags=re.I)
    html = re.sub(r"<br\s*/?>", "\n", html, flags=re.I)
    html = re.sub(r"<[^>]+>", "", html)
    text = html_mod.unescape(html)
    # 零宽字符（Wikisource PDF 扫描 transclusion 渲染产物）会让条号不再处于「行首」，
    # split_articles 的行首判定失效——在清洗层统一剥离（与 NBSP 缩进同为合法行首空白处理）。
    text = re.sub(r"[\u200b\u200c\u200d\ufeff]", "", text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text


def _is_marker_position(text: str, idx: int) -> bool:
    prev_ch = text[idx - 1] if idx > 0 else "\n"
    # 人大网旧页面常用 NBSP 缩进条文；它与普通/全角空格同为合法行首空白。
    return prev_ch in "\n　 \t*'\"（(、。>\u00a0"


def _heading_line_start(text: str, idx: int) -> bool:
    """idx 是否位于一个标题行的起始位置：向前跳过空白与 wikitext 的 '=' 标记后须触及行首。"""
    j = idx
    while j > 0 and text[j - 1] in "=　 \t":
        j -= 1
    return j == 0 or text[j - 1] == "\n"


def _collect_headings(text: str):
    """按文档顺序收集标题行 → [(offset, title)]。

    识别三类标题行：clean_html_to_text 产生的 @@H2@@ 标记行、wikitext 的 ==…== 行、
    以及「整行恰为编/章标题」的纯文本行（gov.cn 页面）。目录行等含额外内容的行不匹配。
    """
    headings = []
    offset = 0
    for line in text.split("\n"):
        stripped = line.strip()
        title = None
        m = re.match(r"^@@H\d+@@\s*(.+)$", stripped)
        if m:
            title = m.group(1).strip()
        elif stripped.startswith("=="):
            inner = stripped.strip("= ").strip()
            if HEAD_BIAN_RE.match(inner) or HEAD_ZHANG_RE.match(inner):
                title = inner
        elif stripped:
            hm = HEAD_BIAN_RE.match(stripped)
            if hm and hm.group(0) == stripped:
                title = stripped
            else:
                hz = HEAD_ZHANG_RE.match(stripped)
                if hz and hz.group(0) == stripped:
                    title = stripped
        if title:
            headings.append((offset, title))
        offset += len(line) + 1
    return headings


_SOURCE_FURNITURE = ("本作品来自", "人民智云", "查论编", "责编：", "责编", "公开征求意见")


def strip_source_furniture(text: str) -> str:
    """剥离快照页尾被切条器吸收进末条的「页面家具」。

    Wikisource 版权模板/导航与人民网责编页脚会出现在证据快照页尾，
    末条文本常带此类尾巴（lawtext 全量交叉核验 2026-09-15 发现）——
    从首个家具标记起截断；另剥离末个句号后的「第X节/章/编…」标题渗漏残片。
    """
    cut = len(text)
    for marker in _SOURCE_FURNITURE:
        i = text.find(marker)
        if i >= 0:
            cut = min(cut, i)
    text = text[:cut].rstrip()
    tail = re.search(r"。([^。]{1,30})$", text)
    if tail and re.match(r"^\s*第[一二三四五六七八九十]+[节章编]", tail.group(1)):
        text = text[: tail.start() + 1]
    return text.rstrip()


def split_articles(text: str):
    """顺序递增校验切条。返回 (articles, expected_next_no)。

    接受规则（状态机）：初始允许 (1, base)；接受 (n, s) 后允许 (n, s+1) 与 (n+1, base)
    ——即「子条号（之一/之二…）跟随其基条，基条递增后子条号重新从 base 开始」。
    交叉引用（如「依照本法第五百条」）因不在允许集内被忽略。上下文 chapter 取该条
    之前最近的标题行。子条号条目携带 sub 字段（"之一"…），基条不携带。
    """
    candidates = []
    for m in ART_RE.finditer(text):
        if not _is_marker_position(text, m.start()):
            continue
        n = cn_to_int(m.group(1))
        if n <= 0 or n > 3000:
            continue
        sub = m.group(2) or ""
        s = ART_SUB_IDX.get(sub, 0)
        candidates.append((m.start(), m.end(), n, s, m.group(0)))

    accepted = []
    cur_no, cur_sub = 0, 0
    allowed = {(1, 0)}
    for start, end, n, s, label in candidates:
        if (n, s) in allowed:
            accepted.append((start, end, n, s, label))
            cur_no, cur_sub = n, s
            allowed = {(n, s + 1), (n + 1, 0)}
    expected = cur_no + 1

    headings = _collect_headings(text)
    articles = []
    for idx, (start, end, n, s, label) in enumerate(accepted):
        seg_start = end
        seg_end = accepted[idx + 1][0] if idx + 1 < len(accepted) else len(text)
        seg = text[seg_start:seg_end].strip()
        # 剔除段内标题行（== 标记行 / @@H@@ 标记行 / 整行标题），标题信息已入 chapter；
        # 并清除维基 [编辑] 残留标记
        seg = "\n".join(
            ln for ln in seg.split("\n")
            if ln.strip() and not ln.strip().startswith("==") and not ln.strip().startswith("@@H")
            and ln.strip() not in {h_t for _, h_t in headings}
        )
        seg = seg.replace("[编辑]", "").replace("[編輯]", "")
        seg = re.sub(r"\n{2,}", "\n", seg).strip()
        # 编/章分别跟踪：遇「编」重置章；章/节附则等归入章位
        cur_bian = cur_zhang = None
        for h_pos, h_title in headings:
            if h_pos >= start:
                break
            if HEAD_BIAN_RE.match(h_title):
                cur_bian, cur_zhang = h_title, None
            else:
                cur_zhang = h_title
        chapter = " > ".join(x for x in [cur_bian, cur_zhang] if x) or None
        entry = {"no": n, "label": label, "chapter": chapter, "text": seg}
        if s:
            entry["sub"] = next(k for k, v in ART_SUB_IDX.items() if v == s)
        entry["text"] = strip_source_furniture(entry["text"])
        articles.append(entry)
    return articles, expected


def parse_header_field(wikitext: str, field: str):
    m = re.search(field + r"\s*=\s*([^|\n}]+)", wikitext)
    if not m:
        return None
    return wikilink_text(m.group(1)).strip()
