# 受限生成（AI 边界与四道 gate）

**默认无 AI**：qa/研究/需求解析全部确定性（BM25+规则），答案=语料命中卡片。AI 是插件（`ai_providers.json` 目录），默认关闭、无密钥 409。

**网络隔离（ARCH-001，CI 钉住）**：app/ 内仅 ai_governor 允许导入 openai；任何模块禁 requests/httpx/aiohttp。生成路径没有第二条联网通道。

**四道 gate（`app/ai_governor.py`，全程启用）**：
1. gate1 红线词（胜诉率/包赢等确定性承诺）→ 拦截并扣留文本（E2E 实证 output_withheld）；
2. gate2 引用绑定：草稿引用经 `_resolve_allowed_ref` 服务端解析为 `corpus.citation_of()` 规范对象，客户端自报版本/生效/来源字段强制与语料一致——**LLM 无生成引用的入口（LEGAL-001）**；
3. gate3 逐句引用与词面支持（防真实条号+无关断言）；
4. gate4 免责声明强制附加 + 审计留痕。

**运行时 Harness（与开发 Harness 分离）**：每日配额（默认 200/主体）、出域 PII 扫描（只报数量类型不回显）、注入服从评测四探针。

**三种回答模式**：Evidence（命中卡片）/Insufficient（no_answer 显式拒答）/Retrieval Result（研究备忘录「找到相关资料+诚实缺口」）。禁止第四种「没检索到但我大概知道」。

**已知白区**：gate3 为词面级，claim 级 NLI 校验未实现（代码头注诚实标注）。
