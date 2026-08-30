# -*- coding: utf-8 -*-
"""合同审查：条款切分 + 三类审查点规则引擎（费用/账户/责任）。

规则纪律：
- 每个审查点的「依据条文」必须是本库语料中真实存在的条文（corpus.citation_of 解析，
  不存在即启动报错），或显式标记 kind="practice"（实务建议，不引用法条）——不编造依据。
- 审查点范式对齐 CUAD（NeurIPS 2021，41 类条款标注）：AI 意见绑定到条款原文最小片段。
"""
import re

from lib.textparse import cn_to_int
from .corpus import get_corpus

CLAUSE_HEAD_RE = re.compile(r"^第([零〇一二三四五六七八九十百千]+)条")
AMOUNT_RE = re.compile(r"(\d+(?:\.\d+)?)\s*%")
PCT_CAP_RE = re.compile(r"(不得超过|不超过|最高不超过|以.{0,6}为限)\s*(\d+(?:\.\d+)?)\s*%")


def segment_clauses(text: str):
    """按「第X条」切分条款；无编号文本按空行段落切分。返回条款列表（含原文 span 定位）。"""
    lines = text.replace("\r\n", "\n").split("\n")
    clauses = []
    current = None
    offset = 0
    expected = 1
    for line in lines:
        m = CLAUSE_HEAD_RE.match(line.strip())
        if m:
            n = cn_to_int(m.group(1))
            if n == expected:
                current = {"id": f"c{len(clauses) + 1}", "label": m.group(0), "no": n,
                           "heading": line.strip(), "lines": [line], "start": offset}
                clauses.append(current)
                expected += 1
                offset += len(line) + 1
                continue
        if current is None:
            if line.strip():
                current = {"id": f"c{len(clauses) + 1}", "label": "未编号段落", "no": None,
                           "heading": line.strip()[:24], "lines": [line], "start": offset}
                clauses.append(current)
                offset += len(line) + 1
                continue  # 首行已在 lines 初始化，不能再 append（曾致首段首行翻倍）
            else:
                offset += len(line) + 1
                continue
        current["lines"].append(line)
        offset += len(line) + 1
    for c in clauses:
        c["text"] = "\n".join(c["lines"]).strip()
        del c["lines"]
    # 合并连续未编号段落
    merged = []
    for c in clauses:
        if c["no"] is None and merged and merged[-1]["no"] is None:
            merged[-1]["text"] = (merged[-1]["text"] + "\n" + c["text"]).strip()
        else:
            merged.append(c)
    for i, c in enumerate(merged):
        c["id"] = f"c{i + 1}"
    return merged


def _numbers_in(text: str):
    return [float(x) for x in AMOUNT_RE.findall(text)]


def _has_cap(text: str):
    return bool(PCT_CAP_RE.search(text))


def _pct(text: str):
    """条款内出现的百分比最大值（用于违约金阈值判断）。"""
    nums = _numbers_in(text)
    return max(nums) if nums else 0.0


def _pct_near(text: str, keyword: str):
    """与关键词同句的百分比最大值：句级定位（。；！？换行分句），
    避免同一条款内其他比例（如违约金 30%）误触发定金类检查。"""
    worst = 0.0
    for sent in re.split(r"[。；！？\n]", text):
        if keyword in sent:
            p = max(_numbers_in(sent), default=0.0)
            worst = max(worst, p)
    return worst


def _l1_match(t: str) -> bool:
    """违约金/滞纳金/逾期利息偏高的口径：一次性比例 ≥24%；按日 ≥0.3%；按月 ≥2%；
    已设不超过 20% 上限的视为已作风险控制。"""
    if not re.search(r"(违约金|滞纳金|逾期利息|逾期付款利息)", t):
        return False
    p = _pct(t)
    if p <= 0:
        return False
    if _has_cap(t) and p <= 20:
        return False
    if re.search(r"(按日|每日|每天|一日|一天)", t):
        return p >= 0.3
    if re.search(r"(按月|每月)", t):
        return p >= 2
    return p >= 24


def build_checkpoints():
    """审查点库。citation=(law_id, no) 的条文一律在启动时经 corpus 校验存在。"""
    cps = [
        # ── 责任条款 ──────────────────────────────────────────────
        {"id": "L1", "category": "liability", "risk": "high",
         "title": "违约金比例明显偏高",
         "detail": "条款约定了较高比例的违约金/滞纳金/逾期利息。依《民法典》第585条，约定的违约金过分高于造成的损失的，人民法院或仲裁机构可以根据当事人请求予以适当减少；过高的比例条款在诉讼中存在被酌减风险。",
         "match": _l1_match,
         "citation": ("civl-2020", 585),
         "suggestion": "建议将比例调整至与可预见损失相匹配的水平（如日万分之三至万分之五区间），或设置总额上限条款。"},
        {"id": "L2", "category": "liability", "risk": "high",
         "title": "单方免责/概不负责条款",
         "detail": "条款存在免除或减轻己方责任的表述。依《民法典》第506条，造成对方人身损害的免责条款、因故意或重大过失造成对方财产损失的免责条款无效；第497条下格式条款不合理免责亦无效。",
         "match": lambda t: bool(re.search(r"(概不负责|不承担(任何)?责任|免除.{0,8}责任|不负(任何)?责任)", t)),
         "citation": ("civl-2020", 506),
         "suggestion": "删除或改写为在法律允许范围内限制责任的表述，并对人身损害与故意/重大过失情形不做免责安排。"},
        {"id": "L3", "category": "liability", "risk": "high",
         "title": "单方解释权/单方修改权条款",
         "detail": "「最终解释权」「单方修改规则」类条款排除了对方主要权利或重要程序保障。依《民法典》第497条，提供格式条款一方不合理地免除或减轻其责任、加重对方责任、限制或排除对方主要权利的，该格式条款无效。",
         "match": lambda t: bool(re.search(r"(最终解释权|单方解释|保留.{0,8}解释权|有权单方(修改|变更|调整)|无需(另行)?通知.{0,10}(修改|变更|调整))", t)),
         "citation": ("civl-2020", 497),
         "suggestion": "改为「双方协商一致后书面变更」；保留解释权表述整体删除。"},
        {"id": "L4", "category": "liability", "risk": "medium",
         "title": "单方解除权缺乏对等约束",
         "detail": "条款赋予一方单方/随时解除权而未见对等程序约束。依《民法典》第562条，约定解除应明确解除事由；单方解除权宜与通知程序、合理期限、善后安排配套。",
         "match": lambda t: bool(re.search(r"(单方解除|随时解除|无需.{0,6}理由.{0,8}解除|径行解除)", t)) and not re.search(r"(通知|协商|书面)", t),
         "citation": ("civl-2020", 562),
         "suggestion": "补充解除通知程序（提前X日书面通知）、解除后果与已履行部分结算方式。"},
        {"id": "L5", "category": "liability", "risk": "low",
         "title": "连带责任表述宜明确设定依据",
         "detail": "条款出现连带责任表述。依《民法典》第178条，连带责任由法律规定或者当事人约定；建议明确责任份额与追偿安排，避免扩张解释。",
         "match": lambda t: bool(re.search(r"连带(责任|赔偿)", t)) and not re.search(r"(按份|份额|追偿)", t),
         "citation": ("civl-2020", 178),
         "suggestion": "明确连带责任适用情形、内部份额与追偿机制。"},
        {"id": "L6", "category": "liability", "risk": "medium",
         "title": "违约责任条款缺失",
         "detail": "全文未见明确的违约责任安排。依《民法典》第577条，违约方应承担继续履行、采取补救措施或者赔偿损失等责任；无约定时救济确定性下降。",
         "match": lambda t: not re.search(r"违约(责任|金)", t),
         "citation": ("civl-2020", 577),
         "suggestion": "增加违约责任条款：明确违约情形、救济方式与损失计算口径。"},

        # ── 费用条款 ──────────────────────────────────────────────
        {"id": "F1", "category": "fee", "risk": "medium",
         "title": "自动续费/自动展期缺少显著提示安排",
         "detail": "条款包含自动续费/自动展期安排。依《消费者权益保护法实施条例》第10条，经营者采取自动展期、自动续费等方式提供服务的，应当在消费者接受服务前和自动展期、自动续费等日期前，以显著方式提请消费者注意。",
         "match": lambda t: bool(re.search(r"(自动续费|自动续订|自动展期|自动扣费续)", t)) and not re.search(r"(显著|提醒|提示|通知)", t),
         "citation": ("crpl-imp-2024", 10),
         "suggestion": "增加到期前显著提示义务与便捷取消路径，并保留提示记录。"},
        {"id": "F2", "category": "fee", "risk": "medium",
         "title": "单方调价权缺少协商与通知安排",
         "detail": "条款允许一方调整价格/费用而未见协商或通知安排。格式条款语境下可能构成加重对方责任，依《民法典》第497条存在无效风险；第496条并要求以合理方式提示对方注意重大利害关系条款。",
         "match": lambda t: bool(re.search(r"(有权|可以)[^。]{0,16}(调整|变更|上调)[^。]{0,10}(价格|费用|收费标准|租金|利率)", t)) and not re.search(r"(协商|书面|同意)", t),
         "citation": ("civl-2020", 497),
         "suggestion": "增加「调整需提前30日书面通知并经对方书面同意，对方不同意的可解除且不担责」的安排。"},
        {"id": "F3", "category": "fee", "risk": "high",
         "title": "定金比例超过法定上限",
         "detail": "定金比例达到或超过主合同标的额的20%上限。依《民法典》第586条，定金不得超过主合同标的额的百分之二十，超过部分不产生定金的效力。",
         "match": lambda t: re.search(r"定金", t) and _pct_near(t, "定金") >= 20,
         "citation": ("civl-2020", 586),
         "suggestion": "将定金比例降至20%以内；超出部分可改为预付款并约定返还规则。"},
        {"id": "F4", "category": "fee", "risk": "medium",
         "title": "定金与订金/违约金混用风险",
         "detail": "条款同时出现「定金」与其他款项表述，易生混淆。依《民法典》第587条，定金适用双倍返还罚则，与普通预付款（订金）法律后果不同；与违约金并存时还需注意择一适用问题。",
         "match": lambda t: bool(re.search(r"定金", t)) and bool(re.search(r"(订金|预付款|违约金)", t)),
         "citation": ("civl-2020", 587),
         "suggestion": "区分表述：担保目的的款项统一称「定金」并写明适用罚则；预付性质款项称「预付款」并约定结算与返还规则。"},
        {"id": "F5", "category": "fee", "risk": "low",
         "title": "金额缺少大写约定（实务建议）",
         "detail": "条款出现小写金额但未见大写金额。实务中大写金额可有效防止篡改与争议（实务建议，不构成法律依据）。",
         "match": lambda t: bool(re.search(r"(\d+(?:\.\d+)?\s*元|￥|¥)", t)) and not re.search(r"(大写|人民币（大写）)", t),
         "citation": None,
         "suggestion": "补充大写金额，如「人民币壹万元整（¥10,000.00）」。"},
        {"id": "F6", "category": "fee", "risk": "low",
         "title": "税费承担约定不明（实务建议）",
         "detail": "条款涉及价款安排但未见税费承担表述，易在履行中产生争议（实务建议，不构成法律依据）。",
         "match": lambda t: bool(re.search(r"(价款|费用|报酬|租金|服务费)", t)) and not re.search(r"税", t),
         "citation": None,
         "suggestion": "明确「本合同价款是否含税、各自税费由何方承担」及发票开具安排。"},

        # ── 账户条款 ──────────────────────────────────────────────
        {"id": "A1", "category": "account", "risk": "high",
         "title": "收款流向指向第三方账户",
         "detail": "条款显示款项可能流向第三方或个人账户，与合同主体一致性存疑，存在资金安全与结算链路不清风险（实务建议，不构成法律依据）。",
         "match": lambda t: bool(re.search(r"(账户|账号|收款|汇入|转入)[^。]{0,50}(第三方|他人|个人|指定|另外|其他)", t)),
         "citation": None,
         "suggestion": "约定收款账户名称须为合同主体全称；确需变更的，以书面（含盖章确认）方式另行通知，未经确认的付款不视为履约。"},
        {"id": "A2", "category": "account", "risk": "medium",
         "title": "电子支付指令核对与差错责任安排",
         "detail": "条款涉及扣款/划扣授权。若通过电子支付履行，依《电子商务法》第55条，用户发出支付指令前应核对金额、收款人等完整信息，支付指令出错造成损失的由服务提供者承担赔偿责任（非因其原因造成的除外）；建议在合同中同步核对与对账安排。",
         "match": lambda t: bool(re.search(r"(授权|委托|同意)[^。]{0,16}(扣款|划扣|扣缴|代扣)", t)) and not re.search(r"(核对|对账|异议)", t),
         "citation": ("ecom-2018", 55),
         "suggestion": "补充：扣款金额与周期的确认方式、对账与异议期（如每月对账、10日内书面异议）、错误扣款的更正与退款时限。"},
        {"id": "A3", "category": "account", "risk": "low",
         "title": "收款账户变更通知程序缺失（实务建议）",
         "detail": "条款涉及收款账户但未见变更通知程序（实务建议，不构成法律依据）。",
         "match": lambda t: bool(re.search(r"(收款账户|银行账户|指定账户)", t)) and not re.search(r"(变更|书面|通知)", t),
         "citation": None,
         "suggestion": "增加「账户变更须提前X日书面通知并加盖公章，否则按原账户付款视为已履行」。"},
        {"id": "A4", "category": "account", "risk": "low",
         "title": "大额款项未设共管/监管安排（实务建议）",
         "detail": "条款涉及大额款项交付但未见共管、监管或分期支付安排（实务建议，不构成法律依据）。",
         "match": lambda t: bool(re.search(r"(保证金|订金|预付款|货款)[^。]{0,30}(万元|万|亿)", t)) and not re.search(r"(共管|监管|托管|分期)", t),
         "citation": None,
         "suggestion": "对大额款项考虑银行共管/第三方监管账户或按里程碑分期支付。"},
    ]
    # 启动期校验：带 citation 的审查点，其条文必须真实存在于语料（引用不变量硬门）
    corpus = get_corpus()
    for cp in cps:
        if cp["citation"]:
            corpus.citation_of(*cp["citation"])
    return cps


CHECKPOINTS = None


def get_checkpoints():
    global CHECKPOINTS
    if CHECKPOINTS is None:
        CHECKPOINTS = build_checkpoints()
    return CHECKPOINTS


def analyze_contract(text: str, title: str | None = None):
    corpus = get_corpus()
    clauses = segment_clauses(text)
    findings = []
    checked_texts = [c["text"] for c in clauses]
    whole = text
    for cp in get_checkpoints():
        if cp["id"] == "L6":  # 全文级检查
            targets = [whole]
        else:
            targets = checked_texts
        fired = False
        for c in clauses:
            target = whole if cp["id"] == "L6" else c["text"]
            if fired:
                break
            try:
                hit = cp["match"](target)
            except Exception:  # noqa: BLE001
                hit = False
            if not hit:
                continue
            fired = True
            is_whole = cp["id"] == "L6"
            finding = {
                "id": f"f{len(findings) + 1}",
                "clause_id": None if is_whole else c["id"],
                "clause_label": "全文" if is_whole else c["label"],
                "clause_heading": "" if is_whole else c["heading"],
                "excerpt": "" if is_whole else c["text"][:400],
                "category": cp["category"],
                "risk": cp["risk"],
                "checkpoint_id": cp["id"],
                "checkpoint_title": cp["title"],
                "detail": cp["detail"],
                "suggestion": cp["suggestion"],
                "basis_kind": "statute" if cp["citation"] else "practice",
                "citation": corpus.citation_of(*cp["citation"]) if cp["citation"] else None,
            }
            findings.append(finding)
            break
    summary = {
        "high": sum(1 for f in findings if f["risk"] == "high"),
        "medium": sum(1 for f in findings if f["risk"] == "medium"),
        "low": sum(1 for f in findings if f["risk"] == "low"),
        "by_category": {
            cat: sum(1 for f in findings if f["category"] == cat)
            for cat in ["fee", "account", "liability"]
        },
    }
    return {
        "title": title or "未命名合同",
        "clauses": [{"id": c["id"], "label": c["label"], "heading": c["heading"], "text": c["text"]} for c in clauses],
        "findings": findings,
        "summary": summary,
        "disclaimer": "审查输出为「风险提示与修改建议」，不构成法律意见；采纳前请由执业律师复核确认。",
        "engine_meta": {"checkpoint_count": len(get_checkpoints()), "clause_count": len(clauses)},
    }
