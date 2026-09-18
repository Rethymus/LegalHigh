# 已登记白区（不静默）

按 FLERF 审计（2026-09-16）登记。白区=已知未实现、有明确实现路径、系统在未实现前 fail-closed（拒答/标注）而非错答：

1. **AS_OF_DATE 时间检索**——✅ fail-closed 形态已实现（R144，`app/temporal.py`）：时间指涉检测（明确年份/指代词）+ 逐命中 `in_force_at_as_of` 标记 + 显式告知块（现行版本≠时点适用文本，不断言当时合法性）；`/api/qa/ask` 与 `/api/search` 均支持显式 `as_of`。**剩余白区**：历史版本全文独立成条后的真正时点文本检索（历史文本现仅注册表登记）。
2. **claim 级 NLI 校验**——gate3 词面级已有；全句级 entailment 未实现（ai_governor 头注标注）。
3. **统一 A0–D 权威枚举**——分层事实存在（grade/source_kind/level/authority_class），统一命名待法律专家审查（报告 §18 自述「不应由工程师规定法律效力」）。
4. **运行时 On-demand Fetcher**——原型全快照制、无运行时外呼；Source Registry 已为未来 Fetcher 备好合规门（approved 才可运行）。
5. **自动 Source Drift canary**——现行为人工 SOP（季度/半年/事件驱动）+selfcheck；自动化待建设。
6. **Citator 产品层**（被引用于/负面历史检查/后续案例）——LawDetail 版本 Tab+相关条文+术语卡反查为雏形；需案例引用语料规模化后建设。
7. **案例按字段加权检索**——✅ 全链闭环（R146 API + R150 前端）：`app/cases.py` 字段权重三档（balanced/facts/reasoning），facts 偏向零化 holding/result（纯 Facts↔Facts）、reasoning 偏向 Holding×4+Result×3（「为什么这么判」）；`/api/cases` 增 bias 参数；8 项钉住测试（偏向改变排名/召回扩到 facts 字段/案号精确保底/确定性）；前端 CaseSearch 分段控件（综合/类似案情/裁判理由）+ 一句话口径说明，选档即触发重查（api.listCases 携带 bias）。

白区不阻塞发布：每一项都有「未实现即不冒充」的 fail-closed 形态兜底。
