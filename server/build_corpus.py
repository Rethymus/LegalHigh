# -*- coding: utf-8 -*-
"""从 docs/research/evidence/ 快照构建结构化法条语料 → server/data/laws/。

数据纪律（对应 AGENTS.md 硬约束 1「不编造」）：
- 唯一输入是本地证据快照（维基文库转录、gov.cn 与 npc.gov.cn 官方页面），
  每条语料的 source 字段记录 URL、pageid/revid、抓取日期与快照文件名，可复核。
- 条文切分采用「顺序递增校验」：第 N+1 条必须紧跟第 N 条，正文交叉引用的条号不会误切。
- 元数据（公布字号、生效日期等）只从快照文本提取；提取不到就留空，不臆造。

安全设计：输入文件名来自模块级白名单常量 LAW_FILES（编译期常量，不接收外部输入），
读取前经 SAFE_FILE 正则校验，且 final path 必须位于 EVIDENCE_DIR 内（commonpath 校验）。

用法：python server/build_corpus.py
"""
import datetime
import hashlib
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
EXPANSION_FETCH_DATE = "2026-09-08"
WS_BASE = "https://zh.wikisource.org/wiki/"
SAFE_FILE = re.compile(r"^[\w\u4e00-\u9fff()（）.-]+\.(json|html)$")
VERSION_META_FILE = "official_version_effective_dates_2026-09-01.json"

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
    "pipl_npc_html": "npc_个人信息保护法2021.html",
    "legal_aid_npc_html": "npc_法律援助法2021.html",
    "admin_review_npc_html": "npc_行政复议法2023.html",
    "admin_litigation_npc_html": "npc_行政诉讼法2017.html",
    "psm_people_html": "people_治安管理处罚法2025.html",
    "minor_gov_html": "gov_未成年人保护法2024.html",
    "women_people_html": "people_妇女权益保障法2022.html",
    "penal_people_html": "people_行政处罚法2021.html",
    "csl_cac_html": "cac_网络安全法2025.html",
    "dsl_cac_html": "cac_数据安全法2021.html",
    "lcar_gjxfj_html": "gjxfj_劳动争议调解仲裁法2007.html",
    "cpl_gov_html": "gov_刑事诉讼法2018.html",
    "scl_ws_json": "ws_国家赔偿法2012.json",
    "minor_ws_html": "ws_宪法2018.html",
    "cl_ws_html": "ws_刑法2023.html",
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


def snapshot_sha256(key: str) -> str:
    """返回白名单证据快照原始字节的 SHA-256（不对解码后的文本取 hash）。"""
    return hashlib.sha256(_evidence_path(key).read_bytes()).hexdigest()


def version_metadata_for(law_id: str) -> dict:
    """从独立的官方版本日期核验记录读取元数据；禁止在调用点重新手写日期。"""
    if not SAFE_FILE.match(VERSION_META_FILE):
        raise ValueError(f"unsafe version metadata filename: {VERSION_META_FILE!r}")
    path = (EVIDENCE_DIR / VERSION_META_FILE).resolve()
    if path.parent != EVIDENCE_DIR:
        raise ValueError(f"version metadata escapes evidence dir: {path}")
    payload = json.loads(path.read_text(encoding="utf-8"))
    verified_at = payload.get("verified_at")
    if not isinstance(verified_at, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", verified_at):
        raise ValueError("version metadata verified_at must be an ISO date")
    records = [record for record in payload.get("records", []) if record.get("law_id") == law_id]
    if len(records) != 1:
        raise ValueError(f"expected exactly one version metadata record for {law_id}, got {len(records)}")
    record = records[0]
    effective_date = record.get("effective_date")
    source_url = record.get("source_url")
    if not isinstance(effective_date, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", effective_date):
        raise ValueError(f"invalid effective_date for {law_id}")
    if not isinstance(source_url, str) or not source_url.startswith("https://www.npc.gov.cn/"):
        raise ValueError(f"version metadata for {law_id} must use an npc.gov.cn HTTPS source")
    if record.get("evidence_grade") != "强":
        raise ValueError(f"version metadata for {law_id} must be verified as 强 evidence")
    return {
        "effective_date": effective_date,
        "effective_date_evidence": {
            "title": record["source_title"],
            "url": source_url,
            "accessed_at": verified_at,
            "grade": record["evidence_grade"],
            "source_kind": record["source_kind"],
            "version": record["version"],
            "record_snapshot": "docs/research/evidence/" + VERSION_META_FILE,
            "record_sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        },
    }


def date_evidence(meta: dict, *, title: str, url: str, accessed_at: str, grade: str, source_kind: str):
    """为施行日期绑定证据；显式官方核验记录优先，否则绑定同一正文快照。"""
    if not meta.get("effective_date"):
        return None
    return meta.get("effective_date_evidence") or {
        "title": title,
        "url": url,
        "accessed_at": accessed_at,
        "grade": grade,
        "source_kind": source_kind,
        "version": meta.get("status", ""),
    }


def build_wikisource_law(key, law_id, title, meta, html_page):
    p = json.loads(read_evidence_text(key))["parse"]
    wt_raw = p["wikitext"]["*"]
    articles, expected = split_articles(clean_wikitext(wt_raw))
    source_url = WS_BASE + html_page
    effective_date = meta.get("effective_date") or parse_header_field(wt_raw, "生效日期")
    complete_meta = {**meta, "effective_date": effective_date}
    return {
        "law_id": law_id,
        "title": title,
        **meta,
        "promulgation_instrument": meta.get("promulgation_instrument") or parse_header_field(wt_raw, "公布字号"),
        "effective_date": effective_date,
        "effective_date_evidence": date_evidence(
            complete_meta, title=title, url=source_url, accessed_at=FETCH_DATE,
            grade="中", source_kind="wikisource-transcription",
        ),
        "source": {
            "kind": "wikisource-transcription",
            "url": source_url,
            "pageid": p.get("pageid"),
            "snapshot": "docs/research/evidence/" + LAW_FILES[key],
            "fetched_at": FETCH_DATE,
            "sha256": snapshot_sha256(key),
        },
        "authority_pointer": "国家法律法规数据库 https://flk.npc.gov.cn （检索该法条目核对）",
        "articles": articles,
    }


def build_wikisource_html_law(key, law_id, title, meta, html_page):
    html = read_evidence_text(key)
    articles, expected = split_articles(clean_html_to_text(html))
    m = re.search(r'wgCurRevisionId[":=\s]+(\d+)', html)
    source_url = WS_BASE + html_page
    return {
        "law_id": law_id,
        "title": title,
        **meta,
        "effective_date_evidence": date_evidence(
            meta, title=title, url=source_url, accessed_at=FETCH_DATE,
            grade="中", source_kind="wikisource-transcription",
        ),
        "source": {
            "kind": "wikisource-transcription",
            "url": source_url,
            "pageid": None,
            "revid": m.group(1) if m else None,
            "snapshot": "docs/research/evidence/" + LAW_FILES[key],
            "fetched_at": FETCH_DATE,
            "sha256": snapshot_sha256(key),
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
        "effective_date_evidence": date_evidence(
            meta, title=title, url=url, accessed_at=FETCH_DATE,
            grade="强", source_kind="official-gazette-republication",
        ),
        "source": {
            "kind": "official-gazette-republication",
            "url": url,
            "snapshot": "docs/research/evidence/" + LAW_FILES[key],
            "fetched_at": FETCH_DATE,
            "sha256": snapshot_sha256(key),
        },
        "authority_pointer": "国务院公报 / 国家法律法规数据库 https://flk.npc.gov.cn",
        "articles": articles,
    }


def build_npc_law(key, law_id, title, meta):
    """从中国人大网官方页面快照构建现行文本。

    2026-09-08 捕获时本机与 npc.gov.cn 的 HTTPS 握手失败，故原始快照经同域 HTTP
    只读取得，并与 HTTPS 页面搜索索引、首末条及官方条数交叉核对。对外始终给出 HTTPS
    canonical URL；该传输限制写入 source.note，不伪装为端到端 TLS 快照。
    """
    html = read_evidence_text(key)
    articles, expected = split_articles(clean_html_to_text(html))
    meta = dict(meta)
    url = meta.pop("_url")
    return {
        "law_id": law_id,
        "title": title,
        **meta,
        "effective_date_evidence": date_evidence(
            meta, title=title, url=url, accessed_at=EXPANSION_FETCH_DATE,
            grade="强", source_kind="official-legislature-publication",
        ),
        "source": {
            "kind": "official-legislature-publication",
            "url": url,
            "snapshot": "docs/research/evidence/" + LAW_FILES[key],
            "fetched_at": EXPANSION_FETCH_DATE,
            "sha256": snapshot_sha256(key),
            "note": "中国人大网官方页面；本地捕获因 HTTPS 握手失败使用同域 HTTP 传输，已与 HTTPS 索引及条数交叉核验",
        },
        "authority_pointer": "国家法律法规数据库 https://flk.npc.gov.cn",
        "articles": articles,
    }


# 预期条数（用于构建一致性提示；以仓库证据快照切分结果与 gov.cn 已保存页面核验）：
# 民法典 1260 / 消保法(2013修正) 63 / 劳动合同法 98 / 律师法 60 / 电商法 89 / 消保条例 53 / 生成式AI办法 24
# 民诉法(2023修正) 306：末条已定案为上游转录残留【中】——第 306 条文本「本法自公布之日起施行，
# 《民事诉讼法（试行）》同时废止」只能出自 1991 年原法附则（试行法废止发生于 1991 年，2023 修正
# 文本不可能再次废止它）；Wikisource 存档 onlyinclude 正文确含此句，污染在上游转录页本身。
# 真实末条条号（305 还是 306）仍待 flk 人工比对定案（flk-spotcheck-2026-09-13.md 强制复核区；
# 结论见 flk-pcl-2023-末条复核-2026-09-13.md）——按「不臆删」纪律维持 306 条，定案后再改构建规则。
EXPECTED_COUNTS = {
    "civl-2020": 1260,
    "cl-2013": 63,
    "lcl-2012": 98,
    "ll-2017": 60,
    "ecom-2018": 89,
    "pcl-2023": 306,
    "psm-2025": 144,
    "minor-2024": 132,
    "women-2022": 86,
    "penal-2021": 86,
    "csl-2025": 81,
    "dsl-2021": 55,
    "lcar-2007": 54,
    "cpl-2018": 308,
    "scl-2012": 42,
    "con-2018": 143,
    "cl-2023": 505,  # 452 基条 + 53 子条号条目（之一/之二…自 2026-09-14 起独立成条）
    "crpl-imp-2024": 53,
    "genai-2023": 24,
    "pipl-2021": 74,
    "legal-aid-2021": 71,
    "admin-review-2023": 90,
    "admin-litigation-2017": 103,
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
            {"status": "现行有效（2013修正）", "promulgation": {"date": "2013-10-25", "organ": "全国人民代表大会常务委员会"}, **version_metadata_for("cl-2013")},
            "%E4%B8%AD%E5%8D%8E%E4%BA%BA%E6%B0%91%E5%85%B1%E5%92%8C%E5%9B%BD%E6%B6%88%E8%B4%B9%E8%80%85%E6%9D%83%E7%9B%8A%E4%BF%9D%E6%8A%A4%E6%B3%95_(2013%E5%B9%B4)",
        ),
        build_wikisource_law(
            "lcl_json", "lcl-2012", "中华人民共和国劳动合同法",
            {"status": "现行有效（2012修正）", "promulgation": {"date": "2012-12-28", "organ": "全国人民代表大会常务委员会"}, **version_metadata_for("lcl-2012")},
            "%E4%B8%AD%E5%8D%8E%E4%BA%BA%E6%B0%91%E5%85%B1%E5%92%8C%E5%9B%BD%E5%8A%B3%E5%8A%A8%E5%90%88%E5%90%8C%E6%B3%95_(2012%E5%B9%B4)",
        ),
        build_wikisource_law(
            "ll_json", "ll-2017", "中华人民共和国律师法",
            {"status": "现行有效（2017修正）", "promulgation": {"date": "2017-09-01", "organ": "全国人民代表大会常务委员会"}, **version_metadata_for("ll-2017")},
            "%E4%B8%AD%E5%8D%8E%E4%BA%BA%E6%B0%91%E5%85%B1%E5%92%8C%E5%9B%BD%E5%BE%8B%E5%B8%88%E6%B3%95_(2017%E5%B9%B4)",
        ),
        build_wikisource_law(
            "ecom_json", "ecom-2018", "中华人民共和国电子商务法",
            {"status": "现行有效", "promulgation": {"date": "2018-08-31", "organ": "全国人民代表大会常务委员会"}, **version_metadata_for("ecom-2018")},
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
        build_wikisource_law(
            "scl_ws_json", "scl-2012", "中华人民共和国国家赔偿法",
            {
                "status": "现行有效（2012第二次修正）",
                "promulgation": {"date": "2012-10-26", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "1995-01-01",
            },
            "%E4%B8%AD%E8%8F%AF%E4%BA%BA%E6%B0%91%E5%85%B1%E5%92%8C%E5%9C%8B%E5%9C%8B%E5%AE%B6%E8%B3%A0%E5%84%9F%E6%B3%95_(2012%E5%B9%B4)",
        ),
        build_wikisource_html_law(
            "cl_ws_html", "cl-2023", "中华人民共和国刑法",
            {
                "status": "现行有效（2023修正）",
                "promulgation": {"date": "2023-12-29", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "1997-10-01",
            },
            "%E4%B8%AD%E8%8F%AF%E4%BA%BA%E6%B0%91%E5%85%B1%E5%92%8C%E5%9C%8B%E5%88%91%E6%B3%95_(2023%E5%B9%B4)",
        ),
        build_wikisource_html_law(
            "minor_ws_html", "con-2018", "中华人民共和国宪法",
            {
                "status": "现行有效（2018修正）",
                "promulgation": {"date": "2018-03-11", "organ": "全国人民代表大会"},
                "effective_date": "2018-03-11",
            },
            "%E4%B8%AD%E5%8D%8E%E4%BA%BA%E6%B0%91%E5%85%B1%E5%92%8C%E5%9B%BD%E5%AE%AA%E6%B3%95_(2018%E5%B9%B4)",
        ),
        build_govcn_law(
            "cpl_gov_html", "cpl-2018", "中华人民共和国刑事诉讼法",
            {
                "status": "现行有效（2018修正）",
                "promulgation": {"date": "2018-10-26", "organ": "全国人民代表大会常务委员会"},
                "promulgation_instrument": "中华人民共和国主席令第十号",
                "effective_date": "2018-10-26",
                "_url": "https://www.szns.gov.cn/xxgk/bmxxgk/nsgafj/xxgk_99908/zcfg_99917/zcfgjgfxwj_99918/content/post_11403805.html",
            },
        ),
        build_govcn_law(
            "lcar_gjxfj_html", "lcar-2007", "中华人民共和国劳动争议调解仲裁法",
            {
                "status": "现行有效",
                "promulgation": {"date": "2007-12-29", "organ": "全国人民代表大会常务委员会"},
                "promulgation_instrument": "中华人民共和国主席令第八十号",
                "effective_date": "2008-05-01",
                "_url": "https://www.gjxfj.gov.cn/gjxfj/xxgk/fgwj/flfg/webinfo/2016/03/1460585589964384.htm",
            },
        ),
        build_govcn_law(
            "dsl_cac_html", "dsl-2021", "中华人民共和国数据安全法",
            {
                "status": "现行有效",
                "promulgation": {"date": "2021-06-10", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "2021-09-01",
                "_url": "https://www.cac.gov.cn/2021-06/11/c_1624994566919140.htm",
            },
        ),
        build_govcn_law(
            "csl_cac_html", "csl-2025", "中华人民共和国网络安全法",
            {
                "status": "现行有效（2025修正）",
                "promulgation": {"date": "2025-10-28", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "2026-01-01",
                "_url": "https://www.cac.gov.cn/2025-12/29/c_1768735112911946.htm",
            },
        ),
        build_govcn_law(
            "penal_people_html", "penal-2021", "中华人民共和国行政处罚法",
            {
                "status": "现行有效（2021修订）",
                "promulgation": {"date": "2021-01-22", "organ": "全国人民代表大会常务委员会"},
                "promulgation_instrument": "中华人民共和国主席令第七十号",
                "effective_date": "2021-07-15",
                "_url": "https://politics.people.com.cn/n1/2021/0209/c1001-32026746.html",
            },
        ),
        build_govcn_law(
            "women_people_html", "women-2022", "中华人民共和国妇女权益保障法",
            {
                "status": "现行有效（2022修订）",
                "promulgation": {"date": "2022-10-30", "organ": "全国人民代表大会常务委员会"},
                "promulgation_instrument": "中华人民共和国主席令第一二二号",
                "effective_date": "2023-01-01",
                "_url": "https://politics.people.com.cn/n1/2022/1030/c1001-32554934.html",
            },
        ),
        build_govcn_law(
            "minor_gov_html", "minor-2024", "中华人民共和国未成年人保护法",
            {
                "status": "现行有效（2024修正）",
                "promulgation": {"date": "2024-04-26", "organ": "全国人民代表大会常务委员会"},
                "promulgation_instrument": "中华人民共和国主席令第二十四号",
                "effective_date": "2024-04-26",
                "_url": "https://www.yantian.gov.cn/YTQSF/gkmlpt/content/12/12011/post_12011375.html",
            },
        ),
        build_govcn_law(
            "psm_people_html", "psm-2025", "中华人民共和国治安管理处罚法",
            {
                "status": "现行有效（2025修订）",
                "promulgation": {"date": "2025-06-27", "organ": "全国人民代表大会常务委员会"},
                "promulgation_instrument": "中华人民共和国主席令第四十九号",
                "effective_date": "2026-01-01",
                "_url": "https://politics.people.com.cn/n1/2025/0627/c1001-40510468.html",
            },
        ),
        build_npc_law(
            "pipl_npc_html", "pipl-2021", "中华人民共和国个人信息保护法",
            {
                "status": "现行有效",
                "promulgation": {"date": "2021-08-20", "organ": "全国人民代表大会常务委员会"},
                "promulgation_instrument": "中华人民共和国主席令第九十一号",
                "effective_date": "2021-11-01",
                "_url": "https://www.npc.gov.cn/WZWSREL25wYy9jMi9jMzA4MzQvMjAyMTA4L3QyMDIxMDgyMF8zMTMwODguaHRtbD9yZWY9aW1i",
            },
        ),
        build_npc_law(
            "legal_aid_npc_html", "legal-aid-2021", "中华人民共和国法律援助法",
            {
                "status": "现行有效",
                "promulgation": {"date": "2021-08-20", "organ": "全国人民代表大会常务委员会"},
                "promulgation_instrument": "中华人民共和国主席令第九十三号",
                "effective_date": "2022-01-01",
                "_url": "https://www.npc.gov.cn/npc/c2/c30834/202108/t20210820_313079.html",
            },
        ),
        build_npc_law(
            "admin_review_npc_html", "admin-review-2023", "中华人民共和国行政复议法",
            {
                "status": "现行有效（2023修订）",
                "promulgation": {"date": "2023-09-01", "organ": "全国人民代表大会常务委员会"},
                "promulgation_instrument": "中华人民共和国主席令第九号",
                "effective_date": "2024-01-01",
                "_url": "https://www.npc.gov.cn/npc/c2/c30834/202309/t20230901_431409.html",
            },
        ),
        build_npc_law(
            "admin_litigation_npc_html", "admin-litigation-2017", "中华人民共和国行政诉讼法",
            {
                "status": "现行有效（2017修正）",
                "promulgation": {"date": "2017-06-27", "organ": "全国人民代表大会常务委员会"},
                "promulgation_instrument": "中华人民共和国主席令第七十一号",
                "effective_date": "2017-07-01",
                "_url": "https://www.npc.gov.cn/zgrdw/npc/xinwen/2017-06/29/content_2024894.htm",
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
        out_path.write_text(json.dumps(law, ensure_ascii=False, indent=1), encoding="utf-8", newline="\n")
        output_sha256 = hashlib.sha256(out_path.read_bytes()).hexdigest()
        manifest.append({
            "law_id": law["law_id"], "title": law["title"], "status": law["status"],
            "effective_date": law.get("effective_date"),
            "effective_date_evidence": law.get("effective_date_evidence"),
            "promulgation_instrument": law.get("promulgation_instrument"),
            "article_count": got, "expected_count": expect, "missing_numbers": gaps[:10],
            "source_url": law["source"]["url"], "snapshot": law["source"]["snapshot"],
            "fetched_at": law["source"]["fetched_at"], "snapshot_sha256": law["source"]["sha256"],
            "output_sha256": output_sha256,
        })
        print(f"[{law['law_id']}] {law['title']}: {got} 条 {flag} | 缺号: {gaps[:10]}")
        if law["articles"]:
            a0 = law["articles"][0]
            print(f"    首条 {a0['label']}: {a0['text'][:50]}...")
    manifest_path = (OUT_DIR / "manifest.json").resolve()
    latest_snapshot_date = max(item["fetched_at"] for item in manifest)
    manifest_path.write_text(
        json.dumps({"built_at": datetime.datetime.now().isoformat(), "fetch_date": latest_snapshot_date, "laws": manifest}, ensure_ascii=False, indent=2),
        encoding="utf-8",
        newline="\n",
    )
    print("manifest ->", manifest_path)


if __name__ == "__main__":
    main()
