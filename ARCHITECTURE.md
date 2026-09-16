# LegalHigh 架构地图（FLERF 对齐）

本文件是给 AI 会话与贡献者的**架构入口**（「给 Agent 一张地图，而不是一千页说明书」）。历史迭代记录在 `AGENTS.md`（登记不回改），架构知识以本文件与 `docs/architecture/` 为准。

## 一句话架构

**薄索引 + 版本化法条语料 + 确定性 BM25 + 服务端引用 + 证据快照 + 受控 AI gate**——AI 不创造法律事实，法律事实来自可验证的真实法源（快照/哈希/日期自证）。

## 分层（依赖只能向下）

```
前端 web/（React，只消费 /api，无第二检索路径）
  ↓
FastAPI app/
  ├─ qa / research / needs / cases / drafting / review   ← 只读语料，零联网
  ├─ ai_governor                                          ← 唯一联网模块（受控 openai SDK，四道 gate）
  ├─ corpus / law_versions                                ← 语料单例 + 版本注册表（fail-closed）
  └─ storage / audit                                      ← 审计留痕（Evidence Ledger 原型）
  ↓
数据 data/
  ├─ laws/（43 部 5,573 条，source+sha256+生效日证据）
  ├─ law_versions/（43 份注册表，多版本时间线）
  ├─ cases.json（35 件，官方逐字要点/结果）
  ├─ source_registry.json（14 来源，权威等级+合规批准）   ← R138
  └─ non_negotiable_invariants.yaml（15 条不可协商不变式） ← R138
  ↓
证据层（离线，docs/research/evidence/，git 追踪）
  快照 → build_corpus.py 解析 → corpus_selfcheck 校验 → 导出 laws.json
```

## 不可协商不变式

见 `server/data/non_negotiable_invariants.yaml`（LEGAL-001…010 / ARCH-001…005）。每条映射到机械检查（`server/tests/test_architecture_invariants.py` + 既有测试 + CI 门）。**修改这些规则需要 ADR + 业主批准，CI 不得为变绿而放松。**

## 架构文档索引

- `docs/architecture/source-registry.md` — 来源治理与权威等级
- `docs/architecture/temporal-model.md` — 版本注册表与时间效力（含已知白区）
- `docs/architecture/evidence-and-freshness.md` — 证据快照、哈希与新鲜度
- `docs/architecture/retrieval-fabric.md` — 检索引擎（BM25 单引擎 ADR）
- `docs/architecture/grounded-generation.md` — AI 边界与四道 gate
- `docs/architecture/known-gaps.md` — 已登记白区（不静默）

## 决策记录（ADR）

- `docs/adr/0001-deterministic-bm25-single-engine.md`
- `docs/adr/0002-llm-cannot-create-citations.md`
- `docs/adr/0003-fail-closed-verification.md`
- `docs/adr/0004-guiding-cases-not-full-corpus.md`

## 对 FLERF 报告的完整审计

`docs/research/FLERF对齐审计-2026-09-16.md`（49 节逐主题核对，含 ✅/🟡/⚪/⚖️ 判定与证据）。
