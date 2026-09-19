# -*- coding: utf-8 -*-
"""确定性需求解析：生活化描述 → 领域词 → BM25 法条与已核验案例。

用户描述常含个人或案件敏感信息，因此本入口不调用远程模型。证据只来自本地语料
与案例库；无法匹配时明确返回空结果，不让生成模型补写查询、事实或依据。
"""
import re

from . import cases as cases_mod
from .corpus import get_corpus
from .research import extract_keywords
from .retrieval_terms import domain_terms, orchestrated_search


# 只输出“候选问题方向”，不输出案由或请求权成立结论。每一项必须由用户事实中的
# 可见文字触发，并把触发片段返回给用户复核。
ISSUE_DIRECTIONS: list[tuple[str, str, str]] = [
    ("labor-pay", "劳动报酬或劳动关系方向", r"工资|欠薪|劳动合同|加班费|用人单位|辞退|离职"),
    ("housing-rental", "房屋租赁或押金返还方向", r"租房|房东|承租|出租|押金|房租"),
    ("consumer", "消费者权益或网络交易方向", r"网购|商家|消费者|退货|退款|假货|平台|三无产品"),
    ("contract", "合同履行或违约责任方向", r"合同|协议|违约|毁约|定金|约定"),
    ("loan", "借款或款项返还方向", r"借款|借贷|借钱|欠钱|还款"),
    ("traffic", "交通事故损害方向", r"车祸|交通事故|车辆|撞伤|交警"),
    ("family", "婚姻家庭方向", r"离婚|婚姻|抚养|夫妻|子女"),
    ("standard-terms", "格式条款效力方向", r"格式条款|霸王条款|免责条款"),
    ("employment-equality", "就业平等或招聘条件方向", r"就业歧视|招聘歧视|区别对待|平等就业"),
]


def issue_candidates(fact_parts: list[str]) -> list[dict]:
    """从用户确认的事实中产生可解释候选；无命中时诚实返回 unknown。"""
    candidates: list[dict] = []
    for issue_id, label, pattern in ISSUE_DIRECTIONS:
        basis = [part[:180] for part in fact_parts if re.search(pattern, part, re.I)]
        if not basis:
            continue
        matches: list[str] = []
        for part in basis:
            matches.extend(m.group(0) for m in re.finditer(pattern, part, re.I))
        candidates.append({
            "id": issue_id,
            "label": label,
            "status": "candidate",
            "matched_terms": list(dict.fromkeys(matches))[:8],
            "fact_basis": basis[:4],
            "note": "仅由用户填写事实中的关键词触发，不代表案件定性、案由或请求权成立。",
        })
    return candidates or [{
        "id": "unknown", "label": "尚不能判断法律问题方向", "status": "unknown",
        "matched_terms": [], "fact_basis": [],
        "note": "当前事实没有命中受控分类词表；请补充起因、经过和当前结果，系统不会默认套用借贷或其他案件模型。",
    }]


# 度量/数词字符：分词噪声（如「三个月」切出的「三个」「个月」）不含实义检索价值，
# 含任一此类字符的二元组不进入关键词（D4 降噪；域名词不受影响）。
_MEASURE_CHARS = set("零〇一二三四五六七八九十百千万亿两几个年月日天元块钱")


# 关键事实清单（FLERF 报告 §8「unknown_material_facts」的确定性形态，R165）：
# 每个领域列出作出法律判断通常必需的事实项；凡用户描述中未见对应词面即列入「缺失」。
# 目的是防止系统（或任何人）看见「迟到两次」就断言「严重违反规章制度」——
# 缺失的事实只能被提示补充，不能被脑补。清单只提示补充方向，不构成案件定性。
MATERIAL_FACT_CHECKLISTS: list[dict] = [
    {
        "domain": "劳动报酬与劳动关系",
        "pattern": r"工资|欠薪|不发工资|劳动报酬|加班费|辞退|离职|开除|用人单位|劳动合同",
        "facts": [
            {"id": "employment-duration", "fact": "劳动关系存续时间（入职/离职日期）",
             "detect": r"入职|离职|\d+\s*年|\d+\s*个月|20\d\d\s*年",
             "why": "经济补偿按工作年限计算，年限不清则无法估算补偿区间。"},
            {"id": "wage-standard", "fact": "工资标准与构成（月薪/时薪/加班费基数）",
             "detect": r"月薪|日薪|底薪|时薪|工资.{0,8}\d|一个月.{0,4}\d",
             "why": "补偿与赔偿多以离职前平均工资为基数，标准缺失只能给规则不能给区间。"},
            {"id": "written-contract", "fact": "是否签订书面劳动合同",
             "detect": r"书面合同|没签.{0,4}合同|未.{0,4}签.{0,6}合同|签订.{0,4}劳动合同",
             "why": "未签书面合同另有二倍工资等规则，与已签合同的处理路径不同。"},
            {"id": "termination-reason", "fact": "单位给出的解除/终止理由与制度依据",
             "detect": r"理由|原因|规章制度|严重违反|解除通知|书面通知",
             "why": "不同解除事由对应不同补偿/赔偿规则；「迟到」「顶嘴」等片段不足以认定「严重违反规章制度」，须以依法制定并公示的制度与证据为准。"},
        ],
    },
    {
        "domain": "消费者权益与网络交易",
        "pattern": r"网购|商家|消费者|退货|退款|假货|平台|三无产品|欺诈",
        "facts": [
            {"id": "purchase-channel", "fact": "购买渠道与凭证（平台订单/线下小票/聊天记录）",
             "detect": r"平台|订单|小票|发票|聊天记录|截图",
             "why": "渠道决定适用网络交易规则还是线下规则，凭证决定能否举证。"},
            {"id": "goods-condition", "fact": "商品状态与问题描述（是否使用/瑕疵表现）",
             "detect": r"质量|破损|过期|瑕疵|假货|描述.{0,4}符",
             "why": "七日无理由退货与质量问题的适用条件不同（前者有商品完好要求）。"},
            {"id": "merchant-response", "fact": "商家/平台当前处理态度（是否拒绝、有无承诺）",
             "detect": r"拒绝|同意|退款.{0,4}到|客服|承诺",
             "why": "有无承诺与拒绝记录影响救济路径与时效起算。"},
        ],
    },
    {
        "domain": "房屋租赁",
        "pattern": r"租房|房东|承租|出租|押金|房租|租客|中介",
        "facts": [
            {"id": "lease-contract", "fact": "有无书面租赁合同及其押金/解约条款",
             "detect": r"合同|协议|条款|押金条",
             "why": "押金返还与违约责任首先按合同约定处理。"},
            {"id": "deposit-amount", "fact": "押金数额与支付凭证",
             "detect": r"押金.{0,6}\d|\d.{0,4}押金|转账|收据",
             "why": "押金请求的金额与举证都依赖数额与凭证。"},
            {"id": "checkout-status", "fact": "退租/交房是否完成、房屋交接状态",
             "detect": r"退租|交房|搬走|到期|解约",
             "why": "交接状态决定返还请求是否已到期可主张。"},
        ],
    },
    {
        "domain": "借款与款项返还",
        "pattern": r"借款|借贷|借钱|欠钱|还款|欠款|借条",
        "facts": [
            {"id": "loan-evidence", "fact": "借款凭证（借条/转账记录/聊天记录）",
             "detect": r"借条|转账|记录|聊天|凭证|欠条",
             "why": "民间借贷须证明合意与交付，凭证决定主张能否成立。"},
            {"id": "loan-amount-date", "fact": "借款金额与约定还款时间",
             "detect": r"\d+\s*(元|万)|约定.{0,6}还|到期|还款日",
             "why": "金额与还款期影响诉讼时效起算与利息主张。"},
        ],
    },
]


def missing_material_facts(text: str) -> list[dict]:
    """确定性「缺失关键事实」清单：领域命中后，凡描述中未见对应词面的事实项列入缺失。

    只提示补充方向与咨询律师时应携带的信息，不断言案件定性（报告 §8：AI 不得
    看见片段事实就推断「严重违反规章制度」一类的中间结论）。
    """
    out: list[dict] = []
    for group in MATERIAL_FACT_CHECKLISTS:
        if not re.search(group["pattern"], text or "", re.I):
            continue
        missing = [f for f in group["facts"]
                   if not re.search(f["detect"], text or "", re.I)]
        if not missing:
            continue
        out.append({
            "domain": group["domain"],
            "missing": [{"id": f["id"], "fact": f["fact"], "why": f["why"]} for f in missing],
            "note": "以上为常见必需事实的缺失提示，用于补充描述或咨询律师时对照携带；"
                    "不代表案件定性，系统不会替你假设这些事实的答案。",
        })
    return out[:3]


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
    ranked, retrieval = orchestrated_search(corpus, " ".join(keywords[:8]), top_k=article_limit)

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
    return {"articles": articles, "cases": matched_cases, "retrieval_meta": retrieval}


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
    # 关键事实缺失清单（报告 §8 unknown_material_facts）：只提示补充，不脑补结论。
    parse["missing_material_facts"] = missing_material_facts(text)
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
        "retrieval_meta": evidence["retrieval_meta"],
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
    trigger = str(payload.get("trigger") or "").strip()[:2000]
    actual_outcome = str(payload.get("actual_outcome") or "").strip()[:2000]
    desired_outcome = str(payload.get("desired_outcome") or "").strip()[:2000]

    missing_questions: list[str] = []
    if not timeline:
        missing_questions.append("关键事件分别在什么时候发生？请按先后顺序补充日期或大致时间。")
    if not actual_outcome:
        missing_questions.append("事情目前造成了什么实际结果、损失或影响？如果尚无结果，请写“暂无/待确认”。")
    if not parties:
        missing_questions.append("涉及哪些人或机构？请只写称谓/角色，避免输入身份证号等敏感信息。")
    if not evidence_owned:
        missing_questions.append("你目前掌握哪些合同、聊天、付款、通知、照片或其他材料？")
    if not desired_outcome:
        missing_questions.append("你希望解决什么问题，例如退款、支付工资、停止侵害或了解办理路径？")

    # 法律依据检索只使用事实，不把用户期望或提问当成已经发生的事实。
    fact_parts = [x for x in [summary, trigger, *timeline, actual_outcome, *parties] if x]
    fact_text = "\n".join(fact_parts)
    parsed = deterministic_parse(fact_text)
    parsed["keywords_display"] = curate_display(parsed["keywords"], domain_terms(fact_text))
    parsed["missing_material_facts"] = missing_material_facts(fact_text)
    candidates = issue_candidates(fact_parts)
    parsed["issue_type"] = candidates[0]["label"] if len(candidates) == 1 else f"{len(candidates)} 个候选方向"
    parsed["understood"] = "已按用户确认的信息形成事实记录，并在本地语料中检索可能相关的依据。"

    checklist = [{"item": item, "state": "已掌握", "source": "用户填写"} for item in evidence_owned]
    checklist += [{"item": item, "state": "待取得/待确认", "source": "用户填写"} for item in evidence_missing]
    if re.search(r"合同|协议|租房|劳动|借款", fact_text) and not any("合同" in x for x in evidence_owned):
        checklist.append({"item": "合同、协议或能够证明约定内容的记录", "state": "建议核对", "source": "确定性规则提示"})
    if re.search(r"付款|工资|押金|借款|欠钱|退款", fact_text) and not any(re.search(r"付款|转账|工资|收据", x) for x in evidence_owned):
        checklist.append({"item": "付款、转账、工资或收据记录", "state": "建议核对", "source": "确定性规则提示"})
    if not any(re.search(r"聊天|短信|邮件|通知", x) for x in evidence_owned):
        checklist.append({"item": "与对方沟通的原始记录及其时间", "state": "建议核对", "source": "确定性规则提示"})

    checklist = [{"id": f"material-{i + 1}", "verification": "user-reported" if x["source"] == "用户填写" else "rule-suggested", **x}
                 for i, x in enumerate(checklist)]
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
            "summary": summary, "trigger": trigger, "timeline": timeline,
            "actual_outcome": actual_outcome, "parties": parties,
            "desired_outcome": desired_outcome, "questions": questions,
            "missing_questions": missing_questions, "evidence_checklist": checklist,
            "issue_candidates": candidates,
            "field_status": {
                "summary": "filled", "trigger": "filled" if trigger else "not_provided",
                "timeline": "filled" if timeline else "not_provided",
                "actual_outcome": "filled" if actual_outcome else "not_provided",
                "parties": "filled" if parties else "not_provided",
                "evidence_owned": "filled" if evidence_owned else "not_provided",
                "evidence_missing": "filled" if evidence_missing else "not_provided",
                "desired_outcome": "filled" if desired_outcome else "not_provided",
                "questions": "filled" if questions else "not_provided",
            },
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
        "retrieval_meta": evidence["retrieval_meta"],
        "corpus_size": len(corpus.articles),
        "disclaimer": "这是求助前的事实与证据准备记录，不是案件定性、法律意见或结果预测。"
                      "系统没有替你确认事实；正式行动前请核对官方来源并向法律援助机构或受委托的专业律师咨询。",
    }
