# -*- coding: utf-8 -*-
"""具名专业解读证据层。

只登记元数据、项目原创摘要和外链；不在未获授权时复制专业文章全文。
覆盖分衡量“当前收集到哪些层级的证据”，绝不表示正确率、胜诉概率或模型置信度。
"""
import json
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlsplit

from .article_links import links_for
from .corpus import get_corpus

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "expert_commentaries.json"
ALLOWED_KINDS = {"academic_roundtable", "academic_article", "academic_commentary", "official-expert-commentary", "practitioner_commentary"}
ALLOWED_GRADES = {"强", "中", "弱"}
ALLOWED_SOURCE_HOSTS = {"law.cufe.edu.cn", "fxy.buaa.edu.cn", "www.moj.gov.cn"}


@lru_cache(maxsize=1)
def load_registry() -> dict:
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    if data.get("schema_version") != 1 or not isinstance(data.get("commentaries"), list):
        raise ValueError("专业解读登记册 schema 不受支持")
    corpus = get_corpus()
    seen: set[str] = set()
    for item in data["commentaries"]:
        iid = str(item.get("id") or "").strip()
        if not iid or iid in seen:
            raise ValueError("专业解读登记册存在空或重复 id")
        seen.add(iid)
        if item.get("source_kind") not in ALLOWED_KINDS or item.get("evidence_grade") not in ALLOWED_GRADES:
            raise ValueError(f"专业解读来源分类无效: {iid}")
        if item.get("rights") != "link-and-original-summary":
            raise ValueError(f"专业解读转载边界未锁定: {iid}")
        for field in ("title", "published_at", "accessed_at", "summary", "scope_note"):
            if not str(item.get(field) or "").strip():
                raise ValueError(f"专业解读缺少 {field}: {iid}")
        for url_field in ("source_url",):
            parsed = urlsplit(str(item.get(url_field) or ""))
            if parsed.scheme != "https":
                raise ValueError(f"专业解读来源不是 HTTPS: {iid}")
            if (parsed.hostname or "").lower() not in ALLOWED_SOURCE_HOSTS:
                raise ValueError(f"专业解读来源域名未登记: {iid}")
        authors = item.get("authors")
        if not isinstance(authors, list) or not authors:
            raise ValueError(f"专业解读缺少具名作者: {iid}")
        for author in authors:
            if not all(str(author.get(k) or "").strip() for k in ("name", "credential", "credential_source_url")):
                raise ValueError(f"专业解读作者资质元数据不完整: {iid}")
            credential_url = urlsplit(author["credential_source_url"])
            if credential_url.scheme != "https":
                raise ValueError(f"专业解读作者资质来源不是 HTTPS: {iid}")
            if (credential_url.hostname or "").lower() not in ALLOWED_SOURCE_HOSTS:
                raise ValueError(f"专业解读作者资质来源域名未登记: {iid}")
        article_nos = item.get("article_nos")
        if not isinstance(article_nos, list) or not article_nos:
            raise ValueError(f"专业解读没有绑定条文: {iid}")
        for no in article_nos:
            corpus.citation_of(item["law_id"], int(no))
    return data


def for_article(law_id: str, no: int) -> list[dict]:
    return [item for item in load_registry()["commentaries"]
            if item["law_id"] == law_id and int(no) in {int(n) for n in item["article_nos"]}]


def analysis_context(law_id: str, no: int) -> dict:
    corpus = get_corpus()
    citation = corpus.citation_of(law_id, int(no))
    professional = for_article(law_id, int(no))
    official_links = links_for(law_id, int(no))
    institutions = {str(item.get("institution") or "").strip() for item in professional}

    components = [
        {"name": "现行条文原文及版本元数据", "points": 40, "present": True},
        {"name": "直接关联的官方司法解释", "points": 25, "present": bool(official_links)},
        {"name": "具名专业解读", "points": 15, "present": bool(professional)},
        {"name": "第二个独立机构的专业来源", "points": 10, "present": len(institutions) >= 2},
        {"name": "各来源均标明适用边界", "points": 10, "present": bool(professional) and all(item.get("scope_note") for item in professional)},
    ]
    score = sum(c["points"] for c in components if c["present"])
    missing = [c["name"] for c in components if not c["present"]]
    return {
        "law_id": law_id,
        "article_no": int(no),
        "citation": citation,
        "official_interpretations": official_links,
        "professional_commentaries": professional,
        "evidence_coverage": {
            "score": score,
            "max_score": 100,
            "label": "证据覆盖分",
            "not_accuracy": True,
            "components": components,
            "missing": missing,
            "method": "原文40；直接司法解释25；具名专业解读15；第二独立机构10；来源边界完整10。只计是否收录，不评价观点真伪。",
        },
        "calibrated_accuracy": {
            "status": "unavailable",
            "value": None,
            "reason": "尚无由独立法律专业人员逐题标注、按法域分层并记录样本量与误差的评测集，不能诚实给出正确率或概率。",
        },
        "limitations": [
            "专业观点可能存在分歧，且法规、司法解释与裁判尺度会变化。",
            "摘要不能替代来源全文；使用前应打开原页面核对上下文和发布日期。",
            "具体案件还取决于事实、证据、程序、地域和后续规范变化。",
        ],
        "disclaimer": "LegalHigh 仅作普法前置与证据导航，不替代执业律师。涉及诉讼、重大财产、人身自由、时限或其他高风险事项，请携完整材料交由具备相应专业能力的律师独立分析。",
    }


def prompt_context(citations: list[dict]) -> tuple[str, list[dict]]:
    contexts = [analysis_context(c["law_id"], int(c["article_no"])) for c in citations]
    blocks = []
    for ctx in contexts:
        c = ctx["citation"]
        blocks.append(f"【法条原文】《{c['law_title']}》第{c['article_no']}条：{c['text']}")
        for item in ctx["official_interpretations"]:
            blocks.append(f"【官方司法解释】{item['ref_title']}第{item['no']}条：{item['text']} 来源：{item['ref_source_url']}")
        for item in ctx["professional_commentaries"]:
            names = "、".join(a["name"] for a in item["authors"])
            blocks.append(f"【具名专业观点摘要】{names}：{item['summary']} 边界：{item['scope_note']} 来源：{item['source_url']}")
        if not ctx["professional_commentaries"]:
            blocks.append("【证据缺口】当前登记册没有与本条直接绑定的具名专业解读，不得自行补写专家观点。")
    policy = (
        "你是LegalHigh的来源约束型法律信息整理工具。只能使用下列服务端证据。必须分开说明法条原文、官方解释、专业观点和仍不确定之处；"
        "不得把学术观点说成法定结论，不得虚构律师、教授、案例或正确率。专业观点冲突时必须并列呈现。"
        "结尾必须提醒：本系统仅作普法前置，不替代执业律师，具体问题应携材料咨询律师。\n\n"
    )
    return policy + "\n".join(blocks), contexts
