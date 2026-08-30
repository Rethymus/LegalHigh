# -*- coding: utf-8 -*-
"""请求权要件模型库：四类请求权 × 要件 × 依据条文 × 关键词级 probe。

数据纪律（引用不变量）：
- 每个 element 的 citations=(law_id, no) 一律在首次取用时经 corpus.citation_of
  逐条校验存在（不存在即 KeyError——期望的保护行为，模式对齐 review.build_checkpoints）。
- analyze_claim 的「证据」只能来自用户提供的 case_text 本身：evidence_spans 的
  excerpt 是命中处前后各 ≤40 字的**原文切片**（text[ctx_start:ctx_end]），并用
  text.find(excerpt)==ctx_start 做断言式保护，绝不拼接、绝不改写。
- 未命中即 unverified（诚实缺口），status 只依据文本命中与否，不作任何法律评价。
- 本模块完全无状态：不写库、不落盘、无 LLM、无网络调用。
"""
import re

from .corpus import get_corpus

# 四类请求权模板（probes 为关键词级正则，re.IGNORECASE 匹配）。
CLAIM_TEMPLATES = {
    "loan_repayment": {  # 民间借贷·返还借款请求权（金融借贷纠纷主线场景）
        "name": "民间借贷·返还借款请求权",
        "elements": [
            {"id": "E1", "title": "借贷合意（借款合同成立）",
             "citations": [("civl-2020", 667), ("civl-2020", 668)],
             "probes": [r"借条", r"欠条", r"借款(合同|协议)", r"约定.{0,12}借款"]},
            {"id": "E2", "title": "款项实际交付（自然人借款：提供借款时成立）",
             "citations": [("civl-2020", 679)],
             "probes": [r"转账", r"汇款", r"已?支付.{0,6}(借款|款项)", r"交付"]},
            {"id": "E3", "title": "还款期限届满/催告",
             "citations": [("civl-2020", 675)],
             "probes": [r"(到期|期限届满|逾期)", r"催(告|收|款)"]},
            {"id": "E4", "title": "利率合规性（不得违反国家规定；禁止高利放贷）",
             "citations": [("civl-2020", 680), ("civl-2020", 585)],
             "probes": [r"年利率", r"月息", r"日息", r"利息.{0,10}\d+%", r"百分之"]},
            {"id": "E5", "title": "诉讼时效（三年）",
             "citations": [("civl-2020", 188)],
             "probes": [r"20\d\d\s*[年-]"]},
        ],
    },
    "breach_damage": {  # 违约责任·赔偿请求权
        "name": "违约责任·赔偿请求权",
        "elements": [
            {"id": "E1", "title": "违约行为（不履行合同义务或履行不符合约定）",
             "citations": [("civl-2020", 577)],
             "probes": [r"违约", r"未按.{0,6}履行", r"不履行"]},
            {"id": "E2", "title": "损失（赔偿等违约责任范围）",
             "citations": [("civl-2020", 577)],
             "probes": [r"损失", r"赔偿"]},
            {"id": "E3", "title": "违约金约定及司法酌减",
             "citations": [("civl-2020", 585)],
             "probes": [r"违约金", r"滞纳金", r"逾期利息"]},
        ],
    },
    "consumer_fraud": {  # 消费欺诈·惩罚性赔偿请求权
        "name": "消费欺诈·惩罚性赔偿请求权",
        "elements": [
            {"id": "E1", "title": "消费关系（购买商品或接受服务）",
             "citations": [("cl-2013", 55)],
             "probes": [r"购买", r"消费者", r"商品", r"服务费"]},
            {"id": "E2", "title": "欺诈行为（虚假宣传/虚假陈述/隐瞒）",
             "citations": [("cl-2013", 55)],
             "probes": [r"欺诈", r"虚假(宣传|陈述)", r"隐瞒"]},
            {"id": "E3", "title": "惩罚性赔偿请求（增加赔偿三倍/退一赔三）",
             "citations": [("cl-2013", 55)],
             "probes": [r"三倍", r"退一赔三", r"增加赔偿"]},
        ],
    },
    "wage_claim": {  # 劳动报酬·支付请求权
        "name": "劳动报酬·支付请求权",
        "elements": [
            {"id": "E1", "title": "劳动关系（劳动合同/用工事实）",
             "citations": [("lcl-2012", 30)],
             "probes": [r"劳动合同", r"工资", r"劳动报酬", r"用人单位"]},
            {"id": "E2", "title": "拖欠事实（拖欠/未足额支付/克扣）",
             "citations": [("lcl-2012", 30)],
             "probes": [r"拖欠", r"未(足额)?支付", r"克扣"]},
            {"id": "E3", "title": "救济途径（未签书面合同二倍工资）",
             "citations": [("lcl-2012", 82)],
             "probes": [r"未签(订)?(书面)?(劳动合同|合同)", r"二倍工资"]},
        ],
    },
}

DISCLAIMER = (
    "要件匹配为关键词级文本提示，不构成法律意见，亦不构成对案件结果的任何预测；"
    "未命中的要件不代表不成立，仅表示所提供文本中未见对应线索，请结合证据材料"
    "咨询执业律师。"
)

_SPAN_PAD = 40   # 命中处前后各取 ≤40 字原文
_SPAN_LIMIT = 5  # 每个要件最多展示的片段数


def _slice_span(text: str, start: int, end: int, pad: int = _SPAN_PAD) -> dict:
    """断言式截取：excerpt 必须是原文切片（text.find(excerpt)==ctx_start），
    否则立即抛 AssertionError——任何拼接式 excerpt 都不可能通过此保护。"""
    ctx_start = max(0, start - pad)
    ctx_end = min(len(text), end + pad)
    excerpt = text[ctx_start:ctx_end]
    if not excerpt or text.find(excerpt) != ctx_start:
        raise AssertionError("excerpt 必须是原文切片（引用不变量被破坏）")
    return {"excerpt": excerpt, "start": start}


def _probe_hits(probes: list, text: str) -> list:
    """收集全部命中（按 (start,end) 去重、按位置排序）——确定性可复现。"""
    hits, seen = [], set()
    for probe in probes:
        for m in re.finditer(probe, text, re.IGNORECASE):
            key = (m.start(), m.end())
            if key not in seen:
                seen.add(key)
                hits.append(key)
    hits.sort()
    return hits


_TEMPLATES = None


def get_templates() -> dict:
    """取用前启动校验：每条 citation 必须真实存在于语料（引用不变量硬门）。"""
    global _TEMPLATES
    if _TEMPLATES is None:
        corpus = get_corpus()
        for tpl in CLAIM_TEMPLATES.values():
            for el in tpl["elements"]:
                for citation in el["citations"]:
                    corpus.citation_of(*citation)  # 不存在即 KeyError
        _TEMPLATES = CLAIM_TEMPLATES
    return _TEMPLATES


def analyze_claim(case_text: str, claim_id: str) -> dict:
    """对 case_text 跑指定请求权的要件矩阵：命中→supported（带原文切片证据），
    未命中→unverified（诚实保留）。输出不含任何文本之外的事实。"""
    templates = get_templates()
    if claim_id not in templates:
        raise ValueError(
            f"未知的请求权类型：{claim_id}（可选：{'、'.join(templates)}）")
    corpus = get_corpus()
    text = case_text or ""
    tpl = templates[claim_id]

    elements = []
    references = []
    seen_refs = set()
    supported = 0
    for el in tpl["elements"]:
        hits = _probe_hits(el["probes"], text)
        spans = [_slice_span(text, s, e) for s, e in hits[:_SPAN_LIMIT]]
        status = "supported" if hits else "unverified"
        supported += int(status == "supported")
        citations = []
        for citation in el["citations"]:
            cit = corpus.citation_of(*citation)  # 逐条校验（不存在即 KeyError）
            citations.append(cit)
            key = (cit["law_id"], cit["article_no"])
            if key not in seen_refs:
                seen_refs.add(key)
                references.append({
                    "kind": "statute",
                    "law_id": cit["law_id"],
                    "article_no": cit["article_no"],
                    "article_label": cit["article_label"],
                    "law_title": cit["law_title"],
                    "status": cit["status"],
                    "effective_date": cit["effective_date"],
                    "source_url": cit["source_url"],
                    "text": cit["text"],
                })
        elements.append({
            "id": el["id"],
            "title": el["title"],
            "status": status,
            "evidence_spans": spans,
            "citations": citations,
        })

    unverified = len(elements) - supported
    return {
        "claim": {"id": claim_id, "name": tpl["name"]},
        "elements": elements,
        "summary": {
            "supported": supported,
            "unverified": unverified,
            "overall": (
                f"{supported} 项要件有文本支持，{unverified} 项待补充证据或线索"
                "（关键词级匹配，不构成法律意见）"
            ),
        },
        "references": references,
        "disclaimer": DISCLAIMER,
    }
