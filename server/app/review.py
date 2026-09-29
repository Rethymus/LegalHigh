# -*- coding: utf-8 -*-
"""合同审查：条款切分 + 三类审查点规则引擎（费用/账户/责任）。

规则纪律：
- 每个审查点的「依据条文」必须是本库语料中真实存在的条文（corpus.citation_of 解析，
  不存在即启动报错），或显式标记 kind="practice"（实务建议，不引用法条）——不编造依据。
- 审查点范式对齐 CUAD（NeurIPS 2021，41 类条款标注）：AI 意见绑定到条款原文最小片段。
"""
import re
import unicodedata

from lib.textparse import cn_to_int
from .corpus import get_corpus

CLAUSE_HEAD_RE = re.compile(r"^第([零〇一二三四五六七八九十百千]+)条")
AMOUNT_RE = re.compile(r"(\d+(?:\.\d+)?)\s*%")
_CN_PERCENT_DIGITS = "零〇一二三四五六七八九十百千两点"
_PERCENT_VALUE = rf"(?:[0-9０-９]+(?:[.．][0-9０-９]+)?\s*[％%]|百分之[{_CN_PERCENT_DIGITS}]+)"
PERCENT_RE = re.compile(_PERCENT_VALUE)
# 兼容「不得超过 20%」与更常见的「以合同总价的百分之二十为限」两种写法。
PCT_CAP_RE = re.compile(
    rf"(?:不得超过|不超过|最高不超过)\s*{_PERCENT_VALUE}|"
    rf"以[^。；！？\n]{{0,40}}?{_PERCENT_VALUE}\s*为限|"
    rf"以[^。；！？\n]{{0,40}}?为限\s*{_PERCENT_VALUE}"
)

_CN_DIGITS = {"零": 0, "〇": 0, "一": 1, "二": 2, "三": 3, "四": 4,
              "五": 5, "六": 6, "七": 7, "八": 8, "九": 9}


def _cn_number_to_float(raw: str) -> float | None:
    """解析百分比中的中文数字；不识别的写法返回 None 而不是猜测。"""
    value = raw.replace("两", "二")
    if "点" in value:
        whole, fraction = value.split("点", 1)
        if not fraction or any(ch not in _CN_DIGITS for ch in fraction):
            return None
        whole_value = cn_to_int(whole or "零")
        if whole_value < 0:
            return None
        frac_value = "".join(str(_CN_DIGITS[ch]) for ch in fraction)
        return float(whole_value) + int(frac_value) / (10 ** len(frac_value))
    number = cn_to_int(value)
    return float(number) if number >= 0 else None


def _parse_percentage(raw: str) -> float | None:
    normalized = unicodedata.normalize("NFKC", raw)
    normalized = re.sub(r"\s+", "", normalized)
    if normalized.startswith("百分之"):
        return _cn_number_to_float(normalized[3:])
    if normalized.endswith("%"):
        try:
            return float(normalized[:-1])
        except ValueError:
            return None
    return None


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
    return [value for m in PERCENT_RE.finditer(text)
            if (value := _parse_percentage(m.group(0))) is not None]


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


# ---------------- 建议修订块（R440，R437-T3 首批 w:del 修订路由） ----------------
# 结构：{"action": "delete"|"replace", "target_re": <跨度正则>} 或句级近邻形态
# {"action": "replace", "near": <关键词>, "replacement": …[, "replacement_cn"/"replacement_dual"]}。
# 不变式：发射的 target 必须逐字存在于条款文本——跨度一律在条款文本上 re 定位取得
# （匹配结果即逐字子串，构造即真；发射处再防御性复核，失败回退 comment-only 不编造跨度）。
# 加载期形状校验 fail-closed：块不合法即拒绝加载整个审查点库（见 _validate_revisions）。

_BRACKET_PCT = rf"[（(]\s*{_PERCENT_VALUE}\s*[）)]"
_YEAR_VALUE = r"[0-9]{1,3}|[一两二三四五六七八九十]{1,4}"
_YEAR_RE = re.compile(rf"({_YEAR_VALUE})\s*年")


def _year_value(raw: str) -> float:
    return float(raw) if raw.isdigit() else (_cn_number_to_float(raw) or 0.0)


def _validate_revisions(cps: list) -> None:
    """revision 块形状校验（R437 设计 T3 内容闸门 ①）：非法形状直接抛错——审查点库是
    引用绑定产出的一环，宁可拒绝加载也不带病运行（fail-closed，与 citation 校验同纪律）。"""
    for cp in cps:
        rev = cp.get("revision")
        if not rev:
            continue
        cid = cp.get("id", "?")
        if cp["id"] == "L6" or cp.get("scope") == "whole":
            raise ValueError(f"审查点 {cid}：全文级检查点不得携带 revision 块")
        if rev.get("action") not in ("delete", "replace"):
            raise ValueError(f"审查点 {cid}：revision.action 必须是 delete|replace")
        if not rev.get("target_re") and not rev.get("near"):
            raise ValueError(f"审查点 {cid}：revision 需要 target_re 或 near 定位")
        if rev.get("target_re"):
            try:
                re.compile(rev["target_re"])
            except re.error as exc:
                raise ValueError(f"审查点 {cid}：revision.target_re 无法编译") from exc
        if rev["action"] == "delete" and rev.get("replacement"):
            raise ValueError(f"审查点 {cid}：delete 不得携带 replacement")
        if rev["action"] == "replace" and not str(rev.get("replacement", "")).strip():
            raise ValueError(f"审查点 {cid}：replace 缺 replacement")


def _extend_pct_span(text: str, start: int, end: int) -> tuple[int, int]:
    """双记数形态（百分之三十（30%）/ 30%（百分之三十））跨度扩展：括号内另一记数形态
    并入同一替换跨度，避免替换后残留半边旧记数。"""
    m = re.compile(_BRACKET_PCT).match(text, end)
    if m:
        return start, m.end()
    m = re.compile(rf"{_BRACKET_PCT}\s*").match(text, 0, start)
    if m and m.end() == start:
        return m.start(), end
    return start, end


def _locate_revision_span(rev: dict, text: str) -> tuple[int, int] | None:
    """在条款文本上定位建议修订的逐字跨度（返回起止下标）；定位不到返回 None（回退 comment-only）。"""
    if rev.get("near"):
        # 句级近邻（与 _pct_near 同口径）：关键词所在句内取数值最大的目标量度跨度
        # （并列取首个）。unit=year 时目标为年数量词（R442 R1 租期替换）。
        pattern = _YEAR_RE if rev.get("unit") == "year" else PERCENT_RE
        pos = 0
        for sent in re.split(r"[。；！？\n]", text):
            if rev["near"] in sent:
                best = None
                for m in pattern.finditer(sent):
                    v = _year_value(m.group(1)) if rev.get("unit") == "year" else _parse_percentage(m.group(0))
                    if v is None or v <= 0:
                        continue
                    if best is None or v > best[0]:
                        best = (v, m)
                if best is not None:
                    if rev.get("unit") == "year":
                        return pos + best[1].start(), pos + best[1].end()
                    return _extend_pct_span(text, pos + best[1].start(), pos + best[1].end())
            pos += len(sent) + 1  # 分隔符均为单字符（find 对重复句会命中首处，错位后续句）
        return None
    m = re.search(rev["target_re"], text)
    return (m.start(), m.end()) if m else None


def _pick_replacement(rev: dict, span: str):
    """按跨度记数形态选替换文本：中文数字/阿拉伯数字/双形态三选一（确定性映射；
    百分比与年数两类跨度共用——判定看跨度内是否含中文数字字符）。"""
    if rev["action"] == "delete":
        return None
    if "replacement_cn" in rev:
        has_cn = bool(re.search(r"[一两二三四五六七八九十]", span))
        has_sym = "%" in span or "％" in span
        if has_cn and has_sym:
            return rev["replacement_dual"]
        if has_cn:
            return rev["replacement_cn"]
        return rev["replacement"]
    return rev["replacement"]


def _l1_match(t: str) -> bool:
    """违约金/滞纳金/逾期利息/资金占用费偏高的口径：一次性比例 ≥24%；按日 ≥0.3%；按月 ≥2%；
    已设不超过 20% 上限的视为已作风险控制。资金占用费为逾期付款成本的规范表述。"""
    if not re.search(r"(违约金|滞纳金|逾期利息|逾期付款利息|资金占用费)", t):
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
         "suggestion": "建议将比例调整至与可预见损失相匹配的水平，或设置总额上限条款。"},
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
         "suggestion": "改为「双方协商一致后书面变更」；保留解释权表述整体删除。",
         # R440 首批修订（R437-T3）：解释权形态 → 删除该表述（跨度=逐字定位）；
         # 修改权形态（有权单方修改…）定位不到解释权跨度 → 自动回退 comment-only。
         "revision": {"action": "delete",
                      "target_re": r"(?:保留)?(?:对[^，。；]{0,8})?(?:本协议|本合同|本公司)?最终解释权(?:归[^，。；、]{0,20})?"}},
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
         "detail": "定金比例超过主合同标的额的20%上限。依《民法典》第586条，定金不得超过主合同标的额的百分之二十，超过部分不产生定金的效力。",
         "match": lambda t: bool(re.search(r"定金", t)) and _pct_near(t, "定金") > 20,
         "citation": ("civl-2020", 586),
         "suggestion": "将定金比例降至20%以内；超出部分可改为预付款并约定返还规则。",
         # R440 首批修订：句级近邻定位「定金」所在句的最大比例跨度 → 替换为 20%
         # 等值记数（中文数字/百分号/双形态三种确定性映射）。
         "revision": {"action": "replace", "near": "定金",
                      "replacement": "20%", "replacement_cn": "百分之二十", "replacement_dual": "百分之二十（20%）"}},
        {"id": "F4", "category": "fee", "risk": "medium",
         "title": "定金与订金/违约金混用风险",
         "detail": "条款同时出现「定金」与其他款项表述，易生混淆。依《民法典》第587条，定金适用双倍返还罚则，与普通预付款（订金）法律后果不同；与违约金并存时还需注意择一适用问题。",
         "match": lambda t: bool(re.search(r"定金", t)) and bool(re.search(r"(订金|预付款|违约金)", t)),
         "citation": ("civl-2020", 587),
         "suggestion": "区分表述：担保目的的款项统一称「定金」并写明适用罚则；预付性质款项称「预付款」并约定结算与返还规则。",
         # R440 首批修订：混用形态为「订金」时 → 术语替换为「预付款」（建议文本的逐字兑现）；
         # 混用形态为预付款/违约金（无订金字样）→ 定位不到 → comment-only。
         "revision": {"action": "replace", "target_re": r"订金", "replacement": "预付款"}},
        {"id": "F5", "category": "fee", "risk": "low",
         "title": "金额缺少大写约定（实务建议）",
         "detail": "条款出现小写金额但未见大写金额。实务中大写金额可有效防止篡改与争议（实务建议，不构成法律依据）。",
         # 大写金额（壹拾万元整等）视为已满足防篡改要求
         "match": lambda t: bool(re.search(r"(\d+(?:\.\d+)?\s*元|￥|¥)", t)) and not re.search(r"(大写|[壹贰叁肆伍陆柒捌玖拾佰仟万亿]{2,})", t),
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

        # ── 租赁类（T4 首批，R441；民法典合同编租赁章语料已备） ──────────
        {"id": "R1", "category": "liability", "risk": "medium",
         "title": "租赁期限超过法定上限",
         "detail": "约定的租赁期限超过二十年。依《民法典》第705条，租赁期限不得超过二十年，超过二十年的部分无效；续订的，自续订之日起另计。",
         "match": lambda t: bool(m := re.search(r"(?:租赁期限|租期)[^。；，,]{0,6}?([0-9]{1,3}|[一两二三四五六七八九十]{1,4})\s*年", t))
                        and (float(m.group(1)) if m.group(1).isdigit() else (_cn_number_to_float(m.group(1)) or 0)) > 20,
         "citation": ("civl-2020", 705),
         "suggestion": "将租赁期限调整至二十年以内；确需更长的，期满续订（续订之日起重新计算上限）。",
         # R442（T4×T3 交叉）：超限年限 → 法定上限等值替换（年数记数匹配；句内取
         # 最大年数跨度——同句「可提前3年解约」等更小年数不会被误选为替换目标）。
         "revision": {"action": "replace", "near": "租", "unit": "year",
                      "replacement": "20年", "replacement_cn": "二十年"}},
        {"id": "R2", "category": "liability", "risk": "low",
         "title": "欠租即解除条款缺少催告宽限",
         "detail": "条款约定拖欠租金即可解除/收回，未见催告或宽限安排。依《民法典》第722条，承租人无正当理由未支付或迟延支付租金的，出租人应先请求其在合理期限内支付，逾期不支付的方可解除。",
         "match": lambda t: bool(re.search(r"(拖欠|逾期[^。]{0,6}支付|未按时[^。]{0,4}支付)[^。]{0,20}租金", t))
                        and bool(re.search(r"(解除|收回)", t))
                        and not re.search(r"(催告|合理期限|宽限|催缴)", t),
         "citation": ("civl-2020", 722),
         "suggestion": "改为「拖欠租金经书面催告后合理期限内仍未支付的，出租人可以解除合同」，与法定解除程序对齐。"},

        # ── 劳动类（T4 首批，R441；劳动合同法语料已备） ──────────────────
        {"id": "W1", "category": "liability", "risk": "medium", "scope": "whole",
         "title": "竞业限制条款未约定经济补偿",
         "detail": "合同约定了竞业限制，但全文未见与竞业限制相关的经济补偿安排。依《劳动合同法》第23条，约定竞业限制条款的，应当在解除或终止劳动合同后的竞业限制期限内按月给予劳动者经济补偿；第24条并限定竞业限制人员范围与期限。",
         "match": lambda t: bool(re.search(r"竞业限制|竞业禁止", t))
                        and not re.search(r"竞业[^。；]{0,60}(经济)?补偿|补偿[^。；]{0,45}竞业", t),
         "citation": ("lcl-2012", 23),
         "suggestion": "补充「竞业限制期限内按月支付经济补偿」及补偿标准；并核对人员范围（高级管理人员、高级技术人员及其他负有保密义务人员）与期限（不得超过二年）。"},
        {"id": "W2", "category": "fee", "risk": "high",
         "title": "试用期工资低于法定下限",
         "detail": "试用期工资约定低于约定工资的80%。依《劳动合同法》第20条，试用期工资不得低于本单位相同岗位最低档工资或者劳动合同约定工资的百分之八十，并不得低于用人单位所在地最低工资标准。",
         "match": lambda t: bool(re.search(r"试用期", t)) and 0 < _pct_near(t, "试用期") < 80,
         "citation": ("lcl-2012", 20),
         "suggestion": "将试用期工资调整至约定工资（或相同岗位最低档工资）的80%以上，且不低于当地最低工资标准。"},

        # ── 买卖类（T4 续批，R443；民法典合同编买卖章语料已备） ──────────
        {"id": "S1", "category": "liability", "risk": "low",
         "title": "所有权保留安排未提示登记对抗",
         "detail": "条款约定标的物所有权保留（付清前归出卖方）。依《民法典》第641条，当事人可以约定所有权保留，但出卖人对标的物保留的所有权，未经登记，不得对抗善意第三人。",
         "match": lambda t: bool(re.search(r"所有权保留|保留(标的物|货物|设备|商品)?的所有权|所有权归(出卖|卖方|供方)所有", t))
                        and not re.search(r"登记", t),
         "citation": ("civl-2020", 641),
         "suggestion": "对保留所有权办理登记（动产融资统一登记公示系统），并在条款中明确所有权转移的时点与条件；未登记的保留不得对抗善意第三人。"},
        {"id": "S2", "category": "liability", "risk": "medium",
         "title": "分期付款加速/解除条款缺少法定条件",
         "detail": "条款约定分期付款逾期即可解除或要求支付全部价款，未见法定条件。依《民法典》第634条，分期付款买受人未支付到期价款达全部价款的五分之一，且经催告后在合理期限内仍未支付的，出卖人方可请求支付全部价款或解除合同；解除的并可请求支付标的物使用费。",
         "match": lambda t: bool(re.search(r"分[^。；，,]{0,6}期(支付|付款)", t))
                        and bool(re.search(r"(未按期|逾期|未付|拖欠)[^。]{0,20}(解除|付清|支付)", t) or re.search(r"(视为.{0,6}到期|要求支付全部|付清全部)", t))
                        and not re.search(r"(五分之一|1/5|催告|合理期限)", t),
         "citation": ("civl-2020", 634),
         "suggestion": "改为「买受人未支付到期价款达全部价款五分之一，经书面催告后合理期限内仍未支付的，出卖人可以要求支付全部价款或解除合同」，与法定条件对齐。"},

        # ── 物业/建设工程类（T4 续批二波，R445；民法典相应章节语料已备） ──
        {"id": "P1", "category": "liability", "risk": "low", "scope": "whole",
         "title": "物业服务收费未约定公示安排",
         "detail": "合同涉及物业服务收费，但全文未见公示/公开安排。依《民法典》第943条，物业服务人应当定期将服务事项、负责人员、质量要求、收费项目、收费标准、履行情况及维修资金使用情况等以合理方式向业主公开并向业主大会、业主委员会报告——公开系法定义务，合同未约定的亦不得免除。",
         "match": lambda t: bool(re.search(r"物业", t)) and bool(re.search(r"(物业费|物业服务费|物业.{0,4}收费)", t))
                        and not re.search(r"(公开|公示|公布)", t),
         "citation": ("civl-2020", 943),
         "suggestion": "补充「物业服务人定期公示收费项目、收费标准、履行情况与维修资金使用情况」条款（可约定公示方式与周期）；公开义务系法定，不因合同未约定而免除。"},
        {"id": "P2", "category": "liability", "risk": "medium",
         "title": "限制业主解除物业服务合同的权利",
         "detail": "条款限制或排除业主解除物业服务合同的权利。依《民法典》第946条，业主依照法定程序共同决定解聘物业服务人的，可以解除物业服务合同（决定解聘的应提前六十日书面通知，合同另有约定的除外）；解除造成物业服务人损失的除不可归责于业主的事由外业主应赔偿——但解除权本身不得被约定排除。",
         "match": lambda t: bool(re.search(r"业主[^。]{0,20}不得(解除|解聘|更换)|业主无权(解除|解聘|更换)", t)),
         "citation": ("civl-2020", 946),
         "suggestion": "删除限制条款，改为「业主依照法定程序共同决定解聘的，提前六十日书面通知物业服务人后可解除本合同」，保留通知程序与损失赔偿安排。"},
        {"id": "G1", "category": "liability", "risk": "high",
         "title": "约定未经验收即交付使用",
         "detail": "条款约定未经验收即可交付使用。依《民法典》第799条，建设工程竣工经验收合格后方可交付使用；未经验收或者验收不合格的，不得交付使用。",
         "match": lambda t: bool(re.search(r"未经(竣工)?验收[^。]{0,12}(交付|使用|入住)", t)),
         "citation": ("civl-2020", 799),
         "suggestion": "改为「工程竣工经验收合格后交付使用」；确需提前使用的，应先行部分验收并书面确认已验收范围与质量责任分担。"},

        # ── 中介/技术服务类（T4 续批三波，R446；民法典相应章节语料已备） ──
        {"id": "M1", "category": "fee", "risk": "medium",
         "title": "未促成交易仍须支付报酬/费用",
         "detail": "条款约定不论是否促成交易均须支付中介报酬或费用。依《民法典》第963条，中介人促成合同成立的，委托人才按约定支付报酬，且中介活动的费用由中介人负担；未促成的，中介人仅可按约定请求必要费用（第964条）。",
         "match": lambda t: bool(re.search(r"(无论|不论)[^。]{0,4}(是否|成交|成败|成功)[^。]{0,15}(中介费|佣金|报酬|费用)", t)
                                or re.search(r"(未促成|未成交|交易不成)[^。]{0,25}(中介费|佣金|报酬|费用|仍应支付|均应支付)", t)),
         "citation": ("civl-2020", 963),
         "suggestion": "改为「中介人促成合同成立的，委托人支付报酬；未促成的，委托人仅负担中介人从事中介活动支出的必要费用」。"},
        {"id": "M2", "category": "liability", "risk": "medium",
         "title": "中介信息真实性免责条款",
         "detail": "条款约定中介人对信息真实性不保证/不负责。依《民法典》第962条，中介人应当就有关订立合同的事项向委托人如实报告；故意隐瞒重要事实或者提供虚假情况损害委托人利益的，不得请求支付报酬并应当承担赔偿责任。",
         "match": lambda t: bool(re.search(r"中介[^。]{0,25}不(保证|负责|承担|核实)[^。]{0,15}(真实|信息|准确|核)", t)
                                or re.search(r"(信息|资料)[^。]{0,10}(真实性|真实)[^。]{0,10}(概不负责|不作担保|自行核实)", t)),
         "citation": ("civl-2020", 962),
         "suggestion": "删除免责表述，改为「中介人应当就订立合同的事项如实报告；因隐瞒重要事实或提供虚假情况造成委托人损失的，中介人承担赔偿责任」。"},
        {"id": "T1", "category": "liability", "risk": "low", "scope": "whole",
         "title": "委托开发成果知识产权归属未约定",
         "detail": "合同涉及委托开发/技术开发，但全文未见成果归属或知识产权安排。依《民法典》第859条，委托开发完成的发明创造，除法律另有规定或当事人另有约定外，申请专利的权利属于研究开发人；委托人可依法实施该专利并享有同等条件优先受让权——未约定时默认归属未必符合委托方预期。",
         "match": lambda t: bool(re.search(r"(委托开发|技术开发合同)", t))
                        and not re.search(r"(归属|知识产权|专利|技术成果[^。]{0,10}归|著作权|成果归)", t),
         "citation": ("civl-2020", 859),
         "suggestion": "明确约定开发成果的知识产权归属（如「委托开发完成的发明创造，申请专利的权利归委托人所有」）及双方实施、许可与改进安排。"},
    ]
    # 启动期校验：带 citation 的审查点，其条文必须真实存在于语料（引用不变量硬门）；
    # revision 块形状校验 fail-closed（R440，R437-T3 内容闸门——非法形状拒绝加载）。
    corpus = get_corpus()
    for cp in cps:
        if cp["citation"]:
            corpus.citation_of(*cp["citation"])
    _validate_revisions(cps)
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
    rule_errors = []
    whole = text
    for cp in get_checkpoints():
        fired = False
        for c in clauses:
            target = whole if cp["id"] == "L6" else c["text"]
            if fired:
                break
            try:
                hit = cp["match"](target)
            except Exception as exc:  # noqa: BLE001
                # 规则异常不能伪装成「未检出」；跳过该规则并将结果标为不完整。
                rule_errors.append({"checkpoint_id": cp.get("id", "unknown"),
                                    "error": type(exc).__name__})
                break
            if not hit:
                continue
            fired = True
            is_whole = cp["id"] == "L6" or cp.get("scope") == "whole"  # scope=whole：跨条款判断（R441 W1）
            # 建议修订块（R440）：条款级检查点携带 revision 且能逐字定位跨度时发射；
            # 定位不到（形态不匹配）→ revision=None 回退 comment-only，绝不编造跨度。
            rev_out = None
            if cp.get("revision") and not is_whole:
                span = _locate_revision_span(cp["revision"], c["text"])
                if span is not None:
                    target = c["text"][span[0]:span[1]]
                    if target and target in c["text"]:  # 逐字存在（构造即真，防御性复核）
                        rev_out = {
                            "action": cp["revision"]["action"],
                            "target": target,
                            "replacement": _pick_replacement(cp["revision"], target),
                        }
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
                "revision": rev_out,
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
    analysis_incomplete = bool(rule_errors)
    return {
        "title": title or "未命名合同",
        "clauses": [{"id": c["id"], "label": c["label"], "heading": c["heading"], "text": c["text"]} for c in clauses],
        "findings": findings,
        "summary": summary,
        "disclaimer": "审查输出为「风险提示与修改建议」，不构成法律意见；采纳前请由执业律师复核确认。",
        "analysis_incomplete": analysis_incomplete,
        "engine_meta": {
            "checkpoint_count": len(get_checkpoints()),
            "clause_count": len(clauses),
            "analysis_complete": not analysis_incomplete,
            "analysis_incomplete": analysis_incomplete,
            "errors": rule_errors,
        },
    }
