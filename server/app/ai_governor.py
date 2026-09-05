# -*- coding: utf-8 -*-
"""AI 模型插件层（OpenAI 协议 harness）。

设计（对应调研结论，复用而非手搓）：
- 项目 = harness，模型 = 插件：一切兼容 OpenAI Chat Completions 协议的服务
  （OpenAI/DeepSeek/Kimi/智谱/通义/Ollama/vLLM/LiteLLM/one-api…）都通过 openai 官方 SDK
  的 base_url 机制接入（各厂商官方接入文档即此用法），本模块不做任何私有协议适配。
- 密钥纪律：密钥只来自 (a) 环境变量（目录 env_key 指名）或 (b) 用户请求瞬态提供；
  绝不写入源码/配置文件/日志/数据库。audit 只记录 provider/model/字数，不记录 key。
- 合规三道 gate（v2 计划 M6-T4，默认全程启用）：
  gate1 红线词扫描：输出含「胜诉率/包赢/必胜/法院会判…」等确定性承诺表述即拦截；
  gate2 引用绑定：AI 草稿中出现的《法名》条文号必须在提供的依据集合内（轻量正则级；
        全句级 NLI 校验留待后续迭代），越界引用被标记而非静默放行；
  gate3 免责声明强制附加 + audit_log 留痕（who/provider/model/entity/action）。
- 默认关闭：未配置任何可用密钥时端点返回 409 明确提示，不提供任何「演示模型」。
"""
import json
import ipaddress
import os
import re
import socket
from urllib.parse import urlsplit
from pathlib import Path

from openai import OpenAI

from lib.textparse import cn_to_int

from . import storage
from .corpus import get_corpus

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "ai_providers.json"

# gate1 红线表述（规格 §45 Legal Safety；命中即拦截）
REDLINE_RE = re.compile(
    r"胜诉率|胜诉概?率|包赢|必胜|稳赢|稳胜|保证胜诉|肯定胜诉|绝对胜诉|"
    r"一定会?(胜|赢)|法院(一定|必然|必将|会?)判[决定]?|百分之[一二三四五六七八九十百\d]+胜"
)

# gate2 引用提取：《法名》第X条
CITE_RE = re.compile(r"《([^》]{2,30})》\s*第([一二三四五六七八九十百千零〇\d]+)条")


def load_catalog() -> list[dict]:
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    return data["providers"]


def _resolve_key(provider: dict, user_key: str | None) -> str | None:
    """密钥解析顺序：请求瞬态 key > 环境变量；本地服务（Ollama/vLLM）允许占位 key。"""
    # 本地 provider 只能访问目录中固定的 loopback 地址；即使请求携带 key，
    # 也不把它转发给本机服务。OpenAI SDK 仍需要一个非空占位值。
    if provider.get("local"):
        return "local"
    if user_key and user_key.strip():
        return user_key.strip()
    env_name = provider.get("env_key")
    if env_name and os.environ.get(env_name, "").strip():
        return os.environ[env_name].strip()
    if provider.get("local"):
        return "local"  # Ollama/vLLM 不校验 key，SDK 要求非空
    return None


def list_providers(user_key_hint: str | None = None) -> list[dict]:
    """目录 + 密钥可用性（只报是否已配置，绝不回显密钥值）。"""
    out = []
    for p in load_catalog():
        env_name = p.get("env_key")
        out.append({
            "id": p["id"],
            "name": p["name"],
            "base_url": p["base_url"],
            "default_model": p.get("default_model") or "",
            "models_hint": p.get("models_hint") or [],
            "docs": p.get("docs") or "",
            "local": bool(p.get("local")),
            "env_key": env_name,
            "env_key_set": bool(env_name and os.environ.get(env_name, "").strip()),
            "user_key_provided": bool(user_key_hint and user_key_hint.strip()),
        })
    return out


def get_provider(provider_id: str) -> dict | None:
    for p in load_catalog():
        if p["id"] == provider_id:
            return p
    return None


_BLOCKED_HOSTS = {
    "localhost",
    "localhost.localdomain",
    "metadata",
    "metadata.google.internal",
    "instance-data",
}
MAX_MESSAGES = 64
MAX_MESSAGE_CHARS = 200_000
MAX_OUTPUT_TOKENS = 4096
CUSTOM_HOSTS_ENV = "LH_AI_CUSTOM_HOSTS"


def _public_https_url(url: str) -> str:
    """校验自定义端点：HTTPS、无用户信息、解析结果全部为公网地址。

    每次调用都重新解析 DNS；调用方在创建客户端前和实际请求前各调用一次，
    尽量缩短 DNS rebinding 窗口。网络不可解析时 fail closed。
    """
    raw = (url or "").strip()
    try:
        parsed = urlsplit(raw)
        host = parsed.hostname
        port = parsed.port
    except ValueError as exc:
        raise ValueError("自定义 Base URL 格式不正确。") from exc
    host_norm = (host or "").rstrip(".").lower()
    if parsed.scheme.lower() != "https":
        raise ValueError("自定义 Base URL 仅允许 HTTPS。")
    if not host_norm:
        raise ValueError("自定义 Base URL 必须包含主机名。")
    if parsed.username is not None or parsed.password is not None:
        raise ValueError("自定义 Base URL 不得包含 URL 用户信息。")
    if parsed.query or parsed.fragment:
        raise ValueError("自定义 Base URL 不得包含 query 或 fragment。")
    if host_norm in _BLOCKED_HOSTS or host_norm.endswith((".localhost", ".local", ".internal")):
        raise ValueError("自定义 Base URL 不得指向本机、内网或元数据主机。")

    addresses: set[str] = set()
    try:
        literal = ipaddress.ip_address(host_norm)
    except ValueError:
        try:
            infos = socket.getaddrinfo(host_norm, port or 443, type=socket.SOCK_STREAM)
        except OSError as exc:
            raise ValueError("自定义 Base URL 主机无法解析，已拒绝连接。") from exc
        addresses = {str(info[4][0]).split("%", 1)[0] for info in infos if info[4]}
    else:
        addresses = {str(literal)}
    if not addresses:
        raise ValueError("自定义 Base URL 未解析到地址，已拒绝连接。")
    for address in addresses:
        try:
            ip = ipaddress.ip_address(address)
        except ValueError as exc:
            raise ValueError("自定义 Base URL 解析结果无效，已拒绝连接。") from exc
        # is_global 排除 loopback/private/link-local/unspecified/multicast/reserved。
        if not ip.is_global:
            raise ValueError("自定义 Base URL 解析到了非公网地址，已拒绝连接。")
    return raw.rstrip("/")


def _resolve_endpoint(provider: dict, base_url_override: str | None) -> str:
    """选定并校验实际 endpoint；目录 provider 不允许借 override 绕过策略。"""
    catalog_url = (provider.get("base_url") or "").strip().rstrip("/")
    override = (base_url_override or "").strip()
    if provider.get("local"):
        if override and override.rstrip("/") != catalog_url:
            raise ValueError("本机模型仅允许目录中登记的固定 Base URL。")
        return catalog_url
    if provider.get("id") == "custom":
        if not override:
            raise ValueError("自定义 OpenAI 协议端点必须提供 HTTPS Base URL。")
        endpoint = _public_https_url(override)
        host = (urlsplit(endpoint).hostname or "").rstrip(".").lower()
        allowlist = {
            item.strip().rstrip(".").lower()
            for item in (os.environ.get(CUSTOM_HOSTS_ENV) or "").split(",")
            if item.strip()
        }
        if not allowlist:
            raise ValueError(
                f"自定义模型端点默认关闭；须由部署方在 {CUSTOM_HOSTS_ENV} 中登记精确主机名。"
            )
        if host not in allowlist:
            raise ValueError("自定义 Base URL 主机不在部署方允许名单中。")
        return endpoint
    if override and override.rstrip("/") != catalog_url:
        raise ValueError("已登记模型提供方不允许覆盖 Base URL；请使用 custom。")
    return catalog_url


def _validate_messages(messages: list[dict]) -> None:
    if not isinstance(messages, list) or not messages or len(messages) > MAX_MESSAGES:
        raise ValueError("AI 消息数量超出限制。")
    total = 0
    for message in messages:
        if not isinstance(message, dict):
            raise ValueError("AI 消息格式不正确。")
        role = message.get("role")
        content = message.get("content")
        if role not in {"system", "user", "assistant"} or not isinstance(content, str):
            raise ValueError("AI 消息必须包含字符串 role/content。")
        total += len(content)
    if total > MAX_MESSAGE_CHARS:
        raise ValueError("AI 消息总长度超出限制。")


def _client(provider: dict, base_url_override: str | None, api_key: str) -> OpenAI:
    endpoint = _resolve_endpoint(provider, base_url_override)
    return OpenAI(
        base_url=endpoint,
        api_key=api_key,
        timeout=60,
    )


def gate_redline(text: str) -> dict:
    hits = sorted({m.group(0) for m in REDLINE_RE.finditer(text or "")})
    return {"gate": "redline", "pass": not hits, "hits": hits}


def _title_key(title: str | None) -> str:
    return re.sub(r"\s+", "", (title or "").strip()).replace("中华人民共和国", "")


def _resolve_allowed_ref(raw: object, corpus) -> tuple[dict | None, str | None]:
    """把客户端传入的轻量引用解析成 corpus 的规范对象。

    客户端可以只传现有 API 约定的 law_title/article_no；其余 status、effective_date
    和 source 字段一律从 corpus.citation_of 取得。若客户端主动传这些字段，也必须
    与 corpus 完全一致，防止用伪造元数据扩大允许集合。
    """
    if not isinstance(raw, dict):
        return None, "引用项不是对象"
    raw_title = str(raw.get("law_title") or "").strip()
    raw_law_id = str(raw.get("law_id") or "").strip()
    if not raw_title and not raw_law_id:
        return None, "引用项缺少法律标识"
    if "article_no" not in raw:
        return None, "引用项缺少条号"
    raw_no = raw.get("article_no")
    if isinstance(raw_no, bool):
        return None, "引用条号不是有效数字"
    no = _cn_to_int_safe(str(raw_no))
    if no is None:
        return None, "引用条号不是有效数字"

    candidate_ids = []
    if raw_law_id:
        if raw_law_id not in corpus.laws:
            return None, "法律 ID 不在服务端语料"
        candidate_ids = [raw_law_id]
    else:
        title_key = _title_key(raw_title)
        candidate_ids = [
            lid for lid, law in corpus.laws.items()
            if _title_key(law.get("title")) == title_key
        ]
        if len(candidate_ids) != 1:
            return None, "法律名称无法唯一映射到服务端语料"

    try:
        citation = corpus.citation_of(candidate_ids[0], no)
    except (KeyError, TypeError, ValueError):
        return None, "法律条号不在服务端语料"
    if raw_title and _title_key(raw_title) != _title_key(citation["law_title"]):
        return None, "法律名称与服务端语料不一致"

    # 这些字段是引用不变量的一部分：必须存在于 canonical citation；若客户端
    # 传入了值，则拒绝任何与服务端快照不一致的值（包括伪造生效日期/来源 URL）。
    invariant_fields = ("law_id", "law_title", "article_no", "status", "effective_date", "source_url", "source_kind")
    if any(field not in citation for field in invariant_fields):
        return None, "服务端引用缺少版本/生效/来源字段"
    aliases = {
        "law_id": "law_id",
        "law_title": "law_title",
        "article_no": "article_no",
        "status": "status",
        "effective_date": "effective_date",
        "source_url": "source_url",
        "source_kind": "source_kind",
    }
    for field, canonical_field in aliases.items():
        if field not in raw:
            continue
        supplied = raw[field]
        if field == "law_title":
            matches = _title_key(str(supplied)) == _title_key(str(citation[canonical_field]))
        elif field == "article_no":
            supplied_no = _cn_to_int_safe(str(supplied))
            matches = supplied_no == citation[canonical_field]
        else:
            matches = supplied == citation[canonical_field]
        if not matches:
            return None, f"引用字段 {field} 与服务端语料不一致"
    return citation, None


def gate_citations(text: str, allowed_refs: list[dict] | None) -> dict:
    """AI 输出中的法条必须绑定到服务端 corpus 的规范引用对象。

    依据集合为空、集合含无效项、输出没有可识别引用或出现越界条号时一律阻断。
    集合中的每一项都经过 citation_of，不能由客户端凭空创造法律或条号。
    """
    mentions = list(CITE_RE.finditer(text or ""))
    canonical_refs = []
    ref_errors = []
    for idx, raw in enumerate(allowed_refs or []):
        citation, error = _resolve_allowed_ref(raw, get_corpus())
        if citation is None:
            ref_errors.append(f"依据集合第{idx + 1}项无法核验")
        else:
            canonical_refs.append(citation)

    violations = list(ref_errors)
    if not allowed_refs:
        violations.append("服务端未提供非空的可核验依据集合")
    if (text or "").strip() and not mentions:
        violations.append("输出未包含可识别的《法名》第X条引用")
    allowed_pairs = {
        (_title_key(c["law_title"]), c["article_no"])
        for c in canonical_refs
    }
    for m in mentions:
        title, no = m.group(1), m.group(2)
        no_norm = _cn_to_int_safe(no)
        if no_norm is None or (_title_key(title), no_norm) not in allowed_pairs:
            violations.append(f"《{title}》第{no}条")
    return {"gate": "citations", "pass": not violations, "violations": violations[:10]}


def _cn_to_int_safe(s: str) -> int | None:
    """条号归一：ASCII 数字直接解析；中文数字走 cn_to_int（非法输入返回 None，
    由调用方按「无法核验条号」处理）。cn_to_int 对 ASCII 数字返回 -1，须先行分流。"""
    s = (s or "").strip()
    if s.isdigit():
        try:
            return int(s)
        except ValueError:  # pragma: no cover - isdigit 已保证
            return None
    try:
        v = cn_to_int(s)
        return v if v >= 0 else None
    except Exception:  # noqa: BLE001
        return None


def chat(provider_id: str, model: str, messages: list[dict], *, api_key: str | None = None,
         base_url_override: str | None = None, allowed_refs: list[dict] | None = None,
         temperature: float = 0.3, actor: str = "anonymous") -> dict:
    """统一对话入口：OpenAI 协议调用 → 三道 gate → 审计留痕。密钥瞬态使用，不落库。
    provider_id="custom" 时必须提供 base_url_override——任意 OpenAI 协议端点均可接入
    （参照 LiteLLM/one-api/new-api 网关模式，目录不锁厂商）。"""
    provider = get_provider(provider_id)
    if not provider:
        raise ValueError(f"未知模型提供方：{provider_id}")
    if provider_id == "custom" and not (base_url_override or "").strip():
        raise ValueError("自定义 OpenAI 协议端点必须提供 Base URL（如 https://your-gateway/v1）")
    # 对 custom 端点先做一次 DNS/公网校验；_client 会再次校验，缩短 rebinding 窗口。
    endpoint = _resolve_endpoint(provider, base_url_override)
    key = _resolve_key(provider, api_key)
    if not key:
        raise PermissionError(
            f"未配置 {provider['name']} 的密钥：请设置环境变量 {provider.get('env_key')}，"
            "或在请求中提供密钥（仅本次使用，服务端不保存）。"
        )
    if not model or not model.strip():
        raise ValueError("模型名不能为空")
    _validate_messages(messages)
    preflight = gate_citations("", allowed_refs)
    if not preflight["pass"]:
        raise ValueError("AI 起草必须提供全部可由服务端语料核验的非空引用集合。")

    client = _client(provider, endpoint, key)
    try:
        resp = client.chat.completions.create(
            model=model.strip(),
            messages=messages,
            temperature=temperature,
            max_tokens=MAX_OUTPUT_TOKENS,
        )
    except Exception as e:  # noqa: BLE001 — 不回显可能含 URL/header 的第三方异常正文
        raise RuntimeError(f"模型调用失败（{provider['name']}，{type(e).__name__}）。") from e

    text = (resp.choices[0].message.content or "").strip() if resp.choices else ""
    gates = {
        "redline": gate_redline(text),
        "citations": gate_citations(text, allowed_refs),
    }
    blocked = not all(g["pass"] for g in gates.values())
    usage = {}
    if getattr(resp, "usage", None):
        usage = {"prompt_tokens": resp.usage.prompt_tokens, "completion_tokens": resp.usage.completion_tokens}

    # gate3 审计留痕：不含 key、不含消息明文
    storage.audit(actor or "anonymous", "ai_chat", f"{provider_id}/{model}",
                  "generate", {"prompt_chars": sum(len(m.get("content") or "") for m in messages),
                               "output_chars": len(text), "blocked": blocked})
    return {
        "provider_id": provider_id,
        "provider_name": provider["name"],
        "model": model,
        # 命中任一道安全门时不把原始模型文本交给调用方；只返回门状态供纠正。
        "text": "" if blocked else text,
        "output_withheld": blocked,
        "gates": gates,
        "blocked": blocked,
        "usage": usage,
        "disclaimer": "AI 生成内容，供研究参考；不构成法律意见。引用与结论须经人工核验（Strict Evidence 模式）。",
    }


def test_connection(provider_id: str, model: str, *, api_key: str | None = None,
                    base_url_override: str | None = None) -> dict:
    """连接测试：最小消息 + max_tokens=8，验证 base_url/key/model 三要素。"""
    provider = get_provider(provider_id)
    if not provider:
        raise ValueError(f"未知模型提供方：{provider_id}")
    if provider_id == "custom" and not (base_url_override or "").strip():
        raise ValueError("自定义 OpenAI 协议端点必须提供 Base URL")
    if not model or not model.strip():
        raise ValueError("模型名不能为空")
    endpoint = _resolve_endpoint(provider, base_url_override)
    key = _resolve_key(provider, api_key)
    if not key:
        raise PermissionError(f"未配置密钥（环境变量 {provider.get('env_key')} 或请求提供）。")
    client = _client(provider, endpoint, key)
    try:
        resp = client.chat.completions.create(
            model=model.strip(),
            messages=[{"role": "user", "content": "回复：OK"}],
            max_tokens=8,
            temperature=0,
        )
        text = (resp.choices[0].message.content or "").strip() if resp.choices else ""
        return {"ok": True, "sample": text[:40]}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": f"模型端点连接失败（{type(e).__name__}）。"}
