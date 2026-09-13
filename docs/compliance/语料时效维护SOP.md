# 语料时效维护 SOP（S2-T5 · 2026-09-13）

> 目的：把「语料过期」从被动风险变成日历化流程。依据：风险登记册「语料时效漂移（修法未跟进）=高」。

## 一、复核节奏（日历）

| 周期 | 动作 | 产出 |
|---|---|---|
| 每季度首月 | 打开全国人大「法律草案征求意见/新通过法律」页与国务院公报目录，比对 310 件目录基线与未入库队列 | `docs/qa-evidence/corpus-review-<季度>.md`（新增/修正清单） |
| 每半年 | 对 14 部（及当期全部入库法）逐部核对官方文本有无修正（施行日期 vs 快照日期） | 差异清单 → 走证据快照管线重建 |
| 随时（事件驱动） | 已知修法新闻（如个税法/民诉法修正通过）触发该法优先复核 | 同上，插队处理 |

## 二、新增/修正入库流程（红线不变）

1. 证据快照入 `docs/research/evidence/`（官方来源优先；非官方转录标注证据等级「中」并给来源注记）。
2. `server/build_corpus.py` 登记 → 重建 → `corpus_selfcheck.py` 0 问题。
3. **金标先行**：新法/新条入库前先加对应金标（决策 13 制度）。
4. `web/scripts/export_laws.py` 重导出 → 性能预算门自动核对 laws.json 体积（预算 1.5MB；批量扩张超预算属「有意变更」，修订 `qa_gates.mjs` BUDGET 并在本 SOP 记录，不许静默放宽）。
5. README/备案清单语料数字为历史口径不回改；运行时侧栏实时派生自动生效。

## 三、flk 人工抽查（决策 6A）

- 工作单由 `server/scripts/flk_spotcheck_sample.py` 生成（分层：首末条/金标高频/随机 + 疑点强制区）。
- 人工在浏览器逐条核对（flk 无开放 API，禁止脚本抓取）；完成后改名 `flk-spotcheck-完成-<日期>.md` 归档并登记差异。
- 抽查口径「≥10% 无差异 + 字段级全量一致（corpus_selfcheck）」是对外唯一宣称口径。

## 四、责任与工具

- 生成工作单：`server/.venv/Scripts/python.exe scripts/flk_spotcheck_sample.py`
- 机器自检：`server/.venv/Scripts/python.exe scripts/corpus_selfcheck.py`
- 一致性抽查手册：`docs/research/flk抽查操作手册-2026-08-30.md`
