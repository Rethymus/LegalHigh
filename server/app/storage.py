# -*- coding: utf-8 -*-
"""SQLite 存储层：审查会话、批注（状态机）、文书草稿（复核/定稿状态机）、投诉、审计日志。

审计纪律：一切状态变更 append-only 写入 audit_log（who/when/entity/action/payload），
满足 EU AI Act 高风险场景日志可追溯义务的工程形态；状态流转非法即抛错。
"""
import json
import sqlite3
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path

import os as _os
# 桌面端打包（PyInstaller sidecar）经 LH_DB_PATH 指向用户数据目录；默认仓库内路径
_DB_PATH_VALUE = _os.environ.get("LH_DB_PATH", str(Path(__file__).resolve().parent.parent / "data" / "app.db"))
# `:memory:` 是明确支持的隔离模式，供浏览器 E2E/临时验收使用；不能先转成 Path，
# 否则会被误当作磁盘文件名。普通路径继续使用 Path，便于测试替换和父目录创建。
DB_PATH: Path | str = ":memory:" if _DB_PATH_VALUE == ":memory:" else Path(_DB_PATH_VALUE)

SCHEMA = """
CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY, created_at TEXT NOT NULL, title TEXT NOT NULL,
  contract_text TEXT NOT NULL, result_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS annotations (
  id TEXT PRIMARY KEY, review_id TEXT NOT NULL, finding_id TEXT NOT NULL,
  state TEXT NOT NULL, text TEXT NOT NULL, amended_text TEXT,
  actor TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(review_id, finding_id)
);
CREATE TABLE IF NOT EXISTS drafts (
  id TEXT PRIMARY KEY, created_at TEXT NOT NULL, template_id TEXT NOT NULL,
  fields_json TEXT NOT NULL, content_json TEXT NOT NULL,
  citations_json TEXT NOT NULL, status TEXT NOT NULL,
  reviewed_by TEXT, reviewed_at TEXT,
  finalized_by TEXT, finalized_at TEXT,
  responsibility_confirmed INTEGER NOT NULL DEFAULT 0,
  snapshot_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS complaints (
  id TEXT PRIMARY KEY, created_at TEXT NOT NULL, contact TEXT,
  subject TEXT NOT NULL, content TEXT NOT NULL, status TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, actor TEXT NOT NULL,
  entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, action TEXT NOT NULL,
  payload_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS evidence_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, actor TEXT NOT NULL,
  entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, action TEXT NOT NULL,
  snapshot_json TEXT NOT NULL
);
"""

# 批注状态机：pending → adopted / amended / rejected（单向，终态不可再变更）
ANNOTATION_TRANSITIONS = {
    "pending": {"adopted", "amended", "rejected"},
    "adopted": set(),
    "amended": set(),
    "rejected": {"pending"},  # 驳回后可恢复为待复核（恢复动作同样留痕）
}
# 文书状态机只记录本机使用者的工作进度，不宣称平台核验执业资格或签发文书。
DRAFT_TRANSITIONS = {
    "draft": {"reviewed"},
    "reviewed": {"finalized"},
    "finalized": set(),
}

_conn = None
_lock = threading.Lock()


def _now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def get_conn() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        if isinstance(DB_PATH, Path):
            DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        _conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
        _conn.row_factory = sqlite3.Row
        _conn.executescript(SCHEMA)
        _conn.commit()
        try:
            _conn.execute("ALTER TABLE complaints ADD COLUMN kind TEXT NOT NULL DEFAULT 'general'")
            _conn.commit()
        except sqlite3.OperationalError:
            pass  # 列已存在（重复启动）
        # 兼容早期原型数据库：旧的 verified/issued 只是本机操作记录，迁移后不再
        # 对外声称“平台律师核验/签发”。旧审计日志保持原样，作为历史证据。
        draft_columns = {r[1] for r in _conn.execute("PRAGMA table_info(drafts)").fetchall()}
        # 字面量语句表（无插值）：按缺失列名选取，杜绝字符串拼 SQL
        draft_migrations = {
            "reviewed_by": "ALTER TABLE drafts ADD COLUMN reviewed_by TEXT",
            "reviewed_at": "ALTER TABLE drafts ADD COLUMN reviewed_at TEXT",
            "finalized_by": "ALTER TABLE drafts ADD COLUMN finalized_by TEXT",
            "finalized_at": "ALTER TABLE drafts ADD COLUMN finalized_at TEXT",
            "responsibility_confirmed": "ALTER TABLE drafts ADD COLUMN responsibility_confirmed INTEGER NOT NULL DEFAULT 0",
        }
        for name in ("reviewed_by", "reviewed_at", "finalized_by", "finalized_at", "responsibility_confirmed"):
            if name not in draft_columns:
                _conn.execute(draft_migrations[name])
        if "verified_by" in draft_columns:
            _conn.execute("UPDATE drafts SET reviewed_by=COALESCE(reviewed_by, verified_by), reviewed_at=COALESCE(reviewed_at, verified_at)")
        if "issued_by" in draft_columns:
            _conn.execute("UPDATE drafts SET finalized_by=COALESCE(finalized_by, issued_by), finalized_at=COALESCE(finalized_at, issued_at)")
        _conn.execute("UPDATE drafts SET status=CASE status WHEN 'verified' THEN 'reviewed' WHEN 'issued' THEN 'finalized' ELSE status END")
        _conn.commit()
    return _conn


def audit(actor: str, entity_type: str, entity_id: str, action: str, payload: dict):
    with _lock:
        conn = get_conn()
        conn.execute(
            "INSERT INTO audit_log (ts, actor, entity_type, entity_id, action, payload_json) VALUES (?,?,?,?,?,?)",
            (_now(), actor or "anonymous", entity_type, entity_id, action, json.dumps(payload, ensure_ascii=False)),
        )
        conn.commit()


def list_audit(entity_type: str | None = None, entity_id: str | None = None, limit: int = 200):
    """按实体检索审计日志；entity_id 支持前缀匹配（annotation 的 id 形如 review_id/finding_id）。"""
    conn = get_conn()
    q = "SELECT * FROM audit_log"
    conds, args = [], []
    if entity_type:
        conds.append("entity_type=?")
        args.append(entity_type)
    if entity_id:
        conds.append("(entity_id=? OR entity_id LIKE ?)")
        args.extend([entity_id, entity_id + "/%"])
    if conds:
        q += " WHERE " + " AND ".join(conds)
    q += " ORDER BY id DESC LIMIT ?"
    args.append(limit)
    return [dict(r) for r in conn.execute(q, args).fetchall()]


def create_review(title: str, contract_text: str, result: dict, actor: str = "system") -> str:
    rid = "rv_" + uuid.uuid4().hex[:12]
    with _lock:
        conn = get_conn()
        conn.execute(
            "INSERT INTO reviews (id, created_at, title, contract_text, result_json) VALUES (?,?,?,?,?)",
            (rid, _now(), title, contract_text, json.dumps(result, ensure_ascii=False)),
        )
        for f in result["findings"]:
            conn.execute(
                "INSERT OR IGNORE INTO annotations (id, review_id, finding_id, state, text, amended_text, actor, updated_at) VALUES (?,?,?,?,?,?,?,?)",
                ("an_" + uuid.uuid4().hex[:12], rid, f["id"], "pending", f["detail"], None, "system", _now()),
            )
        conn.commit()
    audit(actor or "system", "review", rid, "create", {"title": title, "findings": len(result["findings"])})
    return rid


def get_review(rid: str):
    conn = get_conn()
    row = conn.execute("SELECT * FROM reviews WHERE id=?", (rid,)).fetchone()
    if not row:
        return None
    result = json.loads(row["result_json"])
    annotations = [dict(r) for r in conn.execute("SELECT * FROM annotations WHERE review_id=? ORDER BY rowid", (rid,)).fetchall()]
    return {
        "id": rid,
        "created_at": row["created_at"],
        "title": row["title"],
        "contract_text": row["contract_text"],
        "result": result,
        "annotations": annotations,
    }


def list_reviews(limit: int = 50) -> list[dict]:
    """审查记录列表（轻量：含风险摘要，不含全文）。"""
    conn = get_conn()
    rows = conn.execute(
        "SELECT id, created_at, title, result_json FROM reviews ORDER BY created_at DESC LIMIT ?",
        (limit,),
    ).fetchall()
    out = []
    for r in rows:
        result = json.loads(r["result_json"])
        s = result.get("summary") or {}
        out.append({
            "id": r["id"], "created_at": r["created_at"], "title": r["title"],
            "high": s.get("high", 0), "medium": s.get("medium", 0), "low": s.get("low", 0),
            "findings": len(result.get("findings") or []),
        })
    return out


def transition_annotation(review_id: str, finding_id: str, action: str, actor: str, amended_text: str | None = None):
    target = {"adopt": "adopted", "amend": "amended", "reject": "rejected", "reopen": "pending"}[action]
    with _lock:
        conn = get_conn()
        row = conn.execute("SELECT * FROM annotations WHERE review_id=? AND finding_id=?", (review_id, finding_id)).fetchone()
        if not row:
            raise KeyError(f"annotation not found: {finding_id}")
        current = row["state"]
        if target not in ANNOTATION_TRANSITIONS[current]:
            raise ValueError(f"非法状态流转: {current} → {target}")
        conn.execute(
            "UPDATE annotations SET state=?, amended_text=?, actor=?, updated_at=? WHERE review_id=? AND finding_id=?",
            (target, amended_text, actor or "anonymous", _now(), review_id, finding_id),
        )
        conn.commit()
    audit(actor, "annotation", f"{review_id}/{finding_id}", action, {
        "from": current, "to": target, "amended_text": amended_text,
    })
    return {"finding_id": finding_id, "from": current, "to": target, "actor": actor}


def create_draft(template_id: str, fields: dict, content: dict, citations: list, snapshot: dict,
                 actor: str = "system") -> str:
    did = "df_" + uuid.uuid4().hex[:12]
    with _lock:
        conn = get_conn()
        conn.execute(
            "INSERT INTO drafts (id, created_at, template_id, fields_json, content_json, citations_json, status, snapshot_json) VALUES (?,?,?,?,?,?,?,?)",
            (did, _now(), template_id, json.dumps(fields, ensure_ascii=False), json.dumps(content, ensure_ascii=False),
             json.dumps(citations, ensure_ascii=False), "draft", json.dumps(snapshot, ensure_ascii=False)),
        )
        conn.commit()
    audit(actor or "system", "draft", did, "create", {"template_id": template_id})
    return did


def get_draft(did: str):
    conn = get_conn()
    row = conn.execute("SELECT * FROM drafts WHERE id=?", (did,)).fetchone()
    if not row:
        return None
    d = dict(row)
    for k in ("fields_json", "content_json", "citations_json", "snapshot_json"):
        d[k.replace("_json", "")] = json.loads(d.pop(k))
    return d


def list_drafts(limit: int = 50) -> list[dict]:
    """草稿列表（轻量：不含 content），供交付前校验页选择最近草稿。"""
    conn = get_conn()
    rows = conn.execute(
        "SELECT id, created_at, template_id, status FROM drafts ORDER BY created_at DESC LIMIT ?",
        (limit,),
    ).fetchall()
    return [dict(r) for r in rows]


def transition_draft(did: str, action: str, actor: str, *, responsibility_confirmed: bool = False,
                     note: str | None = None):
    target = {"review": "reviewed", "finalize": "finalized"}[action]
    with _lock:
        conn = get_conn()
        row = conn.execute("SELECT * FROM drafts WHERE id=?", (did,)).fetchone()
        if not row:
            raise KeyError(f"draft not found: {did}")
        current = row["status"]
        if target not in DRAFT_TRANSITIONS[current]:
            raise ValueError(f"非法状态流转: {current} → {target}")
        if action == "review":
            conn.execute("UPDATE drafts SET status=?, reviewed_by=?, reviewed_at=? WHERE id=?",
                         (target, actor, _now(), did))
        else:
            if row["status"] != "reviewed":
                raise ValueError("定稿前必须先完成人工复核。")
            if not responsibility_confirmed:
                raise ValueError("定稿前须确认：使用者已核对事实、引用和格式，并自行承担使用责任。")
            conn.execute("UPDATE drafts SET status=?, finalized_by=?, finalized_at=?, responsibility_confirmed=1 WHERE id=?",
                         (target, actor, _now(), did))
        conn.commit()
    audit(actor, "draft", did, action, {"from": current, "to": target,
          "responsibility_confirmed": bool(responsibility_confirmed), "note": note})
    return {"draft_id": did, "from": current, "to": target, "actor": actor,
            "responsibility_confirmed": bool(responsibility_confirmed)}


def delete_review(rid: str, actor: str = "anonymous"):
    """PIPL 删除通道：删除审查记录及其全部批注（append-only 审计保留删除痕迹）。"""
    with _lock:
        conn = get_conn()
        cur = conn.execute("SELECT id FROM reviews WHERE id=?", (rid,))
        if not cur.fetchone():
            raise KeyError(f"review not found: {rid}")
        with_anno = conn.execute("SELECT COUNT(*) FROM annotations WHERE review_id=?", (rid,)).fetchone()[0]
        conn.execute("DELETE FROM annotations WHERE review_id=?", (rid,))
        conn.execute("DELETE FROM reviews WHERE id=?", (rid,))
        conn.commit()
    audit(actor, "review", rid, "delete", {"cascade_annotations": with_anno})


def delete_draft(did: str, actor: str = "anonymous"):
    """PIPL 删除通道：删除文书草稿（含其快照）；已定稿文书的删除同样留痕。"""
    with _lock:
        conn = get_conn()
        cur = conn.execute("SELECT id, status FROM drafts WHERE id=?", (did,))
        row = cur.fetchone()
        if not row:
            raise KeyError(f"draft not found: {did}")
        conn.execute("DELETE FROM drafts WHERE id=?", (did,))
        conn.commit()
    audit(actor, "draft", did, "delete", {"status_at_delete": row["status"]})


def delete_complaint(cid: str, actor: str = "anonymous"):
    """PIPL 删除通道：删除投诉工单（删除行为本身留痕）。"""
    with _lock:
        conn = get_conn()
        cur = conn.execute("SELECT id FROM complaints WHERE id=?", (cid,))
        if not cur.fetchone():
            raise KeyError(f"complaint not found: {cid}")
        conn.execute("DELETE FROM complaints WHERE id=?", (cid,))
        conn.commit()
    audit(actor, "complaint", cid, "delete", {})


def export_all() -> dict:
    """PIPL 导出通道：全量本机数据（不含审计 payload 以外的派生文件），一次导出。"""
    conn = get_conn()
    return {
        "reviews": [dict(r) for r in conn.execute("SELECT * FROM reviews").fetchall()],
        "annotations": [dict(r) for r in conn.execute("SELECT * FROM annotations").fetchall()],
        "drafts": [dict(r) for r in conn.execute("SELECT * FROM drafts").fetchall()],
        "complaints": [dict(r) for r in conn.execute("SELECT * FROM complaints").fetchall()],
        "audit_log": [dict(r) for r in conn.execute("SELECT * FROM audit_log ORDER BY id").fetchall()],
        "evidence_ledger": [dict(r) for r in conn.execute("SELECT * FROM evidence_ledger ORDER BY id").fetchall()],
    }


def record_evidence(actor: str, entity_type: str, entity_id: str, action: str, snapshot: dict):
    """Evidence Ledger（FLERF §23）：append-only，无更新/删除通道，不随缓存过期。"""
    with _lock:
        conn = get_conn()
        conn.execute(
            "INSERT INTO evidence_ledger (ts, actor, entity_type, entity_id, action, snapshot_json) VALUES (?,?,?,?,?,?)",
            (_now(), actor or "anonymous", entity_type, entity_id, action, json.dumps(snapshot, ensure_ascii=False)),
        )
        conn.commit()


def list_evidence(entity_type: str | None = None, entity_id: str | None = None, limit: int = 200):
    conn = get_conn()
    q = "SELECT * FROM evidence_ledger"
    conds, args = [], []
    if entity_type:
        conds.append("entity_type=?")
        args.append(entity_type)
    if entity_id:
        conds.append("entity_id=?")
        args.append(entity_id)
    if conds:
        q += " WHERE " + " AND ".join(conds)
    q += " ORDER BY id DESC LIMIT ?"
    args.append(limit)
    return [dict(r) for r in conn.execute(q, args).fetchall()]


def create_complaint(contact: str | None, subject: str, content: str, kind: str = "general",
                     actor: str = "system") -> str:
    kind = kind if kind in ("general", "mobile") else "general"
    cid = "cp_" + uuid.uuid4().hex[:12]
    with _lock:
        conn = get_conn()
        conn.execute(
            "INSERT INTO complaints (id, created_at, contact, subject, content, status, kind) VALUES (?,?,?,?,?,?,?)",
            (cid, _now(), contact, subject, content, "open", kind),
        )
        conn.commit()
    audit(actor or "system", "complaint", cid, "create", {"subject": subject, "kind": kind})
    return cid


def list_complaints(limit: int = 50):
    conn = get_conn()
    rows = conn.execute("SELECT * FROM complaints ORDER BY rowid DESC LIMIT ?", (limit,)).fetchall()
    return [dict(r) for r in rows]
