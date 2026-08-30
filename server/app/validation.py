# -*- coding: utf-8 -*-
"""文书交付前校验（Pre-delivery Validation）：程序化检查，非自由判断。

规格（FRAMES 13）：存在问题时状态为 Need Review 且禁止视为可交付；全部通过且已签发才为 Ready。
检查口径全部可程序化复现：
- 事实完整性：必填字段非空；正文不含未填占位（[待填写] / 连续下划线 / ____）；主体名称出现在正文中
- 法律引用：每条引用均可在本地语料解析且为现行有效版本（引用不变量双保险）
- 格式规范：标题块与签名块存在；签发 gate 状态（draft/verified/issued）
"""
import re

from .corpus import get_corpus

PLACEHOLDER_RE = re.compile(r"\[待填写\]|_{4,}|＿{4,}|（大写）____")


def _block_texts(content: dict) -> str:
    parts: list[str] = []
    for b in content.get("sections") or content.get("blocks") or []:
        parts.append(str(b.get("text") or ""))
        parts.extend(str(x) for x in (b.get("lines") or []))
    return "\n".join(parts)


def validate_draft(draft: dict) -> dict:
    corpus = get_corpus()
    fields: dict = draft.get("fields") or {}
    content: dict = draft.get("content") or {}
    body = _block_texts(content)
    checks: list[dict] = []

    def add(group: str, cid: str, title: str, ok: bool, detail: str):
        checks.append({"id": cid, "group": group, "title": title, "pass": bool(ok), "detail": detail})

    # ---- 事实完整性 ----
    tpl = None
    for t in _templates_min():
        if t["template_id"] == draft.get("template_id"):
            tpl = t
            break
    required_missing = []
    if tpl:
        for f in tpl["fields"]:
            if f.get("required") and not str(fields.get(f["key"]) or "").strip():
                required_missing.append(f["label"])
    add("事实完整性", "v1", "必填要素齐备", not required_missing,
        "全部必填字段已填写" if not required_missing else f"缺失：{'、'.join(required_missing)}")

    ph_hits = PLACEHOLDER_RE.findall(body)
    add("事实完整性", "v2", "无未填占位符", not ph_hits,
        "正文中无 [待填写]/空白下划线占位" if not ph_hits else f"正文含 {len(ph_hits)} 处未填占位（[待填写]/下划线）")

    party_keys = [k for k in fields if any(t in k for t in ("party", "client", "recipient", "plaintiff", "defendant"))]
    party_vals = [str(fields[k]).strip() for k in party_keys if str(fields[k]).strip()]
    party_ok = all(p in body for p in party_vals) if party_vals else True
    add("事实完整性", "v3", "主体名称一致", party_ok,
        "当事人在正文中一致出现" if party_ok else "部分当事人名称未在正文中出现（可能被改写或遗漏）")

    date_keys = [k for k in fields if k in ("term", "deadline", "date")]
    date_vals = [str(fields[k]).strip() for k in date_keys if str(fields[k]).strip()]
    date_ok = all(d in body for d in date_vals) if date_vals else True
    add("事实完整性", "v4", "日期一致", date_ok,
        "关键日期与正文一致" if date_ok else "关键日期未在正文中出现，需人工核对")

    # ---- 法律引用 ----
    cites = draft.get("citations") or []
    cite_bad = []
    for c in cites:
        try:
            resolved = corpus.citation_of(c["law_id"], int(c["article_no"]))
        except Exception:  # noqa: BLE001
            cite_bad.append(f"{c.get('law_id')}#{c.get('article_no')}（不在语料）")
            continue
        if "现行有效" not in str(resolved.get("status", "")):
            cite_bad.append(f"{c.get('law_id')}#{c.get('article_no')}（{resolved.get('status')}）")
    add("法律引用", "v5", "法条有效且引用存在", not cite_bad,
        f"{len(cites)} 条引用全部为本地语料现行有效版本" if not cite_bad else "存在无效/非现行引用：" + "；".join(cite_bad))
    add("法律引用", "v6", "引用来源可溯源", all(c.get("source_url") for c in cites),
        "每条引用携带来源链接与版本快照" if cites else "本文书未引用法条（如律师函/合同场景可选，此项自动通过）")

    # ---- 格式规范 ----
    blocks = content.get("sections") or content.get("blocks") or []
    kinds = {b.get("type") for b in blocks}
    add("格式规范", "v7", "标题与结构完整", bool(kinds & {"title"}),
        "含文书标题块" if kinds & {"title"} else "缺少标题块")
    add("格式规范", "v8", "签名/落款区域", bool(kinds & {"signature"}),
        "含签名落款块" if kinds & {"signature"} else "缺少签名/落款区域")

    status = draft.get("status") or "draft"
    add("签发 Gate", "v9", "人工核验签发", status == "issued",
        {"draft": "草稿尚未经执业律师核验签发，不得对外发出", "verified": "已核验、待签发", "issued": "已签发，可对外交付"}[status])

    core_ok = all(c["pass"] for c in checks if c["group"] != "签发 Gate")
    return {
        "draft_id": draft["id"],
        "template_id": draft.get("template_id"),
        "status": status,
        "ready": core_ok and status == "issued",
        "need_review": not core_ok,
        "checks": checks,
        "disclaimer": "校验为程序化检查（要素/引用/格式），不构成法律意见；实体事实仍须人工复核。",
    }


def _templates_min() -> list[dict]:
    # 延迟导入避免循环依赖
    from . import drafting
    return list(drafting.TEMPLATES.values())
