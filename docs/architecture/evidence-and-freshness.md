# 证据与新鲜度

**快照制**：每部法律/每件案例的证据快照永久入仓（`docs/research/evidence/`，git 追踪），语料条目携带 source.url/kind/snapshot/fetched_at/sha256；`corpus_selfcheck` 校验哈希与结构。

**新鲜度口径（freshness-aware，非 live-only）**：全快照制——无运行时外呼，上游改版不影响已验证结论；页面标注「核验于 YYYY-MM-DD，证据等级【强/中】」。语料时效 SOP（`docs/compliance/语料时效维护SOP.md`）：季度比对/半年逐部/事件驱动插队（食品安全法 2025 时效缺口即第三链校验事件驱动发现）。

**Evidence Ledger**：审计表（audit_log）留痕状态变更（create/adopt/approve…）；PIPL 删除通道实证过「业务数据删而审计留痕保留」。**§19 强类型独立账本（R174 收口）**：独立 `evidence_ledger` 表（append-only，无更新/删除通道）承载五条链路（qa/研究备忘录/合同审查/要件分析/文书起草）的 VerifiedEvidence 快照——`app/evidence.py` 把 citation_of 条目升格为报告 §19 完整类型：canonical_document_id（law@生效日）/canonical_unit_id（子条号参与）/content_hash（条文精确文本 sha256）/document_hash（证据快照文档级 SHA-256，selfcheck 复算）/source_id（host→注册表来源，未注册 host fail-closed 拒绝）/verification 四项核验状态；账本只留问题哈希、绝不留用户输入原文，拒答同样留痕；`GET /api/evidence`（管理门）只读查询，PIPL 导出包含账本。剩余：无（source_native_id 诚实留空——官方 native id 未入语料对象）。

**数据生命周期**：现行语料（hot）= 检索可用；历史版本全文（cold）= 注册表+证据存证、不进检索；金标鸿沟实录 = 数据资产。
