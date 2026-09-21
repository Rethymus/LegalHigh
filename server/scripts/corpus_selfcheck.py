# -*- coding: utf-8 -*-
"""语料机器侧自检（决策项6·flk 比对的机器侧准备）。

与 flk 的「人工抽查 ≥10% + 字段级全量对照」中，机器可独立完成的部分：
- 条数与 manifest 一致
- 条号顺序连续（第一条→末条，独立重验 build_corpus 的顺序递增校验）
- 文本非空、无重复 (law_id, no)
- 全量 citation_of 可解析（引用不变量数据面）
- status 非空；施行日期为空时登记为待核（不再把它隐含在“问题 0”中）
- manifest 与 evidence 源文件、生成法律 JSON 的 SHA-256 一致

产物：docs/qa-evidence/corpus_selfcheck_<date>.json + 控制台摘要；异常退出码 1。
运行：server/.venv/Scripts/python.exe scripts/corpus_selfcheck.py
"""
import hashlib
import json
import re
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EVIDENCE_DIR = (ROOT.parent / "docs" / "research" / "evidence").resolve()
sys.path.insert(0, str(ROOT))

from app.corpus import get_corpus  # noqa: E402

CN_NUM = "零〇一二三四五六七八九十百千"


def main() -> int:
    corpus = get_corpus()
    problems = []
    pending = []
    report = {"date": date.today().isoformat(), "laws": {}, "pending": pending}

    for m in corpus.manifest["laws"]:
        lid = m["law_id"]
        law = corpus.laws[lid]
        arts = law["articles"]
        effective_date = law.get("effective_date")
        effective_date_evidence = law.get("effective_date_evidence")
        lr = {"manifest_count": m["article_count"], "actual_count": len(arts),
              "sequential": True, "empty_text": 0, "duplicate_no": 0,
              "no_effective_date": not bool(effective_date),
              "effective_date_evidence_valid": True}
        if not effective_date:
            # 施行日期缺失是“待核”数据状态，不伪装成结构故障，也不能再让
            # 控制台仅显示“问题 0 项”而遗漏这一对引用有效性有影响的缺口。
            pending.append(f"{lid}: effective_date 缺失（待官方核对）")
        else:
            if m.get("effective_date") != effective_date:
                problems.append(f"{lid}: manifest 施行日期与法律对象不一致")
            if not isinstance(effective_date_evidence, dict):
                lr["effective_date_evidence_valid"] = False
                problems.append(f"{lid}: effective_date 缺少独立证据对象")
            else:
                required = ("title", "url", "accessed_at", "grade", "source_kind")
                missing = [key for key in required if not effective_date_evidence.get(key)]
                if missing:
                    lr["effective_date_evidence_valid"] = False
                    problems.append(f"{lid}: effective_date_evidence 缺字段 {missing}")
                if not str(effective_date_evidence.get("url", "")).startswith("https://"):
                    lr["effective_date_evidence_valid"] = False
                    problems.append(f"{lid}: effective_date_evidence URL 非 HTTPS")
                if effective_date_evidence.get("grade") not in {"强", "中", "弱"}:
                    lr["effective_date_evidence_valid"] = False
                    problems.append(f"{lid}: effective_date_evidence 证据等级无效")
                record_rel = effective_date_evidence.get("record_snapshot")
                record_sha = effective_date_evidence.get("record_sha256")
                if record_rel or record_sha:
                    record_path = (ROOT.parent / str(record_rel)).resolve()
                    try:
                        record_path.relative_to(EVIDENCE_DIR)
                    except (ValueError, OSError):
                        problems.append(f"{lid}: 日期核验记录路径不在 evidence 目录")
                    else:
                        if not record_path.is_file() or hashlib.sha256(record_path.read_bytes()).hexdigest() != record_sha:
                            problems.append(f"{lid}: 日期核验记录 SHA-256 不匹配")
            if m.get("effective_date_evidence") != effective_date_evidence:
                problems.append(f"{lid}: manifest 日期证据与法律对象不一致")

        snapshot_rel = m.get("snapshot")
        snapshot_sha = m.get("snapshot_sha256")
        snapshot_path = (ROOT.parent / snapshot_rel).resolve() if snapshot_rel else None
        try:
            if snapshot_path is None or snapshot_path.relative_to(EVIDENCE_DIR) == Path("."):
                raise ValueError
        except (ValueError, OSError):
            problems.append(f"{lid}: manifest snapshot 路径不在 evidence 目录")
        else:
            if not snapshot_path.is_file():
                problems.append(f"{lid}: manifest snapshot 文件不存在")
            elif not snapshot_sha or not re.fullmatch(r"[0-9a-f]{64}", str(snapshot_sha)):
                problems.append(f"{lid}: 缺少 snapshot_sha256")
            elif hashlib.sha256(snapshot_path.read_bytes()).hexdigest() != snapshot_sha:
                problems.append(f"{lid}: 证据快照 SHA-256 不匹配")
            source_sha = (law.get("source") or {}).get("sha256")
            if source_sha != snapshot_sha:
                problems.append(f"{lid}: 法律对象 source.sha256 与 manifest 不一致")

        output_sha = m.get("output_sha256")
        law_path = ROOT / "data" / "laws" / f"{lid}.json"
        if not law_path.is_file():
            problems.append(f"{lid}: 生成法律 JSON 文件不存在")
        elif not output_sha or not re.fullmatch(r"[0-9a-f]{64}", str(output_sha)):
            problems.append(f"{lid}: 缺少 output_sha256")
        elif hashlib.sha256(law_path.read_bytes()).hexdigest() != output_sha:
            problems.append(f"{lid}: 生成法律 JSON SHA-256 不匹配")
        if m["article_count"] != len(arts):
            problems.append(f"{lid}: manifest 条数 {m['article_count']} ≠ 实际 {len(arts)}")
        nos = [a["no"] for a in arts]
        if nos != sorted(nos):
            problems.append(f"{lid}: 条号非升序")
        if len(set(nos)) != len(nos):
            # 子条号感知（2026-09-14）：唯一性按 (no, sub) 对判定——同号子条号是独立条文
            pairs = [(a["no"], a.get("sub") or "") for a in arts]
            lr["duplicate_no"] = len(pairs) - len(set(pairs))
            if lr["duplicate_no"]:
                problems.append(f"{lid}: 条号重复 {lr['duplicate_no']} 处")
        # 顺序连续性：正文条号标签应从第一条（通常第一条）逐条递进（条文有分编/章不影响条号）
        breaks = []
        prev_no, prev_sub = 0, 0  # 子条号感知：17→17之一→18 为合法递进（2026-09-14 S2-T1 子条号支持）
        for a in arts:
            from lib.textparse import ART_SUB_IDX
            n = a["no"]
            s = ART_SUB_IDX.get(a.get("sub") or "", 0)
            if (n, s) != (prev_no, prev_sub + 1) and (n, s) != (prev_no + 1, 0):
                breaks.append(f"{prev_no}→{n}")
            prev_no, prev_sub = n, s
        if breaks:
            lr["sequential"] = False
            problems.append(f"{lid}: 条号断点 {breaks[:5]}{'...' if len(breaks) > 5 else ''}")
        for a in arts:
            if not a["text"].strip():
                lr["empty_text"] += 1
                problems.append(f"{lid}#{a['no']}: 空文本")
        for a in arts:
            corpus.citation_of(lid, a["no"])  # 不存在/解析失败会抛错
        report["laws"][lid] = lr

    report["problems"] = problems
    out = ROOT.parent / "docs" / "qa-evidence" / f"corpus_selfcheck_{date.today().isoformat()}.json"
    # 版本注册表校验（S2-T4）：有注册表的法律必须过 schema + 与语料对齐；无注册表不算问题（PoC 渐进）。
    version_registries = {}
    versions_dir = ROOT / "data" / "law_versions"
    if versions_dir.is_dir():
        from app import law_versions  # noqa: E402
        for reg_file in sorted(versions_dir.glob("*.json")):
            lid = reg_file.stem
            try:
                version_registries[lid] = law_versions.describe(lid)
            except (ValueError, FileNotFoundError) as e:
                problems.append(f"版本注册表 {lid}: {e}")
    report["version_registries"] = {lid: len(d["versions"]) for lid, d in version_registries.items()}

    # 历史版本全文校验（R167，known-gaps #1 垂直切片）：有全文文件的法律必须
    # 双向过检（schema + 注册表对齐 + 快照哈希复算）；无全文文件不算问题（滚动采集）。
    fulltext_count = 0
    fulltext_dir = ROOT / "data" / "law_versions_fulltext"
    if fulltext_dir.is_dir():
        from app import version_fulltext  # noqa: E402
        for law_dir in sorted(fulltext_dir.iterdir()):
            if not law_dir.is_dir():
                continue
            for ft_file in sorted(law_dir.glob("*.json")):
                fulltext_count += 1
                lid, vid = law_dir.name, ft_file.stem
                try:
                    ft = version_fulltext.load(lid, vid)
                except (ValueError, FileNotFoundError) as e:
                    problems.append(f"历史全文 {lid}/{vid}: {e}")
                    continue
                snapshot_path = (ROOT.parent / ft["source"]["snapshot"]).resolve()
                try:
                    snapshot_path.relative_to(EVIDENCE_DIR)
                except (ValueError, OSError):
                    problems.append(f"历史全文 {lid}/{vid}: 快照路径不在 evidence 目录")
                else:
                    if not snapshot_path.is_file() or hashlib.sha256(snapshot_path.read_bytes()).hexdigest() != ft["source"]["sha256"]:
                        problems.append(f"历史全文 {lid}/{vid}: 快照 SHA-256 不匹配")
    report["version_fulltexts"] = fulltext_count

    # flk native id 映射校验（R188）：bbbs 非空且 evidence 文件在库（evidence.py 消费方 fail-open，
    # 此处是唯一的机器门——损坏的映射会让 source_native_id 静默变 None 而无人知晓）。
    native_ids_path = ROOT / "data" / "flk_native_ids.json"
    native_count = 0
    if native_ids_path.is_file():
        try:
            native_map = json.loads(native_ids_path.read_text(encoding="utf-8"))
            for lid, rec in native_map.items():
                native_count += 1
                bbbs = (rec or {}).get("bbbs")
                if not bbbs or not re.fullmatch(r"[\w-]{8,}", str(bbbs)):
                    problems.append(f"flk native id {lid}: bbbs 形态异常")
                ev_rel = (rec or {}).get("evidence")
                ev_path = (ROOT.parent / str(ev_rel)).resolve() if ev_rel else None
                if not ev_rel or not ev_path.is_file():
                    problems.append(f"flk native id {lid}: 证据文件缺失 {ev_rel}")
        except ValueError as e:
            problems.append(f"flk native id 映射不可解析: {e}")
    report["flk_native_ids"] = native_count

    # 案例库校验（R243）：每件指导案例的官方快照在库且 holding/result 逐字在文中
    # （R131 钉住逻辑的机器侧复验）；research_refs 一律指向语料中真实存在的条文。
    cases_report = {"cases": 0, "guiding": 0, "snapshots_verified": 0, "refs_checked": 0}
    cases_path = ROOT / "data" / "cases.json"
    if cases_path.is_file():
        from app import cases as cases_mod  # noqa: E402
        all_cases = cases_mod.load_cases()
        cases_report["cases"] = len(all_cases)
        ws = re.compile(r"[\s　]+")
        for c in all_cases:
            cid = c["id"]
            refs = c.get("research_refs") or []
            cases_report["refs_checked"] += len(refs)
            for r in refs + [
                {"law_id": s.get("law_id"), "no": int(s["no"]), "sub": s.get("sub") or "", "label": s.get("label")}
                for s in (c.get("statutes") or []) if str(s.get("no", "")).isdigit()
            ]:
                sub = r.get("sub") or ""
                found = any(a["law_id"] == r["law_id"] and a["no"] == r["no"] and (a.get("sub") or "") == sub
                            for a in corpus.articles)
                if not found:
                    # R275：statutes（旧形态字段，如 guidance-01）与 research_refs 一并纳入存在性门
                    problems.append(f"案例 {cid}: 法条引用指向语料外条文 {r['law_id']}@{r['no']}{sub}")
                # R274：label 开头的现行法引用必须与存储 (no, sub) 一致——标签漂移会把
                # 详情页深链指到错误条文（存在性门查不出「条号挂错法」的精度缺陷）。
                # 形态容差：《名称》(年份…)?第N条(之X)?；非《》开头的形态跳过不判。
                lm = re.match(r"《[^》]+》(?:\([0-9]{4}[^)]*\))?第(\d+)条(之[一二三四五六七八九十]+)?",
                              r.get("label") or "")
                if lm and (int(lm.group(1)) != int(r["no"]) or (lm.group(2) or "") != sub):
                    problems.append(
                        f"案例 {cid}: research_refs 标签条号 {lm.group(1)}{lm.group(2) or ''} "
                        f"与存储 {r['no']}{sub} 不一致：{(r.get('label') or '')[:40]}")
            if c["id"].startswith("guidance-"):
                cases_report["guiding"] += 1
                n = re.search(r"(\d+)", c["no"]).group(1)
                snap = EVIDENCE_DIR / f"court_指导案例{n}号.html"
                if not snap.is_file():
                    problems.append(f"案例 {cid}: 官方快照缺失 {snap.name}")
                    continue
                text = ws.sub("", re.sub(r"<[^>]+>", " ", snap.read_text(encoding="utf-8", errors="replace")))
                if ws.sub("", c["holding"]) not in text:
                    problems.append(f"案例 {cid}: 裁判要点与官方快照逐字不一致")
                result = c.get("result") or ""
                # 执行实施类指导案例官方页无单列「裁判结果」段——诚实占位豁免（与
                # test_cases_validation 的 exec_note 口径一致），其余一律逐字比对。
                exec_note = "未单列「裁判结果」段" in result and "详见官方发布页" in result
                if not exec_note and ws.sub("", result) not in text:
                    problems.append(f"案例 {cid}: 裁判结果与官方快照逐字不一致")
                cases_report["snapshots_verified"] += 1
    report["cases"] = cases_report

    # 术语卡校验（R248）：每张卡的 art 引用必须指向语料中真实存在的条文
    # （R238 首跑抓出帮信罪卡误指 287之一——语义正确性需人工，存在性由本门机器核验）。
    terms_path = ROOT.parent / "web" / "src" / "data" / "terms.json"
    terms_report = {"cards": 0, "refs_checked": 0}
    if terms_path.is_file():
        terms = json.loads(terms_path.read_text(encoding="utf-8"))
        terms_report["cards"] = len(terms)
        for card in terms:
            for r in card.get("refs", []):
                terms_report["refs_checked"] += 1
                m2 = re.fullmatch(r"(\d+)(之.+)?", str(r.get("art", "")))
                lid = r.get("law_id")
                if not lid or not m2:
                    problems.append(f"术语卡 {card.get('term')}: 引用格式异常 {r.get('art')!r}")
                    continue
                no, sub = int(m2.group(1)), m2.group(2) or ""
                found = any(a["law_id"] == lid and a["no"] == no and (a.get("sub") or "") == (sub or "")
                            for a in corpus.articles)
                if not found:
                    problems.append(f"术语卡 {card.get('term')}: 引用指向语料外条文 {lid}@{r['art']}")
                # R274：同案例域——label 开头引用必须与存储 art 一致（含子条号）。
                lm2 = re.match(r"《[^》]+》(?:\([0-9]{4}[^)]*\))?第(\d+)条(之[一二三四五六七八九十]+)?",
                               r.get("label") or "")
                if lm2 and lm2.group(1) + (lm2.group(2) or "") != str(r.get("art", "")):
                    problems.append(
                        f"术语卡 {card.get('term')}: 标签条号 {lm2.group(1)}{lm2.group(2) or ''} "
                        f"与存储 art {r.get('art')!r} 不一致")
    report["terms"] = terms_report

    # 第三链锁定门（R284）：lawtext 快照（flk DOCX 衍生社区转录，与语料构建源上游独立）
    # 的「全一致」法律逐部锁定——每次自检复验语料 ↔ 快照逐字一致 + 快照 SHA-256 未变。
    # 语料文本漂移或快照被改都在此显式报问题（清单由 scripts/lawtext_lock.py 生成）。
    lock_path = ROOT.parent / "docs" / "qa-evidence" / "lawtext-3rd-lock.json"
    third_chain = {"locked": 0, "reverified": 0}
    if lock_path.is_file():
        import importlib.util
        spec = importlib.util.spec_from_file_location("lawtext_verify", ROOT / "scripts" / "lawtext_verify.py")
        lv = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(lv)
        lock = json.loads(lock_path.read_text(encoding="utf-8"))
        for lid, ent in lock.get("locked", {}).items():
            snap = EVIDENCE_DIR / Path(ent["snapshot"]).name
            if not snap.is_file():
                problems.append(f"第三链锁定 {lid}: 快照缺失 {ent['snapshot']}")
                continue
            sha = hashlib.sha256(snap.read_bytes()).hexdigest()
            if sha != ent["sha256"]:
                problems.append(f"第三链锁定 {lid}: 快照被改动（SHA-256 与锁定清单不符）")
                continue
            res = lv.verify(lid, snap)
            third_chain["reverified"] += 1
            if res.get("label_mismatch_count") or res.get("body_mismatch_count") \
                    or "条数不一致" in res.get("conclusion", ""):
                problems.append(f"第三链锁定 {lid}: 与快照复验不一致（{res.get('conclusion', '')}）——语料文本漂移")
            else:
                third_chain["locked"] += 1
    report["third_chain"] = third_chain

    out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    total = sum(r["actual_count"] for r in report["laws"].values())
    print(f"语料自检：{len(report['laws'])} 部 {total} 条，结构/哈希问题 {len(problems)} 项，待核 {len(pending)} 项，版本注册表 {len(version_registries)} 份，历史全文 {fulltext_count} 份，flk native id {native_count} 部；案例库 {cases_report['cases']} 件（指导 {cases_report['guiding']}，快照逐字复验 {cases_report['snapshots_verified']}，法条引用 {cases_report['refs_checked']} 条全部在语料）；术语卡 {terms_report['cards']} 张（引用 {terms_report['refs_checked']} 条全部在语料）；第三链锁定 {third_chain['locked']} 部逐字复验（快照 {third_chain['reverified']} 份）")
    for p in problems:
        print("  -", p)
    for p in pending:
        print("  - 待核：", p)
    print("报告：", out)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
