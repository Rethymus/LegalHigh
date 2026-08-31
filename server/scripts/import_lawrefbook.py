# -*- coding: utf-8 -*-
"""LawRefBook/Laws Markdown → LegalHigh 语料 JSON 批量转换器（决策项15·数据扩容）。

来源：https://github.com/LawRefBook/Laws (开源社区维护的中国法律法规库)
合法性：法律条文本身不受著作权法保护（著作权法§5），Markdown 格式化以 MIT 许可发布。

用法：
  server/.venv/Scripts/python.exe scripts/import_lawrefbook.py <lawrefbook_dir> [--dry-run]

输出：server/data/lawrefbook_laws/ 目录下每部法律一个 JSON 文件（与 data/laws/ 同格式）。
导入后由 build_corpus 或 corpus_selfcheck 统一验证。
"""
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "data" / "lawrefbook_laws"

# LawRefBook 目录 → 语料分类映射
CATEGORY_KIND = {
    "民法商法": "法律",
    "民法典": "法律",
    "行政法": "法律",
    "经济法": "法律",
    "社会法": "法律",
    "刑法": "法律",
    "宪法相关法": "宪法相关法",
    "诉讼与非诉讼程序法": "法律",
    "司法解释": "司法解释",
    "行政法规": "行政法规",
    "宪法": "宪法",
    "法律解释": "法律解释",
    "部门规章": "部门规章",
}

CN_NUM_MAP = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8,
              "九": 9, "十": 10, "十一": 11, "十二": 12, "十三": 13, "十四": 14, "十五": 15,
              "十六": 16, "十七": 17, "十八": 18, "十九": 19, "二十": 20, "二十一": 21,
              "二十二": 22, "二十三": 23, "二十四": 24, "二十五": 25, "二十六": 26,
              "二十七": 27, "二十八": 28, "二十九": 29, "三十": 30, "三十一": 31,
              "三十二": 32, "三十三": 33, "三十四": 34, "三十五": 35, "三十六": 36,
              "三十七": 37, "三十八": 38, "三十九": 39, "四十": 40, "四十一": 41,
              "四十二": 42, "四十三": 43, "四十四": 44, "四十五": 45, "四十六": 46,
              "四十七": 47, "四十八": 48, "四十九": 49, "五十": 50, "五十一": 51,
              "五十二": 52, "五十三": 53, "五十四": 54, "五十五": 55, "五十六": 56,
              "五十七": 57, "五十八": 58, "五十九": 59, "六十": 60, "六十一": 61,
              "六十二": 62, "六十三": 63, "六十四": 64, "六十五": 65, "六十六": 66,
              "六十七": 67, "六十八": 68, "六十九": 69, "七十": 70, "七十一": 71,
              "七十二": 72, "七十三": 73, "七十四": 74, "七十五": 75, "七十六": 76,
              "七十七": 77, "七十八": 78, "七十九": 79, "八十": 80, "八十一": 81,
              "八十二": 82, "八十三": 83, "八十四": 84, "八十五": 85, "八十六": 86,
              "八十七": 87, "八十八": 88, "八十九": 89, "九十": 90, "九十一": 91,
              "九十二": 92, "九十三": 93, "九十四": 94, "九十五": 95, "九十六": 96,
              "九十七": 97, "九十八": 98, "九十九": 99, "一百": 100}


def cn_to_int(cn: str) -> int | None:
    """中文数字→整数（复用 server/lib/textparse.py 的 cn_to_int）。"""
    try:
        sys_path = str(ROOT / "server")
        if sys_path not in sys.path:
            sys.path.insert(0, sys_path)
        from lib.textparse import cn_to_int
        return cn_to_int(cn)
    except Exception:
        return None


def parse_markdown_law(filepath: Path, category: str) -> dict | None:
    """解析 LawRefBook Markdown 法律文件 → 语料格式。"""
    text = filepath.read_text(encoding="utf-8")

    # 提取标题（第一个 # 标题行）
    title_match = re.match(r"#\s+(.+)", text)
    if not title_match:
        return None
    title = title_match.group(1).strip()

    # 提取元信息（标题后的日期/机构行）
    promulgation_date = ""
    promulgation_organ = ""
    effective_date = ""
    status = "现行有效"
    # 日期行如 "1999年8月30日 第九届全国人民代表大会常务委员会第十一次会议通过"
    date_match = re.search(r"(\d{4}年\d{1,2}月\d{1,2}日)\s+(.+?)(?:通过|发布)", text[:2000])
    if date_match:
        promulgation_date = date_match.group(1)
        promulgation_organ = date_match.group(2).strip()

    # 提取条文
    articles = []
    current_chapter = ""
    # 按段落分割，找 第X条 开头的段落
    lines = text.split("\n")
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        # 章节标题
        if line.startswith("## ") and not line.startswith("### "):
            current_chapter = line[3:].strip()
            i += 1
            continue
        # 条文开头
        art_match = re.match(r"^第([一二三四五六七八九十百千零]+)条", line)
        if art_match:
            cn_num = art_match.group(1)
            no = cn_to_int(cn_num) if cn_num else None
            if no is None:
                # 尝试从 CN_NUM_MAP
                no = CN_NUM_MAP.get(cn_num)
            if no is None:
                i += 1
                continue
            label = f"第{cn_num}条"
            # 收集条文文本直到遇到下一个条文或章节标题
            content_lines = [line]
            j = i + 1
            while j < len(lines):
                next_line = lines[j].strip()
                if (re.match(r"^第[一二三四五六七八九十百千零]+条", next_line)
                        or next_line.startswith("## ")
                        or next_line.startswith("# ")):
                    break
                content_lines.append(next_line)
                j += 1
            art_text = "\n".join(content_lines).strip()
            # 去除 Markdown 格式
            art_text = re.sub(r"\*\*(.+?)\*\*", r"\1", art_text)  # bold
            art_text = re.sub(r"\{\{[^}]+\}\}", "", art_text)  # templates
            art_text = art_text.replace("\u3000", "\u3000")  # keep ideographic space
            articles.append({"no": no, "label": label, "text": art_text, "chapter": current_chapter})
            i = j
            continue
        i += 1

    if len(articles) < 3:
        return None  # 太少条文，可能是索引或非法律文件

    # 生成 law_id
    safe_title = re.sub(r"[^\w\u4e00-\u9fff]", "", title)[:20]
    # 从标题提取年份
    year_match = re.search(r"[(（](\d{4})", filepath.stem)
    year = year_match.group(1) if year_match else ""
    kind = CATEGORY_KIND.get(category, "其他")

    law_id = f"lrb-{safe_title}" + (f"-{year}" if year else "")

    # 去重条号
    seen = set()
    unique_arts = []
    for a in articles:
        if a["no"] not in seen:
            seen.add(a["no"])
            unique_arts.append(a)

    return {
        "law_id": law_id,
        "title": title,
        "status": status,
        "kind": kind,
        "category": category,
        "organ": promulgation_organ or "",
        "promulgation_date": promulgation_date,
        "effective_date": effective_date,
        "source": {
            "url": f"https://github.com/LawRefBook/Laws/tree/master/{category}",
            "kind": "开源社区维护（LawRefBook）",
        },
        "authority_pointer": "",
        "articles": unique_arts,
    }


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("lawrefbook_dir", help="LawRefBook/Laws 解压目录路径")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--category", help="只处理指定分类目录")
    args = parser.parse_args()

    base = Path(args.lawrefbook_dir)
    if not base.exists():
        print(f"目录不存在: {base}")
        sys.exit(1)

    categories = [args.category] if args.category else list(CATEGORY_KIND.keys())
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    stats = {"parsed": 0, "skipped": 0, "errors": 0, "total_articles": 0}
    errors = []

    for cat in categories:
        cat_dir = base / cat
        if not cat_dir.is_dir():
            continue
        for md_file in sorted(cat_dir.rglob("*.md")):
            if "_index" in md_file.name or "README" in md_file.name:
                continue
            if "模版" in md_file.name:
                continue
            try:
                law = parse_markdown_law(md_file, cat)
                if law is None or len(law["articles"]) < 3:
                    stats["skipped"] += 1
                    continue
                if not args.dry_run:
                    out_path = OUT_DIR / f"{law['law_id']}.json"
                    json.dump(law, out_path.open("w", encoding="utf-8"), ensure_ascii=False, indent=1)
                stats["parsed"] += 1
                stats["total_articles"] += len(law["articles"])
            except Exception as ex:
                stats["errors"] += 1
                errors.append(f"{md_file.name}: {ex}")

    print(f"解析完成: {stats['parsed']} 部法律, {stats['total_articles']} 条条文")
    print(f"跳过: {stats['skipped']} | 错误: {stats['errors']}")
    for e in errors[:10]:
        print(f"  ERROR: {e}")
    if args.dry_run:
        print("\n(dry-run 模式，未写入文件)")


if __name__ == "__main__":
    main()
