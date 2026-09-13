# -*- coding: utf-8 -*-
"""LegalHigh 原型 API（FastAPI）。

合规设计：所有产出都带 disclaimer；平台不核验律师资格、不签发文书；文书状态
只记录本机使用者的复核与定稿进度。投诉通道真实落库，备案状态如实呈现。
"""
import hashlib
import json
import os as _os
import secrets
import sys
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from fastapi import Depends, FastAPI, File, Header, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field
from typing import Literal

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import (  # noqa: E402
    ai_governor,
    case_analysis,
    case_report,
    cases as cases_mod,
    compare as compare_mod,
    article_links as links_mod,
    drafting,
    docx_return,
    docxgen,
    explains as explains_mod,
    commentaries as commentaries_mod,
    coverage as coverage_mod,
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

# 本机原型没有账号/会话系统。任何会读写用户数据、写审核结果或调用外部模型的
# 接口必须默认关闭，不能把请求体中的 actor/role 当作身份凭据。启用时由启动环境
# 注入令牌与非敏感的审计主体名；令牌只在请求头中瞬态比较，绝不写入数据库、日志
# 或响应。前端在没有认证传递能力时会收到清晰的 503/401/403，而公开检索仍可用。
ADMIN_TOKEN_ENV = "LH_ADMIN_TOKEN"
ADMIN_PRINCIPAL_ENV = "LH_ADMIN_PRINCIPAL"
ADMIN_TOKEN_HEADER = "X-LegalHigh-Admin-Token"


@dataclass(frozen=True)
class AdminPrincipal:
    """由服务端配置确定的本机可信主体；不接受客户端 actor/role 覆盖。"""

    name: str


def _admin_config() -> tuple[str, str]:
    token = (_os.environ.get(ADMIN_TOKEN_ENV) or "").strip()
    principal = (_os.environ.get(ADMIN_PRINCIPAL_ENV) or "").strip()
    if not token or not principal or len(token) < 32:
        raise HTTPException(
            status_code=503,
            detail="敏感接口未启用：服务端须配置至少 32 字符的管理令牌与可信主体。",
        )
    return token, principal


def require_admin(
    supplied_token: str | None = Header(default=None, alias=ADMIN_TOKEN_HEADER),
) -> AdminPrincipal:
    """敏感端点依赖：配置缺失 503，缺令牌 401，令牌错误 403。

    对哈希后的固定长度摘要做 constant-time 比较，避免把令牌长度差异暴露给
    请求方；服务端配置值本身从不进入返回值或审计 payload。
    """
    expected, principal = _admin_config()
    if not supplied_token:
        raise HTTPException(status_code=401, detail="需要本机管理令牌。")
    expected_digest = hashlib.sha256(expected.encode("utf-8")).digest()
    supplied_digest = hashlib.sha256(supplied_token.encode("utf-8")).digest()
    if not secrets.compare_digest(supplied_digest, expected_digest):
        raise HTTPException(status_code=403, detail="本机管理令牌无效。")
    return AdminPrincipal(name=principal)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:4173", "http://127.0.0.1:4173"],
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", ADMIN_TOKEN_HEADER],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    """本机 Web 壳与 API 的最小浏览器安全基线。"""
    response = await call_next(request)
    response.headers.setdefault(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; "
        "base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
    )
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    response.headers.setdefault("Cross-Origin-Resource-Policy", "same-origin")
    if request.url.path.startswith("/api/"):
        response.headers.setdefault("Cache-Control", "no-store")
    return response


@app.get("/api/health")
def health():
    corpus = get_corpus()
    result = {"status": "ok", "service": "LegalHigh", "laws": len(corpus.laws), "articles": len(corpus.articles)}
    # 桌面壳先通过随机实例证明确认端口确由本次 sidecar 占用，再加载页面或发送管理令牌。
    # 普通 Web 部署不配置该值，也不会伪造桌面实例身份。
    instance_proof = (_os.environ.get("LH_DESKTOP_INSTANCE_PROOF") or "").strip()
    if instance_proof:
        result["instance_proof"] = instance_proof
    return result


@app.get("/api/inventory")
def public_inventory():
    """公开、只读的数据储备口径。

    所有数量均在请求时从当前受控语料和已核实数据源派生；不读取用户审查、草稿
    或审计数据，也不使用前端常量充数。侧栏和数据状态页可据此显示同一真值。
    """
    corpus = get_corpus()
    verified_cases = cases_mod.search_cases("", verified_only=True)
    approved_explains = sum(
        1
        for entry in explains_mod.load_explains()
        if entry.get("status") == "approved" and entry.get("reviewer")
    )
    return {
        "laws": len(corpus.laws),
        "articles": len(corpus.articles),
        "verified_cases": len(verified_cases),
        "approved_explains": approved_explains,
        "fetched_at": corpus.manifest.get("fetch_date"),
        "basis": "current-controlled-corpus",
    }


@app.get("/api/corpus/coverage")
def corpus_coverage():
    """公开当前覆盖边界、官方目录基线与未接入更新队列。"""
    return coverage_mod.get_coverage()


@app.get("/api/session")
def authenticated_session(admin: AdminPrincipal = Depends(require_admin)):
    """返回本机审计署名；不表示账号身份、律师资格或组织关系已经核验。"""
    return {"principal": admin.name, "assurance": "local-audit-label-only"}


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


@app.get("/api/article-links/{law_id}/{no}")
def article_links(law_id: str, no: int):
    """官方解读关联层（决策项15）：法条 → 对应司法解释条文的映射（来源已逐条核实）。"""
    return {"law_id": law_id, "no": no, "links": links_mod.links_for(law_id, no)}


@app.get("/api/scenarios")
def list_scenarios():
    """旧场景指引未做到逐项来源绑定，禁止作为公众法律路径继续返回。"""
    raise HTTPException(410, "旧场景指引已停用；请使用 /api/needs/plan 生成可回溯的事实与证据准备记录")


@app.get("/api/scenarios/match")
def match_scenario(text: str = ""):
    """旧场景匹配未做到逐项来源绑定，禁止作为公众法律路径继续返回。"""
    raise HTTPException(410, "旧场景匹配已停用；请使用 /api/needs/plan")


@app.get("/api/laws/{law_id}/explains")
def law_explains(law_id: str):
    """法条通俗解读（仅 status=approved 且已填审核人；AI 草稿审核前不对外——决策项4 双轨）。"""
    corpus = get_corpus()
    if law_id not in corpus.laws:
        raise HTTPException(404, "law not found")
    return {"law_id": law_id, "explains": explains_mod.approved_for(law_id)}


@app.get("/api/laws/{law_id}/articles/{no}/analysis-context")
def law_analysis_context(law_id: str, no: int):
    """原文、官方解释与具名专业观点的证据包；覆盖分不等于正确率。"""
    try:
        return commentaries_mod.analysis_context(law_id, no)
    except KeyError:
        raise HTTPException(404, "law article not found")


class ExplainReviewBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    action: str  # approve / reopen


@app.get("/api/explains/queue")
def explains_queue(admin: AdminPrincipal = Depends(require_admin)):
    """解读审核队列（敏感：审核面数据不对未配置主体开放）。"""
    return {"queue": explains_mod.review_queue()}


@app.patch("/api/explains/{law_id}/{no}")
def review_explain(law_id: str, no: int, body: ExplainReviewBody, admin: AdminPrincipal = Depends(require_admin)):
    """解读审核（决策项4 双轨的人工一环）。审核人=服务端主体，不接受客户端自报；动作写入 append-only 审计。"""
    try:
        e = explains_mod.set_review(law_id, no, body.action, admin.name)
    except KeyError as ex:
        raise HTTPException(404, str(ex))
    except ValueError as ex:
        raise HTTPException(422, str(ex))
    storage.audit(admin.name, "explain", f"{law_id}#{no}",
                  f"explain_{body.action}", {"status": e["status"]})
    return {"law_id": law_id, "no": no, "status": e["status"], "reviewer": e.get("reviewer")}


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
    requested_laws = [law_id] if law_id else None
    hits, retrieval = research.orchestrated_search(corpus, query, top_k=min(max(top_k, 1), 60), law_ids=requested_laws)
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
        "retrieval_meta": {**retrieval, "corpus_size": len(corpus.articles)},
    }


class AskBody(BaseModel):
    question: str = Field(min_length=1, max_length=20_000)
    top_k: int = Field(default=6, ge=1, le=60)


@app.post("/api/qa/ask")
def ask(body: AskBody):
    if not body.question.strip():
        raise HTTPException(422, "问题不能为空")
    return qa.ask(body.question.strip(), top_k=min(max(body.top_k, 1), 12))


class ResearchBody(BaseModel):
    question: str = Field(min_length=1, max_length=20_000)
    law_ids: list[str] | None = Field(default=None, max_length=32)
    top_k: int = Field(default=12, ge=1, le=60)


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
    title: str | None = Field(default=None, max_length=256)
    case_text: str = Field(min_length=1, max_length=200_000)
    claim_id: str | None = Field(default=None, max_length=64)


@app.post("/api/case/analyze")
def case_analyze(body: CaseBody):
    """案件分析（完全无状态：不写库、不落盘，case_text 仅在内存中做正则扫描）。"""
    if len(body.case_text.strip()) < 30:
        raise HTTPException(422, "案件文本过短（至少 30 字）")
    if not body.claim_id:
        raise HTTPException(422, "必须由使用者从候选方向中明确选择分析模型；系统不会默认套用借贷请求权。")
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
    title: str | None = Field(default=None, max_length=256)
    contract_text: str = Field(min_length=1, max_length=200_000)


@app.post("/api/reviews/analyze")
def analyze(body: AnalyzeBody):
    if len(body.contract_text.strip()) < 30:
        raise HTTPException(422, "合同文本过短（至少 30 字）")
    return review.analyze_contract(body.contract_text, body.title)


@app.post("/api/reviews")
def create_review(body: AnalyzeBody, admin: AdminPrincipal = Depends(require_admin)):
    result = analyze(body)
    rid = storage.create_review(result["title"], body.contract_text, result, actor=admin.name)
    return {"review_id": rid, **result}


@app.get("/api/reviews")
def reviews_list(limit: int = 50, admin: AdminPrincipal = Depends(require_admin)):
    return {"reviews": storage.list_reviews(min(max(limit, 1), 200))}


class CompareBody(BaseModel):
    text_a: str = Field(min_length=1, max_length=200_000)
    text_b: str = Field(min_length=1, max_length=200_000)


@app.post("/api/compare")
def compare_texts(body: CompareBody):
    if len(body.text_a.strip()) < 10 or len(body.text_b.strip()) < 10:
        raise HTTPException(422, "两版文本均不能为空（至少 10 字）")
    return compare_mod.diff_texts(body.text_a, body.text_b)


@app.get("/api/reviews/{rid}")
def get_review(rid: str, admin: AdminPrincipal = Depends(require_admin)):
    r = storage.get_review(rid)
    if not r:
        raise HTTPException(404, "review not found")
    return r


@app.get("/api/reviews/{rid}/docx")
def review_docx(rid: str, admin: AdminPrincipal = Depends(require_admin)):
    """审查记录 DOCX 导出：AI 建议以 Word 修订插入（w:ins）写入，律师可在 Word/WPS 中接受或拒绝。"""
    r = storage.get_review(rid)
    if not r:
        raise HTTPException(404, "review not found")
    data = docxgen.generate_review_docx(r)
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="review_{rid}.docx"'},
    )


@app.post("/api/reviews/{rid}/docx-return")
async def review_docx_return(
    rid: str,
    file: UploadFile = File(...),
    admin: AdminPrincipal = Depends(require_admin),
):
    """律师回传修订稿（M7-T1 后半）：解析 Word 修订状态（接受→采纳 / 拒绝→驳回 / 未处理→不动），
    经既有批注状态机流转并写审计；非法流转如实记 skipped。"""
    r = storage.get_review(rid)
    if not r:
        raise HTTPException(404, "review not found")
    content_type = (file.content_type or "").lower()
    if content_type not in docx_return.ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=415, detail="仅支持 DOCX 文件。")
    data = await file.read(docx_return.MAX_DOCX_BYTES + 1)
    if len(data) > docx_return.MAX_DOCX_BYTES:
        raise HTTPException(status_code=413, detail="DOCX 文件超过 10 MiB 大小限制。")
    try:
        parsed = docx_return.parse_review_docx(data)
        summary = docx_return.apply_return(rid, parsed, r, actor=admin.name)
    except ValueError as ex:
        raise HTTPException(status_code=422, detail=str(ex)) from ex
    except Exception as ex:  # noqa: BLE001 - 第三方 DOCX 解析异常统一转为输入错误
        raise HTTPException(status_code=422, detail="DOCX 文件无法解析。") from ex
    storage.audit(admin.name, "review", rid, "docx_return", {
        "accepted": summary["accepted_n"], "rejected": summary["rejected_n"],
        "pending": summary["pending"], "skipped": len(summary["skipped"])})
    return summary


@app.delete("/api/reviews/{rid}")
def delete_review(rid: str, admin: AdminPrincipal = Depends(require_admin)):
    """PIPL 删除通道：审查记录级联删除批注；删除动作本身写入 append-only 审计。"""
    try:
        storage.delete_review(rid, actor=admin.name)
    except KeyError as e:
        raise HTTPException(404, str(e))
    return {"deleted": rid}


@app.delete("/api/drafts/{did}")
def delete_draft(did: str, admin: AdminPrincipal = Depends(require_admin)):
    try:
        storage.delete_draft(did, actor=admin.name)
    except KeyError as e:
        raise HTTPException(404, str(e))
    return {"deleted": did}


@app.delete("/api/complaints/{cid}")
def delete_complaint(cid: str, admin: AdminPrincipal = Depends(require_admin)):
    try:
        storage.delete_complaint(cid, actor=admin.name)
    except KeyError as e:
        raise HTTPException(404, str(e))
    return {"deleted": cid}


@app.get("/api/privacy/export")
def privacy_export(admin: AdminPrincipal = Depends(require_admin)):
    """PIPL 导出通道：全量本机数据 JSON 下载（reviews/annotations/drafts/complaints/audit_log）。"""
    data = storage.export_all()
    return Response(
        content=json.dumps(data, ensure_ascii=False, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": 'attachment; filename="legalhigh_data_export.json"'},
    )


class TransitionBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    action: Literal["adopt", "amend", "reject", "reopen"]
    amended_text: str | None = Field(default=None, max_length=20_000)


@app.post("/api/reviews/{rid}/annotations/{finding_id}/transition")
def transition_annotation(rid: str, finding_id: str, body: TransitionBody,
                          admin: AdminPrincipal = Depends(require_admin)):
    try:
        return storage.transition_annotation(rid, finding_id, body.action, admin.name, body.amended_text)
    except KeyError as e:
        raise HTTPException(404, str(e))
    except ValueError as e:
        raise HTTPException(422, str(e))


@app.get("/api/reviews/{rid}/audit")
def review_audit(rid: str, admin: AdminPrincipal = Depends(require_admin)):
    return {"entries": storage.list_audit(None, rid)}


@app.get("/api/drafts/templates")
def templates():
    """模板清单（轻量）：引用池只返回法律目录，条文按需取 /citation-pool/{law_id}（A7）。"""
    corpus = get_corpus()
    return {"templates": list(drafting.TEMPLATES.values()),
            "citation_laws": [{"law_id": l["law_id"], "title": l["title"]} for l in corpus.manifest["laws"]]}


@app.get("/api/drafts/citation-pool/{law_id}")
def citation_pool(law_id: str):
    """单部法律的引用池：按需加载，避免把整套语料随模板下发。"""
    corpus = get_corpus()
    if law_id not in corpus.laws:
        raise HTTPException(404, "law not found")
    law = corpus.laws[law_id]
    return {"law_id": law_id, "title": law["title"],
            "articles": [{"no": a["no"], "label": a["label"], "chapter": a["chapter"],
                          "excerpt": a["text"][:80]} for a in law["articles"]]}


class DraftBody(BaseModel):
    template_id: str = Field(min_length=1, max_length=64)
    fields: dict = Field(max_length=64)


@app.post("/api/drafts")
def create_draft(body: DraftBody, admin: AdminPrincipal = Depends(require_admin)):
    try:
        gen = drafting.generate(body.template_id, body.fields)
    except KeyError as e:
        raise HTTPException(404, str(e))
    except ValueError as e:
        raise HTTPException(422, str(e))
    did = storage.create_draft(body.template_id, body.fields, gen["content"], gen["content"]["citations"], gen["snapshot"], actor=admin.name)
    return {"draft_id": did, "status": "draft", **gen}


@app.get("/api/drafts/{did}")
def get_draft(did: str, admin: AdminPrincipal = Depends(require_admin)):
    d = storage.get_draft(did)
    if not d:
        raise HTTPException(404, "draft not found")
    return d


class GateBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    note: str | None = Field(default=None, max_length=2000)
    responsibility_confirmed: bool = False


@app.post("/api/drafts/{did}/review")
def review_draft(did: str, body: GateBody, admin: AdminPrincipal = Depends(require_admin)):
    """记录本机使用者已逐项复核；不表示平台核验了身份、资格或内容正确性。"""
    try:
        return storage.transition_draft(did, "review", admin.name, note=body.note)
    except KeyError as e:
        raise HTTPException(404, str(e))
    except ValueError as e:
        raise HTTPException(422, str(e))


@app.post("/api/drafts/{did}/finalize")
def finalize_draft(did: str, body: GateBody, admin: AdminPrincipal = Depends(require_admin)):
    """由使用者确认定稿；平台不实施签发，也不据此授予任何法律身份。"""
    try:
        return storage.transition_draft(did, "finalize", admin.name,
                                        responsibility_confirmed=body.responsibility_confirmed,
                                        note=body.note)
    except KeyError as e:
        raise HTTPException(404, str(e))
    except ValueError as e:
        raise HTTPException(422, str(e))


@app.get("/api/drafts/{did}/docx")
def draft_docx(did: str, admin: AdminPrincipal = Depends(require_admin)):
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
        "positioning": "LegalHigh 是法律信息检索与文书辅助工具原型：输出法条原文与程序性信息，不提供诉讼代理、辩护或以律师名义的法律服务（《律师法》第13条）。AI 文书仅生成草稿；平台不核验使用者身份与执业资格、不实施签发，高风险产出应由执业律师等专业人员在平台外独立复核后使用，定稿责任由使用者自行确认承担。",
        "disclaimer": qa.DISCLAIMER,
        "model_status": {
            "status": "默认未启用大模型服务",
            "detail": "公开问答端点仅执行 BM25 词法检索并展示证据快照，不进行生成式输出。管理员可自行配置模型插件用于标注为 AI 草稿的研究流程；面向公众提供生成式服务前，运营方仍须完成适用的备案/登记、模型公示与内容治理义务。",
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
        "infringement_notice": "如发现内容可能侵犯著作权、商标权、隐私权或其他权益，请通过「设置 → 隐私 → 投诉与纠错通道」提交。工单会写入本机数据库并保留审计记录；具体响应主体与时限须由实际部署运营方另行公示。",
        "ai_content_label": "标注「AI 草稿」的内容由外部模型生成，仅供授权用户核验；未经人工审核不得作为已核实法律结论或对外文书。AI 可能犯错，请逐条核查引用并以可验证来源为准。",
    }


class ComplaintBody(BaseModel):
    subject: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=1, max_length=20_000)
    contact: str | None = Field(default=None, max_length=320)
    kind: Literal["general", "mobile"] = "general"  # 决策11：移动端体验反馈入口


@app.post("/api/complaints")
def create_complaint(body: ComplaintBody, admin: AdminPrincipal = Depends(require_admin)):
    if not body.subject.strip() or not body.content.strip():
        raise HTTPException(422, "主题与内容不能为空")
    cid = storage.create_complaint(body.contact, body.subject.strip(), body.content.strip(), body.kind, actor=admin.name)
    return {"complaint_id": cid, "status": "open",
            "message": "已受理并留痕。我们将在核实后通过您留下的联系方式反馈。"}


@app.get("/api/complaints")
def complaints(admin: AdminPrincipal = Depends(require_admin)):
    return {"complaints": storage.list_complaints()}


# ---------- 案例库（只收录带直接来源与核验日期的公开真实案件） ----------

@app.get("/api/cases")
def list_cases(q: str | None = None, level: str | None = None):
    return {"cases": cases_mod.search_cases(q or "", level, verified_only=True)}


@app.get("/api/cases/{case_id}")
def get_case(case_id: str):
    c = cases_mod.get_case(case_id)
    if not c:
        raise HTTPException(404, "case not found")
    return c


# ---------- 文书交付前校验（程序化检查） ----------

@app.get("/api/drafts")
def list_drafts(admin: AdminPrincipal = Depends(require_admin)):
    return {"drafts": storage.list_drafts()}


@app.get("/api/audit")
def audit_all(limit: int = 100, admin: AdminPrincipal = Depends(require_admin)):
    """全站审计日志（append-only；who/when/entity/action/payload）。"""
    entries = storage.list_audit(None, None, limit=min(max(limit, 1), 500))
    return {"entries": entries}


@app.get("/api/drafts/{did}/validation")
def draft_validation(did: str, admin: AdminPrincipal = Depends(require_admin)):
    d = storage.get_draft(did)
    if not d:
        raise HTTPException(404, "draft not found")
    return validation.validate_draft(d)


# ---------- AI 模型插件层（OpenAI 协议 harness；默认关闭，BYO key，三道合规 gate） ----------

class AiChatBody(BaseModel):
    provider_id: str = Field(min_length=1, max_length=64)
    model: str = Field(min_length=1, max_length=256)
    messages: list[dict] = Field(min_length=1, max_length=64)
    api_key: str | None = Field(default=None, max_length=512)  # 瞬态使用，服务端不落库不记日志
    base_url_override: str | None = Field(default=None, max_length=2048)
    allowed_refs: list[dict] | None = Field(default=None, max_length=128)  # gate2 引用绑定
    temperature: float = Field(default=0.3, ge=0, le=2)


@app.get("/api/ai/providers")
def ai_providers():
    return {"providers": ai_governor.list_providers()}


@app.post("/api/ai/test")
def ai_test(body: AiChatBody, admin: AdminPrincipal = Depends(require_admin)):
    try:
        return ai_governor.test_connection(
            body.provider_id, body.model,
            api_key=body.api_key, base_url_override=body.base_url_override)
    except ValueError as e:
        raise HTTPException(422, str(e))
    except ai_governor.QuotaExceeded as e:
        raise HTTPException(429, str(e))
    except PermissionError as e:
        raise HTTPException(409, str(e))


@app.post("/api/ai/chat")
def ai_chat(body: AiChatBody, admin: AdminPrincipal = Depends(require_admin)):
    try:
        return ai_governor.chat(
            body.provider_id, body.model, body.messages,
            api_key=body.api_key, base_url_override=body.base_url_override,
            allowed_refs=body.allowed_refs, temperature=body.temperature, actor=admin.name)
    except ValueError as e:
        raise HTTPException(422, str(e))
    except ai_governor.QuotaExceeded as e:
        raise HTTPException(429, str(e))
    except PermissionError as e:
        raise HTTPException(409, str(e))
    except RuntimeError as e:
        raise HTTPException(502, str(e))


# ---------- 需求解析（抽象描述 → 可溯源法条 + 案例；「薄 AI」双轨） ----------

class NeedsBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: str = Field(min_length=1, max_length=20_000)


class IntakePlanBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    summary: str = Field(min_length=1, max_length=5_000)
    trigger: str = Field(default="", max_length=2_000)
    timeline: list[str] = Field(default_factory=list, max_length=50)
    actual_outcome: str = Field(default="", max_length=2_000)
    parties: list[str] = Field(default_factory=list, max_length=50)
    evidence_owned: list[str] = Field(default_factory=list, max_length=50)
    evidence_missing: list[str] = Field(default_factory=list, max_length=50)
    desired_outcome: str = Field(default="", max_length=2_000)
    questions: list[str] = Field(default_factory=list, max_length=20)


@app.post("/api/needs/plan")
def needs_plan(body: IntakePlanBody):
    """分阶段事实梳理：只整理用户确认的信息，不调用模型补事实或作案件定性。"""
    try:
        return needs.build_intake_plan(body.model_dump())
    except ValueError as e:
        raise HTTPException(422, str(e))


@app.post("/api/needs/parse")
def needs_parse(body: NeedsBody):
    if len(body.text.strip()) < 4:
        raise HTTPException(422, "描述过短：请补充具体情形（如「老板拖欠三个月工资」）")
    try:
        return needs.parse_needs(body.text)
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

WEB_DIST = Path(_os.environ.get("WEB_DIST_DIR", str(Path(__file__).resolve().parent.parent.parent / "web" / "dist")))


def _static_file_candidate(full_path: str) -> Path | None:
    """返回位于 WEB_DIST 内的文件；用路径关系判断而非字符串前缀。"""
    if not full_path:
        return None
    candidate = (WEB_DIST / full_path).resolve()
    if not candidate.is_file():
        return None
    try:
        candidate.relative_to(WEB_DIST.resolve())
    except ValueError:
        return None
    return candidate


if (WEB_DIST / "assets").exists():
    app.mount("/assets", StaticFiles(directory=str(WEB_DIST / "assets")), name="assets")


@app.get("/{full_path:path}", include_in_schema=False)
def spa_fallback(full_path: str):
    # 路由无条件注册（无前端构建时也要 404，而不是不注册——曾使 CI 与本地行为分叉）；
    # 安全检查先于任何文件访问，穿越路径即使在有 dist 的环境也一律 404。
    if full_path.startswith("api/") or full_path == "api":
        raise HTTPException(404, "Not Found")
    if "\\" in full_path or any(part in (".", "..") for part in full_path.split("/")):
        raise HTTPException(404, "Not Found")
    if not WEB_DIST.exists():
        raise HTTPException(404, "前端未构建")
    candidate = _static_file_candidate(full_path)
    if candidate is not None:
        return FileResponse(candidate)
    return FileResponse(WEB_DIST / "index.html")
