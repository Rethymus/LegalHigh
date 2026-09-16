# 证据与新鲜度

**快照制**：每部法律/每件案例的证据快照永久入仓（`docs/research/evidence/`，git 追踪），语料条目携带 source.url/kind/snapshot/fetched_at/sha256；`corpus_selfcheck` 校验哈希与结构。

**新鲜度口径（freshness-aware，非 live-only）**：全快照制——无运行时外呼，上游改版不影响已验证结论；页面标注「核验于 YYYY-MM-DD，证据等级【强/中】」。语料时效 SOP（`docs/compliance/语料时效维护SOP.md`）：季度比对/半年逐部/事件驱动插队（食品安全法 2025 时效缺口即第三链校验事件驱动发现）。

**Evidence Ledger 原型**：审计表（audit_log）留痕 ai_chat/adopt/approve（who/provider/model/entity/action）；PIPL 删除通道实证过「业务数据删而审计留痕保留」。已知白区：未按独立 EvidenceSnapshot 账本结构建账（报告 §23 完整形态），审计表+永久快照为其原型。

**数据生命周期**：现行语料（hot）= 检索可用；历史版本全文（cold）= 注册表+证据存证、不进检索；金标鸿沟实录 = 数据资产。
