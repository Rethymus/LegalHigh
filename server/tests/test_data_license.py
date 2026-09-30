# -*- coding: utf-8 -*-
"""数据许可（决策 19 = CC0，业主 2026-09-30 裁定）钉子：许可文本在位且为官方件、
打包器携带许可声明与 LICENSE 入包、laws-md 页脚带许可行——许可接线不被悄悄回退。"""
import io
import sys
import zipfile
from pathlib import Path

SERVER = Path(__file__).resolve().parent.parent
ROOT = SERVER.parent
LICENSE = ROOT / "LICENSES" / "DATA-CC0-1.0.txt"


def test_data_license_file_is_canonical_cc0():
    assert LICENSE.exists(), "LICENSES/DATA-CC0-1.0.txt 缺失（决策 19 已裁定 CC0）"
    text = LICENSE.read_text(encoding="utf-8")
    assert text.startswith("Creative Commons Legal Code"), "非官方 CC0 纯文本头部"
    assert "CC0 1.0 Universal" in text
    # 权利放弃与公共许可回退两节是 CC0 法律文本的结构性标志
    assert "waives" in text and "Public License Fallback" in text


def test_dataset_manifest_note_carries_license():
    sys.path.insert(0, str(SERVER / "scripts"))
    import package_dataset as pd
    assert "CC0 1.0 Universal" in pd.MANIFEST_NOTE
    assert "著作权法》第五条" in pd.MANIFEST_NOTE, "公有领域事实声明须与 CC0 并列出现"
    assert pd.DATA_LICENSE.exists() and pd.DATA_LICENSE.name == "DATA-CC0-1.0.txt"


def test_laws_md_readme_carries_license_line():
    readme = (ROOT / "web" / "public" / "data" / "laws-md" / "README.md").read_text(encoding="utf-8")
    assert "CC0 1.0 Universal" in readme and "决策 19" in readme


def test_zip_layout_when_built(tmp_path):
    """构建路径抽查（产物不入 git）：给 --out 临时目录打一个小包验证 LICENSE 确实入包。"""
    import subprocess
    out = tmp_path / "pkg"
    r = subprocess.run(
        [sys.executable, str(SERVER / "scripts" / "package_dataset.py"), "--out", str(out)],
        capture_output=True, text=True, timeout=300, cwd=str(ROOT))
    assert r.returncode == 0, r.stderr[-300:]
    zips = sorted(out.glob("*.zip"))
    assert zips, "未产出 ZIP"
    with zipfile.ZipFile(zips[-1]) as z:
        names = z.namelist()
        assert "LICENSE" in names, "CC0 LICENSE 未入包"
        assert "MANIFEST.txt" in names and "CC0 1.0 Universal" in z.read("MANIFEST.txt").decode("utf-8")
