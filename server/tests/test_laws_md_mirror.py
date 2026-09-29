# -*- coding: utf-8 -*-
"""laws-md 导出镜像一致性钉子（R432）。

背景：export_markdown.py 曾「只写不清」——food-safety-2021 被 2025 版替代后，
旧 .md 在 laws-md 目录残留多轮无人发现（llms.txt 还硬编码「28 部」）。本测试钉住
导出镜像的三个口径：文件集=manifest 法集、README 计数行=派生值、文件头计数=派生值。
"""
import json
import re
from pathlib import Path

SERVER = Path(__file__).resolve().parent.parent
MD_DIR = SERVER.parent / "web" / "public" / "data" / "laws-md"


def _manifest():
    return json.loads((SERVER / "data" / "laws" / "manifest.json").read_text(encoding="utf-8"))["laws"]


def test_laws_md_file_set_matches_manifest():
    if not MD_DIR.exists():
        return  # 未导出的环境（如精简 checkout）不判失败
    expect = {f"{m['law_id']}.md" for m in _manifest()}
    actual = {p.name for p in MD_DIR.glob("*.md")} - {"README.md"}
    assert actual == expect, f"laws-md 镜像漂移：多出 {sorted(actual - expect)[:4]} 缺少 {sorted(expect - actual)[:4]}"


def test_laws_md_readme_count_is_derived():
    if not MD_DIR.exists():
        return
    readme = (MD_DIR / "README.md").read_text(encoding="utf-8")
    m = re.search(r"共 (\d+) 部 (\d+) 条", readme)
    assert m, "README 缺少「共 N 部 M 条」计数行"
    laws = _manifest()
    assert int(m.group(1)) == len(laws), f"README 部数 {m.group(1)} ≠ manifest {len(laws)}"
    total = sum(x.get("article_count", 0) for x in laws)
    assert int(m.group(2)) == total, f"README 条数 {m.group(2)} ≠ manifest {total}"


def test_laws_md_header_count_not_hardcoded_stale():
    if not MD_DIR.exists():
        return
    laws = _manifest()
    sample = (MD_DIR / f"{laws[0]['law_id']}.md").read_text(encoding="utf-8")
    m = re.search(r"（(\d+) 部现行法律", sample)
    assert m, "文件头缺少「N 部现行法律」来源行"
    assert int(m.group(1)) == len(laws), f"文件头部数 {m.group(1)} ≠ manifest {len(laws)}（陈旧硬编码复发）"
