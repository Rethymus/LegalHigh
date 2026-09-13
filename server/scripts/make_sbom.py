# -*- coding: utf-8 -*-
"""SBOM 生成器（S1-T5）：server 锁文件 → CycloneDX 1.5 JSON；web/desktop 用 npm sbom。

生成口径（诚实声明）：
- server 侧直接解析 `requirements.lock` 的 `name==version` 清单——是「声明清单的物料清单」，
  不包含传递依赖展开，也非漏洞报告（漏洞审计由 CI 第六门 pip-audit/npm audit 负责）。
- npm 侧用 npm 内置 `npm sbom --sbom-format cyclonedx`（含完整依赖树）。
用法：python scripts/make_sbom.py [--out .tmp/sbom]
"""
import argparse
import json
import re
import shutil
import subprocess
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOCK_RE = re.compile(r"^([A-Za-z0-9][A-Za-z0-9_.\-]*(?:\[[a-z0-9,\-]+\])?)==([^\s\\]+)")


def pip_components() -> list[dict]:
    comps = []
    for raw in (ROOT / "requirements.lock").read_text(encoding="utf-8").splitlines():
        m = LOCK_RE.match(raw.strip())
        if not m:
            continue
        name, version = m.group(1).split("[", 1)[0], m.group(2)
        comps.append({
            "type": "library",
            "bom-ref": f"pkg:pypi/{name.lower()}@{version}",
            "name": name,
            "version": version,
            "purl": f"pkg:pypi/{name.lower()}@{version}",
            "properties": [{"name": "legalhigh:source", "value": "server/requirements.lock"}],
        })
    return comps


def cyclonedx(comps: list[dict], source: str) -> dict:
    return {
        "$schema": "http://cyclonedx.org/schema/bom-1.5.schema.json",
        "bomFormat": "CycloneDX",
        "specVersion": "1.5",
        "serialNumber": f"urn:uuid:{uuid.uuid4()}",
        "version": 1,
        "metadata": {
            "timestamp": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "tools": {"components": [{"type": "application", "name": "legalhigh-make-sbom", "version": "1.0"}]},
            "properties": [{"name": "legalhigh:generated-from", "value": source}],
        },
        "components": comps,
    }


def npm_sbom(project: Path, out: Path) -> int:
    npm = shutil.which("npm")  # Windows 上是 npm.cmd，裸 "npm" 会 WinError 2
    if not npm:
        print("npm 不在 PATH，无法生成 web/desktop SBOM", file=sys.stderr)
        return -1
    r = subprocess.run(
        [npm, "sbom", "--sbom-format", "cyclonedx"],
        cwd=project, capture_output=True, text=True, encoding="utf-8", shell=False,
    )
    if r.returncode != 0:
        print(f"  npm sbom 失败（{project.name}）：{r.stderr.strip()[:200]}", file=sys.stderr)
        return 1
    data = json.loads(r.stdout)
    out.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return len(data.get("components", []))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(ROOT.parent / ".tmp" / "sbom"))
    args = ap.parse_args()
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    pip = pip_components()
    (out_dir / "sbom-server.cdx.json").write_text(
        json.dumps(cyclonedx(pip, "server/requirements.lock"), ensure_ascii=False, indent=2),
        encoding="utf-8")
    print(f"server: {len(pip)} components -> sbom-server.cdx.json")

    total = 0
    for proj in ("web", "desktop"):
        n = npm_sbom(ROOT.parent / proj, out_dir / f"sbom-{proj}.cdx.json")
        if n < 0:
            return 1
        print(f"{proj}: {n} components -> sbom-{proj}.cdx.json")
        total += n
    print(f"SBOM 完成：{out_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
