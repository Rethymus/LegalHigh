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
SAFE_FILE = re.compile(r"^[\w\u4e00-\u9fff()（）.-]+\.(json|html|md)$")  # md：lawtext flk-DOCX 转录快照（R130）
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
    "dv_ws_html": "ws_反家庭暴力法.html",
    "social_ins_ws_html": "ws_社会保险法.html",
    "food_safety_ws_html": "ws_食品安全法.html",  # 2021 修正版（历史版证据，现行文本见 lawtext 键）
    "food_safety_2025_lawtext_md": "lawtext_食品安全法2025.md",  # 2025 第三次修正（flk DOCX 转录，R130）
    "road_safety_2021_lawtext_md": "lawtext_道交法2021.md",  # 道路交通安全法 2021 第三次修正（R133）
    "labor_law_2018_lawtext_md": "lawtext_劳动法2018.md",  # 劳动法 2018 修正（R133）
    "product_quality_2018_lawtext_md": "lawtext_产品质量法2018.md",  # 产品质量法 2018 修正（R133）
    "crime_prev_2020_lawtext_md": "lawtext_预防未成年人犯罪法2020.md",  # 预防未成年人犯罪法 2020 修订（R134）
    "elderly_2018_lawtext_md": "lawtext_老年人权益保障法2018.md",  # 老年人权益保障法 2018 修正（R134）
    "mediation_2010_lawtext_md": "lawtext_人民调解法2010.md",  # 人民调解法（R134）
    "advertising_2021_lawtext_md": "lawtext_广告法2021.md",  # 广告法 2021 修正（R135）
    "fire_2021_lawtext_md": "lawtext_消防法2021.md",  # 消防法 2021 修正（R135）
    "drug_2019_lawtext_md": "lawtext_药品管理法2019.md",  # 药品管理法 2019 修订（R135）
    "copyright_2020_lawtext_md": "lawtext_著作权法2020.md",  # 著作权法 2020 修正（R136）
    "patent_2020_lawtext_md": "lawtext_专利法2020.md",  # 专利法 2020 修正（R136）
    "trademark_2026_lawtext_md": "lawtext_商标法2026.md",  # 商标法（2026 新法，2027-01-01 施行）（R136）
    "family_edu_2021_lawtext_md": "lawtext_家庭教育促进法2021.md",  # 家庭教育促进法 2021（R137）
    "tourism_2018_lawtext_md": "lawtext_旅游法2018.md",  # 旅游法 2018 修正（R137）
    "disabled_2018_lawtext_md": "lawtext_残疾人保障法2018.md",  # 残疾人保障法 2018 修正（R137）
    "unfair_comp_2025_lawtext_md": "lawtext_反不正当竞争法2025.md",  # 反不正当竞争法 2025 修正（R139）
    "environment_2014_lawtext_md": "lawtext_环境保护法2014.md",  # 环境保护法 2014 修订（R139）
    "id_card_2011_lawtext_md": "lawtext_居民身份证法2011.md",  # 居民身份证法 2011 修正（R139）
    "price_1997_lawtext_md": "lawtext_价格法1997.md",  # 价格法（R140）
    "notary_2017_lawtext_md": "lawtext_公证法2017.md",  # 公证法 2017 修正（R140）
    "agri_quality_2022_lawtext_md": "lawtext_农产品质量安全法2022.md",  # 农产品质量安全法 2022 修订（R140）
    "anti_fraud_2022_lawtext_md": "lawtext_反电信网络诈骗法2022.md",  # 反电信网络诈骗法（R141）
    "compulsory_edu_2018_lawtext_md": "lawtext_义务教育法2018.md",  # 义务教育法 2018 修正（R141）
    "arbitration_2025_lawtext_md": "lawtext_仲裁法2025.md",  # 仲裁法 2025 修订（R141）
    "company_2023_lawtext_md": "lawtext_公司法2023.md",  # 公司法 2023 修订（R142）
    "police_2012_lawtext_md": "lawtext_人民警察法2012.md",  # 人民警察法 2012 修正（R142）
    "anti_monopoly_2022_lawtext_md": "lawtext_反垄断法2022.md",  # 反垄断法 2022 修正（R143）
    "bankruptcy_2006_lawtext_md": "lawtext_企业破产法2006.md",  # 企业破产法（R143）
    "insurance_2015_lawtext_md": "lawtext_保险法2015.md",  # 保险法 2015 修正（R143）
    "infectious_2025_lawtext_md": "lawtext_传染病防治法2025.md",  # 传染病防治法 2025 修订（R145）
    "partnership_2006_lawtext_md": "lawtext_合伙企业法2006.md",  # 合伙企业法（R145）
    "tax_admin_2015_lawtext_md": "lawtext_税收征收管理法2015.md",  # 税收征收管理法 2015 修正（R145）
    "commercial_bank_2015_lawtext_md": "lawtext_商业银行法2015.md",  # 商业银行法 2015 修正（R147）
    "negotiable_2004_lawtext_md": "lawtext_票据法2004.md",  # 票据法 2004 修正（R147）
    "emergency_2024_lawtext_md": "lawtext_突发事件应对法2024.md",  # 突发事件应对法 2024 修订（R147）
    "work_safety_2021_lawtext_md": "lawtext_安全生产法2021.md",  # 安全生产法 2021 修正（R148）
    "securities_2019_lawtext_md": "lawtext_证券法2019.md",  # 证券法 2019 修订（R148）
    "accounting_2024_lawtext_md": "lawtext_会计法2024.md",  # 会计法 2024 修正（R148）
    "audit_2021_lawtext_md": "lawtext_审计法2021.md",  # 审计法 2021 修正（R149）
    "aml_2024_lawtext_md": "lawtext_反洗钱法2024.md",  # 反洗钱法 2024 修订（R149）
    "academic_degree_2024_lawtext_md": "lawtext_学位法2024.md",  # 学位法 2024（R149）
    "vaccine_2019_lawtext_md": "lawtext_疫苗管理法2019.md",  # 疫苗管理法 2019（R151）
    "martyrs_2018_lawtext_md": "lawtext_英雄烈士保护法2018.md",  # 英雄烈士保护法 2018（R151）
    "family_plan_2021_lawtext_md": "lawtext_人口与计划生育法2021.md",  # 人口与计划生育法 2021 修正（R151）
    "mental_health_2018_lawtext_md": "lawtext_精神卫生法2018.md",  # 精神卫生法 2018 修正（R152）
    "anti_drug_2008_lawtext_md": "lawtext_禁毒法2008.md",  # 禁毒法 2008（R152）
    "rural_land_2018_lawtext_md": "lawtext_农村土地承包法2018.md",  # 农村土地承包法 2018 修订（R152）
    "education_2021_lawtext_md": "lawtext_教育法2021.md",  # 教育法 2021 修正（R153）
    "community_correction_2020_lawtext_md": "lawtext_社区矫正法2020.md",  # 社区矫正法 2019（R153）
    "postal_2015_lawtext_md": "lawtext_邮政法2015.md",  # 邮政法 2015 修正（R153）
    "trade_union_2021_lawtext_md": "lawtext_工会法2021.md",  # 工会法 2021 修正（R154）
    "blood_donation_1998_lawtext_md": "lawtext_献血法1998.md",  # 献血法 1997（R154）
    "tcm_2017_lawtext_md": "lawtext_中医药法2017.md",  # 中医药法 2016（R154）
    "higher_edu_2018_lawtext_md": "lawtext_高等教育法2018.md",  # 高等教育法 2018 修正（R155）
    "charity_2023_lawtext_md": "lawtext_慈善法2023.md",  # 慈善法 2023 修正（R155）
    "special_equipment_2014_lawtext_md": "lawtext_特种设备安全法2014.md",  # 特种设备安全法 2013（R155）
    "vocational_edu_2022_lawtext_md": "lawtext_职业教育法2022.md",  # 职业教育法 2022 修订（R156）
    "maternal_infant_2017_lawtext_md": "lawtext_母婴保健法2017.md",  # 母婴保健法 2017 修正（R156）
    "prison_2012_lawtext_md": "lawtext_监狱法2012.md",  # 监狱法 2012 修正（R156）
    "mine_safety_2009_lawtext_md": "lawtext_矿山安全法2009.md",  # 矿山安全法 2009 修正（R157）
    "rural_revitalization_2021_lawtext_md": "lawtext_乡村振兴促进法2021.md",  # 乡村振兴促进法 2021（R157）
    "physicians_2021_lawtext_md": "lawtext_医师法2021.md",  # 医师法 2021（R157）
    "archives_2020_lawtext_md": "lawtext_档案法2020.md",  # 档案法 2020 修订（R158）
    "animal_epidemic_2021_lawtext_md": "lawtext_动物防疫法2021.md",  # 动物防疫法 2021 修订（R158）
    "sci_tech_2021_lawtext_md": "lawtext_科学技术进步法2021.md",  # 科学技术进步法 2021 修订（R158）
    "metrology_2018_lawtext_md": "lawtext_计量法2018.md",  # 计量法 2018 修正（R159）
    "standardization_2017_lawtext_md": "lawtext_标准化法2017.md",  # 标准化法 2017 修订（R159）
    "tech_transfer_2015_lawtext_md": "lawtext_促进科技成果转化法2015.md",  # 促进科技成果转化法 2015 修正（R159）
    "accessibility_2023_lawtext_md": "lawtext_无障碍环境建设法2023.md",  # 无障碍环境建设法 2023（R160）
    "medical_insurance_2027_lawtext_md": "lawtext_医疗保障法2027.md",  # 医疗保障法 2026 公布 2027 施行（R160，尚未生效诚实标注）
    "env_tax_2025_lawtext_md": "lawtext_环境保护税法2025.md",  # 环境保护税法 2025 修正（R160）
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


def build_lawtext_md_law(key, law_id, title, meta, flk_url):
    """lawtext/laws（GitHub，flk 官方 DOCX 转录）markdown 快照 → 语料条目。

    R130 第三链校验引入：维基文库 (2025年) 全文页存在转写缺陷（81 条末句漏改一处
    「婴幼儿配方液态乳」——官方修改决定要求条内每处「婴幼儿配方乳粉」后增补），
    故本部法律改用 flk DOCX 转录链构建；bbbs 与公布/施行元数据经 flk 官方
    flfgDetails API 独立核验（evidence/flk_食品安全法2025_detail.json）。
    """
    raw = read_evidence_text(key)
    m = re.match(r"^---\n[\s\S]*?\n---\n", raw)
    body = raw[m.end():] if m else raw
    # 剥目录段（「## 目录」至下一个水平线/标题之间）——目录的章名列表会污染章位上下文
    body = re.sub(r"^#{1,6}\s*目\s*录\s*$[\s\S]*?(?=^---\s*$|^#{1,6}\s)", "", body, count=1, flags=re.M)
    out = []
    for ln in body.split("\n"):
        s = ln.strip()
        if not s or s == "---":
            continue
        if s.startswith("#"):
            # 章/节标题行转为纯文本行（切条器收进 chapter 上下文）；其余标题（书名等）丢弃
            plain = re.sub(r"^#+\s*", "", s).replace(" ", "\u3000")
            if not re.match(r"^第[一二三四五六七八九十百零]+[编章节]", plain):
                continue
            # lawtext 源缺陷归一化（R139 环保法先例）：章标题与条号粘在同一 heading 行
            # （「## 第五章…公众参与第五十三条 …」）——在第X条处拆开，让条号回到行首
            glued = re.search(r"第[一二三四五六七八九十百零]+条", plain[2:])
            if glued:
                cut = 2 + glued.start()
                out.append(plain[:cut].rstrip("\u3000 "))
                out.append(plain[cut:])
            else:
                out.append(plain)
            continue
        s = re.sub(r"^>\s*", "", s)              # 引用块（沿革序言）
        s = s.replace("**", "")                  # 加粗
        s = re.sub(r"^- ", "", s)                # 列表符（条文条号行）
        out.append(s)
    articles, expected = split_articles("\n".join(out))
    return {
        "law_id": law_id,
        "title": title,
        **meta,
        "effective_date_evidence": date_evidence(
            meta, title=title, url=flk_url, accessed_at=FETCH_DATE,
            grade="中", source_kind="flk-docx-transcription",
        ),
        "source": {
            "kind": "flk-docx-transcription",
            "url": flk_url,
            "pageid": None,
            "revid": None,
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
# 民诉法(2023修正) 306：末条定案（2026-09-15，业主授权 flk 抽查）——官方数据库结构树
# 恰含 306 个条号节点，第一条→第三百零六条连续无缺（flfgDetails 官方接口只读核验；
# 证据 docs/research/evidence/flk-pcl-2023-structure-2026-09-15.json）。第 306 条
# 「本法自公布之日起施行，《试行》同时废止」为跨修正保留的原附则（保留附则说成立，
# R44 时代的「残留说」被官方数据否定）。维持 306 条，无需构建规则改动。
# 历史争议记录见 docs/qa-evidence/flk-pcl-2023-末条复核-2026-09-13.md 定案附记。
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
    "dv-2015": 38,
    "social-ins-2018": 98,
    "food-safety-2025": 154,
    "road-safety-2021": 124,
    "labor-law-2018": 107,
    "product-quality-2018": 74,
    "crime-prev-2020": 68,
    "elderly-2018": 85,
    "mediation-2010": 35,
    "advertising-2021": 74,
    "fire-2021": 74,
    "drug-admin-2019": 155,
    "copyright-2020": 67,
    "patent-2020": 82,
    "trademark-2026": 87,
    "family-edu-2021": 55,
    "tourism-2018": 112,
    "disabled-2018": 68,
    "unfair-competition-2025": 41,
    "environment-2014": 70,
    "id-card-2011": 23,
    "price-1997": 48,
    "notary-2017": 47,
    "agri-quality-2022": 81,
    "anti-fraud-2022": 50,
    "compulsory-edu-2018": 63,
    "arbitration-2025": 96,
    "company-2023": 266,
    "police-2012": 52,
    "anti-monopoly-2022": 70,
    "bankruptcy-2006": 136,
    "insurance-2015": 185,
    "infectious-2025": 115,
    "partnership-2006": 109,
    "tax-admin-2015": 94,
    "commercial-bank-2015": 95,
    "negotiable-2004": 110,
    "emergency-2024": 106,
    "work-safety-2021": 119,
    "securities-2019": 226,
    "accounting-2024": 51,
    "audit-2021": 60,
    "aml-2024": 65,
    "academic-degree-2024": 45,
    "vaccine-2019": 100,
    "martyrs-2018": 30,
    "family-plan-2021": 48,
    "mental-health-2018": 85,
    "anti-drug-2008": 71,
    "rural-land-2018": 70,
    "education-2021": 86,
    "community-correction-2020": 63,
    "postal-2015": 87,
    "trade-union-2021": 58,
    "blood-donation-1998": 24,
    "tcm-2017": 63,
    "higher-edu-2018": 69,
    "charity-2023": 125,
    "special-equipment-2014": 101,
    "vocational-edu-2022": 69,
    "maternal-infant-2017": 39,
    "prison-2012": 78,
    "mine-safety-2009": 50,
    "rural-revitalization-2021": 74,
    "physicians-2021": 67,
    "archives-2020": 53,
    "animal-epidemic-2021": 113,
    "sci-tech-2021": 117,
    "metrology-2018": 34,
    "standardization-2017": 45,
    "tech-transfer-2015": 52,
    "accessibility-2023": 72,
    "medical-insurance-2027": 56,
    "env-tax-2025": 29,
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
            "dv_ws_html", "dv-2015", "中华人民共和国反家庭暴力法",
            {
                "status": "现行有效",
                "promulgation": {"date": "2015-12-27", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "2016-03-01",
            },
            "%E4%B8%AD%E8%8F%AF%E4%BA%BA%E6%B0%91%E5%85%B1%E5%92%8C%E5%9C%8B%E5%8F%8D%E5%AE%B6%E5%BA%AD%E6%9A%B4%E5%8A%9B%E6%B3%95",
        ),
        build_wikisource_html_law(
            "social_ins_ws_html", "social-ins-2018", "中华人民共和国社会保险法",
            {
                "status": "现行有效（2018修正）",
                "promulgation": {"date": "2018-12-29", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "2011-07-01",
            },
            "%E4%B8%AD%E8%8F%AF%E4%BA%BA%E6%B0%91%E5%85%B1%E5%92%8C%E5%9C%8B%E7%A4%BE%E6%9C%83%E4%BF%9D%E9%9A%AA%E6%B3%95",
        ),
        build_lawtext_md_law(
            "food_safety_2025_lawtext_md", "food-safety-2025", "中华人民共和国食品安全法",
            {
                "status": "现行有效（2025修正）",
                "promulgation": {"date": "2025-09-12", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "2015-10-01",
            },
            "https://flk.npc.gov.cn/detail?id=7b5a76d0461745a08d3f964916b87ef3",
        ),
        build_lawtext_md_law(
            "road_safety_2021_lawtext_md", "road-safety-2021", "中华人民共和国道路交通安全法",
            {
                "status": "现行有效（2021修正）",
                "promulgation": {"date": "2021-04-29", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "2004-05-01",
            },
            "https://flk.npc.gov.cn/detail?id=ff8081817ab231eb017abd617ef70519",
        ),
        build_lawtext_md_law(
            "labor_law_2018_lawtext_md", "labor-law-2018", "中华人民共和国劳动法",
            {
                "status": "现行有效（2018修正）",
                "promulgation": {"date": "2018-12-29", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "1995-01-01",
            },
            "https://flk.npc.gov.cn/detail?id=ff8080816f135f46016f20f16ee11737",
        ),
        build_lawtext_md_law(
            "product_quality_2018_lawtext_md", "product-quality-2018", "中华人民共和国产品质量法",
            {
                "status": "现行有效（2018修正）",
                "promulgation": {"date": "2018-12-29", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "1993-09-01",
            },
            "https://flk.npc.gov.cn/detail?id=ff8080816f135f46016f1d6dfd7614d3",
        ),
        build_lawtext_md_law(
            "crime_prev_2020_lawtext_md", "crime-prev-2020", "中华人民共和国预防未成年人犯罪法",
            {
                "status": "现行有效（2020修订）",
                "promulgation": {"date": "2020-12-26", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "2021-06-01",
            },
            "https://flk.npc.gov.cn/detail?id=ff80808175265dd40176a88c218f2853",
        ),
        build_lawtext_md_law(
            "elderly_2018_lawtext_md", "elderly-2018", "中华人民共和国老年人权益保障法",
            {
                "status": "现行有效（2018修正）",
                "promulgation": {"date": "2018-12-29", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "2013-07-01",
            },
            "https://flk.npc.gov.cn/detail?id=ff8080816f135f46016f20f4bf851746",
        ),
        build_lawtext_md_law(
            "mediation_2010_lawtext_md", "mediation-2010", "中华人民共和国人民调解法",
            {
                "status": "现行有效",
                "promulgation": {"date": "2010-08-28", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "2011-01-01",
            },
            "https://flk.npc.gov.cn/detail?id=2c909fdd678bf17901678bf7105c05af",
        ),
        build_lawtext_md_law(
            "advertising_2021_lawtext_md", "advertising-2021", "中华人民共和国广告法",
            {
                "status": "现行有效（2021修正）",
                "promulgation": {"date": "2021-04-29", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "2015-09-01",
            },
            "https://flk.npc.gov.cn/detail?id=ff8081817ab231eb017abd6bd860052d",
        ),
        build_lawtext_md_law(
            "fire_2021_lawtext_md", "fire-2021", "中华人民共和国消防法",
            {
                "status": "现行有效（2021修正）",
                "promulgation": {"date": "2021-04-29", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "2009-05-01",
            },
            "https://flk.npc.gov.cn/detail?id=ff8081817ab22e0c017abd909312060a",
        ),
        build_lawtext_md_law(
            "drug_2019_lawtext_md", "drug-admin-2019", "中华人民共和国药品管理法",
            {
                "status": "现行有效（2019修订）",
                "promulgation": {"date": "2019-08-26", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "2019-12-01",
            },
            "https://flk.npc.gov.cn/detail?id=ff8080816f3cbb3c016f46242d6127ed",
        ),
        build_lawtext_md_law(
            "copyright_2020_lawtext_md", "copyright-2020", "中华人民共和国著作权法",
            {
                "status": "现行有效（2020修正）",
                "promulgation": {"date": "2020-11-11", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "2021-06-01",
            },
            "https://flk.npc.gov.cn/detail?id=ff808081752b7d430175e4766bab1557",
        ),
        build_lawtext_md_law(
            "patent_2020_lawtext_md", "patent-2020", "中华人民共和国专利法",
            {
                "status": "现行有效（2020修正）",
                "promulgation": {"date": "2020-10-17", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "2021-06-01",
            },
            "https://flk.npc.gov.cn/detail?id=ff808081752b7d430175e4651cbd1547",
        ),
        build_lawtext_md_law(
            "trademark_2026_lawtext_md", "trademark-2026", "中华人民共和国商标法",
            {
                "status": "已公布（2026修订，2027-01-01 施行）",
                "promulgation": {"date": "2026-06-26", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "2027-01-01",
            },
            "https://flk.npc.gov.cn/detail?id=95bb747db54e419184eff06546515826",
        ),
        build_lawtext_md_law(
            "family_edu_2021_lawtext_md", "family-edu-2021", "中华人民共和国家庭教育促进法",
            {
                "status": "现行有效",
                "promulgation": {"date": "2021-10-23", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "2022-01-01",
            },
            "https://flk.npc.gov.cn/detail?id=ff8081817cac3b2d017cac5a6c6f0109",
        ),
        build_lawtext_md_law(
            "tourism_2018_lawtext_md", "tourism-2018", "中华人民共和国旅游法",
            {
                "status": "现行有效（2018修正）",
                "promulgation": {"date": "2018-10-26", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "2013-10-01",
            },
            "https://flk.npc.gov.cn/detail?id=ff8080816f135f46016f1d08f6da12f6",
        ),
        build_lawtext_md_law(
            "disabled_2018_lawtext_md", "disabled-2018", "中华人民共和国残疾人保障法",
            {
                "status": "现行有效（2018修正）",
                "promulgation": {"date": "2018-10-26", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "2008-07-01",
            },
            "https://flk.npc.gov.cn/detail?id=ff8080816f135f46016f1d134c88132b",
        ),
        build_lawtext_md_law(
            "unfair_comp_2025_lawtext_md", "unfair-competition-2025", "中华人民共和国反不正当竞争法",
            {
                "status": "现行有效（2025修正）",
                "promulgation": {"date": "2025-06-27", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "2025-10-15",
            },
            "https://flk.npc.gov.cn/detail?id=ff808181971552b40197b1016efc5437",
        ),
        build_lawtext_md_law(
            "environment_2014_lawtext_md", "environment-2014", "中华人民共和国环境保护法",
            {
                "status": "现行有效（2014修订）",
                "promulgation": {"date": "2014-04-24", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "2015-01-01",
            },
            "https://flk.npc.gov.cn/detail?id=2c909fdd678bf17901678bf76c1d0717",
        ),
        build_lawtext_md_law(
            "id_card_2011_lawtext_md", "id-card-2011", "中华人民共和国居民身份证法",
            {
                "status": "现行有效（2011修正）",
                "promulgation": {"date": "2011-10-29", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "2004-01-01",
            },
            "https://flk.npc.gov.cn/detail?id=2c909fdd678bf17901678bf736e30627",
        ),
        build_lawtext_md_law(
            "price_1997_lawtext_md", "price-1997", "中华人民共和国价格法",
            {
                "status": "现行有效",
                "promulgation": {"date": "1997-12-29", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "1998-05-01",
            },
            "https://flk.npc.gov.cn/detail?id=2c909fdd678bf17901678bf5e05801ef",
        ),
        build_lawtext_md_law(
            "notary_2017_lawtext_md", "notary-2017", "中华人民共和国公证法",
            {
                "status": "现行有效（2017修正）",
                "promulgation": {"date": "2017-09-01", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "2006-03-01",
            },
            "https://flk.npc.gov.cn/detail?id=2c909fdd678bf17901678bf8688a0a5f",
        ),
        build_lawtext_md_law(
            "agri_quality_2022_lawtext_md", "agri-quality-2022", "中华人民共和国农产品质量安全法",
            {
                "status": "现行有效（2022修订）",
                "promulgation": {"date": "2022-09-02", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "2023-01-01",
            },
            "https://flk.npc.gov.cn/detail?id=ff80818182cf5d600182fd5d77dd23cf",
        ),
        build_lawtext_md_law(
            "anti_fraud_2022_lawtext_md", "anti-fraud-2022", "中华人民共和国反电信网络诈骗法",
            {
                "status": "现行有效",
                "promulgation": {"date": "2022-09-02", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "2022-12-01",
            },
            "https://flk.npc.gov.cn/detail?id=ff80818182cf5c220182fd54401023d6",
        ),
        build_lawtext_md_law(
            "compulsory_edu_2018_lawtext_md", "compulsory-edu-2018", "中华人民共和国义务教育法",
            {
                "status": "现行有效（2018修正）",
                "promulgation": {"date": "2018-12-29", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "2006-09-01",
            },
            "https://flk.npc.gov.cn/detail?id=ff8080816f135f46016f210efccb17b9",
        ),
        build_lawtext_md_law(
            "arbitration_2025_lawtext_md", "arbitration-2025", "中华人民共和国仲裁法",
            {
                "status": "现行有效（2025修订）",
                "promulgation": {"date": "2025-09-12", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "2026-03-01",
            },
            "https://flk.npc.gov.cn/detail?id=58d7569a322b4eca9b22feaa4f5d7d4f",
        ),
        build_lawtext_md_law(
            "company_2023_lawtext_md", "company-2023", "中华人民共和国公司法",
            {
                "status": "现行有效（2023修订）",
                "promulgation": {"date": "2023-12-29", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "2024-07-01",
            },
            "https://flk.npc.gov.cn/detail?id=ff8081818c9108eb018cb6922f750c07",
        ),
        build_lawtext_md_law(
            "police_2012_lawtext_md", "police-2012", "中华人民共和国人民警察法",
            {
                "status": "现行有效（2012修正）",
                "promulgation": {"date": "2012-10-26", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "1995-02-28",
            },
            "https://flk.npc.gov.cn/detail?id=2c909fdd678bf17901678bf74cef06a9",
        ),
        build_lawtext_md_law(
            "anti_monopoly_2022_lawtext_md", "anti-monopoly-2022", "中华人民共和国反垄断法",
            {
                "status": "现行有效（2022修正）",
                "promulgation": {"date": "2022-06-24", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "2022-08-01",
            },
            "https://flk.npc.gov.cn/detail?id=ff8081818234ccb501829f46c6ac2a5a",
        ),
        build_lawtext_md_law(
            "bankruptcy_2006_lawtext_md", "bankruptcy-2006", "中华人民共和国企业破产法",
            {
                "status": "现行有效",
                "promulgation": {"date": "2006-08-27", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "2007-06-01",
            },
            "https://flk.npc.gov.cn/detail?id=2c909fdd678bf17901678bf63c7c0343",
        ),
        build_lawtext_md_law(
            "insurance_2015_lawtext_md", "insurance-2015", "中华人民共和国保险法",
            {
                "status": "现行有效（2015修正）",
                "promulgation": {"date": "2015-04-24", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "2009-10-01",
            },
            "https://flk.npc.gov.cn/detail?id=2c909fdd678bf17901678bf7c4060811",
        ),
        build_lawtext_md_law(
            "infectious_2025_lawtext_md", "infectious-2025", "中华人民共和国传染病防治法",
            {
                "status": "现行有效（2025修订）",
                "promulgation": {"date": "2025-04-30", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "2025-09-01",
            },
            "https://flk.npc.gov.cn/detail?id=ff8081819667441b019686946a752bbd",
        ),
        build_lawtext_md_law(
            "partnership_2006_lawtext_md", "partnership-2006", "中华人民共和国合伙企业法",
            {
                "status": "现行有效（2006修订）",
                "promulgation": {"date": "2006-08-27", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "2007-06-01",
            },
            "https://flk.npc.gov.cn/detail?id=2c909fdd678bf17901678bf63dce034d",
        ),
        build_lawtext_md_law(
            "tax_admin_2015_lawtext_md", "tax-admin-2015", "中华人民共和国税收征收管理法",
            {
                "status": "现行有效（2015修正）",
                "promulgation": {"date": "2015-04-24", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "2001-05-01",
            },
            "https://flk.npc.gov.cn/detail?id=2c909fdd678bf17901678bf78cff0785",
        ),
        build_lawtext_md_law(
            "commercial_bank_2015_lawtext_md", "commercial-bank-2015", "中华人民共和国商业银行法",
            {
                "status": "现行有效（2015修正）",
                "promulgation": {"date": "2015-08-29", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "2015-10-01",
            },
            "https://flk.npc.gov.cn/detail?id=2c909fdd678bf17901678bf7eba9086b",
        ),
        build_lawtext_md_law(
            "negotiable_2004_lawtext_md", "negotiable-2004", "中华人民共和国票据法",
            {
                "status": "现行有效（2004修正）",
                "promulgation": {"date": "2004-08-28", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "1996-01-01",
            },
            "https://flk.npc.gov.cn/detail?id=2c909fdd678bf17901678bf62b2a02df",
        ),
        build_lawtext_md_law(
            "emergency_2024_lawtext_md", "emergency-2024", "中华人民共和国突发事件应对法",
            {
                "status": "现行有效（2024修订）",
                "promulgation": {"date": "2024-06-28", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "2024-11-01",
            },
            "https://flk.npc.gov.cn/detail?id=ff8081818d6a424b01905f13edba2efb",
        ),
        build_lawtext_md_law(
            "work_safety_2021_lawtext_md", "work-safety-2021", "中华人民共和国安全生产法",
            {
                "status": "现行有效（2021修正）",
                "promulgation": {"date": "2021-06-10", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "2021-09-01",
            },
            "https://flk.npc.gov.cn/detail?id=ff8081817a66b816017a7956b7db0ad4",
        ),
        build_lawtext_md_law(
            "securities_2019_lawtext_md", "securities-2019", "中华人民共和国证券法",
            {
                "status": "现行有效（2019修订）",
                "promulgation": {"date": "2019-12-28", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "2020-03-01",
            },
            "https://flk.npc.gov.cn/detail?id=ff80808171e9e18101727e32b94d7de6",
        ),
        build_lawtext_md_law(
            "accounting_2024_lawtext_md", "accounting-2024", "中华人民共和国会计法",
            {
                "status": "现行有效（2024修正）",
                "promulgation": {"date": "2024-06-28", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "2000-07-01",
            },
            "https://flk.npc.gov.cn/detail?id=ff8081818d6a46390191686dca9952bf",
        ),
        build_lawtext_md_law(
            "audit_2021_lawtext_md", "audit-2021", "中华人民共和国审计法",
            {
                "status": "现行有效（2021修正）",
                "promulgation": {"date": "2021-10-23", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "2022-01-01",
            },
            "https://flk.npc.gov.cn/detail?id=ff8081817d99a43a017dbd2663521c3f",
        ),
        build_lawtext_md_law(
            "aml_2024_lawtext_md", "aml-2024", "中华人民共和国反洗钱法",
            {
                "status": "现行有效（2024修订）",
                "promulgation": {"date": "2024-11-08", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "2025-01-01",
            },
            "https://flk.npc.gov.cn/detail?id=ff808181927b2d1a01930c84b1c96d8b",
        ),
        build_lawtext_md_law(
            "academic_degree_2024_lawtext_md", "academic-degree-2024", "中华人民共和国学位法",
            {
                "status": "现行有效",
                "promulgation": {"date": "2024-04-26", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "2025-01-01",
            },
            "https://flk.npc.gov.cn/detail?id=ff8081818d6a424b018f1a63b49a796a",
        ),
        build_lawtext_md_law(
            "vaccine_2019_lawtext_md", "vaccine-2019", "中华人民共和国疫苗管理法",
            {
                "status": "现行有效",
                "promulgation": {"date": "2019-06-29", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "2019-12-01",
            },
            "https://flk.npc.gov.cn/detail?id=ff8080816f135f46016f219a9e101bba",
        ),
        build_lawtext_md_law(
            "martyrs_2018_lawtext_md", "martyrs-2018", "中华人民共和国英雄烈士保护法",
            {
                "status": "现行有效",
                "promulgation": {"date": "2018-04-27", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "2018-05-01",
            },
            "https://flk.npc.gov.cn/detail?id=2c909fdd678bf17901678bf8a38c0b59",
        ),
        build_lawtext_md_law(
            "family_plan_2021_lawtext_md", "family-plan-2021", "中华人民共和国人口与计划生育法",
            {
                "status": "现行有效（2021修正）",
                "promulgation": {"date": "2021-08-20", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "2021-08-20",
            },
            "https://flk.npc.gov.cn/detail?id=ff8081817ba965c4017bb8921d13077a",
        ),
        build_lawtext_md_law(
            "mental_health_2018_lawtext_md", "mental-health-2018", "中华人民共和国精神卫生法",
            {
                "status": "现行有效（2018修正）",
                "promulgation": {"date": "2018-04-27", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "2018-04-27",
            },
            "https://flk.npc.gov.cn/detail?id=2c909fdd678bf17901678bf7448a066d",
        ),
        build_lawtext_md_law(
            "anti_drug_2008_lawtext_md", "anti-drug-2008", "中华人民共和国禁毒法",
            {
                "status": "现行有效",
                "promulgation": {"date": "2007-12-29", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "2008-06-01",
            },
            "https://flk.npc.gov.cn/detail?id=2c909fdd678bf17901678bf64d550393",
        ),
        build_lawtext_md_law(
            "rural_land_2018_lawtext_md", "rural-land-2018", "中华人民共和国农村土地承包法",
            {
                "status": "现行有效（2018修订）",
                "promulgation": {"date": "2018-12-29", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "2019-01-01",
            },
            "https://flk.npc.gov.cn/detail?id=ff8080816f135f46016f2104531f1774",
        ),
        build_lawtext_md_law(
            "education_2021_lawtext_md", "education-2021", "中华人民共和国教育法",
            {
                "status": "现行有效（2021修正）",
                "promulgation": {"date": "2021-04-29", "organ": "全国人民代表大会"},
                "effective_date": "2021-04-30",
            },
            "https://flk.npc.gov.cn/detail?id=ff8081817ab22b8a017abd777cdc05d8",
        ),
        build_lawtext_md_law(
            "community_correction_2020_lawtext_md", "community-correction-2020", "中华人民共和国社区矫正法",
            {
                "status": "现行有效",
                "promulgation": {"date": "2019-12-28", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "2020-07-01",
            },
            "https://flk.npc.gov.cn/detail?id=ff80808171e9e18101727e4443b37e86",
        ),
        build_lawtext_md_law(
            "postal_2015_lawtext_md", "postal-2015", "中华人民共和国邮政法",
            {
                "status": "现行有效（2015修正）",
                "promulgation": {"date": "2015-04-24", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "2015-04-24",
            },
            "https://flk.npc.gov.cn/detail?id=2c909fdd678bf17901678bf7bb6307f3",
        ),
        build_lawtext_md_law(
            "trade_union_2021_lawtext_md", "trade-union-2021", "中华人民共和国工会法",
            {
                "status": "现行有效（2021修正）",
                "promulgation": {"date": "2021-12-24", "organ": "全国人民代表大会"},
                "effective_date": "2022-01-01",
            },
            "https://flk.npc.gov.cn/detail?id=ff8081817f072a2e017f0ae1a7f600f0",
        ),
        build_lawtext_md_law(
            "blood_donation_1998_lawtext_md", "blood-donation-1998", "中华人民共和国献血法",
            {
                "status": "现行有效",
                "promulgation": {"date": "1997-12-29", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "1998-10-01",
            },
            "https://flk.npc.gov.cn/detail?id=2c909fdd678bf17901678bf5e71801f9",
        ),
        build_lawtext_md_law(
            "tcm_2017_lawtext_md", "tcm-2017", "中华人民共和国中医药法",
            {
                "status": "现行有效",
                "promulgation": {"date": "2016-12-25", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "2017-07-01",
            },
            "https://flk.npc.gov.cn/detail?id=2c909fdd678bf17901678bf8382809ab",
        ),
        build_lawtext_md_law(
            "higher_edu_2018_lawtext_md", "higher-edu-2018", "中华人民共和国高等教育法",
            {
                "status": "现行有效（2018修正）",
                "promulgation": {"date": "2018-12-29", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "2018-12-29",
            },
            "https://flk.npc.gov.cn/detail?id=ff8080816f135f46016f20df64ec16c5",
        ),
        build_lawtext_md_law(
            "charity_2023_lawtext_md", "charity-2023", "中华人民共和国慈善法",
            {
                "status": "现行有效（2023修正）",
                "promulgation": {"date": "2023-12-29", "organ": "全国人民代表大会"},
                "effective_date": "2024-09-05",
            },
            "https://flk.npc.gov.cn/detail?id=ff8081818d6a4639018df3f1fc7e122d",
        ),
        build_lawtext_md_law(
            "special_equipment_2014_lawtext_md", "special-equipment-2014", "中华人民共和国特种设备安全法",
            {
                "status": "现行有效",
                "promulgation": {"date": "2013-06-29", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "2014-01-01",
            },
            "https://flk.npc.gov.cn/detail?id=2c909fdd678bf17901678bf74ede06c7",
        ),
        build_lawtext_md_law(
            "vocational_edu_2022_lawtext_md", "vocational-edu-2022", "中华人民共和国职业教育法",
            {
                "status": "现行有效（2022修订）",
                "promulgation": {"date": "2022-04-20", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "2022-05-01",
            },
            "https://flk.npc.gov.cn/detail?id=ff808181802d2853018044c7370108c6",
        ),
        build_lawtext_md_law(
            "maternal_infant_2017_lawtext_md", "maternal-infant-2017", "中华人民共和国母婴保健法",
            {
                "status": "现行有效（2017修正）",
                "promulgation": {"date": "2017-11-04", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "2017-11-05",
            },
            "https://flk.npc.gov.cn/detail?id=2c909fdd678bf17901678bf8867e0ad7",
        ),
        build_lawtext_md_law(
            "prison_2012_lawtext_md", "prison-2012", "中华人民共和国监狱法",
            {
                "status": "现行有效（2012修正）",
                "promulgation": {"date": "2012-10-26", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "2013-01-01",
            },
            "https://flk.npc.gov.cn/detail?id=2c909fdd678bf17901678bf745870677",
        ),
        build_lawtext_md_law(
            "mine_safety_2009_lawtext_md", "mine-safety-2009", "中华人民共和国矿山安全法",
            {
                "status": "现行有效（2009修正）",
                "promulgation": {"date": "2009-08-27", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "2009-08-27",
            },
            "https://flk.npc.gov.cn/detail?id=2c909fdd678bf17901678bf6b19e04f1",
        ),
        build_lawtext_md_law(
            "rural_revitalization_2021_lawtext_md", "rural-revitalization-2021", "中华人民共和国乡村振兴促进法",
            {
                "status": "现行有效",
                "promulgation": {"date": "2021-04-29", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "2021-06-01",
            },
            "https://flk.npc.gov.cn/detail?id=ff80818178efe3620179206d421428ce",
        ),
        build_lawtext_md_law(
            "physicians_2021_lawtext_md", "physicians-2021", "中华人民共和国医师法",
            {
                "status": "现行有效",
                "promulgation": {"date": "2021-08-20", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "2022-03-01",
            },
            "https://flk.npc.gov.cn/detail?id=ff8081817b6450e6017b657ba9500116",
        ),
        build_lawtext_md_law(
            "archives_2020_lawtext_md", "archives-2020", "中华人民共和国档案法",
            {
                "status": "现行有效（2020修订）",
                "promulgation": {"date": "2020-06-20", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "2021-01-01",
            },
            "https://flk.npc.gov.cn/detail?id=ff80808172b5f24f0172e4ef05e218d4",
        ),
        build_lawtext_md_law(
            "animal_epidemic_2021_lawtext_md", "animal-epidemic-2021", "中华人民共和国动物防疫法",
            {
                "status": "现行有效（2021修订）",
                "promulgation": {"date": "2021-01-22", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "2021-05-01",
            },
            "https://flk.npc.gov.cn/detail?id=ff8080817703add2017737395a973e31",
        ),
        build_lawtext_md_law(
            "sci_tech_2021_lawtext_md", "sci-tech-2021", "中华人民共和国科学技术进步法",
            {
                "status": "现行有效（2021修订）",
                "promulgation": {"date": "2021-12-24", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "2022-01-01",
            },
            "https://flk.npc.gov.cn/detail?id=ff8081817d99a39f017dec555db834da",
        ),
        build_lawtext_md_law(
            "metrology_2018_lawtext_md", "metrology-2018", "中华人民共和国计量法",
            {
                "status": "现行有效（2018修正）",
                "promulgation": {"date": "2018-10-26", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "2018-10-26",
            },
            "https://flk.npc.gov.cn/detail?id=ff8080816f135f46016f1cf499ff11eb",
        ),
        build_lawtext_md_law(
            "standardization_2017_lawtext_md", "standardization-2017", "中华人民共和国标准化法",
            {
                "status": "现行有效（2017修订）",
                "promulgation": {"date": "2017-11-04", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "2018-01-01",
            },
            "https://flk.npc.gov.cn/detail?id=2c909fdd678bf17901678bf876430a91",
        ),
        build_lawtext_md_law(
            "tech_transfer_2015_lawtext_md", "tech-transfer-2015", "中华人民共和国促进科技成果转化法",
            {
                "status": "现行有效（2015修正）",
                "promulgation": {"date": "2015-08-29", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "2015-10-01",
            },
            "https://flk.npc.gov.cn/detail?id=2c909fdd678bf17901678bf7e3540843",
        ),
        build_lawtext_md_law(
            "accessibility_2023_lawtext_md", "accessibility-2023", "中华人民共和国无障碍环境建设法",
            {
                "status": "现行有效",
                "promulgation": {"date": "2023-06-28", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "2023-09-01",
            },
            "https://flk.npc.gov.cn/detail?id=ff80818188d7430b0189018493370940",
        ),
        build_lawtext_md_law(
            "medical_insurance_2027_lawtext_md", "medical-insurance-2027", "中华人民共和国医疗保障法",
            {
                "status": "已公布，尚未生效（2027-01-01 施行）",
                "promulgation": {"date": "2026-08-28", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "2027-01-01",
            },
            "https://flk.npc.gov.cn/detail?id=5d298a33dc474da595bf956cec680163",
        ),
        build_lawtext_md_law(
            "env_tax_2025_lawtext_md", "env-tax-2025", "中华人民共和国环境保护税法",
            {
                "status": "现行有效（2025修正）",
                "promulgation": {"date": "2025-10-28", "organ": "全国人民代表大会常务委员会"},
                "effective_date": "2025-10-28",
            },
            "https://flk.npc.gov.cn/detail?id=6bae366fd9f94fbf9450c48a68bfc68a",
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
