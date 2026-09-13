<div align="center">
<a name="readme-top"></a>

# LegalHigh

**可追溯的法律信息检索、合同审查与文书辅助原型**<br>
*A traceable legal-information, contract-review, and document-assistance prototype*

[简体中文](README.zh-CN.md) · [English](README.en.md) · [在线法条浏览 / Pages](https://rethymus.github.io/LegalHigh/) · [安全政策](SECURITY.md) · [贡献指南](CONTRIBUTING.md) · [更新记录](CHANGELOG.md) · [v1.1.0-rc.1 预发布](https://github.com/Rethymus/LegalHigh/releases/tag/v1.1.0-rc.1)

<p align="center"><b>首页 · 浅色 Light</b> · <b>首页 · 深色 Dark</b></p>
<p align="center"><img src="docs/readme/hero-light.png" alt="首页·浅色" width="48.8%"> <img src="docs/readme/hero-dark.png" alt="首页·深色" width="48.8%"></p>

<sup>▲ 首页 · 专业律师视图（浅色 / 深色），采集于 2026-09-09</sup>

</div>

> [!IMPORTANT]
> LegalHigh 坚持「检索、引用绑定、人工核验、审计留痕」的受控工作流。**它不是律师，不提供法律意见，也不保证任何案件结果**；高风险产出必须由具备相应资格的人在平台外独立复核。当前仓库是仍在验收中的本地优先原型，未完成备案或生产部署。
>
> LegalHigh follows a controlled retrieval, citation-binding, human-review, and audit workflow. **It is not a lawyer, does not provide legal advice, and makes no outcome guarantee.** High-risk outputs require independent review outside the platform. This is a local-first prototype under active verification.

## 目录 · Contents

<div align="center">

[✨ 核心工作流](#-核心工作流--core-workflows) · [📸 界面速览](#-界面速览--gallery) · [🚀 快速开始](#-快速开始--quick-start) · [📦 版本与使用方式](#-版本与使用方式--editions) · [🧪 质量与验证](#-质量与验证--quality--verification) · [🗂 目录结构](#-目录结构--repository-layout) · [⚖️ 合规边界](#%EF%B8%8F-合规边界--boundaries) · [🔗 参考项目](#-参考项目--references) · [📄 许可](#-许可--license)

</div>

## ✨ 核心工作流 · Core Workflows

<div align="center">

四条主链路全部本地可复现；GIF 于 2026-09-09 在隔离临时数据库的真实前后端上录制，未剪辑出关键结果态。

</div>

<div align="center">

**① 法条检索 → 引用卡片**：跨 25 部受控语料的 BM25 检索，每条结果带来源、时效与证据等级；摘要只显示程序统计，不调用生成模型。

</div>

<div align="center">

![检索工作流](docs/readme/gif-search.gif)

</div>

<p align="center"><b>② 事实与证据梳理</b> · <b>③ 请求权要件检查</b></p>
<p align="center"><img src="docs/readme/gif-needs.gif" alt="事实与证据梳理" width="48.8%"> <img src="docs/readme/gif-case-analysis.gif" alt="请求权要件检查" width="48.8%"></p>
<p align="center"><sub>左：公众入口的六步向导：只依据使用者陈述检索可回溯来源，输出「候选问题方向」与待补材料，未知明确标未知；右：使用者二次明确选择方向后运行的无状态检查：逐项回链原文片段与现行条文，只报告「文本中发现线索/未见线索」。</sub></p>

<p align="center"><b>④ 合同规则审查</b> · <b>外观与动效</b></p>
<p align="center"><img src="docs/readme/gif-contract.gif" alt="合同审查" width="48.8%"> <img src="docs/readme/gif-theme.gif" alt="外观切换" width="48.8%"></p>
<p align="center"><sub>左：本地规则扫描费用、账户与责任条款：16 个审查点 → Risk Inspector 批注状态机 → DOCX 修订稿导出；右：界面遵循系统浅色/深色与减少动态效果设置；弹簧动效、对比度、焦点环均纳入 QA 门禁。</sub></p>

<div align="center">

AI 插件默认关闭：仅在用户明确配置并授权后调用受控远程端点，且全部输出经过红线、引用绑定与审计三道 gate。详见[中文说明](README.zh-CN.md)或 [English documentation](README.en.md)。

</div>

## 📸 界面速览 · Gallery

<div align="center">

三个本机使用视图（公众 / 法学学习者 / 专业使用者）按用途展示不同工具集；直接输入受限路由地址会被视图门拦截。

</div>

<p align="center"><b>事实与证据梳理</b> · <b>法律检索</b> · <b>法条详情（证据字段）</b></p>
<p align="center"><img src="docs/readme/needs.png" alt="事实与证据梳理" width="32.5%"> <img src="docs/readme/search-results.png" alt="法律检索" width="32.5%"> <img src="docs/readme/law-evidence.png" alt="法条详情" width="32.5%"></p>
<p align="center"><b>案例检索（来源+证据等级）</b> · <b>合同审查</b> · <b>专业工作台</b></p>
<p align="center"><img src="docs/readme/case-detail.png" alt="案例详情" width="32.5%"> <img src="docs/readme/contract-review.png" alt="合同审查" width="32.5%"> <img src="docs/readme/workspace.png" alt="专业工作台" width="32.5%"></p>

<details>
<summary><kbd>展开 12 张补充截图</kbd>（研究 / 学习 / 起草 / 审计 · 深色 · 窄屏 390×844）</summary>

<p align="center"><b>法律研究</b> · <b>跨法域对比</b> · <b>学习中心（法学学习者视图）</b></p>
<p align="center"><img src="docs/readme/research.png" alt="法律研究" width="32.5%"> <img src="docs/readme/comparative.png" alt="跨法域对比" width="32.5%"> <img src="docs/readme/learning.png" alt="学习中心" width="32.5%"></p>
<p align="center"><b>文书起草</b> · <b>数据与证据来源</b> · <b>历史记录与操作审计</b></p>
<p align="center"><img src="docs/readme/draft.png" alt="文书起草" width="32.5%"> <img src="docs/readme/data-sources.png" alt="数据与证据来源" width="32.5%"> <img src="docs/readme/audit.png" alt="操作审计" width="32.5%"></p>
<p align="center"><b>首页（深色）</b> · <b>检索结果（深色）</b> · <b>专业工作台（深色）</b></p>
<p align="center"><img src="docs/readme/dark-search-results.png" alt="首页深色" width="32.5%"> <img src="docs/readme/dark-law-detail.png" alt="法条详情深色" width="32.5%"> <img src="docs/readme/dark-workspace.png" alt="工作台深色" width="32.5%"></p>
<p align="center"><b>窄屏 · 首页</b> · <b>窄屏 · 检索结果</b> · <b>窄屏 · 法条详情</b></p>
<p align="center"><img src="docs/readme/narrow-dashboard.png" alt="窄屏首页" width="26%"> <img src="docs/readme/narrow-search-results.png" alt="窄屏检索" width="26%"> <img src="docs/readme/narrow-law-detail.png" alt="窄屏法条" width="26%"></p>

</details>

## 🚀 快速开始 · Quick Start

要求：Python 3.12、Node.js 22、npm。完整步骤（含桌面壳、质量门、升级与回退）见[中文说明](README.zh-CN.md#本地开发) / [English docs](README.en.md#local-development)。

```bash
# ① 后端（先构建受控语料，再启动 API）
cd server && python -m venv .venv
.venv/bin/python -m pip install --require-hashes -r requirements-dev.lock   # Windows: .venv\Scripts\python.exe
.venv/bin/python build_corpus.py
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000

# ② 前端（Vite 把 /api 代理到 127.0.0.1:8000）
cd web && npm ci && npm run dev
```

> [!NOTE]
> 不要把开发服务绑定到公网地址。敏感接口需要 ≥32 字符的 `LH_ADMIN_TOKEN`（请求头 `X-LegalHigh-Admin-Token`），缺省时按 503 fail-closed 处理。

## 📦 版本与使用方式 · Editions

| 入口 / Entry | 内容 / Available |
|---|---|
| [GitHub Pages](https://rethymus.github.io/LegalHigh/) | 静态法条浏览与产品说明。无后端、无在线 AI、无合同或案件材料上传服务。 / Static statute browsing and product information; no backend or AI service. |
| [源码预发布 / Source prerelease](https://github.com/Rethymus/LegalHigh/releases/tag/v1.1.0-rc.1) | 本机运行完整工作流；包含源码、静态站点 ZIP 和 SHA-256。 / Run the full workflow locally; source, static-site ZIP and SHA-256 checksums. |
| 桌面候选包 / Desktop candidates | 三平台安装、签名与升级验收尚未完成，本次不附桌面安装器。 / Install, signature and upgrade verification are incomplete; no installers in this release. |

本次版本为 **v1.1.0-rc.1（预发布）**，已记录的本地验收为 182 项后端测试、48 路由浏览器巡检及 1 项专业解读页定向巡检；以链接中的具体断言和日期为准，不代表法律正确率。旧 v1.0.0 安装包不包含此后修复。

核心公开链路是六步「事实与证据梳理」：使用者自己记录起因、经过、结果、人员、材料和问题，系统仅据此检索可回溯来源并给出有事实依据的候选方向；未知就明确标未知，不自动判案。首次使用必须在普通民众、法学学生和专业律师三种本机视图中自行选择（不采集姓名、不是资格认证）；法条与案例检索对三类视图始终开放，合同、文书与专业工作台仅在专业律师视图出现。

## 🧪 质量与验证 · Quality & Verification

| 门禁 / Gate | 内容 / What it checks |
|---|---|
| 后端测试 / Backend tests | 182 项 pytest（引用绑定、状态机、PIPL 级联、fail-closed 等） |
| 浏览器巡检 / Route sweeps | 无头 Chrome 逐路由截图 + console/网络零错误门（记录于 2026-09-08） |
| 对比度 / Contrast | WCAG AA 正文 4.5:1 + UI 指示器 3:1（strict 模式） |
| 动效探针 / Motion probes | 弹簧位移、Toast/Dialog 卸载、Reduce Motion 双通道等 11 项行为断言（2026-09-13 实测 11/11） |
| 发布前核验 / Final verify | `server/scripts/final_verify.py` 对运行中实例做十项 API 真值断言 |

自动化测试只能证明被覆盖的断言，不能证明系统「绝不出错」；检索评测（金标 106 组，hit@5 0.97）衡量的是语料命中率，不是法律正确率。

## 🗂 目录结构 · Repository layout

```text
LegalHigh/
├─ server/                  FastAPI 后端：app/ 模块 · build_corpus.py 语料构建 · scripts/ 测试与核验
│  └─ data/laws/            受控语料（由证据快照构建，禁止手改）
├─ web/                     React 19 + react-router 7 前端 · scripts/ QA 工具链
│  └─ public/data/laws.json 语料导出（web/scripts/export_laws.py 唯一路径）
├─ desktop/                 桌面壳（PyInstaller sidecar，候选包待验收）
├─ docs/
│  ├─ readme/               README 媒体资产（readme_media.mjs 生成）
│  ├─ research/             调研报告与证据快照 evidence/
│  ├─ compliance/           备案材料清单与安全扫描记录
│  ├─ standards/qa-evidence/ 质量门证据（截图、报告、终局核验）
│  └─ plan/                 开发计划与决策清单
└─ .githooks/               pre-commit 快门（pytest / build / 数据纪律 / WCAG）
```

## ⚖️ 合规边界 · Boundaries

- 不以律师名义执业：律师函等文书走「AI/模板起草 → 使用者本机复核 → 平台外独立复核」；模板中的律所、律师与证号由使用者自行填写，平台不核验。
- 引用不变量：每条断言绑定来源段落；法条引用附版本/生效/效力字段；判例引用附负面历史检查。
- 裁判文书入库前二次脱敏，并提供拒绝/删除通道（PIPL 级联删除 + 审计留痕）。
- 禁止未授权爬取；语料一律来自证据快照，`server/build_corpus.py` 是唯一构建路径。
- 无证据表明本项目已完成生成式 AI 服务备案、算法备案或律师业务许可；GitHub Pages 工作流只构建静态浏览界面且仅人工触发。

数据与证据纪律、完整安全边界与「不能据此声称的事项」见[中文说明](README.zh-CN.md#数据与证据纪律) / [English documentation](README.en.md#data-and-evidence-discipline)。

## 🔗 参考项目 · References

| 参考 | 借鉴点 |
|---|---|
| [LegalBench-RAG](https://github.com/ZeroEntropy-AI/legalbenchrag) / [论文](https://arxiv.org/abs/2408.10343) | 检索与生成分开评测、确定性金标 |
| [LawBench](https://github.com/open-compass/LawBench) | 中英文 README 导航、任务矩阵、弃权率指标 |
| [DISC-LawLLM](https://github.com/FudanDISC/DISC-LawLLM) | 中文法律系统检索增强与「不能替代律师」边界 |
| [CUAD](https://github.com/TheAtticusProject/cuad) | 合同审查条款类别与金标思路 |
| [CourtListener](https://github.com/freelawproject/courtlistener) / [docassemble](https://github.com/jhpyle/docassemble) | 项目结构、权利说明与引导式访谈定位 |

仅参考方法与文档结构，未复制其数据或代码；逐项许可核验见[中文说明](README.zh-CN.md#开源项目与论文参考)。

## 📄 许可 · License

本仓库当前**未附开源许可证**，默认保留全部权利，不能因仓库公开即复制、修改、分发或商业使用；法律文本、裁判文书及第三方材料的权利由其来源决定。详见[权利与第三方说明](THIRD_PARTY_NOTICES.md)。

<div align="center">

[« 返回顶部 / Back to top](#readme-top)

</div>
