# -*- coding: utf-8 -*-
"""刑法/宪法修正案决定全文全量钉子（R405）。

R393 legacy schema 归一后 17 份修正案快照全部经 amendment_fulltext 管线可读。
本测试全量钉住：每份决定正文干净（零 HTML 残渣）、长度合理、标题含「修正案」。
"""
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

CL_CASES = list(range(1, 13))   # 刑法修正案一~十二（1999-2023）
CON_CASES = list(range(1, 6))    # 宪法修正案 1988/1993/1999/2004/2018


@pytest.mark.parametrize("no", CL_CASES)
def test_cl_amendment_fulltext_clean(no):
    r = client.get(f"/api/laws/cl-2023/amendments/{no}/fulltext")
    assert r.status_code == 200
    body = r.json()
    assert "修正案" in body["title"]
    assert "<ul" not in body["text"] and "<div" not in body["text"]
    assert len(body["text"]) > 200, f"修{no} 正文过短"


@pytest.mark.parametrize("no", CON_CASES)
def test_con_amendment_fulltext_clean(no):
    r = client.get(f"/api/laws/con-2018/amendments/{no}/fulltext")
    assert r.status_code == 200
    body = r.json()
    assert "修正案" in body["title"]
    assert "<ul" not in body["text"]
    assert len(body["text"]) > 200
