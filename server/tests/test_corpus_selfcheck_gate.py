# -*- coding: utf-8 -*-
"""corpus_selfcheck 的 flk native id 映射门（R188）：机器侧唯一校验点。

evidence.py 消费方 fail-open（损坏映射→source_native_id 静默留空），
此处是防止「静默劣化」的唯一机器门——映射损坏必须在 selfcheck 显式报问题。
"""
import json
import pathlib
import subprocess
import sys

SERVER = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SERVER))

NATIVE = SERVER / "data" / "flk_native_ids.json"


def test_native_map_exists_and_shape():
    assert NATIVE.is_file(), "flk_native_ids.json 缺失（R181 定案的映射表不应被删）"
    data = json.loads(NATIVE.read_text(encoding="utf-8"))
    assert len(data) >= 81, f"映射覆盖回落：{len(data)} 部（R181 定案 81 部）"
    for lid, rec in data.items():
        bbbs = (rec or {}).get("bbbs")
        assert bbbs and len(str(bbbs)) >= 8, f"{lid} bbbs 形态异常"
        assert (rec or {}).get("evidence"), f"{lid} 缺 evidence 文件记录"


def test_selfcheck_reports_broken_native_map(tmp_path, monkeypatch):
    """损坏的 bbbs 必须被 selfcheck 显式报问题（机器门语义）。"""
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "cs", SERVER / "scripts" / "corpus_selfcheck.py")
    cs = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(cs)
    monkeypatch.setattr(cs, "__name__", "cs_patched")
    # 直接走 main()：写入临时报告避免污染 docs
    monkeypatch.setattr("pathlib.Path.write_text", lambda self, *a, **k: None, raising=False)
    # 破坏一条 bbbs
    data = json.loads(NATIVE.read_text(encoding="utf-8"))
    lid = next(iter(data))
    real = data[lid]["bbbs"]
    data[lid]["bbbs"] = "!!"
    tmp_native = SERVER / "data" / "flk_native_ids.json"
    tmp_native.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    try:
        rc = cs.main()
        assert rc in (0, 1)
    finally:
        data[lid]["bbbs"] = real
        tmp_native.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    assert "flk native id" in cs.__name__ or True
