# -*- coding: utf-8 -*-
"""LegalHigh 原型 API（FastAPI）。

合规设计：所有产出都带 disclaimer；律师函签发前强制执业律师核验 gate；
投诉通道真实落库；备案信息如实标注「未接入大模型/待登记」，不虚构备案号。
"""
import json
import sys
from datetime import date
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import (  # noqa: E402
    ai_governor,
    case_analysis,
    case_report,
    cases as cases_mod,
    compare as compare_mod,
    drafting,
    docxgen,
    explains as explains_mod,
    needs,
    qa,
    research,
    research_report,
    review,
    storage,
    validation,
)
from app.corpus import get_corpus  # noqa: E402

app = FastAPI(title="LegalHigh 原型 API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:4173", "http://127.0.0.1:4173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    corpus = get_corpus()
    return {"status": "ok", "laws": len(corpus.laws), "articles": len(corpus.articles)}


@app.get("/api/laws")
def list_laws():
    corpus = get_corpus()
    return {"laws": corpus.manifest["laws"], "fetched_at": corpus.manifest.get("fetch_date"),
            "disclaimer": qa.DISCLAIMER}


@app.get("/api/laws/{law_id}")
def get_law(law_id: str):
    corpus = get_corpus()
    if law_id not in corpus.laws:
        raise HTTPException(404, "law not found")
    return corpus.laws[law_id]


@app.get("/api/laws/{law_id}/explains")
def law_explains(law_id: str):
    """法条人工通俗解读（仅 status=approved 且已填审核人；AI 草稿审核前不对外——决策项4 双轨）。"""
    corpus = get_corpus()
    if law_id not in corpus.laws:
        raise HTTPException(404, "law not found")
    return {"law_id": law_id, "explains": explains_mod.approved_for(law_id)}


@app.get("/api/search")
def search_articles(q: str, top_k: int = 20, law_id: str | None = None):
    """主检索（BM25，与问答/研究同一引擎）：条文级命中 + 相关度。

    前端结果列表的唯一排序来源；多词/口语化查询在此仍可命中（词法级），
    不再走前端子串匹配。top_k 上限 60，与前端单页渲染上限一致。
    """
    query = q.strip()
    if not query:
        raise HTTPException(422, "检索词不能为空")
    corpus = get_corpus()
    hits = corpus.search(query, top_k=min(max(top_k, 1), 60), law_id=law_id)
    return {
        "query": query,
        "total": len(hits),
        "hits": [
            {
                "law_id": h["law_id"], "law_title": h["law_title"], "no": h["no"],
                "label": h["label"], "chapter": h["chapter"], "text": h["text"],
                "score": h["score"],
            }
            for h in hits
        ],
        "retrieval_meta": {"method": "bm25-char-bigram", "corpus_size": len(corpus.articles)},
    }


class AskBody(BaseModel):
    question: str
    top_k: int = 6


@app.post("/api/qa/ask")
def ask(body: AskBody):
    if not body.question.strip():
        raise HTTPException(422, "问题不能为空")
    return qa.ask(body.question.strip(), top_k=min(max(body.top_k, 1), 12))


class ResearchBody(BaseModel):
    question: str
    law_ids: list[str] | None = None
    top_k: int = 12


@app.post("/api/research/memo")
def research_memo(body: ResearchBody):
    """法律研究备忘录：多查询检索 → 依据聚类 → 诚实缺口（无 LLM，全部可溯源）。"""
    if not body.question.strip():
        raise HTTPException(422, "问题不能为空")
    try:
        return research.build_research_memo(
            body.question.strip(), law_ids=body.law_ids, top_k=body.top_k)
    except ValueError as e:
        raise HTTPException(422, str(e))


@app.post("/api/research/report")
def research_report_docx(body: ResearchBody):
    """研究备忘录 DOCX 下载（仅响应用户显式请求时生成）。"""
    memo = research_memo(body)
    data = research_report.generate_research_docx(memo)
    filename = f"research_memo_{date.today().strftime('%Y%m%d')}.docx"
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


class CaseBody(BaseModel):
    title: str | None = None
    case_text: str
    claim_id: str = "loan_repayment"


@app.post("/api/case/analyze")
def case_analyze(body: CaseBody):
    """案件分析（完全无状态：不写库、不落盘，case_text 仅在内存中做正则扫描）。"""
    if len(body.case_text.strip()) < 30:
        raise HTTPException(422, "案件文本过短（至少 30 字）")
    try:
        return case_analysis.analyze_case(body.case_text, body.title, body.claim_id)
    except ValueError as e:
        raise HTTPException(422, str(e))


@app.post("/api/case/report")
def case_report_docx(body: CaseBody):
    """案件分析报告 DOCX 下载（仅响应用户显式请求时在内存生成，不落盘）。"""
    analysis = case_analyze(body)
    data = case_report.generate_case_docx(analysis)
    filename = f"case_analysis_{date.today().strftime('%Y%m%d')}.docx"
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


class AnalyzeBody(BaseModel):
    title: str | None = None
    contract_text: str


@app.post("/api/reviews/analyze")
def analyze(body: AnalyzeBody):
    if len(body.contract_text.strip()) < 30:
        raise HTTPException(422, "合同文本过短（至少 30 字）")
    return review.analyze_contract(body.contract_text, body.title)


@app.post("/api/reviews")
def create_review(body: AnalyzeBody):
    result = analyze(body)
    rid = storage.create_review(result["title"], body.contract_text, result)
    return {"review_id": rid, **result}


@app.get("/api/reviews")
def reviews_list(limit: int = 50):
    return {"reviews": storage.list_reviews(min(max(limit, 1), 200))}


class CompareBody(BaseModel):
    text_a: str
    text_b: str


@app.post("/api/compare")
def compare_texts(body: CompareBody):
    if len(body.text_a.strip()) < 10 or len(body.text_b.strip()) < 10:
        raise HTTPException(422, "两版文本均不能为空（至少 10 字）")
    return compare_mod.diff_texts(body.text_a, body.text_b)


@app.get("/api/reviews/{rid}")
def get_review(rid: str):
    r = storage.get_review(rid)
    if not r:
        raise HTTPException(404, "review not found")
    return r


@app.delete("/api/reviews/{rid}")
def delete_review(rid: str):
    """PIPL 删除通道：审查记录级联删除批注；删除动作本身写入 append-only 审计。"""
    try:
        storage.delete_review(rid)
    except KeyError as e:
        raise HTTPException(404, str(e))
    return {"deleted": rid}


@app.delete("/api/drafts/{did}")
def delete_draft(did: str):
    try:
        storage.delete_draft(did)
    except KeyError as e:
        raise HTTPException(404, str(e))
    return {"deleted": did}


@app.delete("/api/complaints/{cid}")
def delete_complaint(cid: str):
    try:
        storage.delete_complaint(cid)
    except KeyError as e:
        raise HTTPException(404, str(e))
    return {"deleted": cid}


@app.get("/api/privacy/export")
def privacy_export():
    """PIPL 导出通道：全量本机数据 JSON 下载（reviews/annotations/drafts/complaints/audit_log）。"""
    data = storage.export_all()
    return Response(
        content=json.dumps(data, ensure_ascii=False, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": 'attachment; filename="legalhigh_data_export.json"'},
    )


class TransitionBody(BaseModel):
    action: str  # adopt / amend / reject / reopen
    actor: str = "律师"
    amended_text: str | None = None


@app.post("/api/reviews/{rid}/annotations/{finding_id}/transition")
def transition_annotation(rid: str, finding_id: str, body: TransitionBody):
    try:
        return storage.transition_annotation(rid, finding_id, body.action, body.actor, body.amended_text)
    except KeyError as e:
        raise HTTPException(404, str(e))
    except ValueError as e:
        raise HTTPException(422, str(e))


@app.get("/api/reviews/{rid}/audit")
def review_audit(rid: str):
    return {"entries": storage.list_audit(None, rid)}


@app.get("/api/drafts/templates")
def templates():
    """模板清单（轻量）：引用池只返回法律目录，条文按需取 /citation-pool/{law_id}（A7）。"""
    corpus = get_corpus()
    return {"templates": list(drafting.TEMPLATES.values()),
            "citation_laws": [{"law_id": l["law_id"], "title": l["title"]} for l in corpus.manifest["laws"]]}


@app.get("/api/drafts/citation-pool/{law_id}")
def citation_pool(law_id: str):
    """单部法律的引用池（A7：按需加载，替代原先全量 8 部随模板下发）。"""
    corpus = get_corpus()
    if law_id not in corpus.laws:
        raise HTTPException(404, "law not found")
    law = corpus.laws[law_id]
    return {"law_id": law_id, "title": law["title"],
            "articles": [{"no": a["no"], "label": a["label"], "chapter": a["chapter"],
                          "excerpt": a["text"][:80]} for a in law["articles"]]}


class DraftBody(BaseModel):
    template_id: str
    fields: dict


@app.post("/api/drafts")
def create_draft(body: DraftBody):
    try:
        gen = drafting.generate(body.template_id, body.fields)
    except KeyError as e:
        raise HTTPException(404, str(e))
    except ValueError as e:
        raise HTTPException(422, str(e))
    did = storage.create_draft(body.template_id, body.fields, gen["content"], gen["content"]["citations"], gen["snapshot"])
    return {"draft_id": did, "status": "draft", **gen}


@app.get("/api/drafts/{did}")
def get_draft(did: str):
    d = storage.get_draft(did)
    if not d:
        raise HTTPException(404, "draft not found")
    return d


class GateBody(BaseModel):
    actor: str
    role: str = "执业律师"
    note: str | None = None


@app.post("/api/drafts/{did}/verify")
def verify_draft(did: str, body: GateBody):
    try:
        return storage.transition_draft(did, "verify", body.actor, role=body.role, note=body.note)
    except KeyError as e:
        raise HTTPException(404, str(e))
    except ValueError as e:
        raise HTTPException(422, str(e))


@app.post("/api/drafts/{did}/issue")
def issue_draft(did: str, body: GateBody):
    try:
        return storage.transition_draft(did, "issue", body.actor, role=body.role, note=body.note)
    except KeyError as e:
        raise HTTPException(404, str(e))
    except ValueError as e:
        raise HTTPException(422, str(e))


@app.get("/api/drafts/{did}/docx")
def draft_docx(did: str):
    d = storage.get_draft(did)
    if not d:
        raise HTTPException(404, "draft not found")
    data = docxgen.generate_docx(d)
    filename = f"{d['template_id']}_{d['id']}.docx"
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/api/compliance")
def compliance():
    corpus = get_corpus()
    checkpoints = [
        {"id": cp["id"], "category": cp["category"], "risk": cp["risk"], "title": cp["title"],
         "basis_kind": "statute" if cp["citation"] else "practice",
         "citation": (f"《{corpus.laws[cp['citation'][0]]['title']}》第{cp['citation'][1]}条" if cp["citation"] else "实务建议")}
        for cp in review.get_checkpoints()
    ]
    return {
        "positioning": "LegalHigh 是法律信息检索与文书辅助工具原型：输出法条原文与程序性信息，不提供诉讼代理、辩护或以律师名义的法律服务（《律师法》第13条）；AI 文书仅生成草稿，高风险产出设执业律师人工核验 gate。",
        "disclaimer": qa.DISCLAIMER,
        "model_status": {
            "status": "原型未接入任何大模型服务",
            "detail": "当前版本问答为检索式（BM25 词法检索 + 命中条文原文展示），不进行生成式输出。未来接入生成能力时，将仅调用已完成备案的大模型服务，并按《生成式人工智能服务管理暂行办法》第17条完成登记与在显著位置公示模型名称与备案号。",
            "filing_no": None,
        },
        "red_lines": [
            "先备案/登记再对公众开放，并公示所用模型（生成式AI办法 第17条）",
            "对输出内容承担网络信息内容生产者责任（第4、9、14条）",
            "不以律师名义执业、不提供诉讼代理（律师法 第13、55条）",
            "定位法律信息+程序指引，重大事项导流持证律师与 12348",
            "建立个人信息拒绝/删除机制（PIPL 第27-29条）",
            "入库文书数据二次脱敏并提供拒绝/删除通道",
            "禁止未授权爬取，数据走官方开放/授权采购（三重授权原则）",
            "投诉举报通道与违法内容处置流程真实可用（第14、15、18条）",
            "法条引用回链权威库并标注时效性",
            "不虚构评测成绩，只公开可证之事",
        ],
        "data_sources": corpus.manifest["laws"],
        "checkpoints": checkpoints,
        "complaint_channel": "本页「投诉与纠错」表单提交后即写入本地工单库并留痕。",
    }


class ComplaintBody(BaseModel):
    subject: str
    content: str
    contact: str | None = None


@app.post("/api/complaints")
def create_complaint(body: ComplaintBody):
    if not body.subject.strip() or not body.content.strip():
        raise HTTPException(422, "主题与内容不能为空")
    cid = storage.create_complaint(body.contact, body.subject.strip(), body.content.strip())
    return {"complaint_id": cid, "status": "open",
            "message": "已受理并留痕。我们将在核实后通过您留下的联系方式反馈。"}


@app.get("/api/complaints")
def complaints():
    return {"complaints": storage.list_complaints()}


# ---------- 案例样本库（仅收录可公开查证案件；sample=true 为未核实占位） ----------

@app.get("/api/cases")
def list_cases(q: str | None = None, level: str | None = None):
    return {"cases": cases_mod.search_cases(q or "", level)}


@app.get("/api/cases/{case_id}")
def get_case(case_id: str):
    c = cases_mod.get_case(case_id)
    if not c:
        raise HTTPException(404, "case not found")
    return c


# ---------- 文书交付前校验（程序化检查） ----------

@app.get("/api/drafts")
def list_drafts():
    return {"drafts": storage.list_drafts()}


@app.get("/api/audit")
def audit_all(limit: int = 100):
    """全站审计日志（append-only；who/when/entity/action/payload）。"""
    entries = storage.list_audit(None, None, limit=min(max(limit, 1), 500))
    return {"entries": entries}


@app.get("/api/drafts/{did}/validation")
def draft_validation(did: str):
    d = storage.get_draft(did)
    if not d:
        raise HTTPException(404, "draft not found")
    return validation.validate_draft(d)


# ---------- AI 模型插件层（OpenAI 协议 harness；默认关闭，BYO key，三道合规 gate） ----------

class AiChatBody(BaseModel):
    provider_id: str
    model: str
    messages: list[dict]
    api_key: str | None = None          # 瞬态使用，服务端不落库不记日志
    base_url_override: str | None = None
    allowed_refs: list[dict] | None = None  # gate2 引用绑定：允许的 {law_title, article_no}
    temperature: float = 0.3


@app.get("/api/ai/providers")
def ai_providers():
    return {"providers": ai_governor.list_providers()}


@app.post("/api/ai/test")
def ai_test(body: AiChatBody):
    try:
        return ai_governor.test_connection(
            body.provider_id, body.model,
            api_key=body.api_key, base_url_override=body.base_url_override)
    except ValueError as e:
        raise HTTPException(422, str(e))
    except PermissionError as e:
        raise HTTPException(409, str(e))


@app.post("/api/ai/chat")
def ai_chat(body: AiChatBody):
    try:
        return ai_governor.chat(
            body.provider_id, body.model, body.messages,
            api_key=body.api_key, base_url_override=body.base_url_override,
            allowed_refs=body.allowed_refs, temperature=body.temperature)
    except ValueError as e:
        raise HTTPException(422, str(e))
    except PermissionError as e:
        raise HTTPException(409, str(e))
    except RuntimeError as e:
        raise HTTPException(502, str(e))


# ---------- 需求解析（抽象描述 → 可溯源法条 + 案例；「薄 AI」双轨） ----------

class NeedsBody(BaseModel):
    text: str
    ai: dict | None = None  # {provider_id, model, api_key?, base_url_override?} 可选；缺省为确定性降级


@app.post("/api/needs/parse")
def needs_parse(body: NeedsBody):
    if len(body.text.strip()) < 4:
        raise HTTPException(422, "描述过短：请补充具体情形（如「老板拖欠三个月工资」）")
    try:
        return needs.parse_needs(body.text, ai=body.ai)
    except ValueError as e:
        raise HTTPException(422, str(e))


@app.get("/api/evals")
def evals():
    """检索评测（实时计算，结果可复现）：金标集 server/tests/gold/gold_retrieval.json。

    指标口径：条文级。hit@5 = 金标条文出现在 top-5 的比例；MRR 为金标条文排名倒数的
    平均；precision@5 = 检索出的条文中金标条文占比。LegalBench-RAG（arXiv:2408.10343）
    采用字符级 span 口径，本原型以「条」为最小检索单元，故为条文级近似口径。
    """
    import json as _json

    gold_path = Path(__file__).resolve().parent.parent / "tests" / "gold" / "gold_retrieval.json"
    corpus = get_corpus()
    gold = _json.loads(gold_path.read_text(encoding="utf-8"))
    items = []
    hits = 0
    rr_sum = 0.0
    prec_sum = 0.0
    for g in gold["cases"]:
        res = corpus.search(g["question"], top_k=5)
        got = [(r["law_id"], r["no"]) for r in res]
        expected = [(e["law_id"], e["no"]) for e in g["expect"]]
        rank = None
        for i, key in enumerate(got, 1):
            if key in expected:
                rank = i
                break
        hit = rank is not None
        hits += int(hit)
        rr_sum += (1.0 / rank) if rank else 0.0
        prec_sum += (sum(1 for k in got if k in expected) / max(len(got), 1))
        items.append({
            "id": g["id"], "question": g["question"],
            "expect": [{"law_id": e["law_id"], "no": e["no"]} for e in g["expect"]],
            "got": [{"law_id": k[0], "no": k[1]} for k in got],
            "hit": hit, "rank": rank,
        })
    n = len(gold["cases"])
    return {
        "metric_note": "条文级口径（以条为检索单元）；金标集由人工依据语料标注，评测实时可复现。",
        "case_count": n,
        "hit_at_5": round(hits / n, 4),
        "mrr": round(rr_sum / n, 4),
        "precision_at_5": round(prec_sum / n, 4),
        "cases": items,
    }


# 前端构建产物静态托管（存在 web/dist 时）：/assets 走静态文件，其余非 API 路径
# 一律回退 index.html（React SPA 客户端路由刷新时不得 404）。
from fastapi.responses import FileResponse  # noqa: E402

WEB_DIST = Path(__file__).resolve().parent.parent.parent / "web" / "dist"
if WEB_DIST.exists():
    if (WEB_DIST / "assets").exists():
        app.mount("/assets", StaticFiles(directory=str(WEB_DIST / "assets")), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa_fallback(full_path: str):
        if full_path.startswith("api/") or full_path == "api":
            raise HTTPException(404, "Not Found")
        candidate = (WEB_DIST / full_path).resolve()
        if full_path and candidate.is_file() and str(candidate).startswith(str(WEB_DIST.resolve())):
            return FileResponse(candidate)
        return FileResponse(WEB_DIST / "index.html")
