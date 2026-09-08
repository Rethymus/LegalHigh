<div align="center">

# LegalHigh

**可追溯的法律信息检索、合同审查与文书辅助原型**<br>
**A traceable legal-information, contract-review, and document-assistance prototype**

![LegalHigh 首页](docs/qa-evidence/goal-2026-09-08-auth/01-dashboard.png)

[简体中文](README.zh-CN.md) · [English](README.en.md) · [安全政策](SECURITY.md) · [贡献指南](CONTRIBUTING.md)

[在线法条浏览 / Pages](https://rethymus.github.io/LegalHigh/) · [v1.1.0-rc.1](https://github.com/Rethymus/LegalHigh/releases/tag/v1.1.0-rc.1) · [更新记录 / Changelog](CHANGELOG.md)

[![QA](https://github.com/Rethymus/LegalHigh/actions/workflows/qa.yml/badge.svg)](https://github.com/Rethymus/LegalHigh/actions/workflows/qa.yml) [![Pages](https://github.com/Rethymus/LegalHigh/actions/workflows/pages.yml/badge.svg)](https://github.com/Rethymus/LegalHigh/actions/workflows/pages.yml)

</div>

## 选择使用方式 · Choose your edition

| 入口 / Entry | 内容 / Available |
|---|---|
| [GitHub Pages](https://rethymus.github.io/LegalHigh/) | 静态法条浏览与产品说明。无后端、无在线 AI、无合同或案件材料上传服务。 / Static statute browsing and product information; no backend or AI service. |
| [源码预发布 / Source prerelease](https://github.com/Rethymus/LegalHigh/releases/tag/v1.1.0-rc.1) | 本机运行完整工作流；包含源码、静态站点 ZIP 和 SHA-256。 / Run the full workflow locally; source, static-site ZIP and SHA-256 checksums. |
| 桌面候选包 / Desktop candidates | 三平台安装、签名与升级验收尚未完成，本次不附桌面安装器。 / Install, signature and upgrade verification are incomplete; no installers in this release. |

本次版本为 **v1.1.0-rc.1（预发布）**，已记录的本地验收为 182 项后端测试、48 路由浏览器巡检及 1 项专业解读页定向巡检；以链接中的具体断言和日期为准，不代表法律正确率。旧 v1.0.0 安装包不包含此后修复。

This is **v1.1.0-rc.1 (prerelease)**. Recorded local verification covers 182 backend tests, 48 browser routes and one focused professional-commentary page check. These are engineering checks, not legal-accuracy measurements. Old v1.0.0 installers do not contain subsequent fixes.

LegalHigh 坚持“检索、引用绑定、人工核验、审计留痕”的受控工作流。当前受控语料为 14 部、2,380 条，并公开 310 件现行有效法律目录基线与未入库更新队列；这不是完整法律体系覆盖率。它不是律师，不提供法律意见，也不保证任何案件结果。当前仓库是仍在验收中的本地优先原型，不应被当作已经完成备案、生产部署或律师执业授权的服务。

LegalHigh follows a controlled retrieval, citation-binding, human-review, and audit workflow. It is not a lawyer, does not provide legal advice, and makes no outcome guarantee. This repository is a local-first prototype under active verification—not a registered production legal service.

核心入口是六步“事实与证据梳理”：用户自己记录起因、经过、结果、人员、材料和问题，系统仅据此检索可回溯来源并给出有事实依据的候选方向；未知就明确标未知，不自动判案。只有使用者二次明确选择方向后，才可运行无状态的请求权要件检查，且结果只表示原文中是否出现线索。项目同时提供法学学习、合同规则审查和专业文书草稿工具，但不建设律师入驻、派单、在线咨询、资格核验或平台签发体系。

首次使用必须在普通民众、法学学生和专业律师三种本机视图中自行选择。法条与案例检索对三类视图始终开放；学习研究入口只在相应视图出现，合同、文书和专业工作台仅在专业律师视图出现，直接访问也会被视图门拦截。该选择不采集姓名，也不是身份或律师资格认证。侧栏底部只展示服务端从当前受控数据源实时派生的数据储备，不显示虚构用户资料。

The primary public flow is a six-step fact-and-evidence preparation process. It retrieves traceable sources and provisional issue directions from user-reported facts, and explicitly says “unknown” when unsupported. The project also supports legal study, rule-based contract review, and professional document drafts, but it does not operate lawyer onboarding, referrals, online consultation, credential verification, or platform issuance.

First use requires an explicit local choice among Public, Law Student, and Professional Lawyer views. Statute and case search remain available in every view; study/research tools appear only where relevant, while contract, drafting, and professional-workspace routes are limited to the professional view, including direct-URL access. The choice collects no name and is not identity or licence verification. The sidebar footer shows only live inventory derived by the server from controlled sources.

开始使用、数据边界、测试证据和已知限制请阅读 [中文说明](README.zh-CN.md) 或 [English documentation](README.en.md)。仓库目前没有授予开源许可证；详见[权利与第三方说明](THIRD_PARTY_NOTICES.md)。
