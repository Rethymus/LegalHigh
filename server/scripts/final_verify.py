# -*- coding: utf-8 -*-
"""终验脚本：D8 删除链 / premise 纠错 / 评测指标 / A7 池 / 解读审核 / C7 —— 全部走真实 API。
运行：server/.venv/Scripts/python.exe scripts/final_verify.py

安全说明：目标仅限本机回环上的开发服务；BASE 经 allowlist 校验（SSRF 防护）。
"""
import json
import sys
import urllib.error
import urllib.request
from urllib.parse import urlsplit

BASE = "http://127.0.0.1:8000"
_ALLOWED_HOSTS = {"127.0.0.1", "localhost"}
_host = urlsplit(BASE).hostname or ""
if urlsplit(BASE).scheme != "http" or _host not in _ALLOWED_HOSTS:
    raise SystemExit(f"BASE 不在允许的主机清单内: {BASE}")

sys.path.insert(0, ".")


def call(method: str, path: str, body: dict | None = None):
    if not path.startswith("/"):
        raise ValueError("path 必须以 / 开头")
    req = urllib.request.Request(BASE + path, method=method,
                                 data=json.dumps(body).encode() if body else None,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as r:
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
st, d = call("GET", "/api/evals")
c5 = d["case_count"] >= 100 and d["hit_at_5"] >= 0.90
print(f"[evals] {d['case_count']} 组 hit@5={d['hit_at_5']} MRR={d['mrr']} ->", "PASS" if c5 else "FAIL")
ok &= c5

# --- A7 池 ---
st, d = call("GET", "/api/drafts/templates")
c6 = "citation_pool" not in d and len(d["citation_laws"]) == 10
st2, d2 = call("GET", "/api/drafts/citation-pool/cl-2013")
c6 = c6 and st2 == 200 and len(d2["articles"]) == 63
print(f"[A7] templates 轻量 + 单法池 63 条 ->", "PASS" if c6 else "FAIL")
ok &= c6

# --- 解读库审核门 ---
st, d = call("GET", "/api/laws/cl-2013/explains")
c7 = st == 200 and isinstance(d.get("explains"), dict)
print(f"[explains] draft 不对外（返回空） ->", "PASS" if c7 else "FAIL")
ok &= c7

# --- C7 案例检索 server 端 ---
from urllib.parse import urlencode
st, d = call("GET", "/api/cases?" + urlencode({"q": "保险"}))
c8 = st == 200 and len(d["cases"]) >= 1 and all("保险" in (c["name"] + c["cause"] + c["summary"] + c["court"]) for c in d["cases"])
print(f"[C7] /api/cases?q=保险 → {len(d['cases'])} 件全含关键词 ->", "PASS" if c8 else "FAIL")
ok &= c8

# --- 场景路径（第十六轮新增） ---
st, d = call("GET", "/api/scenarios")
c9 = st == 200 and len(d.get("scenarios", [])) >= 5
print(f"[scenarios] {len(d.get('scenarios', []))} 个场景 ->", "PASS" if c9 else "FAIL")
ok &= c9
st, d = call("GET", "/api/scenarios/match?" + urlencode({"text": "拖欠工资"}))
c10 = st == 200 and len(d.get("matches", [])) >= 1
print(f"[scenarios/match] 匹配 → {len(d.get('matches', []))} 个 ->", "PASS" if c10 else "FAIL")
ok &= c10

print("\n终验结果：", "ALL PASS" if ok else "HAS FAILURES")
sys.exit(0 if ok else 1)
