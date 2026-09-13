# 贡献指南 / Contributing

LegalHigh 承载法律信息，正确性和可追溯性优先于功能数量。提交代码即表示你同意遵守以下规则；本文件不是对仓库代码授予许可证。

## 协作现状（2026-09-09 起，仓库公开后适用）

- **Issue 与讨论：欢迎。** 缺陷报告与功能建议走 Issue 模板；法律问题不属于 Issue 范围（见模板指引）。
- **代码贡献：暂不接收合并。** 本仓库未附开源许可证（THIRD_PARTY_NOTICES.md），维护者无法在未定许可前合法合并第三方代码。欢迎以 Issue 描述思路、附最小 diff 草稿供讨论；许可证决策（路线图决策项 19）若未来开放，将另行公告并更新本文件。
- 外部参考引用必须像代码一样守证据纪律：只参考方法与文档结构，逐项核验上游许可。

## 提交前

1. 不要加入虚构客户、案件、合同、审核人、律师身份、数据源接入状态或评测结果。
2. 外部事实必须记录 URL、核验日期和证据等级（强/中/弱）；不能核实的内容明确写“未核实”，且不得进入对外法律结论。
3. 法条只能从 `docs/research/evidence/` 的快照经 `server/build_corpus.py` 构建，禁止直接修改 `server/data/laws/`。
4. 新数据必须先确认许可、授权、个人信息处理和抓取边界。公开可访问不等于允许复制或批量抓取。
5. 高风险流程必须保留服务端授权、人工核验和审计记录；不得以客户端传入的 `actor` 或 `role` 作为权限依据。
6. 前端假交互必须实现或删除；不可点击后仅弹出“成功”。本机存储按不可信、跨版本输入进行 schema 校验。

## 开发流程

- 从直接依赖 `.in` 文件生成带哈希的锁文件，不要手改解析结果。
- Python 安装使用 `--require-hashes`；npm 使用 `npm ci`。
- 后端测试一律设置唯一临时 `LH_DB_PATH`，或使用自行隔离的 `final_verify.py`。不得让自动化测试写入 `server/data/app.db`。
- 改语料、分词或检索规则前先加入对应金标，再改变实现。
- 改前端后运行类型检查/生产构建、数据纪律门、对比度门和受影响路由的真实浏览器巡检。
- 提交中说明数据来源、失败模式、测试命令和未覆盖风险。不要把 CI 配置称作“已通过”，除非有对应运行记录。

## 最低验收

```text
pytest（隔离 DB）
corpus_selfcheck
final_verify（自身临时 DB）
web production build
qa_gates
qa_contrast --strict
依赖审计（官方 npm/PyPI 来源）
```

涉及身份、隐私、DOCX、AI 出站或静态文件边界的变更，还必须增加针对性负面测试。

## 文档与语言

用户可见能力和限制应同步更新 `README.zh-CN.md` 与 `README.en.md`。不要硬编码测试数量、语料规模或指标，除非明确标注日期并作为不可变的历史运行记录；当前值应由脚本或产物派生。

## English summary

Never add fictional legal/business data. Record source URL, verification date, and evidence grade for external facts. Build statutes only from evidence snapshots. Keep authorization and human-review gates server-side. Validate local storage. Run all tests against an isolated database, update both language READMEs, and report untested boundaries honestly.
