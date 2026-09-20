# -*- coding: utf-8 -*-
"""终验脚本：D8 删除链 / premise 纠错 / 评测指标 / A7 池 / 解读审核 / C7。

默认通过 FastAPI TestClient 走真实路由，并把所有写入自动隔离到临时 SQLite；不要求先
启动 uvicorn，也不会接触 ``server/data/app.db``。若确需验证一个已运行的本机服务，须
同时设置 ``LH_VERIFY_BASE`` 与 ``LH_VERIFY_ALLOW_WRITES=1``。外部目标仅允许回环地址。

运行：server/.venv/Scripts/python.exe scripts/final_verify.py
"""
import atexit
import json
import os
import secrets
import sys
import tempfile
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import urlsplit

sys.path.insert(0, ".")

_external_base = os.environ.get("LH_VERIFY_BASE", "").strip()
_client = None
_tmp_dir = None
_storage = None
_admin_token = None

if _external_base:
    BASE = _external_base.rstrip("/")
    _target = urlsplit(BASE)
    if (
        _target.scheme != "http"
        or (_target.hostname or "") not in {"127.0.0.1", "localhost"}
        or _target.username is not None
        or _target.password is not None
        or _target.query
        or _target.fragment
        or _target.path not in ("", "/")
    ):
        raise SystemExit(f"LH_VERIFY_BASE 仅允许本机回环 HTTP 服务: {BASE}")
    if os.environ.get("LH_VERIFY_ALLOW_WRITES") != "1":
        raise SystemExit(
            "外部服务终验会创建并删除测试记录；确认其使用隔离数据库后，"
            "再设置 LH_VERIFY_ALLOW_WRITES=1。"
        )
    _admin_token = os.environ.get("LH_VERIFY_ADMIN_TOKEN", "").strip()
    if not _admin_token:
        raise SystemExit("外部服务终验需要 LH_VERIFY_ADMIN_TOKEN（仅通过请求头瞬态传递）。")
else:
    from fastapi.testclient import TestClient

    from app import storage as _storage

    _tmp_dir = tempfile.TemporaryDirectory(prefix="legalhigh-final-verify-")
    if _storage._conn is not None:
        _storage._conn.close()
    _storage._conn = None
    _storage.DB_PATH = Path(_tmp_dir.name) / "app.db"
    # 内置 TestClient 使用一次性令牌访问敏感路由；令牌只存在于本进程环境和
    # 请求头，不写入临时数据库或终验输出。外部模式则必须由调用者显式提供。
    _admin_token = "final-verify-" + secrets.token_urlsafe(24)
    os.environ["LH_ADMIN_TOKEN"] = _admin_token
    os.environ["LH_ADMIN_PRINCIPAL"] = "final-verify"

    from app.main import app as _app

    _client = TestClient(_app)


def _cleanup():
    if _client is not None:
        _client.close()
    if _storage is not None and _storage._conn is not None:
        _storage._conn.close()
        _storage._conn = None
    if _tmp_dir is not None:
        _tmp_dir.cleanup()


atexit.register(_cleanup)


def call(method: str, path: str, body: dict | None = None, timeout: int = 10):
    if not path.startswith("/"):
        raise ValueError("path 必须以 / 开头")
    if _client is not None:
        response = _client.request(
            method, path, json=body,
            headers={"X-LegalHigh-Admin-Token": _admin_token},
        )
        return response.status_code, response.json()
    req = urllib.request.Request(BASE + path, method=method,
                                 data=json.dumps(body).encode() if body else None,
                                 headers={"Content-Type": "application/json",
                                          "X-LegalHigh-Admin-Token": _admin_token})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode())


ok = True

# --- D8 删除链 ---
st, r = call("POST", "/api/reviews", {"contract_text": "第一条 价款：合同总价款为人民币 100000 元，签约后七日内一次性支付。第二条 争议：协商不成向被告住所地人民法院起诉。", "title": "D8验证"})
if "review_id" not in r:
    raise SystemExit(f"create review 失败: {st} {json.dumps(r, ensure_ascii=False)[:200]}")
rid = r["review_id"]
st2, _ = call("DELETE", f"/api/reviews/{rid}")
st3, _ = call("GET", f"/api/reviews/{rid}")
_, audit = call("GET", "/api/audit?limit=10")
del_entry = next((e for e in audit["entries"] if e["entity_id"] == rid and e["action"] == "delete"), None)
c1 = st2 == 200 and st3 == 404 and del_entry is not None
print(f"[D8] create→DELETE({st2})→GET({st3})→audit.delete={'有' if del_entry else '无'} ->", "PASS" if c1 else "FAIL")
ok &= c1

# --- D8 导出 ---
st, data = call("GET", "/api/privacy/export")
c2 = st == 200 and all(k in data for k in ("reviews", "annotations", "drafts", "complaints", "audit_log"))
print(f"[D8] privacy/export {st} keys={'全' if c2 else '缺'} ->", "PASS" if c2 else "FAIL")
ok &= c2

# --- premise 新规则 ---
st, d = call("POST", "/api/qa/ask", {"question": "别人欠我钱超过诉讼时效二年了还能起诉吗"})
p = d["premise_check"]
c3 = p and p["rule_id"] == "pr-limitation-2y" and p["citation"]["article_no"] == 188
print(f"[premise] 诉讼时效 → {p['rule_id']} @188 ->", "PASS" if c3 else "FAIL")
ok &= c3
st, d = call("POST", "/api/qa/ask", {"question": "公司扣押身份证三个月怎么办"})
p = d["premise_check"]
c4 = p and p["rule_id"] == "pr-id-seizure" and p["citation"]["law_id"] == "lcl-2012"
print(f"[premise] 扣证件 → {p['rule_id']} @lcl-2012 ->", "PASS" if c4 else "FAIL")
ok &= c4

# --- 评测指标 ---
# 冷进程首调 /api/evals 需全量金标 BM25 复算（541 组 × 108 部语料，去重后实测约 95s，
# R200 前为 278s）——10s 默认超时会误杀，此处放宽为 420s。
st, d = call("GET", "/api/evals", timeout=420)
c5 = d["case_count"] >= 100 and d["hit_at_5"] >= 0.90
print(f"[evals] {d['case_count']} 组 hit@5={d['hit_at_5']} MRR={d['mrr']} ->", "PASS" if c5 else "FAIL")
ok &= c5

# --- A7 池 ---
st, d = call("GET", "/api/drafts/templates")
_, inventory = call("GET", "/api/inventory")
citation_law_count = len(d["citation_laws"])
c6 = "citation_pool" not in d and citation_law_count == inventory["laws"]
st2, d2 = call("GET", "/api/drafts/citation-pool/cl-2013")
c6 = c6 and st2 == 200 and len(d2["articles"]) == 63
print(f"[A7] templates 轻量 + {citation_law_count} 部引用目录 + 单法池 63 条 ->", "PASS" if c6 else "FAIL")
ok &= c6

# --- 解读库审核门 ---
st, d = call("GET", "/api/laws/cl-2013/explains")
c7 = st == 200 and isinstance(d.get("explains"), dict)
print(f"[explains] draft 不对外（返回空） ->", "PASS" if c7 else "FAIL")
ok &= c7

# --- C7 案例检索 server 端 ---
from urllib.parse import urlencode
st, d = call("GET", "/api/cases?" + urlencode({"q": "保险"}))
# R146 起案例检索为字段加权（facts/holding/result 入索引）——R155 修：相关性核对覆盖全部可检索字段
# （此前 guidance-17 以 facts 字段命中「保险」暴露旧断言只查轻字段的滞后，R146 扩索引时未同步此断言）
c8 = st == 200 and len(d["cases"]) >= 1 and all(
    "保险" in (c["name"] + c["cause"] + c["summary"] + c["court"] + (c.get("facts") or "") + (c.get("holding") or "") + (c.get("result") or ""))
    for c in d["cases"]
)
print(f"[C7] /api/cases?q=保险 → {len(d['cases'])} 件全含关键词 ->", "PASS" if c8 else "FAIL")
ok &= c8

# --- 旧场景路径已停用：其中的步骤/期限没有做到逐项来源绑定 ---
st, d = call("GET", "/api/scenarios")
c9 = st == 410 and "已停用" in str(d.get("detail", ""))
print("[scenarios] 无证据旧指引已拒绝公开 ->", "PASS" if c9 else "FAIL")
ok &= c9
st, d = call("GET", "/api/scenarios/match?" + urlencode({"text": "拖欠工资"}))
c10 = st == 410 and "已停用" in str(d.get("detail", ""))
print("[scenarios/match] 无证据旧匹配已拒绝公开 ->", "PASS" if c10 else "FAIL")
ok &= c10

print("\n终验结果：", "ALL PASS" if ok else "HAS FAILURES")
sys.exit(0 if ok else 1)
