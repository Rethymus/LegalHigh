# ADR-0002：LLM 不得生成引用（LEGAL-001）

日期：2026-09-16（实践自 2026-08-29 M5 接线确立，本 ADR 形式化）

## 决策

引用只能来自服务端语料对象：
- qa 答案=语料命中卡片（answer_cards 全字段来自 corpus 对象，无 LLM 参与）；
- AI 草稿中的引用经 `_resolve_allowed_ref` 解析为 `corpus.citation_of()` 规范对象——客户端/模型自报的 law_title/law_status/effective_date/source 与语料不一致即拒；
- 越界引用（依据集合外）被 gate2 标记拦截而非静默放行。

## 理由

消灭「论文式假参考文献」类错误的整类来源（FLERF 报告 §21）：模型只输出 `{{citation:evidence}}` 占位，渲染层从服务端对象生成——Invented Citation Rate 结构性为 0。

## 机械检查

`test_architecture_invariants.py::test_citation_rendering_is_server_side`；ai_governor gate2/3 测试；引用四要素完整率恒 1.0 评测。
