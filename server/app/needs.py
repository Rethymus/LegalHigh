# -*- coding: utf-8 -*-
"""需求解析管线（Needs Parse）：抽象/语序不当的用户描述 → 可溯源的法条 + 案例。

「薄 AI」双轨（调研 docs/research/需求解析与可溯源检索调研-2026-08-30.md）：
- Stage A 理解层（AI 可选，受控）：LLM 仅做改写与结构化（固定 schema），不产出事实；
  未配置模型 / 解析失败 → 降级为确定性关键词抽取。
- Stage B 取证层（确定性）：keywords → BM25 法条检索（citation_of 逐条校验）+ 案例样本检索。
- Stage C 呈现层：全部条目携带官方核对入口 / 快照链接；案由等判断显式标注「假设」。

幻觉防线：AI 只写查询，不写证据；证据一律来自本地语料与样本库。
"""
import json
import re

from . import cases as cases_mod
from . import ai_governor
from .corpus import get_corpus
from .research import extract_keywords

PARSE_SCHEMA = (
    '输出严格 JSON（不要代码块）：{"understood": "用中性语言重述用户问题(≤60字)", '
    '"issue_type": "民事|刑事|行政|劳动|其他", '
    '"assumed_causes": ["可能的案由假设(1-3个)"], '
    '"keywords": ["法律术语检索词(3-8个，如：劳动合同/违约金/格式条款)"], '
    '"cautions": ["用户应注意的证据或时效事项(1-3条)"]}。'
)


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


def ai_parse(text: str, *, provider_id: str, model: str, api_key: str | None = None,
             base_url_override: str | None = None) -> dict:
    """Stage A：受控 LLM 结构化理解。JSON 解析失败抛 ValueError（调用方降级）。"""
    out = ai_governor.chat(
        provider_id, model,
        [
            {"role": "system", "content":
                "你是法律需求解析器。任务：把用户可能抽象、语序不当的描述改写为结构化检索计划。"
                "规则：①不解释法条、不引用任何具体法条或案例（取证由系统完成）；②keywords 用规范法律术语；"
                "③无法确定的信息放入 cautions 而不是臆测；" + PARSE_SCHEMA},
            {"role": "user", "content": text},
        ],
        api_key=api_key, base_url_override=base_url_override, temperature=0.1)
    if out.get("blocked"):
        raise ValueError("解析输出未通过合规 gate（红线词），已拦截")
    raw = out["text"].strip()
    raw = re.sub(r"^```(json)?|```$", "", raw, flags=re.M).strip()
    start, end = raw.find("{"), raw.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("AI 输出中未找到 JSON 结构")
    parsed = json.loads(raw[start:end + 1])
    kws = [str(k).strip() for k in parsed.get("keywords", []) if str(k).strip()]
    if not kws:
        raise ValueError("AI 输出缺少 keywords")
    return {
        "understood": str(parsed.get("understood") or text[:60])[:80],
        "issue_type": str(parsed.get("issue_type") or "其他"),
        "assumed_causes": [str(x) for x in (parsed.get("assumed_causes") or [])][:3],
        "keywords": kws[:8],
        "cautions": [str(x) for x in (parsed.get("cautions") or [])][:3],
        "by": f"ai:{provider_id}/{model}",
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


def parse_needs(text: str, *, ai: dict | None = None) -> dict:
    """入口：text 为用户模糊描述。ai = {provider_id, model, api_key?, base_url_override?} 可选。"""
    text = (text or "").strip()
    if len(text) < 4:
        raise ValueError("描述过短：请补充具体情形（如「老板拖欠三个月工资」）")

    parse = None
    ai_error = None
    if ai and ai.get("provider_id") and ai.get("model"):
        try:
            parse = ai_parse(text, provider_id=ai["provider_id"], model=ai["model"],
                             api_key=ai.get("api_key"), base_url_override=ai.get("base_url_override"))
        except (ValueError, RuntimeError, PermissionError) as e:
            ai_error = str(e)  # AI 理解失败 → 降级，不阻塞取证
    if parse is None:
        parse = deterministic_parse(text)

    evidence = fetch_evidence(parse["keywords"])
    corpus = get_corpus()
    return {
        "input": text,
        "parse": parse,
        "ai_error": ai_error,
        "articles": evidence["articles"],
        "cases": [
            {"id": c["id"], "name": c["name"], "name_en": c.get("name_en"), "no": c["no"],
             "court": c["court"], "date": c["date"], "cause": c["cause"], "level": c["level"],
             "summary": c["summary"], "kind": c["kind"], "grade": c["grade"],
             "source_note": c["source_note"], "verified": c["verified"],
             "official_entries": [
                 {"name": "最高法典型案例栏目（官方发布入口）", "url": "https://www.court.gov.cn/zixun/gengduo/104_3.html"},
                 {"name": "人民法院案例库（官方检索）", "url": "https://rmfyalk.court.gov.cn"},
                 {"name": "最高检网上发布厅", "url": "https://www.spp.gov.cn"},
             ] if c["level"] == "指导性案例" else [
                 {"name": "CourtListener 站内检索（官方镜像库）", "url": "https://www.courtlistener.com/?q=" + c["name_en"] if c.get("name_en") else "https://www.courtlistener.com"},
             ] or None}
            for c in evidence["cases"]
        ],
        "articles_none": len(evidence["articles"]) == 0,
        "corpus_size": len(corpus.articles),
        "disclaimer": "解析结果为检索线索（AI 仅参与改写，证据来自本地语料），不构成法律意见；"
                      "真实法律求助请咨询执业律师，经济困难可申请法律援助或拨打 12348。",
    }
