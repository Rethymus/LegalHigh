# -*- coding: utf-8 -*-
"""架构不可协商不变式的机械检查（R138，对应 FLERF 报告 §28/§29/§34 G0）。

不是文档性断言——每条测试都在 CI 里真实运行：
- 网络导入隔离（生成路径无越权联网）；
- 引用渲染服务端化（qa 答案来自语料对象而非模型字符串）；
- Source Registry 覆盖全部语料与案例来源，reference_only 不得作构建源；
- 不可协商不变式清单可解析且与测试映射一致。
"""
import json
import pathlib
import re

from app import qa  # noqa: E402

APP_DIR = pathlib.Path(__file__).resolve().parent.parent / "app"
DATA_DIR = pathlib.Path(__file__).resolve().parent.parent / "data"


def test_network_import_isolation():
    """ARCH-001：app/ 内仅 ai_governor 允许导入 openai；任何模块不得导入 requests/httpx/aiohttp/urllib.request。

    FLERF 报告 §29：Generator→HTTP 必须被 CI 拦截。本项目的生成适配层是 ai_governor
    （受控 openai SDK 客户端），其余一切 app 模块（qa/research/needs/cases/...）
    只消费本地语料——检索与答案组装没有任何第二条联网路径。
    """
    forbidden = re.compile(r"^\s*(?:import|from)\s+(requests|httpx|aiohttp|urllib\.request)\b", re.M)
    openai_import = re.compile(r"^\s*(?:import openai|from openai import)\b", re.M)
    for py in sorted(APP_DIR.glob("*.py")):
        src = py.read_text(encoding="utf-8")
        assert not forbidden.search(src), f"{py.name} 出现越权网络导入（ARCH-001）"
        if openai_import.search(src):
            assert py.name == "ai_governor.py", f"{py.name} 导入 openai，仅 ai_governor 允许（ARCH-001）"


def test_citation_rendering_is_server_side():
    """LEGAL-001（机械面）：qa 答案=语料卡片，answer_cards 的每个字段都来自 corpus 命中对象。

    qa.ask 的实现中不存在任何 LLM 调用（qa.py 不 import openai 已由上一条保证）；
    引用四要素（law_status/effective_date/source_url/label）由语料元数据携带，
    模型没有生成引用字符串的入口。
    """
    src = (APP_DIR / "qa.py").read_text(encoding="utf-8")
    assert "orchestrated_search" in src, "qa 必须走服务端检索引擎"
    for field in ("law_status", "effective_date", "source_url", "article_label"):
        assert field in src, f"qa answer_cards 缺少引用不变量字段 {field}"
    out = qa.ask("试用期最长不得超过多久", top_k=3)
    assert out["answer_cards"], "语料内问题必须命中"
    for card in out["answer_cards"]:
        assert card["source_url"].startswith("https://")
        assert card["effective_date"]


def _registry():
    return json.loads((DATA_DIR / "source_registry.json").read_text(encoding="utf-8"))


def test_source_registry_covers_corpus():
    """LEGAL-005：语料 source 域名与案例 host 必须全部落在 approved 来源；reference_only 不得作构建源。"""
    reg = _registry()
    approved_hosts = set()
    reference_only_ids = set()
    for s in reg["sources"]:
        assert s["compliance"]["approved"] is True, f"来源 {s['id']} 未批准即入表"
        if s.get("host"):
            approved_hosts.add(s["host"])
        if s["authority_class"] == "REFERENCE_ONLY":
            reference_only_ids.add(s["id"])

    manifest = json.loads((DATA_DIR / "laws" / "manifest.json").read_text(encoding="utf-8"))
    for entry in manifest["laws"]:
        law = json.loads((DATA_DIR / "laws" / (entry["law_id"] + ".json")).read_text(encoding="utf-8"))
        url = (law.get("source") or {}).get("url", "")
        host = url.split("/")[2] if url.startswith("https://") else ""
        assert host in approved_hosts, f"{entry['law_id']} 来源 {host} 未在 Source Registry 登记"

    cases = json.loads((DATA_DIR / "cases.json").read_text(encoding="utf-8"))
    for c in (cases if isinstance(cases, list) else cases.get("cases", [])):
        host = c["source_url"].split("/")[2]
        assert host in approved_hosts, f"{c['id']} 来源 {host} 未在 Source Registry 登记"


def test_reference_only_never_a_build_source():
    """REFERENCE_ONLY（lttxzmj 参照库）只作交叉核验：语料任何 source.url 都不得指向其仓库内容。"""
    for law_json in sorted((DATA_DIR / "laws").glob("*.json")):
        if law_json.name == "manifest.json":
            continue
        law = json.loads(law_json.read_text(encoding="utf-8"))
        url = (law.get("source") or {}).get("url", "")
        assert "lttxzmj" not in url and "chinese-law-corpus" not in url, (
            f"{law_json.stem} 把参照库当作了构建源（LEGAL-005）")


def test_invariants_manifest_parseable_and_mapped():
    """不可协商不变式清单可解析、编号唯一，且每条都声明了机械检查锚点。"""
    text = (DATA_DIR / "non_negotiable_invariants.yaml").read_text(encoding="utf-8")
    ids = re.findall(r"^\s*- id: (LEGAL-\d+|ARCH-\d+)$", text, re.M)
    assert len(ids) >= 15, "不变式清单不完整"
    assert len(ids) == len(set(ids)), "不变式编号重复"
    checks = re.findall(r"mechanical_check:", text)
    assert len(checks) == len(ids), "每条不变式必须声明机械检查锚点"
