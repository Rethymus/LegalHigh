# 发布检查清单 —— RC 转正式（v1.1.0）/ Release checklist（S1-T2）

> 决策 18 口径：**不设日期，三条件齐即转正**。本清单把「转正」拆成可勾选的事实判断；
> release.yml 只产出草稿 Release，最后一公里（发布按钮）永远是人 gate。

## 一、转正三条件（全部 ✅ 才进入第二节）

| # | 条件 | 证据指针 | 状态 |
|---|---|---|---|
| 1 | M6 遗留清零：flk 人工抽查 ≥10% 完成并归档；pcl-2023 末条定案并落地构建规则 | `docs/qa-evidence/flk-spotcheck-完成-<日期>.md` | ⬜（工作单已生成 167 条，2026-09-13） |
| 2 | rc.1 起两周零回归（无因修复引入的新缺陷） | 登记册 + git log | ⬜ |
| 3 | 云端 CI 连绿（main 分支 qa 六门） | GitHub Actions 运行记录 | ✅ 持续满足中（2026-09-09 起） |

## 二、发布前核查（草稿 Release 上逐项勾选）

1. **版本与变更**：`CHANGELOG.md` 顶部新增本版本段落（Added/Fixed/Verification/Upgrade and limits 四节，中英）；版本号与 tag 一致；`desktop/package.json` version 同步。
2. **附件四件**：源码 ZIP、静态站点 ZIP、SBOM ×3（server/web/desktop CycloneDX 1.5）、`SHA256SUMS`。桌面安装器不在附件内，除非决策 16 已决议签名路径。
3. **静态站点内容**：解包抽查 `data/laws.json` 与 `/api/laws` 一致（export_laws 同源）；首页可达、法条详情路由（HashRouter）深链可开。
4. **质量门当次全绿**：pytest / build / qa_gates / qa_contrast --strict / qa_motion（发布前手动 `run_qa.cmd` 全量，含 52 路由巡检）。
5. **合规公示复核**（对照 `备案材料清单` B 类）：B2 定位声明在列；B5 投诉通道可用；B1/B3/B4/B6 现状如实标注「未接入/待建立」，不虚标。
6. **README 双语数字**：质量表中的测试数/语料数与本次构建产物一致（或明确标注历史口径日期）。

## 三、发布动作

1. 在 GitHub Releases 页把草稿改为正式发布（或先发 prerelease 观察）。
2. 推送后 24 小时内复查 Actions（release 工作流 + qa 工作流）无新失败。
3. 归档：本清单勾选完毕后随版本提交入库，`docs/qa-evidence/` 附当次 final_verify 输出。

## 四、回退

发布后发现阻断缺陷：先在 Release 页标「pre-release/已知问题」声明，禁止删除已发布 tag；修复走正常迭代，下个补丁版本发布。旧 v1.0.0 安装包不含后续修复的既有声明继续有效。
