# 数据集打包脚本（v7 S1-T2 前置准备）：把开放数据资产打包为可发布的 ZIP。
# ⚠️ 发布本身 gated on 决策 19（许可证）——本脚本只做「输入到位即可零改造出包」的准备，
#    产物输出到本地 dist-dataset/（不入 git），业主定许可证后一条命令即可产出发布附件。
# 用法: python server/scripts/package_dataset.py [--out dist-dataset]
import argparse
import datetime
import hashlib
import json
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC_LAWS = ROOT / "server" / "data" / "laws"
LAWS_MD = ROOT / "web" / "public" / "data" / "laws-md"
LAWS_JSON = ROOT / "web" / "public" / "data" / "laws.json"
VERSIONS = ROOT / "server" / "data" / "law_versions"

MANIFEST_NOTE = """LegalHigh 开放数据集
====================

内容：28 部中国现行法律逐条结构化语料（JSON + markdown 双格式）+ 版本注册表。

数据纪律：
- 法条文本不受著作权保护（《著作权法》第五条）；本数据集的整理成果许可见随附 LICENSE 声明（发布时确定）。
- 每部法律附官方元数据（公布/施行/机关/令号/来源 URL/权威核对指针）。
- 语料经双独立转录链全量交叉核验（lawtext/laws + flk 官方结构树），26/28 部文本级一致；
  核验证据见仓库 docs/qa-evidence/。

引用格式（GB/T 7714 参考）：
LegalHigh 语料. [版本]. [日期]. https://github.com/Rethymus/LegalHigh

免责声明：本数据集为机器转录语料，不构成法律意见；引用请以官方公报为准。
快照日期：{date}
"""


def sha256_file(p: Path) -> str:
    h = hashlib.sha256()
    h.update(p.read_bytes())
    return h.hexdigest()


def main():
    ap = argparse.ArgumentParser(description="打包 LegalHigh 开放数据集（S1-T2 前置准备）")
    ap.add_argument("--out", default="dist-dataset", help="输出目录（相对仓库根，默认 dist-dataset）")
    args = ap.parse_args()

    out_dir = ROOT / args.out
    out_dir.mkdir(parents=True, exist_ok=True)
    date = datetime.date.today().isoformat()
    zip_name = f"legalhigh-corpus-{date}.zip"
    zip_path = out_dir / zip_name

    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        # ① 结构化 JSON（manifest + 28 部逐条）
        for p in sorted(SRC_LAWS.glob("*.json")):
            zf.write(p, f"laws/{p.name}")
        # ② markdown 导出（含 README 索引）
        for p in sorted(LAWS_MD.glob("*.md")):
            zf.write(p, f"laws-md/{p.name}")
        # ③ 前端运行时 laws.json
        if LAWS_JSON.exists():
            zf.write(LAWS_JSON, "web-data/laws.json")
        # ④ 版本注册表（28 份）
        for p in sorted(VERSIONS.glob("*.json")):
            zf.write(p, f"law-versions/{p.name}")
        # ⑤ MANIFEST（数据纪律与引用格式）
        zf.writestr("MANIFEST.txt", MANIFEST_NOTE.format(date=date))

    size_kb = zip_path.stat().st_size // 1024
    digest = sha256_file(zip_path)
    sums_path = out_dir / "SHA256SUMS.txt"
    sums_path.write_text(f"{digest}  {zip_name}\n", encoding="utf-8", newline="\n")

    manifest = json.loads((SRC_LAWS / "manifest.json").read_text(encoding="utf-8"))
    articles = sum(len(json.loads((SRC_LAWS / (e["law_id"] + ".json")).read_text(encoding="utf-8"))["articles"])
                   for e in manifest["laws"])
    print(f"打包完成：{zip_path.name}（{size_kb} KB，28 部 {articles} 条）")
    print(f"SHA256：{digest}")
    print(f"校验和：{sums_path}")
    print("⚠️ 发布 gated on 决策 19（许可证）——产物未发布，仅本地就绪。")


if __name__ == "__main__":
    main()
