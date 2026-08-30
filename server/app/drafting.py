# -*- coding: utf-8 -*-
"""文书起草：结构化模板引擎（律师函 / 合同 / 民事起诉状）。

设计原则（对应调研报告 §8）：
- 版式由结构化模板（字段+条件分支）决定，不让自由生成决定版式；
- 文书中的法条引用全部来自本库语料并携带版本/施行日期快照（时效护栏）；
- 状态机在 storage.transition_draft 强制执行：draft → verified(执业律师) → issued。
"""
from datetime import date

from .corpus import get_corpus

TEMPLATE_VERSION = "1.0"

LETTER_FIELDS = [
    {"key": "firm", "label": "发函律所", "type": "text", "required": True, "placeholder": "如：北京某某律师事务所"},
    {"key": "lawyer", "label": "承办律师姓名", "type": "text", "required": True, "placeholder": "执业律师姓名"},
    {"key": "license_no", "label": "律师执业证号", "type": "text", "required": True, "placeholder": "如：1110120XX12345678"},
    {"key": "client", "label": "委托人（发函方）", "type": "text", "required": True},
    {"key": "recipient", "label": "收函对象", "type": "text", "required": True, "placeholder": "公司全称或个人姓名"},
    {"key": "subject", "label": "函件事由", "type": "text", "required": True, "placeholder": "如：催告支付拖欠货款"},
    {"key": "facts", "label": "事实与理由", "type": "textarea", "required": True, "placeholder": "客观陈述交易背景、对方义务与违约事实，避免情绪化与夸大表述"},
    {"key": "legal_basis", "label": "法律依据（选择库内条文）", "type": "citation_picker", "required": True},
    {"key": "demands", "label": "催告要求（每行一条）", "type": "textarea_list", "required": True, "placeholder": "如：于本函发出之日起七日内支付全部拖欠款项"},
    {"key": "deadline", "label": "履行期限", "type": "text", "required": True, "placeholder": "如：本函发出之日起七日内"},
    {"key": "contact", "label": "联系方式", "type": "text", "required": False, "placeholder": "电话 / 地址"},
]

CONTRACT_FIELDS = [
    {"key": "contract_type", "label": "合同类型", "type": "select", "required": True,
     "options": ["服务合同", "房屋租赁合同"]},
    {"key": "contract_no", "label": "合同编号", "type": "text", "required": False, "placeholder": "如：LH-2026-001"},
    {"key": "party_a", "label": "甲方（全称）", "type": "text", "required": True},
    {"key": "party_a_id", "label": "甲方统一社会信用代码/证件号", "type": "text", "required": False},
    {"key": "party_b", "label": "乙方（全称）", "type": "text", "required": True},
    {"key": "party_b_id", "label": "乙方统一社会信用代码/证件号", "type": "text", "required": False},
    {"key": "preamble", "label": "鉴于条款（合作背景）", "type": "textarea", "required": False},
    {"key": "subject", "label": "标的/服务内容", "type": "textarea", "required": True},
    {"key": "amount", "label": "价款或报酬", "type": "text", "required": True, "placeholder": "建议同时写明大写金额"},
    {"key": "payment", "label": "支付方式与节点", "type": "textarea", "required": True},
    {"key": "term", "label": "履行期限", "type": "text", "required": True, "placeholder": "如：自2026年9月1日至2027年8月31日"},
    {"key": "breach_options", "label": "违约责任条款（可多选）", "type": "multi_select",
     "options": ["迟延履行按日支付违约金", "违约金总额以合同总价款的百分之二十为限", "守约方有权催告后解除合同", "逾期支付按日万分之五支付逾期利息"],
     "required": False},
    {"key": "dispute", "label": "争议解决", "type": "select", "options": ["向合同签订地人民法院起诉", "提交约定的仲裁委员会仲裁"], "required": True},
    {"key": "special_terms", "label": "其他约定", "type": "textarea", "required": False},
]

COMPLAINT_FILING_FIELDS = [
    {"key": "plaintiff", "label": "原告（姓名/名称）", "type": "text", "required": True},
    {"key": "plaintiff_info", "label": "原告信息（性别/出生日期/民族/住址或统一社会信用代码/法定代表人）", "type": "textarea", "required": True},
    {"key": "defendant", "label": "被告（姓名/名称）", "type": "text", "required": True},
    {"key": "defendant_info", "label": "被告信息（住址/住所地等）", "type": "textarea", "required": True},
    {"key": "claims", "label": "诉讼请求（每行一条）", "type": "textarea_list", "required": True},
    {"key": "facts", "label": "事实与理由", "type": "textarea", "required": True},
    {"key": "evidence", "label": "证据和证据来源（每行一条）", "type": "textarea_list", "required": False},
    {"key": "court", "label": "受诉法院", "type": "text", "required": True, "placeholder": "如：某某市某某区人民法院"},
    {"key": "legal_basis", "label": "法律依据（选择库内条文，可选）", "type": "citation_picker", "required": False},
]

TEMPLATES = {
    "lawyer_letter": {
        "template_id": "lawyer_letter",
        "name": "律师函（催告函）",
        "description": "以律所名义发出的催告函草稿。须由执业律师核验并签发后方可对外发送（《律师法》第13条：非律师不得以律师名义执业——本系统仅生成草稿，签发权在执业律师）。",
        "gate": {"verify_label": "执业律师核验", "issue_label": "律师签发", "require_role": "执业律师"},
        "fields": LETTER_FIELDS,
    },
    "contract": {
        "template_id": "contract",
        "name": "合同（服务/租赁）",
        "description": "场景化合同草稿：条款结构对齐常见实务体例，生成后可一键转入「合同审查」模块做三类条款批注审查。",
        "gate": {"verify_label": "人工核验", "issue_label": "确认定稿", "require_role": "执业律师"},
        "fields": CONTRACT_FIELDS,
    },
    "civil_complaint": {
        "template_id": "civil_complaint",
        "name": "民事起诉状",
        "description": "要素式诉讼文书模板（程序指引属性）：按最高法诉讼文书样式的要素结构生成，明示不构成法律意见、不建立委托关系。",
        "gate": {"verify_label": "人工核验", "issue_label": "确认定稿", "require_role": "执业律师"},
        "fields": COMPLAINT_FILING_FIELDS,
    },
}


def parse_citations(items):
    corpus = get_corpus()
    out = []
    for it in items or []:
        law_id, no = it.get("law_id"), it.get("article_no")
        if not law_id or no is None:
            continue
        out.append(corpus.citation_of(law_id, int(no)))
    return out


def _snapshot():
    corpus = get_corpus()
    return {
        "generated_at": date.today().isoformat(),
        "template_version": TEMPLATE_VERSION,
        "corpus_manifest": {
            "fetch_date": corpus.manifest.get("fetch_date"),
            "laws": [{"law_id": l["law_id"], "title": l["title"], "status": l["status"], "article_count": l["article_count"]} for l in corpus.manifest["laws"]],
        },
    }


def build_lawyer_letter(f: dict):
    citations = parse_citations(f.get("legal_basis"))
    demands = [x.strip() for x in (f.get("demands") or "").split("\n") if x.strip()]
    sections = [
        {"type": "title", "text": "律师函"},
        {"type": "subtitle", "text": f"——关于{f.get('subject', '')}的函"},
        {"type": "para_noindent", "text": f"致：{f.get('recipient', '')}"},
        {"type": "para", "text": f"{f.get('firm', '')}（以下简称「本所」）接受{f.get('client', '')}（以下简称「委托人」）的委托，指派{f.get('lawyer', '')}律师（执业证号：{f.get('license_no', '')}）就{f.get('subject', '')}事宜向您致函如下："},
        {"type": "heading", "text": "一、事实与理由"},
        {"type": "para", "text": f.get("facts", "")},
        {"type": "heading", "text": "二、法律依据"},
    ]
    for c in citations:
        sections.append({"type": "para", "text": f"《{c['law_title']}》{c['article_label']}（{c['status']}，施行日期：{c.get('effective_date') or '见文本'}）：{c['text']}"})
    sections.append({"type": "heading", "text": "三、催告要求"})
    for i, d in enumerate(demands, 1):
        sections.append({"type": "numbered", "n": i, "text": d})
    sections += [
        {"type": "para", "text": f"请您于{f.get('deadline', '收函后合理期限内')}履行上述义务。逾期未履行的，委托人将保留依法采取进一步措施（包括但不限于提起诉讼、申请财产保全等）追究相应法律责任的权利，由此产生的费用与后果由您承担。"},
        {"type": "heading", "text": "四、其他"},
        {"type": "para", "text": "如您对本函所述事项存有异议，请于收函后以书面形式与本所联系并提供相应依据。"},
        {"type": "signature", "lines": [
            f"{f.get('firm', '')}",
            f"承办律师：{f.get('lawyer', '')}（执业证号：{f.get('license_no', '')}）",
            f"联系方式：{f.get('contact', '')}" if f.get("contact") else None,
            date.today().strftime("%Y年%m月%d日"),
        ]},
    ]
    gate_note = "本文件由系统生成的草稿状态输出，未经执业律师核验签发，不得以律所/律师名义对外发送。"
    return {"sections": [s for s in sections if s], "citations": citations, "gate_note": gate_note}


def build_contract(f: dict):
    ctype = f.get("contract_type") or "服务合同"
    citations = [get_corpus().citation_of("civl-2020", 577)]
    breach = [b for b in (f.get("breach_options") or []) if b]
    sections = [
        {"type": "title", "text": ctype},
        {"type": "subtitle", "text": f"合同编号：{f.get('contract_no') or '（编号待填）'}"},
        {"type": "party", "lines": [
            f"甲方（{('出租方' if ctype == '房屋租赁合同' else '委托方')}）：{f.get('party_a', '')}" + (f"    统一社会信用代码/证件号：{f['party_a_id']}" if f.get("party_a_id") else ""),
            f"乙方（{('承租方' if ctype == '房屋租赁合同' else '受托方')}）：{f.get('party_b', '')}" + (f"    统一社会信用代码/证件号：{f['party_b_id']}" if f.get("party_b_id") else ""),
        ]},
    ]
    if f.get("preamble"):
        sections.append({"type": "para", "text": f"鉴于：{f['preamble']}甲乙双方本着平等自愿、诚实信用的原则，经协商一致，订立本合同。"})
    sections += [
        {"type": "heading", "text": "第一条  标的"},
        {"type": "para", "text": f.get("subject", "")},
        {"type": "heading", "text": "第二条  价款与支付"},
        {"type": "para", "text": f"合同价款：{f.get('amount', '')}。支付方式与节点：{f.get('payment', '')}"},
        {"type": "heading", "text": "第三条  履行期限"},
        {"type": "para", "text": f.get("term", "")},
        {"type": "heading", "text": "第四条  违约责任"},
    ]
    if breach:
        for i, b in enumerate(breach, 1):
            sections.append({"type": "numbered", "n": i, "text": b})
    else:
        sections.append({"type": "para", "text": "任何一方不履行合同义务或者履行合同义务不符合约定的，应当依法承担继续履行、采取补救措施或者赔偿损失等违约责任。"})
    sections += [
        {"type": "heading", "text": "第五条  争议解决"},
        {"type": "para", "text": f"因本合同引起的争议，双方协商解决；协商不成的，{f.get('dispute', '依法向有管辖权的人民法院起诉')}。"},
        {"type": "heading", "text": "第六条  其他"},
        {"type": "para", "text": f.get("special_terms") or "本合同一式两份，双方各执一份，自双方签字（盖章）之日起生效；未尽事宜由双方另行书面补充。"},
        {"type": "signature", "lines": [
            f"甲方（签章）：{f.get('party_a', '')}                        乙方（签章）：{f.get('party_b', '')}",
            "日期：　　　年　　月　　日　　　　　　日期：　　　年　　月　　日",
        ]},
    ]
    gate_note = "本合同文本为系统生成的草稿，仅含基础条款骨架；对外签署前应经专业复核，建议同步使用本系统「合同审查」模块对费用、账户、责任条款进行批注审查。"
    return {"sections": sections, "citations": citations, "gate_note": gate_note}


def build_civil_complaint(f: dict):
    claims = [x.strip() for x in (f.get("claims") or "").split("\n") if x.strip()]
    evidence = [x.strip() for x in (f.get("evidence") or "").split("\n") if x.strip()]
    citations = parse_citations(f.get("legal_basis"))
    sections = [
        {"type": "title", "text": "民事起诉状"},
        {"type": "party", "lines": [
            f"原告：{f.get('plaintiff', '')}　{f.get('plaintiff_info', '')}",
            f"被告：{f.get('defendant', '')}　{f.get('defendant_info', '')}",
        ]},
        {"type": "heading", "text": "诉讼请求"},
    ]
    for i, c in enumerate(claims, 1):
        sections.append({"type": "numbered", "n": i, "text": c})
    sections.append({"type": "heading", "text": "事实与理由"})
    sections.append({"type": "para", "text": f.get("facts", "")})
    if citations:
        sections.append({"type": "heading", "text": "法律依据"})
        for c in citations:
            sections.append({"type": "para", "text": f"《{c['law_title']}》{c['article_label']}（{c['status']}）：{c['text']}"})
    if evidence:
        sections.append({"type": "heading", "text": "证据和证据来源"})
        for i, e in enumerate(evidence, 1):
            sections.append({"type": "numbered", "n": i, "text": e})
    sections += [
        {"type": "closing", "text": f"此致\n{f.get('court', '')}"},
        {"type": "signature", "lines": ["具状人（签名/盖章）：", date.today().strftime("%Y年%m月%d日")]},
    ]
    gate_note = "本起诉状为要素式模板生成的草稿（程序指引属性）：不构成法律意见、不建立委托关系；提交法院前请经人工核验，并核对管辖、诉讼时效与证据清单。"
    return {"sections": sections, "citations": citations, "gate_note": gate_note}


BUILDERS = {"lawyer_letter": build_lawyer_letter, "contract": build_contract, "civil_complaint": build_civil_complaint}


def generate(template_id: str, fields: dict):
    if template_id not in TEMPLATES:
        raise KeyError(f"unknown template: {template_id}")
    tpl = TEMPLATES[template_id]
    missing = [f["label"] for f in tpl["fields"] if f.get("required") and not (fields.get(f["key"]) or (f["type"] == "citation_picker" and fields.get(f["key"])))]
    if missing:
        raise ValueError(f"必填字段缺失：{'、'.join(missing)}")
    content = BUILDERS[template_id](fields)
    return {
        "template_id": template_id,
        "fields": fields,
        "content": content,
        "snapshot": _snapshot(),
        "gate": tpl["gate"],
    }
