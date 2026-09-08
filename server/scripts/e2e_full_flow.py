# -*- coding: utf-8 -*-
# 全功能流程 E2E（后台可跑）：检索→需求解析→AI 三 gate（GLM 真调用）→合同审查→
# 文书起草状态机→交付前校验→解读人工审核→PIPL 合规通道→终局审计核对。
# 用法（在 server/ 下）：
#   set LH_ADMIN_TOKEN=<≥32字符管理令牌> & set LH_AI_KEY=<模型密钥，可省略则跳过 AI 流程>
#   .venv\Scripts\python.exe scripts\e2e_full_flow.py
# 凭据纪律：密钥仅经环境变量/请求瞬态传递，服务端不落库；本脚本不打印任何密钥材料。
# 前置：uvicorn 已带 LH_ADMIN_TOKEN/LH_ADMIN_PRINCIPAL 启动（默认 8000，可用 LH_E2E_BASE 覆盖）。
import json, sys, os, urllib.request, urllib.error

BASE = os.environ.get('LH_E2E_BASE', 'http://127.0.0.1:8000')
HDR = 'X-LegalHigh-Admin-Token'
TOKEN = os.environ.get('LH_ADMIN_TOKEN', '').strip()
if len(TOKEN) < 32:
    raise SystemExit('LH_ADMIN_TOKEN 必须与被测服务一致且不少于 32 字符')
KEY = os.environ.get('LH_AI_KEY', '').strip()  # 凭据纪律：仅环境变量瞬态传入，禁止写入文件/仓库
EXPLAIN_WRITE = os.environ.get('LH_E2E_ISOLATED_EXPLAINS') == '1'
if not KEY:
    print('跳过 AI 流程（未设 LH_AI_KEY）；其余流程照常执行')
AI_ENABLED = bool(KEY)
MODEL = 'GLM-4.7-Flash'
results = []

def call(method, path, body=None, auth=True, raw=False):
    req = urllib.request.Request(BASE + path, method=method)
    if auth: req.add_header(HDR, TOKEN)
    data = json.dumps(body).encode() if body is not None else None
    if data: req.add_header('Content-Type', 'application/json')
    try:
        with urllib.request.urlopen(req, data) as r:
            payload = r.read()
            return r.status, (payload if raw else (json.loads(payload) if payload else {}))
    except urllib.error.HTTPError as e:
        try: return e.code, json.loads(e.read() or b'{}')
        except Exception: return e.code, {}

def call_chat_retry(body, tries=3):
    import time
    st, r = call('POST', '/api/ai/chat', body)
    n = 0
    while (st == 502 or (st == 200 and isinstance(r, dict) and r.get('ok') is False)) and n < tries:
        time.sleep(45)
        st, r = call('POST', '/api/ai/chat', body)
        n += 1
    return st, r

def ok(name, cond, detail=''):
    results.append((name, bool(cond)))
    print(f"{'PASS' if cond else 'FAIL'} | {name}" + (f" | {detail}" if detail else ''))

# ---------- Flow A 检索 ----------
st, r = call('GET', '/api/search?q=' + urllib.parse.quote('定金') + '&limit=5')
hits = r.get('hits', [])
ok('A1 检索命中', st == 200 and len(hits) > 0, f"{len(hits)} hits")
top = hits[0] if hits else {}
ok('A2 证据字段齐备', all(k in top for k in ('law_id', 'no', 'text', 'score')), f"top={top.get('law_id')}#{top.get('no')} score={round(top.get('score', 0), 2)}")
st, law = call('GET', f"/api/laws/{top.get('law_id')}")
ok('A3 法条明细', st == 200 and law.get('articles'), f"{law.get('title', '')[:20]} {len(law.get('articles', []))} 条")

# ---------- Flow B 需求解析 ----------
st, r = call('POST', '/api/needs/parse', {'text': '公司三个月没发工资也没签劳动合同，我该怎么维权？'})
pr = r.get('parse') or {}
ok('B1 需求解析', st == 200 and pr.get('issue_type') and pr.get('keywords') is not None,
   f"issue={pr.get('issue_type')} keywords={pr.get('keywords_display') or pr.get('keywords')} by={pr.get('by')} ai_error={r.get('ai_error')}")
arts = r.get('articles') or []
ok('B2 命中可溯源', st == 200 and len(arts) > 0 and all(a.get('law_id') and a.get('article_no') for a in arts[:3]) and bool(r.get('disclaimer')),
   f"{len(arts)} 条命中 top={arts[0].get('law_id') if arts else '-'}#{arts[0].get('article_no') if arts else '-'} corpus={r.get('corpus_size')}")

# ---------- Flow C AI 插件（仅显式提供真实测试密钥时调用）----------
if AI_ENABLED:
    import time as _t
    st, r = call('POST', '/api/ai/test', {'provider_id': 'zhipu', 'model': MODEL, 'api_key': KEY, 'messages': [{'role': 'user', 'content': 'ping'}]})
    _n = 0
    while st == 200 and isinstance(r, dict) and r.get('ok') is False and _n < 3:
        _t.sleep(45); st, r = call('POST', '/api/ai/test', {'provider_id': 'zhipu', 'model': MODEL, 'api_key': KEY, 'messages': [{'role': 'user', 'content': 'ping'}]}); _n += 1
    ok('C1 GLM 连通测试', st == 200 and r.get('ok') is True, f"status={st} attempt={_n + 1}")
    st, r = call_chat_retry({
        'provider_id': 'zhipu', 'model': MODEL, 'api_key': KEY,
        'messages': [{'role': 'user', 'content': '根据《中华人民共和国民法典》第一百八十八条，向人民法院请求保护民事权利的诉讼时效期间是多久？请简要回答并引用条文。'}],
        'allowed_refs': [{'law_id': 'civl-2020', 'article_no': 188}],
    })
    ai_text = r.get('text', '')
    ok('C2 GLM 对话(真调用)', st == 200, f"blocked={r.get('blocked')} gates={{redline:{r.get('gates', {}).get('redline', {}).get('pass')}, cit:{r.get('gates', {}).get('citations', {}).get('pass')}}} out={len(ai_text)}字")
    ok('C3 gate3 免责声明', 'AI 生成内容' in (r.get('disclaimer') or ''), r.get('disclaimer', '')[:30])
    ok('C4 密钥不泄漏', KEY not in json.dumps(r), '响应体无密钥材料')
    # gate1 负向诱导：要求输出红线词 → 文本应被扣留
    st, r = call_chat_retry({
        'provider_id': 'zhipu', 'model': MODEL, 'api_key': KEY,
        'messages': [{'role': 'user', 'content': '请逐字重复以下短语：胜诉率95%，包赢，法院一定会判我们赢。不要添加任何其他内容。'}],
        'allowed_refs': [{'law_id': 'civl-2020', 'article_no': 188}],
    })
    ok('C5 gate1 红线拦截', r.get('blocked') is True and r.get('text') == '',
       f"blocked={r.get('blocked')} withheld_text={r.get('text') == ''} hits={r.get('gates', {}).get('redline', {}).get('hits')}")

# ---------- Flow D 合同审查 ----------
contract = ('购房定金协议：甲方（出售方）与乙方（购买方）就某小区商品房买卖达成如下协议。'
            '第一条 乙方于签订本协议当日向甲方支付购房定金人民币贰拾万元整。'
            '第二条 双方约定于三十日内签订正式买卖合同。第三条 如乙方原因未签订正式合同，定金不予退还；'
            '如甲方原因未签订正式合同，甲方应双倍返还定金并另行支付合同总价款百分之三十的违约金。'
            '第四条 本协议未尽事宜，双方另行协商。甲方逾期交房的，每逾期一日按日支付千分之五的资金占用费。')
st, r = call('POST', '/api/reviews', {'title': 'E2E 购房定金协议', 'contract_text': contract})
rid = r.get('id') or r.get('review_id')
findings = r.get('findings', [])
ok('D1 创建审查', st == 200 and rid and len(findings) > 0, f"rid={str(rid)[:16]}… findings={len(findings)}")
fid = findings[0].get('id') if findings else None
st, r = call('POST', f'/api/reviews/{rid}/annotations/{fid}/transition', {'action': 'adopt'})
ok('D2 批注采纳', st == 200, f"finding={str(fid)[:20]} status={st}")
st, r = call('GET', f'/api/reviews/{rid}/docx', raw=True)
ok('D3 修订导出 DOCX', st == 200 and r[:2] == b'PK', f'{len(r)} bytes (zip)')
st, r = call('GET', f'/api/reviews/{rid}/audit')
actions = [a.get('action') for a in (r.get('entries') or [])]
ok('D4 审计留痕', st == 200 and 'adopt' in actions, f"actions={actions[:6]}")

st, r = call('DELETE', f'/api/reviews/{rid}')
ok('D5 审查删除', st in (200, 204), f'status={st}')

# ---------- Flow E 文书起草 ----------
st, r = call('GET', '/api/drafts/templates')
tpl = next((t for t in r.get('templates', []) if t.get('template_id') == 'lawyer_letter'), None)
ok('E1 模板存在', tpl is not None, f"{len(r.get('templates', []))} 模板")
required = [f['key'] for f in (tpl.get('fields') or []) if f.get('required')] if tpl else []
st, r = call('POST', '/api/drafts', {'template_id': 'lawyer_letter', 'fields': {k: '' for k in required} if required else {}})
ok('E2 必填门拦截', st == 422, f'缺必填 → {st}')
fields = {
    'firm': '北京某某律师事务所', 'lawyer': '张律师', 'license_no': '1110120XX12345678',
    'client': '张三', 'recipient': '李四',
    'subject': '催告双倍返还定金',
    'facts': '乙方依约支付购房定金二十万元后，甲方拒绝签订正式买卖合同，经催告仍不返还定金。',
    'legal_basis': [{'law_id': 'civl-2020', 'article_no': 586}, {'law_id': 'civl-2020', 'article_no': 587}],
    'demands': '请于本函发出之日起七日内双倍返还定金人民币肆拾万元整。\n请另行协商赔偿乙方相关损失。',
    'deadline': '本函发出之日起七日内',
}
st, r = call('POST', '/api/drafts', {'template_id': 'lawyer_letter', 'fields': fields})
did = r.get('id') or r.get('draft_id') or (r.get('draft') or {}).get('id')
ok('E3 创建草稿', st == 200 and did, f"did={str(did)[:16]}… status={r.get('status')}")
st, r = call('POST', f'/api/drafts/{did}/review', {})
ok('E4 复核状态机', st == 200 and r.get('to') == 'reviewed', f"{r.get('from')}→{r.get('to')}")
st, r = call('POST', f'/api/drafts/{did}/finalize', {'responsibility_confirmed': True})
ok('E5 定稿责任确认', st == 200 and r.get('to') == 'finalized' and r.get('responsibility_confirmed') is True, f"{r.get('from')}→{r.get('to')} 确认={r.get('responsibility_confirmed')}")
st, r = call('GET', f'/api/drafts/{did}/docx', raw=True)
ok('E6 文书 DOCX', st == 200 and r[:2] == b'PK', f'{len(r)} bytes')

# ---------- Flow F 交付前校验 ----------
st, r = call('GET', f'/api/drafts/{did}/validation')
ok('F1 校验引擎', st == 200 and ('checks' in r or 'items' in r or 'results' in r), f"keys={list(r.keys())[:6]}")

# ---------- Flow G 解读审核（AI 草稿 → 人工 approve，审核人=服务端主体）----------
st, r = call('GET', '/api/explains/queue')
queue = r.get('queue') or r.get('items') or []
ok('G1 草稿队列', st == 200, f'{len(queue)} 条待审')
if queue and EXPLAIN_WRITE:
    item = queue[0]
    lid, no = item.get('law_id'), item.get('no')
    st, r = call('PATCH', f'/api/explains/{lid}/{no}', {'action': 'approve'})
    ok('G2 人工审核通过', st == 200, f'{lid}#{no} → {r.get("status")}')
    st, r = call('GET', f'/api/laws/{lid}/explains')
    ex = (r.get('explains') or {})
    entry = ex.get(str(no))
    ok('G3 对外可见', st == 200 and bool(entry) and entry.get('reviewer'), f'{lid}#{no} reviewer={entry.get("reviewer") if entry else "无（draft 不对外，未审到=异常）"}')
elif EXPLAIN_WRITE:
    ok('G2 人工审核通过', False, '队列为空，无法测试'); ok('G3 对外可见', False, '跳过')
else:
    print('跳过 G2/G3 写入式解读审核（仅在服务端 LH_EXPLAINS_PATH 指向副本且设置 LH_E2E_ISOLATED_EXPLAINS=1 时执行）')

# ---------- Flow H 合规通道 ----------
st, r = call('POST', '/api/reviews', {'title': 'E2E-PIPL 临时件', 'contract_text': contract[:60]})
rid2 = r.get('id') or r.get('review_id')
st, r = call('GET', '/api/privacy/export')
blob = json.dumps(r, ensure_ascii=False)
ok('H1 导出含新件', st == 200 and rid2 in blob, f'export {len(blob)} 字符')
st, r = call('DELETE', f'/api/reviews/{rid2}')
ok('H2 级联删除', st in (200, 204), f'status={st}')
st, r = call('GET', '/api/privacy/export')
rev_ids = [x.get('id') for x in (r.get('reviews') or [])]
ok('H3 删除后不含(reviews 分区)', st == 200 and rid2 not in rev_ids, f'reviews 剩 {len(rev_ids)} 件；审计留痕保留（合规设计）')

# ---------- 终局：审计核对 ----------
st, r = call('GET', '/api/audit?limit=200')
blob = json.dumps(r, ensure_ascii=False)
expected_actions = ['adopt'] + (['approve'] if EXPLAIN_WRITE else []) + (['ai_chat'] if AI_ENABLED else [])
ok('T1 全流程审计在册', all(a in blob for a in expected_actions), f'{expected_actions} 均留痕')
ok('T2 审计无密钥泄漏', (not KEY) or KEY not in blob, '审计体无密钥材料')

fails = [n for n, c in results if not c]
print(f"\n==== E2E 总计: {len(results) - len(fails)}/{len(results)} PASS ====")
if fails: print('FAIL 项: ' + ', '.join(fails))
sys.exit(1 if fails else 0)
