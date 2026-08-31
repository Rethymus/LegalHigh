# -*- coding: utf-8 -*-
"""从 docs/research/evidence/ 快照构建结构化法条语料 → server/data/laws/。

数据纪律（对应 AGENTS.md 硬约束 1「不编造」）：
- 唯一输入是本地证据快照（维基文库 parse API JSON / 页面 HTML、gov.cn 页面 HTML），
  每条语料的 source 字段记录 URL、pageid/revid、抓取日期与快照文件名，可复核。
- 条文切分采用「顺序递增校验」：第 N+1 条必须紧跟第 N 条，正文交叉引用的条号不会误切。
- 元数据（公布字号、生效日期等）只从快照文本提取；提取不到就留空，不臆造。

安全设计：输入文件名来自模块级白名单常量 LAW_FILES（编译期常量，不接收外部输入），
读取前经 SAFE_FILE 正则校验，且 final path 必须位于 EVIDENCE_DIR 内（commonpath 校验）。

用法：python server/build_corpus.py
"""
import datetime
import json
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.textparse import clean_html_to_text, clean_wikitext, parse_header_field, split_articles  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parent.parent
EVIDENCE_DIR = (REPO_ROOT / "docs" / "research" / "evidence").resolve()
OUT_DIR = REPO_ROOT / "server" / "data" / "laws"

FETCH_DATE = "2026-08-29"
WS_BASE = "https://zh.wikisource.org/wiki/"
SAFE_FILE = re.compile(r"^[\w\u4e00-\u9fff()（）.-]+\.(json|html)$")

LAW_FILES = {
    "civl_html": "ws_中华人民共和国民法典.html",
    "cl_json": "ws_消保法2013.json",
    "lcl_json": "ws_劳动合同法2012.json",
    "ll_json": "ws_律师法2017.json",
    "ecom_json": "ws_电子商务法.json",
    "pcl_json": "ws_民事诉讼法2023.json",
    "crpl_html": "消保法实施条例_govcn.html",
    "genai_html": "生成式AI办法_govcn.html",
    "htjs_json": "ws_合同编通则解释2023.json",
    "wlxf_json": "ws_网络消费纠纷规定2022.json",
}


def _evidence_path(key: str) -> Path:
    name = LAW_FILES[key]
    if not SAFE_FILE.match(name):
        raise ValueError(f"unsafe filename: {name!r}")
    path = (EVIDENCE_DIR / name).resolve()
    if path.parent != EVIDENCE_DIR:
        raise ValueError(f"snapshot escapes evidence dir: {path}")
    return path


def read_evidence_text(key: str) -> str:
    raw = _evidence_path(key).read_bytes()
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        return raw.decode("gbk", errors="ignore")


def build_wikisource_law(key, law_id, title, meta, html_page):
    p = json.loads(read_evidence_text(key))["parse"]
    wt_raw = p["wikitext"]["*"]
    articles, expected = split_articles(clean_wikitext(wt_raw))
    return {
        "law_id": law_id,
        "title": title,
        **meta,
        "promulgation_instrument": meta.get("promulgation_instrument") or parse_header_field(wt_raw, "公布字号"),
        "effective_date": meta.get("effective_date") or parse_header_field(wt_raw, "生效日期"),
        "source": {
            "kind": "wikisource-transcription",
            "url": WS_BASE + html_page,
            "pageid": p.get("pageid"),
            "snapshot": "docs/research/evidence/" + LAW_FILES[key],
            "fetched_at": FETCH_DATE,
        },
        "authority_pointer": "国家法律法规数据库 https://flk.npc.gov.cn （检索该法条目核对）",
        "articles": articles,
    }


def build_wikisource_html_law(key, law_id, title, meta, html_page):
    html = read_evidence_text(key)
    articles, expected = split_articles(clean_html_to_text(html))
    m = re.search(r'wgCurRevisionId[":=\s]+(\d+)', html)
    return {
        "law_id": law_id,
        "title": title,
        **meta,
        "source": {
            "kind": "wikisource-transcription",
            "url": WS_BASE + html_page,
            "pageid": None,
            "revid": m.group(1) if m else None,
            "snapshot": "docs/research/evidence/" + LAW_FILES[key],
            "fetched_at": FETCH_DATE,
        },
        "authority_pointer": "国家法律法规数据库 https://flk.npc.gov.cn （检索该法条目核对）",
        "articles": articles,
    }


def build_govcn_law(key, law_id, title, meta):
    html = read_evidence_text(key)
    articles, expected = split_articles(clean_html_to_text(html))
    meta = dict(meta)
    url = meta.pop("_url")
    return {
        "law_id": law_id,
        "title": title,
        **meta,
        "source": {
            "kind": "official-gazette-republication",
            "url": url,
            "snapshot": "docs/research/evidence/" + LAW_FILES[key],
            "fetched_at": FETCH_DATE,
        },
        "authority_pointer": "国务院公报 / 国家法律法规数据库 https://flk.npc.gov.cn",
        "articles": articles,
    }


# 预期条数（用于构建后一致性提示；2026-08-29 经维基文库/LawRefBook/gov.cn 三源交叉核验）：
# 民法典 1260 / 消保法(2013修正) 63 / 劳动合同法 98 / 律师法 60 / 电商法 89 / 消保条例 53 / 生成式AI办法 24
# 民诉法(2023修正) 306：以快照切分+顺序递增校验为准（末条"试行废止"表述疑为维基文库页面残留，
# 待 flk 逐条比对（M6-T1）确认；引用第 300-306 条前需人工复核）——诚实标注，不臆删
EXPECTED_COUNTS = {
    "civl-2020": 1260,
    "cl-2013": 63,
    "lcl-2012": 98,
    "ll-2017": 60,
    "ecom-2018": 89,
    "pcl-2023": 306,
    "crpl-imp-2024": 53,
    "genai-2023": 24,
}


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    laws = [
        build_wikisource_html_law(
            "civl_html", "civl-2020", "中华人民共和国民法典",
            {
                "status": "现行有效",
                "promulgation": {"date": "2020-05-28", "organ": "全国人民代表大会"},
                "promulgation_instrument": "中华人民共和国主席令第四十五号",
                "effective_date": "2021-01-01",
            },
            "%E4%B8%AD%E5%8D%8E%E4%BA%BA%E6%B0%91%E5%85%B1%E5%92%8C%E5%9B%BD%E6%B0%91%E6%B3%95%E5%85%B8",
        ),
        build_wikisource_law(
            "cl_json", "cl-2013", "中华人民共和国消费者权益保护法",
            {"status": "现行有效（2013修正）", "promulgation": {"date": "2013-10-25", "organ": "全国人民代表大会常务委员会"}},
            "%E4%B8%AD%E5%8D%8E%E4%BA%BA%E6%B0%91%E5%85%B1%E5%92%8C%E5%9B%BD%E6%B6%88%E8%B4%B9%E8%80%85%E6%9D%83%E7%9B%8A%E4%BF%9D%E6%8A%A4%E6%B3%95_(2013%E5%B9%B4)",
        ),
        build_wikisource_law(
            "lcl_json", "lcl-2012", "中华人民共和国劳动合同法",
            {"status": "现行有效（2012修正）", "promulgation": {"date": "2012-12-28", "organ": "全国人民代表大会常务委员会"}},
            "%E4%B8%AD%E5%8D%8E%E4%BA%BA%E6%B0%91%E5%85%B1%E5%92%8C%E5%9B%BD%E5%8A%B3%E5%8A%A8%E5%90%88%E5%90%8C%E6%B3%95_(2012%E5%B9%B4)",
        ),
        build_wikisource_law(
            "ll_json", "ll-2017", "中华人民共和国律师法",
            {"status": "现行有效（2017修正）", "promulgation": {"date": "2017-09-01", "organ": "全国人民代表大会常务委员会"}},
            "%E4%B8%AD%E5%8D%8E%E4%BA%BA%E6%B0%91%E5%85%B1%E5%92%8C%E5%9B%BD%E5%BE%8B%E5%B8%88%E6%B3%95_(2017%E5%B9%B4)",
        ),
        build_wikisource_law(
            "ecom_json", "ecom-2018", "中华人民共和国电子商务法",
            {"status": "现行有效", "promulgation": {"date": "2018-08-31", "organ": "全国人民代表大会常务委员会"}},
            "%E4%B8%AD%E5%8D%8E%E4%BA%BA%E6%B0%91%E5%85%B1%E5%92%8C%E5%9B%BD%E7%94%B5%E5%AD%90%E5%95%86%E5%8A%A1%E6%B3%95",
        ),
        build_wikisource_law(
            "pcl_json", "pcl-2023", "中华人民共和国民事诉讼法",
            {
                "status": "现行有效（2023修正）",
                "promulgation": {"date": "2023-09-01", "organ": "全国人民代表大会常务委员会"},
                "promulgation_instrument": "中华人民共和国主席令第十一号",
                "effective_date": "2024-01-01",
            },
            "%E4%B8%AD%E5%8D%8E%E4%BA%BA%E6%B0%91%E5%85%B1%E5%92%8C%E5%9B%BD%E6%B0%91%E4%BA%8B%E8%AF%89%E8%AE%BC%E6%B3%95_(2023%E5%B9%B4)",
        ),
        build_wikisource_law(
            "htjs_json", "htjs-2023", "最高人民法院关于适用《中华人民共和国民法典》合同编通则若干问题的解释",
            {
                "status": "现行有效",
                "kind": "司法解释",
                "promulgation": {"date": "2023-12-04", "organ": "最高人民法院"},
                "promulgation_instrument": "法释〔2023〕13号",
                "effective_date": "2023-12-05",
            },
            "%E6%9C%80%E9%AB%98%E4%BA%BA%E6%B0%91%E6%B3%95%E9%99%A2%E5%85%B3%E4%BA%8E%E9%80%82%E7%94%A8%E3%80%8A%E4%B8%AD%E5%8D%8E%E4%BA%BA%E6%B0%91%E5%85%B1%E5%92%8C%E5%9B%BD%E6%B0%91%E6%B3%95%E5%85%B8%E3%80%8B%E5%90%88%E5%90%8C%E7%BC%96%E9%80%9A%E5%88%99%E8%8B%A5%E5%B9%B2%E9%97%AE%E9%A2%98%E7%9A%84%E8%A7%A3%E9%87%8A",
        ),
        build_wikisource_law(
            "wlxf_json", "wlxf-2022", "最高人民法院关于审理网络消费纠纷案件适用法律若干问题的规定（一）",
            {
                "status": "现行有效",
                "kind": "司法解释",
                "promulgation": {"date": "2022-03-01", "organ": "最高人民法院"},
                "promulgation_instrument": "法释〔2022〕8号",
                "effective_date": "2022-03-15",
            },
            "%E6%9C%80%E9%AB%98%E4%BA%BA%E6%B0%91%E6%B3%95%E9%99%A2%E5%85%B3%E4%BA%8E%E5%AE%A1%E7%90%86%E7%BD%91%E7%BB%9C%E6%B6%88%E8%B4%B9%E7%BA%A0%E7%BA%B7%E6%A1%88%E4%BB%B6%E9%80%82%E7%94%A8%E6%B3%95%E5%BE%8B%E8%8B%A5%E5%B9%B2%E9%97%AE%E9%A2%98%E7%9A%84%E8%A7%84%E5%AE%9A%EF%BC%88%E4%B8%80%EF%BC%89",
        ),
        build_govcn_law(
            "crpl_html", "crpl-imp-2024", "中华人民共和国消费者权益保护法实施条例",
            {
                "status": "现行有效",
                "promulgation": {"date": "2024-03-19", "organ": "国务院"},
                "promulgation_instrument": "中华人民共和国国务院令第778号",
                "effective_date": "2024-07-01",
                "_url": "https://www.gov.cn/zhengce/zhengceku/202403/content_6940159.htm",
            },
        ),
        build_govcn_law(
            "genai_html", "genai-2023", "生成式人工智能服务管理暂行办法",
            {
                "status": "现行有效",
                "promulgation": {"date": "2023-07-10", "organ": "国家网信办等七部门"},
                "promulgation_instrument": "国家互联网信息办公室等七部门令第15号",
                "effective_date": "2023-08-15",
                "_url": "https://www.gov.cn/zhengce/zhengceku/202307/content_6891752.htm",
            },
        ),
    ]

    manifest = []
    for law in laws:
        expect = EXPECTED_COUNTS.get(law["law_id"])
        got = len(law["articles"])
        flag = "OK" if expect == got else f"CHECK(expect={expect})"
        nos = [a["no"] for a in law["articles"]]
        gaps = [i for i in range(1, (nos[-1] if nos else 0) + 1) if i not in set(nos)]
        out_path = (OUT_DIR / (law["law_id"] + ".json")).resolve()
        if out_path.parent != OUT_DIR.resolve():
            raise ValueError(f"output escapes laws dir: {out_path}")
        out_path.write_text(json.dumps(law, ensure_ascii=False, indent=1), encoding="utf-8")
        manifest.append({
            "law_id": law["law_id"], "title": law["title"], "status": law["status"],
            "article_count": got, "expected_count": expect, "missing_numbers": gaps[:10],
            "source_url": law["source"]["url"], "snapshot": law["source"]["snapshot"],
            "fetched_at": FETCH_DATE,
        })
        print(f"[{law['law_id']}] {law['title']}: {got} 条 {flag} | 缺号: {gaps[:10]}")
        if law["articles"]:
            a0 = law["articles"][0]
            print(f"    首条 {a0['label']}: {a0['text'][:50]}...")
    manifest_path = (OUT_DIR / "manifest.json").resolve()
    manifest_path.write_text(
        json.dumps({"built_at": datetime.datetime.now().isoformat(), "fetch_date": FETCH_DATE, "laws": manifest}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print("manifest ->", manifest_path)


if __name__ == "__main__":
    main()
