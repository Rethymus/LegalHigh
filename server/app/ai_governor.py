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
import os
import re
from pathlib import Path

from openai import OpenAI

from lib.textparse import cn_to_int

from . import storage

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "ai_providers.json"

# gate1 红线表述（规格 §45 Legal Safety；命中即拦截）
REDLINE_RE = re.compile(r"胜诉率|包赢|必胜|一定会?(胜|赢)|法院会?判[决定]定?|百分之九十?\d*胜")

# gate2 引用提取：《法名》第X条
CITE_RE = re.compile(r"《([^》]{2,30})》\s*第([一二三四五六七八九十百千零〇\d]+)条")


def load_catalog() -> list[dict]:
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    return data["providers"]


def _resolve_key(provider: dict, user_key: str | None) -> str | None:
    """密钥解析顺序：请求瞬态 key > 环境变量；本地服务（Ollama/vLLM）允许占位 key。"""
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


def _client(provider: dict, base_url_override: str | None, api_key: str) -> OpenAI:
    return OpenAI(
        base_url=(base_url_override or provider["base_url"]).strip() or provider["base_url"],
        api_key=api_key,
        timeout=60,
    )


def gate_redline(text: str) -> dict:
    hits = sorted({m.group(0) for m in REDLINE_RE.finditer(text or "")})
    return {"gate": "redline", "pass": not hits, "hits": hits}


def gate_citations(text: str, allowed_refs: list[dict] | None) -> dict:
    """AI 输出中提及的《法名》第X条必须在允许集合内；未提供集合时不判定（pass=True + note）。"""
    if not allowed_refs:
        return {"gate": "citations", "pass": True, "violations": [], "note": "未提供依据集合，跳过绑定校验（不建议）"}
    allowed_titles = {r["law_title"].replace("中华人民共和国", "") for r in allowed_refs}
    allowed_titles |= {r["law_title"] for r in allowed_refs}
    allowed_nos = {r["article_no"] for r in allowed_refs}
    violations = []
    for m in CITE_RE.finditer(text or ""):
        title, no = m.group(1), m.group(2)
        no_norm = _cn_to_int_safe(no)
        if title.replace("中华人民共和国", "") in allowed_titles and (no_norm is None or no_norm in allowed_nos):
            continue
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
    """统一对话入口：OpenAI 协议调用 → 三道 gate → 审计留痕。密钥瞬态使用，不落库。"""
    provider = get_provider(provider_id)
    if not provider:
        raise ValueError(f"未知模型提供方：{provider_id}")
    key = _resolve_key(provider, api_key)
    if not key:
        raise PermissionError(
            f"未配置 {provider['name']} 的密钥：请设置环境变量 {provider.get('env_key')}，"
            "或在请求中提供密钥（仅本次使用，服务端不保存）。"
        )
    if not model or not model.strip():
        raise ValueError("模型名不能为空")

    client = _client(provider, base_url_override, key)
    try:
        resp = client.chat.completions.create(
            model=model.strip(),
            messages=messages,
            temperature=temperature,
        )
    except Exception as e:  # noqa: BLE001 — 网络侧错误统一上抛为 RuntimeError，不泄露 key
        raise RuntimeError(f"模型调用失败（{provider['name']}）：{type(e).__name__}: {str(e)[:300]}") from e

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
        "text": text,
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
    key = _resolve_key(provider, api_key)
    if not key:
        raise PermissionError(f"未配置密钥（环境变量 {provider.get('env_key')} 或请求提供）。")
    client = _client(provider, base_url_override, key)
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
        return {"ok": False, "error": f"{type(e).__name__}: {str(e)[:240]}"}
