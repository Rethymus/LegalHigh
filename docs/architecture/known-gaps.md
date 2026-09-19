# 已登记白区（不静默）

按 FLERF 审计（2026-09-16）登记。白区=已知未实现、有明确实现路径、系统在未实现前 fail-closed（拒答/标注）而非错答：

1. **AS_OF_DATE 时间检索**——✅ fail-closed 形态已实现（R144，`app/temporal.py`）：时间指涉检测（明确年份/指代词）+ 逐命中 `in_force_at_as_of` 标记 + 显式告知块（现行版本≠时点适用文本，不断言当时合法性）；`/api/qa/ask` 与 `/api/search` 均支持显式 `as_of`。**剩余白区**：历史版本全文独立成条后的真正时点文本检索（历史文本现仅注册表登记）。
2. **claim 级 NLI 校验**——gate3 词面级已有；全句级 entailment 未实现（ai_governor 头注标注）。
3. **统一 A0–D 权威枚举**——分层事实存在（grade/source_kind/level/authority_class），统一命名待法律专家审查（报告 §18 自述「不应由工程师规定法律效力」）。
4. **运行时 On-demand Fetcher**——原型全快照制、无运行时外呼；Source Registry 已为未来 Fetcher 备好合规门（approved 才可运行）。
5. **自动 Source Drift canary**——✅ 自动化落地（R164，`server/scripts/source_canary.py`）：注册表 canary 配置驱动（现 4 处：npc_flk/gov_cn/court_gov/wikisource）、只读诊断（状态 200+期望标记+体积档位突变检测）、状态账本 `source_canary_state.json` 作漂移基线；异常报 SOURCE_DEGRADED（停止刷新、保留已验证快照）。首跑即经历「误报→回源复核→修正标记」全流程。**剩余白区**：定时调度（挂部署决策，现为显式手动运行）；canary 仅覆盖首页级指纹，逐法条页指纹待扩。
6. **Citator 产品层**（被引用于/负面历史检查/后续案例）——🟡 种子已落地（R165，FLERF §26）：`app/citator.py` + `GET /api/laws/{law_id}/cited-by`——已核实案例 research_refs 对本法/本条的**精确引用反查**（子条号参与匹配，253之一≠253），权威分级统计（指导性案例/域外判例）；LawDetail「关联案例」Tab 从 ±40 邻近启发式升级为精确匹配、「引用关系」Tab 从 Neo4j 占位升级为 Citator 概览（被引统计+高引条文 chips+负面历史诚实声明）。**剩余白区**：负面历史检查（后续案例/修法如何对待本条）无数据源，显式声明不提供；全国裁判文书层面引用全景不可得（不爬取）；案例-法条引用语料规模化后建图谱。
7. **案例按字段加权检索**——✅ 全链闭环（R146 API + R150 前端）：`app/cases.py` 字段权重三档（balanced/facts/reasoning），facts 偏向零化 holding/result（纯 Facts↔Facts）、reasoning 偏向 Holding×4+Result×3（「为什么这么判」）；`/api/cases` 增 bias 参数；8 项钉住测试（偏向改变排名/召回扩到 facts 字段/案号精确保底/确定性）；前端 CaseSearch 分段控件（综合/类似案情/裁判理由）+ 一句话口径说明，选档即触发重查（api.listCases 携带 bias）。
8. **Evidence Ledger 完整形态**——🟡 覆盖面扩大（R164 qa → R165 qa+研究备忘录）：回答/备忘录产生时刻的证据快照（逐条条文精确文本 sha256+版本/生效+官方 URL+时间上下文标记）随 append-only 审计账本持久化，只留问题哈希不留原文，拒答同样留痕。**剩余白区**：报告 §19 完整 VerifiedEvidence 强类型（canonicalUnitId/文档级 hash）与独立账本表；审查/起草链路快照未接入。
9. **needs 取证词面误配 badcase**——✅ 按「金标先行→A/B→ADR」收口（R166，ADR-0005）：5 组劳动法域金标（541 组）量化基线（新组 1/5，raw 层 hit@5 0.9612）→ 新增 `labor-termination` 受控主题组（组查询=目标条文规范词面）+ 组级 `when` 条件试用期组（命中即优先供位）→ A/B 定案：编排层（qa/needs/search 产品路径）新组 **1/5→5/5**、全量 hit@5 0.9593→0.9612、MRR 0.7787→0.7791，零回退超限；**raw 层词面地板如实保留**（4 组问法 raw 仍 MISS——门=引擎地板、编排=产品层，两层口径分离，不粉饰）；6 项钉住测试（test_labor_termination_retrieval.py，ADR 名次锚）防漂移。

白区不阻塞发布：每一项都有「未实现即不冒充」的 fail-closed 形态兜底。
