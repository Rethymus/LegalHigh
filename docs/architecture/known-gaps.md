# 已登记白区（不静默）

按 FLERF 审计（2026-09-16）登记。白区=已知未实现、有明确实现路径、系统在未实现前 fail-closed（拒答/标注）而非错答：

1. **AS_OF_DATE 时间检索**——✅ fail-closed 形态已实现（R144，`app/temporal.py`）：时间指涉检测 + 逐命中 `in_force_at_as_of` 标记 + 显式告知块；`/api/qa/ask` 与 `/api/search` 均支持显式 `as_of`。**时点文本对照已全量落地（R167 切片 → R168 全量采集 → R169 as_of 命中面收口）**：全部 37 份非现行历史版本全文结构化入 `data/law_versions_fulltext/`（双向过 selfcheck/pytest）；`GET /api/laws/{id}/versions/{vid}/fulltext` + LawDetail 版本 Tab 对照查阅；**as_of 命中时答案卡/检索命中自动携带 `historical_version`**（适用版本=施行日与公布日均 ≤ as_of 中公布日最新者；同条号对照文本+移位风险随行标注；适用即现行时不出字段）。**剩余白区**：跨版本条号重编号映射（重编号条文的精确历史定位）与历史文本独立检索索引。
2. **claim 级 NLI 校验**——🟡 确定性中间步已落地（R168，gate3 升级）：逐句逐分句引用绑定 + 词面重合（≥0.20）+ 确定性裁判承诺识别之外，新增**数值一致性核验**——断言分句中的数值（三十日/6个月/二倍/3年…，CN 与阿拉伯归一化、条文引用第X条不按事实数值抽取）必须能在被引原文中找到同值同单位，否则扣留全文（「编造数字」是词面重合抓不住的高频幻觉，此为高精度确定性代理；既有 42 项 gate 测试零回归）。**剩余白区**：全句级语义 NLI 需引入模型——继续 benchmark-gated（须凭 ADR + 评测数据引入，不静默加依赖）。
3. **统一 A0–D 权威枚举**——分层事实存在（grade/source_kind/level/authority_class），统一命名待法律专家审查（报告 §18 自述「不应由工程师规定法律效力」）。
4. **运行时 On-demand Fetcher**——原型全快照制、无运行时外呼；Source Registry 已为未来 Fetcher 备好合规门（approved 才可运行）。
5. **自动 Source Drift canary**——✅ 自动化落地（R164，`server/scripts/source_canary.py`）+ **CI 接线（R168）**：`.github/workflows/source-canary.yml`（workflow_dispatch 手动触发；stdlib 零依赖；报告无论成败上传 artifact；异常退出码 2 = SOURCE_DEGRADED——停止刷新、保留已验证快照）。注册表 canary 配置现 4 处（npc_flk/gov_cn/court_gov/wikisource）、只读诊断（状态 200+期望标记+体积档位突变检测）、状态账本 `source_canary_state.json` 作漂移基线；首跑即经历「误报→回源复核→修正标记」全流程。**剩余白区**：cron 定时调度挂部署决策（决策清单）；canary 仅覆盖首页级指纹，逐法条页指纹待扩。
6. **Citator 产品层**（被引用于/负面历史检查/后续案例）——🟡 种子已落地（R165，FLERF §26）：`app/citator.py` + `GET /api/laws/{law_id}/cited-by`——已核实案例 research_refs 对本法/本条的**精确引用反查**（子条号参与匹配，253之一≠253），权威分级统计（指导性案例/域外判例）；LawDetail「关联案例」Tab 从 ±40 邻近启发式升级为精确匹配、「引用关系」Tab 从 Neo4j 占位升级为 Citator 概览（被引统计+高引条文 chips+负面历史诚实声明）。**剩余白区**：负面历史检查（后续案例/修法如何对待本条）无数据源，显式声明不提供；全国裁判文书层面引用全景不可得（不爬取）；案例-法条引用语料规模化后建图谱。
7. **案例按字段加权检索**——✅ 全链闭环（R146 API + R150 前端）：`app/cases.py` 字段权重三档（balanced/facts/reasoning），facts 偏向零化 holding/result（纯 Facts↔Facts）、reasoning 偏向 Holding×4+Result×3（「为什么这么判」）；`/api/cases` 增 bias 参数；8 项钉住测试（偏向改变排名/召回扩到 facts 字段/案号精确保底/确定性）；前端 CaseSearch 分段控件（综合/类似案情/裁判理由）+ 一句话口径说明，选档即触发重查（api.listCases 携带 bias）。
8. **Evidence Ledger 完整形态**——🟡 覆盖面扩大（R164 qa → R165 qa+研究备忘录）：回答/备忘录产生时刻的证据快照（逐条条文精确文本 sha256+版本/生效+官方 URL+时间上下文标记）随 append-only 审计账本持久化，只留问题哈希不留原文，拒答同样留痕。**剩余白区**：报告 §19 完整 VerifiedEvidence 强类型（canonicalUnitId/文档级 hash）与独立账本表；审查/起草链路快照未接入。
9. **needs 取证词面误配 badcase**——✅ 按「金标先行→A/B→ADR」收口（R166，ADR-0005）：5 组劳动法域金标（541 组）量化基线（新组 1/5，raw 层 hit@5 0.9612）→ 新增 `labor-termination` 受控主题组（组查询=目标条文规范词面）+ 组级 `when` 条件试用期组（命中即优先供位）→ A/B 定案：编排层（qa/needs/search 产品路径）新组 **1/5→5/5**、全量 hit@5 0.9593→0.9612、MRR 0.7787→0.7791，零回退超限；**raw 层词面地板如实保留**（4 组问法 raw 仍 MISS——门=引擎地板、编排=产品层，两层口径分离，不粉饰）；6 项钉住测试（test_labor_termination_retrieval.py，ADR 名次锚）防漂移。

白区不阻塞发布：每一项都有「未实现即不冒充」的 fail-closed 形态兜底。
