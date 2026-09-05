# -*- coding: utf-8 -*-
"""确定性需求解析：生活化描述 → 领域词 → BM25 法条与已核验案例。

用户描述常含个人或案件敏感信息，因此本入口不调用远程模型。证据只来自本地语料
与案例库；无法匹配时明确返回空结果，不让生成模型补写查询、事实或依据。
"""
import re

from . import cases as cases_mod
from .corpus import get_corpus
from .research import extract_keywords


# 领域词表增强（规则级，确定性）：生活语言 → 规范法律术语。词表可随语料扩充，均为通用法律概念而非虚构引用。
TOPIC_TERMS: list[tuple[str, list[str]]] = [
    (r"工资|欠薪|不发工资|劳动报酬|加班费", ["劳动报酬", "劳动合同", "工资支付"]),
    (r"押金|租房|房东|承租|转租", ["租赁合同", "押金", "出租人"]),
    (r"假货|退货|网购|欺诈|三无产品", ["欺诈", "经营者", "退货、更换、修理"]),
    (r"违约金|违约|毁约", ["违约金", "违约责任"]),
    (r"离婚|婚姻|抚养", ["离婚", "抚养"]),
    (r"借款|借.{0,2}钱|借贷|欠钱", ["借款合同", "借贷"]),
    (r"车祸|交通事故|撞", ["交通事故"]),
    (r"格式条款|霸王条款", ["格式条款"]),
    (r"竞业|竞业限制", ["竞业限制"]),
    (r"歧视|区别对待|不公正对待", ["平等就业"]),
]


def domain_terms(text: str) -> list[str]:
    """规则匹配：把生活语言映射为规范法律术语（确定性，无 AI 参与）。"""
    out: list[str] = []
    for pat, terms in TOPIC_TERMS:
        if re.search(pat, text or "", re.I):
            for t in terms:
                if t not in out:
                    out.append(t)
    return out


# 度量/数词字符：分词噪声（如「三个月」切出的「三个」「个月」）不含实义检索价值，
# 含任一此类字符的二元组不进入关键词（D4 降噪；域名词不受影响）。
_MEASURE_CHARS = set("零〇一二三四五六七八九十百千万亿两几个年月日天元块钱")


def _is_noise_token(tok: str) -> bool:
    return any(ch in _MEASURE_CHARS for ch in tok)


def clean_keywords(raw: list[str], domain: list[str]) -> list[str]:
    """确定性路径的关键词清洗：去度量/数词噪声，去域名词的子串冗余（如「工资」⊂「工资支付」）。
    结果确定可测；跨词二元组（如「板拖」）为 bigram 切分固有噪声，对 BM25 无害，显示层可接受。"""
    out: list[str] = []
    for t in raw:
        if _is_noise_token(t):
            continue
        if any(t in d for d in domain):
            continue
        if t not in out:
            out.append(t)
    return out


def curate_display(keywords: list[str], domain: list[str], cap: int = 8) -> list[str]:
    """展示层降噪（决策项2，2026-08-30 决议：不引入 jieba）：检索仍用完整 keywords
    （bigram 跨词噪声对 BM25 无害）。对外展示：
    - 命中规则域词时，只显示域词——域词即人工维护的规范词表，生成二元组属检索内部词，
      不作为面向用户的「关键词」呈现（跨词噪声如「板拖」无法在无分词器下可靠判定）；
    - 未命中域词时，显示生成词（做包含去重 + 截断），并由 cautions 如实标注来源。
    结果确定可测。"""
    if domain:
        return list(domain)[:cap]
    kept: list[str] = []
    for t in keywords:
        t = (t or "").strip()
        if not t or t in kept:
            continue
        if any(t in k or k in t for k in kept):
            continue
        kept.append(t)
        if len(kept) >= cap:
            break
    return kept


def deterministic_parse(text: str) -> dict:
    """无 AI 降级：领域词表增强 + 关键词抽取（复用 research.extract_keywords）+ 噪声清洗。"""
    terms = domain_terms(text)
    kws = terms + clean_keywords([w for w in extract_keywords(text) if w not in terms], terms)
    if not kws:
        kws = [w for w in re.findall(r"[\u4e00-\u9fff]{2,6}", text)][:5]
    return {
        "understood": f"就『{(text or '').strip()[:60]}』在现行法规语料与案例样本中检索依据",
        "issue_type": "其他",
        "assumed_causes": [],
        "keywords": kws[:8],
        "cautions": (["已根据规则词表增强检索词（无 AI 参与）。"] if terms else
                     ["以上关键词由分词程序生成（无 AI 参与），建议补充细节后重新解析。"]),
        "by": "deterministic",
    }


def fetch_evidence(keywords: list[str], *, article_limit: int = 6, case_limit: int = 4) -> dict:
    """Stage B：确定性取证（无 AI）。多关键词合并去重，按「命中词数→相关度」排序抑制噪声。"""
    corpus = get_corpus()
    merged: dict[tuple, dict] = {}
    for kw in keywords[:8]:
        for h in corpus.search(kw, top_k=4):
            key = (h["law_id"], h["no"])
            e = merged.get(key)
            if e is None:
                e = {**h, "_hits": 1}
                merged[key] = e
            else:
                e["_hits"] += 1
                if h["score"] > e["score"]:
                    e.update({k: v for k, v in h.items() if k != "_hits"})
    ranked = sorted(merged.values(), key=lambda h: (-h["_hits"], -h["score"]))[:article_limit]

    articles = []
    for h in ranked:
        cit = corpus.citation_of(h["law_id"], h["no"])  # 引用不变量收口：不存在即抛错
        articles.append({
            "law_id": cit["law_id"], "law_title": cit["law_title"], "article_no": cit["article_no"],
            "article_label": cit["article_label"], "text": cit["text"], "status": cit["status"],
            "effective_date": cit["effective_date"], "chapter": cit["chapter"],
            "score": round(h["score"], 3),
            "official_entry": "https://flk.npc.gov.cn",
            "official_entry_note": "国家法律法规数据库（官方核对入口，检索该法条目）",
            "snapshot_url": cit["source_url"],
        })

    matched_cases = []
    seen_terms = set()
    for kw in keywords[:6]:
        for c in cases_mod.search_cases(kw):
            if c["id"] in seen_terms or not c["verified"]:
                continue
            seen_terms.add(c["id"])
            matched_cases.append(c)
    matched_cases = matched_cases[:case_limit]
    return {"articles": articles, "cases": matched_cases}


def parse_needs(text: str) -> dict:
    """入口：仅在本机执行确定性规则与检索，不发送用户描述。"""
    text = (text or "").strip()
    if len(text) < 4:
        raise ValueError("描述过短：请补充具体情形（如「老板拖欠三个月工资」）")

    parse = deterministic_parse(text)

    evidence = fetch_evidence(parse["keywords"])
    corpus = get_corpus()
    # 展示降噪：域词从原文重算；内部 bigram 只参与检索，不作为专业判断展示。
    parse["keywords_display"] = curate_display(parse["keywords"], domain_terms(text))
    return {
        "input": text,
        "parse": parse,
        "ai_error": None,
        "articles": evidence["articles"],
        "cases": [
            {"id": c["id"], "name": c["name"], "name_en": c.get("name_en"), "no": c["no"],
             "court": c["court"], "date": c["date"], "cause": c["cause"], "level": c["level"],
             "summary": c["summary"], "kind": c["kind"], "grade": c["grade"],
             "source_note": c["source_note"], "source_title": c["source_title"],
             "source_url": c["source_url"], "source_accessed_at": c["source_accessed_at"],
             "verified": c["verified"],
             "official_entries": [{"name": c["source_title"], "url": c["source_url"]}]}
            for c in evidence["cases"]
        ],
        "articles_none": len(evidence["articles"]) == 0,
        "corpus_size": len(corpus.articles),
        "disclaimer": "解析结果为确定性规则与本地证据检索线索，不构成法律意见；"
                      "真实法律求助请咨询执业律师，经济困难可申请法律援助或拨打 12348。",
    }


def build_intake_plan(payload: dict) -> dict:
    """把用户逐步确认的信息整理为事实/证据清单，再执行确定性检索。

    模型不得补齐事实。每个事实项都来自用户输入；缺失内容以问题返回，供用户继续
    梳理。由此让“计划模式”推进求助准备，而不是替用户作案件结论。
    """
    summary = str(payload.get("summary") or "").strip()
    if len(summary) < 4:
        raise ValueError("请先用一句话说明发生了什么（至少 4 个字）")

    def clean_list(key: str, limit: int = 50) -> list[str]:
        raw = payload.get(key) or []
        if not isinstance(raw, list):
            raise ValueError(f"{key} 必须是列表")
        return [str(item).strip()[:500] for item in raw if str(item).strip()][:limit]

    timeline = clean_list("timeline")
    parties = clean_list("parties")
    evidence_owned = clean_list("evidence_owned")
    evidence_missing = clean_list("evidence_missing")
    questions = clean_list("questions", 20)
    desired_outcome = str(payload.get("desired_outcome") or "").strip()[:2000]

    missing_questions: list[str] = []
    if not timeline:
        missing_questions.append("关键事件分别在什么时候发生？请按先后顺序补充日期或大致时间。")
    if not parties:
        missing_questions.append("涉及哪些人或机构？请只写称谓/角色，避免输入身份证号等敏感信息。")
    if not evidence_owned:
        missing_questions.append("你目前掌握哪些合同、聊天、付款、通知、照片或其他材料？")
    if not desired_outcome:
        missing_questions.append("你希望解决什么问题，例如退款、支付工资、停止侵害或了解办理路径？")

    combined = "\n".join([summary, *timeline, *parties, desired_outcome, *questions])
    parsed = deterministic_parse(combined)
    parsed["keywords_display"] = curate_display(parsed["keywords"], domain_terms(combined))
    terms = domain_terms(combined)
    parsed["issue_type"] = "、".join(terms[:3]) if terms else "尚待进一步分类"
    parsed["understood"] = "已按用户确认的信息形成事实记录，并在本地语料中检索可能相关的依据。"

    checklist = [{"item": item, "state": "已掌握", "source": "用户填写"} for item in evidence_owned]
    checklist += [{"item": item, "state": "待取得/待确认", "source": "用户填写"} for item in evidence_missing]
    if re.search(r"合同|协议|租房|劳动|借款", combined) and not any("合同" in x for x in evidence_owned):
        checklist.append({"item": "合同、协议或能够证明约定内容的记录", "state": "建议核对", "source": "确定性规则提示"})
    if re.search(r"付款|工资|押金|借款|欠钱|退款", combined) and not any(re.search(r"付款|转账|工资|收据", x) for x in evidence_owned):
        checklist.append({"item": "付款、转账、工资或收据记录", "state": "建议核对", "source": "确定性规则提示"})
    if not any(re.search(r"聊天|短信|邮件|通知", x) for x in evidence_owned):
        checklist.append({"item": "与对方沟通的原始记录及其时间", "state": "建议核对", "source": "确定性规则提示"})

    evidence = fetch_evidence(parsed["keywords"])
    corpus = get_corpus()
    next_steps = [
        "逐项核对事实记录；不确定的内容保留为“待确认”，不要猜测补写。",
        "保留材料原件及原始载体，另做副本；记录取得时间和来源，不修改原始内容。",
        "逐条打开下方来源，核对现行状态、施行日期和原文，不只阅读系统摘要。",
    ]
    if missing_questions:
        next_steps.insert(0, "先回答缺失问题，再据更新后的事实重新检索。")
    next_steps.append("需要采取诉讼、仲裁、签署文件等行动时，把本记录交给法律援助机构或受委托的专业律师复核。")

    return {
        "input": summary,
        "intake": {
            "summary": summary, "timeline": timeline, "parties": parties,
            "desired_outcome": desired_outcome, "questions": questions,
            "missing_questions": missing_questions, "evidence_checklist": checklist,
            "next_steps": next_steps,
            "method": "user-confirmed-facts + deterministic-rules + local-BM25",
        },
        "parse": parsed,
        "ai_error": None,
        "articles": evidence["articles"],
        "cases": [
            {"id": c["id"], "name": c["name"], "name_en": c.get("name_en"), "no": c["no"],
             "court": c["court"], "date": c["date"], "cause": c["cause"], "level": c["level"],
             "summary": c["summary"], "kind": c["kind"], "grade": c["grade"],
             "source_note": c["source_note"], "source_title": c["source_title"],
             "source_url": c["source_url"], "source_accessed_at": c["source_accessed_at"],
             "verified": c["verified"],
             "official_entries": [{"name": c["source_title"], "url": c["source_url"]}]}
            for c in evidence["cases"]
        ],
        "articles_none": len(evidence["articles"]) == 0,
        "corpus_size": len(corpus.articles),
        "disclaimer": "这是求助前的事实与证据准备记录，不是案件定性、法律意见或结果预测。"
                      "系统没有替你确认事实；正式行动前请核对官方来源并向法律援助机构或受委托的专业律师咨询。",
    }
