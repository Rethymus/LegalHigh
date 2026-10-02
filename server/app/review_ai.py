# -*- coding: utf-8 -*-
"""审查 AI 框架审阅四问（R460，R437 设计 T2——contract-review-pro 方法论吸收）。

四问（义务单向性/退出权不对等/虚假前提/违约对称性）是语义判断，确定性不可实现，
归属 AI 提示层：模型对已切分条款逐问回答并**内联引用合同条款号**。

红线随行（与 ai_governor.chat 同纪律）：
- gate1 红线复用 ai_governor.gate_redline；
- 引用判分不适用法条 gate2（四问引用的是**用户合同条款**而非语料条文）——专用纯函数
  judge_four_questions：四节结构完整 + 每节至少一处条款引用 + 所有引用条号真实存在于
  该审查的条款集合（引用编造条款号=扣留）；
- gate3 免责声明随行；配额复用 ai_governor；审计只记数量与判定，**不含合同文本**
  （审查记录属用户材料，PIPL 纪律：不进 evidence ledger/审计明文）。
- 无密钥 409（AI 默认关闭）；空输出按扣留（R422 语义）。
"""
import re

from . import ai_governor
from . import storage

MAX_CLAUSE_CHARS = 300          # 每条进提示词的截断（防超长合同撑爆上下文）
MAX_CLAUSES_IN_PROMPT = 60      # 超出部分如实告知模型「以下条款未纳入本次四问」

FOUR_QUESTIONS = [
    ("义务单向性", "合同义务是否实质上只约束一方？逐项指出仅施加于单一方的义务条款，或回答「未发现」。",
     "PASS：指出了仅约束单一方的义务条款并引用条号，或如实回答「未发现/无法判断」。FAIL：声称无单向义务却不引用任何条号，或虚构清单外条号。"),
    ("退出权不对等", "解除、终止或退出权利是否不对等（一方随时可退且无成本，另一方退出须赔偿或被禁止）？",
     "PASS：指出不对等的解除安排并引用条号，或如实回答「未发现/无法判断」。FAIL：空泛断言不对等而无条号依据，或编造条号。"),
    ("虚假前提", "合同是否建立在不实或未经核实的前提上（资质、权属、数据、口头承诺被写成本次合同的事实）？",
     "PASS：指出依赖未核实前提的条款并引用条号，或如实说明缺什么材料。FAIL：把未经核实的前提当作已证事实陈述。"),
    ("违约对称性", "违约责任是否明显不对称（一方的违约金/罚则远重于另一方，或单方免责）？",
     "PASS：指出不对称的违约安排并引用条号，或如实回答「未发现」。FAIL：只描述一方违约金而不对比另一方，或编造条号。"),
]

_SECTION_MARKERS = [f"问题{cn}（{name}）" for cn, (name, _desc, _crit) in zip("一二三四", FOUR_QUESTIONS)]
_CLAUSE_REF_RE = re.compile(r"第([0-9]+|[零〇一二三四五六七八九十百千两]+)条")
_CLAUSE_LABEL_RE = re.compile(r"第([0-9]+|[零〇一二三四五六七八九十百千两]+)条")


def clause_nos_of(review: dict) -> set[int]:
    """从条款 label（「第一条/第1条」）解析条号集合——判分的引用合法性范围。"""
    nos = set()
    for c in review["result"]["clauses"]:
        m = _CLAUSE_LABEL_RE.search(c.get("label") or "")
        if m:
            n = _clause_no(m.group(1))
            if n:
                nos.add(n)
    return nos

_SYSTEM_PROMPT = (
    "你是合同审查辅助工具。对用户提交的合同条款完成「框架审阅四问」，"
    "严格按以下格式输出四节，每节标题一字不差：\n"
    + "\n".join(f"{m}：结论+依据" for m in _SECTION_MARKERS) + "\n"
    "纪律：①结论涉及具体条款的，必须在同一节内引用条款号（如「第3条」），"
    "且只能引用条款清单中存在的条号，禁止编造；②未发现或无法判断时如实写「未发现」或"
    "「无法判断」，并说明缺什么信息（此时可无条款引用）；③不输出任何法律意见结论、"
    "不预测裁判结果、不建议「签或不签」；④不改写条款、不虚构清单外内容。"
)


def _clause_no(raw: str) -> int | None:
    return ai_governor._cn_numeral_to_int(raw)


def build_messages(review: dict) -> list[dict]:
    """从审查记录构造提示（条款清单截断+现有发现标题供参考；不含 stance 等无关字段）。"""
    clauses = review["result"]["clauses"][:MAX_CLAUSES_IN_PROMPT]
    lines = [f"{c['label'].replace('第', '第', 1)}：{c['text'][:MAX_CLAUSE_CHARS]}" for c in clauses]
    if len(review["result"]["clauses"]) > MAX_CLAUSES_IN_PROMPT:
        lines.append(f"（其余 {len(review['result']['clauses']) - MAX_CLAUSES_IN_PROMPT} 条未纳入本次四问，勿推测其内容）")
    findings = "；".join(f"{f['checkpoint_title']}" for f in review["result"]["findings"][:10]) or "（规则引擎未检出）"
    q = "\n".join(f"- {m.split('（')[1][:-1]}：{desc}" for m, (_, desc, _c) in zip(_SECTION_MARKERS, FOUR_QUESTIONS))
    user = (
        "合同条款清单（条号即引用依据范围）：\n" + "\n".join(lines) +
        "\n\n规则引擎已检出（供参考，不构成四问结论）：\n" + findings +
        "\n\n请完成四问：\n" + q
    )
    return [{"role": "system", "content": _SYSTEM_PROMPT}, {"role": "user", "content": user}]


def judge_four_questions(text: str, clause_nos: set[int]) -> dict:
    """四问判分（纯函数，无网络无密钥可测）：结构完整 + 每节有真实条款引用。

    违规三类：缺节 / 节内无条款引用 / 引用了条款集合外的条号（编造引用）。
    questions：逐问判定（R463，legal-skill-evaluation「定位最小修复单元」方法论）——
    在线评测读数可据此定位哪一问失败最多，而非只见整体 pass。
    """
    violations: list[str] = []
    questions: list[dict] = []
    spans: list[tuple[str, str | None]] = []
    for marker in _SECTION_MARKERS:
        idx = text.find(marker)
        if idx < 0:
            violations.append(f"缺少章节：{marker}")
            spans.append((marker, None))
            continue
        nxt = [text.find(m2) for m2 in _SECTION_MARKERS if text.find(m2) > idx]
        end = min(nxt) if nxt else len(text)
        spans.append((marker, text[idx:end]))
    for marker, sec in spans:
        qname = marker.split("（")[1][:-1]
        qcriteria = next((c for n, (_, _d, c) in zip(_SECTION_MARKERS, FOUR_QUESTIONS) if n == marker), "")
        if sec is None:
            questions.append({"question": qname, "pass": False,
                              "violations": [f"缺少章节：{marker}"], "criteria": qcriteria})
            continue
        refs = [_clause_no(m.group(1)) for m in _CLAUSE_REF_RE.finditer(sec)]
        refs = [r for r in refs if r is not None]
        q_violations: list[str] = []
        bad = sorted({r for r in refs if r not in clause_nos})
        if bad:
            q_violations.append(f"引用了条款清单外的条号：第{bad[0]}条")
        # 诚实「未发现/无法判断」可不带引用（R463 门侧不公修复：系统提示允许如实答
        # 「未发现」，判分却要求每节必有引用——诚实答案会被扣留，R422 同类结构性不公）；
        # 既无引用又无诚实标记=含糊作答，仍判违规。
        if not refs and not re.search(r"(未发现|无法判断)", sec):
            q_violations.append(f"章节未引用任何条款：{sec[:18]}…")
        questions.append({"question": qname, "pass": not q_violations, "violations": q_violations,
                          "criteria": qcriteria})
        violations.extend(q_violations)
    return {"pass": not violations, "violations": violations, "questions": questions}


def frame_review(review: dict, provider_id: str, model: str, *, api_key: str | None = None,
                 base_url_override: str | None = None, actor: str = "anonymous",
                 redact_outbound: bool = False) -> dict:
    """四问框架审阅主入口（红线/判分/配额/审计随行；扣留语义与 chat 一致）。
    redact_outbound=True（R500）：合同条款外发前确定性脱敏——占位符不破坏四问
    判分输入（判分锚定条款引用与问题判决结构，非当事人联系方式）。"""
    provider = ai_governor.get_provider(provider_id)
    if not provider:
        raise ValueError(f"未知模型提供方：{provider_id}")
    if provider_id == "custom" and not (base_url_override or "").strip():
        raise ValueError("自定义 OpenAI 协议端点必须提供 Base URL。")
    endpoint = ai_governor._resolve_endpoint(provider, base_url_override)
    key = ai_governor._resolve_key(provider, api_key)
    if not key:
        raise PermissionError(f"未配置 {provider['name']} 的密钥（环境变量或请求瞬态提供）。")
    quota = ai_governor.check_quota(actor)
    messages = build_messages(review)
    redaction = None
    if redact_outbound:
        counters = {k: 0 for k in ai_governor._REDACT_KINDS}
        messages = [{**m, "content": ai_governor._redact_text(str(m.get("content") or ""), counters)}
                    for m in messages]
        total = sum(counters.values())
        if total:
            redaction = {"total": total, "replacements": {k: v for k, v in counters.items() if v}}
    clause_nos = clause_nos_of(review)
    client = ai_governor._client(provider, endpoint, key)
    try:
        resp = client.chat.completions.create(
            model=model.strip(), messages=messages, temperature=0.2,
            max_tokens=ai_governor.MAX_OUTPUT_TOKENS)
    except Exception as e:  # noqa: BLE001 — 不回显可能含 URL/header 的第三方异常正文
        raise RuntimeError(f"模型调用失败（{provider['name']}，{type(e).__name__}）。") from e
    text = (resp.choices[0].message.content or "").strip() if resp.choices else ""
    gates = {
        "redline": ai_governor.gate_redline(text),
        "four_questions": judge_four_questions(text, clause_nos),
    }
    blocked = not all(g["pass"] for g in gates.values()) or not text  # 空输出=扣留（R422）
    usage = {}
    if getattr(resp, "usage", None):
        usage = {"prompt_tokens": resp.usage.prompt_tokens,
                 "completion_tokens": resp.usage.completion_tokens}
    # 审计只记数量与判定——合同条款属用户材料，不入审计明文（PIPL 纪律）
    storage.audit(actor or "anonymous", "ai_review_frame", f"{provider_id}/{model}",
                  "generate", {"clauses": len(review["result"]["clauses"]),
                               "output_chars": len(text), "blocked": blocked,
                               "redacted_outbound": redaction["total"] if redaction else 0})
    return {
        "provider_id": provider_id, "model": model, "blocked": blocked,
        "output_withheld": blocked, "text": "" if blocked else text,
        "gates": gates, "quota": quota, "usage": usage,
        "privacy_redaction": redaction,
        "disclaimer": "AI 生成内容，仅作合同审查辅助梳理，不构成法律意见，也不替代执业律师审核；"
                      "四问结论须由使用者结合完整材料独立核验。",
    }
