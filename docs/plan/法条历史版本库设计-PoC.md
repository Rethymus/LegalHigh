# 法条历史版本库设计（S2-T4 PoC · 2026-09-13）

> v5 路线图 S2-T4：「法条历史版本库 PoC——legislation.gov.uk 版本模型（既有参考）+ 修正案跟踪；先做 1 部修法最频繁的法律验证 schema」。本轮以《民事诉讼法》为样本落地注册表层。

## 一、为什么需要（问题实证）

pcl-2023 末条事件（`flk-pcl-2023-末条复核-2026-09-13.md`）实证了单版本语料的结构性风险：上游转录页把 **1991 年原法附则**混入 **2023 修正文本**（第 306 条），单版本快照无法表达「这是哪个版本的话」。引用不变量要求法条引用附「版本/生效/效力字段」——版本注册表是这一不变量在「版本维」的数据基础。

## 二、参考模型（legislation.gov.uk，核验于 2026-08-29 开源与论文调研）

legislation.gov.uk 以「enactment」为版本单位：每个 enacted/ revised 版本独立成文档、带 URI 与时间线；「current」是时间线上的指向。本地化最小集：

| 概念 | 本项目对应 |
|---|---|
| enactment | `version`（version_id + 公布/施行 + 证据对象） |
| current point | `current: true`（必须恰好一个，且与语料元数据对齐） |
| pending/earlier versions | `pending_note`（诚实占位，不预填日期） |

## 三、PoC 落地内容（全部已实现并有测试）

1. **注册表**：`server/data/law_versions/pcl-2023.json`——只登记有仓库内证据的版本（2023 修正，字段全部派生自语料元数据：公布 2023-09-01 / 施行 2024-01-01 / 主席令第十一号 / 证据快照 ws_民事诉讼法2023.json / 等级【中】/ 条数 306 带残留疑点注记）。历史版本**零预填**。
2. **模块与 API**：`app/law_versions.py`（schema 校验 fail-closed：schema_version 白名单、law_id 一致、恰好一个 current、证据五字段必填、**current 字段与语料元数据逐一比对——注册表不得比语料更先进**）+ `GET /api/laws/{law_id}/versions`（未建表 404、schema 问题 500）。
3. **自检集成**：`corpus_selfcheck.py` 新增版本注册表校验（有表必过检，无表不算问题——渐进覆盖），报告含注册表计数（当前 14 部 2,380 条 0 问题 + 1 份注册表）。
4. **测试**：`tests/test_law_versions.py` 6 项——契约、未知 404、证据缺字段 fail-closed、双 current fail-closed、**注册表超前于语料 fail-closed**（把施行日改成 2099 必须被拒）、schema 版本不受支持 fail-closed。

## 四、后续（条件触发，不在 PoC 范围）

- 历史版本全文入库：按 build_corpus 证据快照管线采集（修正决定 + 旧版全文），同一 schema 追加 versions 条目；**金标先行**制度照旧。
- 版本级引用：citation_of 支持按 version_id 取文（当前引用不变量已含现行有效校验；历史版本文面比对属 M6-T1 flk 人工定案后的增量）。
- 前端展示：法条详情「版本」信息随注册表扩展逐步可见（当前仅 API）。
- 预算联动：历史版本语料增长走 qa_gates gate6 预算修订流程。

## 五、本 PoC 明确不做

- 不从记忆预填任何历史版本日期/条数（1991/2007/2012/2017/2021 各次修正的具体事实待证据快照）。
- 不做版本间 diff 生成（difflib 双文本对比已有 /api/compare 承担，版本库只负责「哪版是什么」）。
