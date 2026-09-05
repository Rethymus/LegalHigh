# 权利与第三方说明 / Rights and Third-Party Notices

## 本仓库代码

截至 2026-09-02，仓库根目录没有 `LICENSE`。因此，代码公开可见不等于获得复制、修改、分发、再许可或商业使用权；默认权利仍由相应权利人保留。`desktop/package.json` 使用 `UNLICENSED` 明示这一状态。项目所有者在选择许可证前应完成贡献归属和第三方材料审计。

## 软件依赖

Python、npm 和 Electron 依赖由各自许可证管理。精确版本可从以下机器可读文件取得：

- `server/requirements*.lock`
- `web/package-lock.json`
- `desktop/package-lock.json`

发布者应在分发前根据最终产物生成完整的软件物料清单和许可证文本，并复核强制署名、NOTICE、源代码提供及再分发义务。本文件不替代各依赖的许可证。

## 法律文本与裁判材料

法律、司法解释、裁判文本及机关发布材料来自各条记录所列来源。仓库中的获取、结构化和引用不改变原材料的权利状态，也不保证某一来源授权任何特定的再利用方式。正式发布前应按法域、来源和用途逐项复核。

`docs/research/evidence/` 保存研究证据；`server/data/laws/` 是构建产物。案例摘要是项目转述，原始裁判内容以 `source_url` 为准。

## 已移除的数据

早期工作树曾包含 LawRefBook 派生数据。核查时没有发现可覆盖该批数据的明确上游许可证，且运行时没有使用，因此本轮从产品仓库移除。此决定不评价原项目质量，只遵守“无明确授权不复制”的保守边界。

## 参考而未复用

[LegalBench-RAG](https://github.com/zeroentropy-cc/legalbenchrag)、[LegalBench](https://hazyresearch.stanford.edu/legalbench/tasks/)、[LawBench](https://github.com/open-compass/LawBench) 和 [DISC-LawLLM](https://github.com/FudanDISC/DISC-LawLLM) 仅用于评测方法或 README 结构调研。本仓库未导入其数据、模型或代码。LegalBench 各任务许可证不同，不能整体推定为统一许可。

## English summary

No open-source licence is currently granted for this repository. Dependencies and source materials remain governed by their own terms. A release owner must generate a complete software bill of materials and licence bundle for the actual distributable, and separately verify the reuse terms of each legal-text and case source.
