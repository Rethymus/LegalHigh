<div align="center">
<a name="readme-top"></a>

# LegalHigh（简体中文）

**本地优先的法律信息与文书辅助原型：证据快照 → 确定性检索 → 引用绑定 → 人工核验 → 审计留痕**

[English](README.en.md) · [项目首页](README.md) · [安全政策](SECURITY.md) · [贡献指南](CONTRIBUTING.md) · [更新记录](CHANGELOG.md) · [v1.1.0-rc.1 预发布](https://github.com/Rethymus/LegalHigh/releases/tag/v1.1.0-rc.1) · [在线法条浏览](https://rethymus.github.io/LegalHigh/)

</div>

## 目录

<div align="center">

[安装与版本选择](#安装与版本选择) · [为谁服务、怎样使用](#为谁服务怎样使用) · [界面速览](#界面速览) · [核心工作流](#核心工作流) · [当前真实能力](#当前真实能力) · [不能据此声称的事项](#不能据此声称的事项) · [数据与证据纪律](#数据与证据纪律) · [本地开发](#本地开发) · [质量门](#质量门) · [架构与安全边界](#架构与安全边界) · [开源项目与论文参考](#开源项目与论文参考) · [贡献、声明与许可](#贡献声明与许可)

</div>

> [!IMPORTANT]
> LegalHigh 不是律师事务所，不以律师名义执业，不提供法律意见，也不预测裁判结果。任何高风险输出都必须由有权且具备相应资格的人在平台外独立复核后使用；平台只记录使用者自己的复核定稿进度，不核验执业资格、不实施签发。

## 安装与版本选择

直接阅读法条可访问 [GitHub Pages](https://rethymus.github.io/LegalHigh/)，站点仅提供静态浏览和产品说明。完整检索、事实梳理、合同审查、草稿、专业解读和可选 AI 需按下文[本地开发](#本地开发)步骤在本机运行 Python 后端。Release 提供源码与静态站 ZIP，并附 SHA-256；静态 ZIP 不是桌面安装包。v1.1.0-rc.1 是预发布，尚未完成三平台签名安装验收。旧 v1.0.0 不含后续修复。

升级前请备份本机 SQLite，保存模型配置并停掉旧服务；使用新版本锁文件安装依赖后重启。旧 verified/issued 草稿会迁移为 reviewed/finalized，仅表示使用者本机进度，不表示平台签发。需要回退时使用升级前数据库备份，不让旧版程序直接读写已迁移的库。

## 为谁服务、怎样使用

首次打开完整应用时必须自行选择一种本机使用视图；系统不再静默指定默认受众，也不采集姓名。之后可在「设置 → 使用视图」随时切换。法条和案例检索在三种视图中始终可用；来源研究、学习与比较法按用途展示；合同审查、文书草稿、专业工作台和操作审计仅在「专业律师」视图展示，直接输入这些地址也会被视图门拦截。「专业律师」只是界面用途选择，不是账号、执业资格或组织关系认证。

- **公众**：先在「事实与证据梳理」中分步记录起因、时间经过、当前结果、相关人员、现有材料、诉求与疑问。系统只根据使用者陈述检索来源，给出带事实依据的「候选问题方向」和待补材料，不自动判定案由，更不会默认套用某一种请求权模型。整理结果仅在当前页面存在，可手动导出 JSON 后带给法律援助机构或专业律师。
- **法学学习者**：通过真实来源法条、已核实案例、引用链与检索缺口练习从事实到规范的分析；外国判例始终与中国法依据分层。
- **专业使用者**：可用本地合同规则检查费用、账户和责任条款，保留批注与审计记录，并按模板生成律师函、合同和诉讼文书草稿。模板中的律所、律师和证号均由使用者自行填写；平台不核验这些信息，也不代替有权人员审查或出具文书。

项目不建设律师入驻、派单、在线咨询或平台签发体系。它的定位是专业法律援助之前的普法与事实准备工具，以及专业人员和学生可检查的研究、审查和文书辅助工具。

## 界面速览

<div align="center">

以下截图采集于 2026-09-09，使用隔离本机后端与临时数据库；截图展示完整本机功能，GitHub Pages 仅提供其中的静态浏览部分。

</div>

<p align="center"><b>首页（浅色）</b> · <b>首页（深色）</b></p>
<p align="center"><img src="docs/readme/hero-light.png" alt="首页·浅色" width="48.8%"> <img src="docs/readme/hero-dark.png" alt="首页·深色" width="48.8%"></p>

<div align="center">

<sup>▲ 首页 · 专业律师视图（浅色 / 深色）</sup>

</div>

<p align="center"><b>事实与证据梳理</b> · <b>法律检索</b> · <b>法条详情（证据字段）</b></p>
<p align="center"><img src="docs/readme/needs.png" alt="事实与证据梳理" width="32.5%"> <img src="docs/readme/search-results.png" alt="法律检索" width="32.5%"> <img src="docs/readme/law-evidence.png" alt="法条详情" width="32.5%"></p>
<p align="center"><b>案例检索（来源+证据等级）</b> · <b>合同审查</b> · <b>专业工作台</b></p>
<p align="center"><img src="docs/readme/case-detail.png" alt="案例详情" width="32.5%"> <img src="docs/readme/contract-review.png" alt="合同审查" width="32.5%"> <img src="docs/readme/workspace.png" alt="专业工作台" width="32.5%"></p>

<details>
<summary><kbd>展开全部截图</kbd>（研究 / 学习 / 起草 / 审计等 12 张 · 深色 3 · 窄屏 3）</summary>

<p align="center"><b>请求权要件检查</b> · <b>法规浏览</b> · <b>外国判例（分层展示）</b></p>
<p align="center"><img src="docs/readme/case-analysis.png" alt="请求权要件检查" width="32.5%"> <img src="docs/readme/laws-browse.png" alt="法规浏览" width="32.5%"> <img src="docs/readme/case-foreign.png" alt="外国判例" width="32.5%"></p>
<p align="center"><b>法律研究</b> · <b>跨法域对比</b> · <b>学习中心（法学学习者视图）</b></p>
<p align="center"><img src="docs/readme/research.png" alt="法律研究" width="32.5%"> <img src="docs/readme/comparative.png" alt="跨法域对比" width="32.5%"> <img src="docs/readme/learning.png" alt="学习中心" width="32.5%"></p>
<p align="center"><b>文书起草</b> · <b>合同版本对比</b> · <b>数据与证据来源</b></p>
<p align="center"><img src="docs/readme/draft.png" alt="文书起草" width="32.5%"> <img src="docs/readme/contracts.png" alt="合同库" width="32.5%"> <img src="docs/readme/data-sources.png" alt="数据与证据来源" width="32.5%"></p>
<p align="center"><b>历史记录与操作审计</b> · <b>设置</b> · <b>收藏</b></p>
<p align="center"><img src="docs/readme/audit.png" alt="操作审计" width="32.5%"> <img src="docs/readme/settings.png" alt="设置" width="32.5%"> <img src="docs/readme/collections.png" alt="收藏" width="32.5%"></p>
<p align="center"><b>首页（深色）</b> · <b>检索结果（深色）</b> · <b>专业工作台（深色）</b></p>
<p align="center"><img src="docs/readme/dark-search-results.png" alt="检索深色" width="32.5%"> <img src="docs/readme/dark-law-detail.png" alt="法条深色" width="32.5%"> <img src="docs/readme/dark-workspace.png" alt="工作台深色" width="32.5%"></p>
<p align="center"><b>窄屏 · 首页</b> · <b>窄屏 · 检索结果</b> · <b>窄屏 · 法条详情</b></p>
<p align="center"><img src="docs/readme/narrow-dashboard.png" alt="窄屏首页" width="26%"> <img src="docs/readme/narrow-search-results.png" alt="窄屏检索" width="26%"> <img src="docs/readme/narrow-law-detail.png" alt="窄屏法条" width="26%"></p>

</details>

界面动效只服务于真实产品交互：Toast、对话框、分段控件、开关、列表和滚动导航均接受无头浏览器行为探针；减少动态效果、键盘焦点、对比度和动效时长纳入 QA 门禁。项目不向最终用户暴露内部设计规范或组件展台页面。

## 核心工作流

<div align="center">

四条链路的演示 GIF 于 2026-09-09 在真实前后端（隔离临时数据库）上录制，结尾均停在真实结果态。

</div>

<div align="center">

**① 法条检索 → 引用卡片**（全部视图可用）：跨 25 部受控语料（4,016 条条文条目）的 BM25 检索，每条结果带来源、时效与证据等级；摘要只显示程序统计，不调用生成模型。

</div>

<div align="center">

![检索工作流](docs/readme/gif-search.gif)

</div>

<p align="center"><b>② 事实与证据梳理（公众）</b> · <b>③ 请求权要件检查</b></p>
<p align="center"><img src="docs/readme/gif-needs.gif" alt="事实与证据梳理" width="48.8%"> <img src="docs/readme/gif-case-analysis.gif" alt="请求权要件检查" width="48.8%"></p>
<p align="center"><sub>左：六步向导只依据使用者陈述检索可回溯来源，输出「候选问题方向」与待补材料；未知明确标未知，不自动判案；右：使用者二次明确选择方向后运行的无状态检查：逐项回链原文片段与现行条文，只报告「文本中发现线索/未见线索」。</sub></p>

<p align="center"><b>④ 合同规则审查（专业视图）</b> · <b>外观与动效</b></p>
<p align="center"><img src="docs/readme/gif-contract.gif" alt="合同审查" width="48.8%"> <img src="docs/readme/gif-theme.gif" alt="外观切换" width="48.8%"></p>
<p align="center"><sub>左：本地规则扫描费用、账户与责任条款：16 个审查点 → Risk Inspector 批注状态机 → DOCX 修订稿导出；右：界面遵循系统浅色/深色与减少动态效果设置；弹簧动效、对比度、焦点环均纳入 QA 门禁。</sub></p>

AI 插件默认关闭：只有在用户明确配置并授权后，才会把请求发送到受控的远程端点，且全部输出经过红线、引用绑定与审计三道 gate；引用 gate 不通过时不交付生成正文。

## 当前真实能力

| 能力 | 当前边界 |
|---|---|
| 事实与证据梳理 | 六步记录起因、经过、结果、人员、材料和诉求；候选方向必须显示所依据的使用者原话，未知时明确标为未知。问题和诉求不参与事实检索，避免反问内容污染证据命中。结果不自动持久化，可由使用者导出。 |
| 请求权要件检查 | 只在使用者明确选择候选方向后运行，无默认借贷模型。结果仅区分「文本中发现线索/未见线索」，原文片段与现行条文逐项回链；不作案由认定、权利成立判断或结果预测。 |
| 法条浏览与 BM25 检索 | 由仓库内证据快照构建；当前构建产物为 25 部、3,963 个基条（含「之一/之二」子条号共 4,016 个条文条目，2026-09-14 起；含宪法与刑法，优先登记册 backlog 清零）。此前新增个人信息保护法、法律援助法、行政复议法和行政诉讼法的全国人大官方快照；2026-09-13/14 新增治安管理处罚法（2025 修订）、未成年人保护法（2024 修正）、妇女权益保障法（2022 修订）、行政处罚法（2021 修订）、网络安全法（2025 修正，网信办重新公布文本）、数据安全法（2021，网信办受权发布）、劳动争议调解仲裁法（2007，国家信访局法律法规库）、刑事诉讼法（2018 修正）、国家赔偿法（2012 第二次修正）、宪法（2018 修正）与刑法（2023 第十二次修正）官方公报转载/转录快照。页面提供来源、快照日期、文件哈希、施行/版本日期证据。全国人大截至 2026-03-16 的目录载明 310 件现行有效法律；两者统计口径不同，本项目不是完整中国法律数据库，也没有历史版本全库。 |
| 引用式问答 | 确定性检索返回法条原文卡片；错误前提仅按已测试规则纠正。没有命中时必须明确缺口。 |
| 案例检索 | 仅展示带直接来源、核验日期与证据等级的记录。外国判例仅供比较研究，不构成中国裁判依据。 |
| 实时数据储备 | 侧栏底部通过公开只读 `/api/inventory` 从当前受控语料、已核实案例和已审核解读实时派生数量；不读取用户审查、草稿、投诉或审计记录，也不显示虚构用户身份。 |
| 合同审查 | 在用户提交的文本上运行本地规则扫描，生成审查记录、批注状态与 DOCX 修订稿；结果不是律师审查结论。仓库不再附带虚构客户合同。 |
| 文书起草 | 依据用户输入和固定模板生成草稿并运行确定性校验。复核与定稿进度由本机使用者记录并确认承担责任；服务端不接受客户端自报身份。 |
| AI 插件 | 默认关闭。只有用户明确配置并授权后，才会把请求发送到受控的远程端点；自定义公网端点还须由服务端主机白名单批准。服务端先注入法条原文、直接司法解释和登记在册的具名专业观点摘要，并降级客户端自报的 system 指令；引用 gate 不通过时不交付生成正文。没有独立法律专家金标评测集时，正确率显示为「暂无」，只展示明确标为「不是正确率」的证据覆盖分。 |
| 隐私与审计 | SQLite 本地记录；敏感导出、删除与状态流转需要服务端认证主体。当前没有多用户账号体系，因此不适合公网共享部署。 |

## 不能据此声称的事项

- 没有证据表明本项目已完成生成式 AI 服务备案、算法备案、应用上线登记或律师业务许可。
- GitHub Pages 工作流只构建静态法条浏览界面，而且当前只允许人工触发；后端合同、起草、审计、AI 与隐私接口不会在静态站点运行。
- 桌面工作流只生成标为 `unsigned-desktop-candidate-*` 的人工候选包，不会发布 Release；本地验收不等同于三个操作系统上的签名安装包均已发布验证。
- 本地语料不是国家法律法规数据库的镜像；公开快照必须回到所列来源核验后才能正式引用。
- 自动化测试、检索评测与安全检查只能证明被覆盖的断言，不能证明系统「绝不出错」。

应用内[质量透明度页](/quality)只读公示实时派生指标与带日期历史记录。

## 数据与证据纪律

1. 原始证据位于 `docs/research/evidence/`；`server/build_corpus.py` 是生成 `server/data/laws/` 的唯一路径。
2. 构建记录来源 URL、抓取/核验日期、证据等级、源文件 SHA-256、构建文件 SHA-256，以及版本/施行日期的证据对象。
3. `server/scripts/corpus_selfcheck.py` 校验结构、条号、哈希和日期证据。机器自检通过并不替代人工核对官方原文。
4. 案例摘要是项目结构化转述，不是裁判文书全文；页面始终提供原始来源入口。
5. 未获明确许可的数据不得复制进产品。此前附带、但上游未提供许可证且未被运行时使用的 LawRefBook 数据副本已经移除。
6. 专业解读只登记具名作者、可核资质、原文链接、查阅日期、项目原创摘要和适用边界；未获转载授权时不复制全文。学术观点与司法解释必须分层展示，不能互相冒充。

## 本地开发

要求：Python 3.12、Node.js 22（Vite 8 的兼容基线）和 npm。

Windows PowerShell：

```powershell
cd server
python -m venv .venv
.venv\Scripts\python.exe -m pip install --require-hashes -r requirements-dev.lock
.venv\Scripts\python.exe build_corpus.py
.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Linux/macOS：

```bash
cd server
python3.12 -m venv .venv
.venv/bin/python -m pip install --require-hashes -r requirements-dev.lock
.venv/bin/python build_corpus.py
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

不要把开发服务绑定到公网地址。敏感接口需要长度不少于 32 个字符的 `LH_ADMIN_TOKEN`，并在请求头中发送 `X-LegalHigh-Admin-Token`。审计署名由服务端 `LH_ADMIN_PRINCIPAL` 提供，不能由请求正文自报；该署名只标识本机操作记录，不代表账号实名、组织关系或执业资格已经核验。

前端：

```bash
cd web
npm ci
npm run dev
```

Vite 把 `/api` 代理到 `127.0.0.1:8000`。静态构建使用 `npm run build`。

桌面壳：

```bash
cd desktop
npm ci
npm run check
```

桌面壳使用随机回环端口、随机管理令牌和实例证明启动 PyInstaller sidecar；渲染进程不接收管理令牌。SQLite 位于操作系统用户数据目录，不写安装资源。完整打包还需要相应平台的后端 sidecar，因此普通源码检出不能直接声称完成安装包构建。

README 截图与 GIF 的再生成方式（媒体资产唯一来源，禁止手工拼图冒充产品状态）：

```bash
# 后端以唯一临时库启动后（写操作仅入临时库）：
cd web && node scripts/readme_media.mjs   # 产物 docs/readme/*.png 与 *.gif
```

## 质量门

推荐在隔离数据库上运行：

```powershell
$env:LH_DB_PATH = Join-Path $env:TEMP "legalhigh-qa-$([guid]::NewGuid()).db"
server\run_tests.cmd -q
server\.venv\Scripts\python.exe server\scripts\final_verify.py
cd web
npm run build
node scripts\qa_gates.mjs
node scripts\qa_contrast.mjs --strict
```

`final_verify.py` 默认自行建立临时 SQLite 并清理，不会接触 `server/data/app.db`。视觉巡检默认只读；只有同时传入 `--write-e2e --isolated-db` 才允许创建测试记录。

锁文件分为运行时 `requirements.lock`、开发验收 `requirements-dev.lock`、桌面构建 `requirements-desktop.lock`，均含版本和下载哈希。前端与桌面端使用提交的 `package-lock.json`，CI 使用 `npm ci`。

## 架构与安全边界

```text
证据快照 ──构建/哈希校验──> 法条语料 ──受控主题组/BM25──> 引用卡片
用户文本 ──确定性规则────> 审查/草稿 ──使用者复核并确认责任──> 定稿产物（平台外独立复核）
可选远程模型 ──红线/引用/审计 gate──> 明确标识的 AI 草稿
```

- 后端只允许明确列出的本地前端来源，并设置安全响应头和静态路径边界。
- 自定义 AI URL 禁止明文 HTTP、公网白名单外主机、私网/回环/链路本地/元数据地址；本机固定开发端点不允许携带用户密钥。
- DOCX 回传限制体积、ZIP 结构和解压规模，格式错误返回 4xx。
- 收藏、浏览历史和研究标记保存在本机 `localStorage`，读取时校验类型与字段；损坏数据会降级为空集合。
- 当前认证是单机管理员边界，不是成熟的租户、用户和资源所有权模型。公网部署前必须重新设计身份、会话、授权、CSRF、密钥托管与数据隔离。

## 开源项目与论文参考

以下资料用于方法、文档结构和评测设计参考；本仓库没有复制它们的数据或代码。2026-09-08 另核对 [CourtListener](https://github.com/freelawproject/courtlistener) 的项目结构、贡献与权利说明，以及 [docassemble](https://github.com/jhpyle/docassemble) 的引导式访谈定位和文档入口。README 的呈现方式（图片先导的首页区块、折叠图廊、GitHub Alerts 提示框）另参考了 LobeChat、Langfuse、Dub、NextChat 与 LawBench 的公开 README 排版惯例（核验于 2026-09-09）。证据等级：强（项目官方仓库），不表示对本项目背书。

| 参考 | 借鉴点 | 许可/使用判断（核验于 2026-09-07） |
|---|---|---|
| [LegalBench-RAG](https://github.com/ZeroEntropy-AI/legalbenchrag) / [论文](https://arxiv.org/abs/2408.10343) | 把检索与生成分开评测、用确定性金标计算检索表现 | 仅参考方法，不导入数据。证据等级：强（作者仓库/论文）。 |
| [LegalBench](https://hazyresearch.stanford.edu/legalbench/tasks/) | 按法律推理能力组织任务、公开评测边界 | 各任务许可证不同，必须逐任务判断。证据等级：强（项目官网）。 |
| [LawBench](https://github.com/open-compass/LawBench) | 中英文 README 导航、知识/理解/应用任务矩阵，以及把弃权率单列为指标 | 各下游数据仍须逐项核对许可；本项目仅参考评测和文档组织。证据等级：强（项目仓库）。 |
| [DISC-LawLLM](https://github.com/FudanDISC/DISC-LawLLM) | 中文法律系统的检索增强与「不能替代律师」边界 | Apache 许可；未引入其模型或数据。证据等级：强（项目仓库）。 |
| [CUAD](https://github.com/TheAtticusProject/cuad) | 专家标注合同审查的条款类别思路，用于检查本项目费用、账户、责任规则是否有明确类别与金标 | 仅参考任务设计，不复制合同数据、模型或代码。证据等级：强（作者项目仓库）。 |

许可证缺失意味着默认保留权利，不能因仓库公开就复制。第三方依赖和本仓库许可状态见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 贡献、声明与许可

提交前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。安全问题按 [SECURITY.md](SECURITY.md) 私下报告，不要在公开 Issue 中放入个人信息、合同、案件材料、密钥或漏洞利用细节。

LegalHigh 仅用于法律信息检索、研究和软件工程验证。任何输出均可能不完整、过期或错误；正式使用前请核对有权机关最新发布文本，并就具体事项咨询具备相应资格的专业人士。

本仓库当前未附开源许可证，因此未授予复制、修改、分发或商业使用代码的许可。法律文本、裁判文书及第三方材料的权利和使用条件分别由其来源决定。

<div align="center">

[« 返回顶部](#readme-top)

</div>
