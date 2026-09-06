# LegalHigh（简体中文）

[English](README.en.md) · [项目首页](README.md) · [安全政策](SECURITY.md) · [贡献指南](CONTRIBUTING.md)

LegalHigh 是一个本地优先的法律信息与文书辅助原型。系统把法条证据快照、可核验案例、确定性检索、合同规则扫描、文书模板、人工审核门和审计记录放在同一条可检查的工作流中。

它不是律师事务所，不以律师名义执业，不提供法律意见，也不预测裁判结果。任何高风险输出都必须由有权且具备相应资格的人在平台外独立复核后使用；平台只记录使用者自己的复核定稿进度，不核验执业资格、不实施签发。

## 界面速览

以下截图来自 2026-09-06 的本地完整服务运行实况（真实 API 驱动；演示性内容均带「示例」标注）：

| 首页（浅色） | 首页（深色） |
|---|---|
| ![首页·浅色](docs/readme/01-home-light.png) | ![首页·深色](docs/readme/02-home-dark.png) |

| 法律检索 | 法条详情 |
|---|---|
| ![法律检索](docs/readme/03-search.png) | ![法条详情](docs/readme/04-law-detail.png) |

| 合同审查 | 设置·外观（分段控件） |
|---|---|
| ![合同审查](docs/readme/05-contract-review.png) | ![设置·外观](docs/readme/06-settings-appearance.png) |

动效系统（SwiftUI 弹簧模型换算的 CSS `linear()` 曲线）：三球同距对比三档阻尼、Toast 弹簧入场、推石 shake 指数衰减、竹简槽分段控件滑块。该展台在内部「设计系统」页可实操，动效物理由 `web/scripts/qa_motion.mjs` 在无头浏览器中断言（bouncy 过冲实测 230px≈理论 229px、smooth 无过冲、shake 三段衰减证据）：

![动效展台](docs/readme/motion-lab.gif)

材质体系按语义分档：导航铬层/内容台面/卡片/浮层各自一套模糊、叠色、内缘光、发丝线参数（全部收敛为 Token）；中性色阶 `--gray-1..6` 深浅两套同语义；焦点环、对比度与动效时长均纳入 QA 门禁。

## 当前真实能力

| 能力 | 当前边界 |
|---|---|
| 法条浏览与 BM25 检索 | 由仓库内证据快照构建；当前构建产物为 10 部、2,042 条。页面提供来源、快照日期、文件哈希、施行/版本日期证据。不是完整中国法律数据库，也没有历史版本全库。 |
| 引用式问答 | 确定性检索返回法条原文卡片；错误前提仅按已测试规则纠正。没有命中时必须明确缺口。 |
| 案例检索 | 仅展示带直接来源、核验日期与证据等级的记录。外国判例仅供比较研究，不构成中国裁判依据。 |
| 合同审查 | 在用户提交的文本上运行本地规则扫描，生成审查记录、批注状态与 DOCX 修订稿；结果不是律师审查结论。仓库不再附带虚构客户合同。 |
| 文书起草 | 依据用户输入和固定模板生成草稿并运行确定性校验。复核与定稿进度由本机使用者记录并确认承担责任；服务端不接受客户端自报身份。 |
| AI 插件 | 默认关闭。只有用户明确配置并授权后，才会把请求发送到受控的远程端点；自定义公网端点还须由服务端主机白名单批准。引用 gate 不通过时不交付生成正文。 |
| 隐私与审计 | SQLite 本地记录；敏感导出、删除与状态流转需要服务端认证主体。当前没有多用户账号体系，因此不适合公网共享部署。 |

## 不能据此声称的事项

- 没有证据表明本项目已完成生成式 AI 服务备案、算法备案、应用上线登记或律师业务许可。
- GitHub Pages 工作流只构建静态法条浏览界面，而且当前只允许人工触发；后端合同、起草、审计、AI 与隐私接口不会在静态站点运行。
- 桌面工作流只生成标为 `unsigned-desktop-candidate-*` 的人工候选包，不会发布 Release；本次本地验收不等同于三个操作系统上的签名安装包均已发布验证。
- 本地语料不是国家法律法规数据库的镜像；公开快照必须回到所列来源核验后才能正式引用。
- 自动化测试、检索评测与安全检查只能证明被覆盖的断言，不能证明系统“绝不出错”。

## 数据与证据纪律

1. 原始证据位于 `docs/research/evidence/`；`server/build_corpus.py` 是生成 `server/data/laws/` 的唯一路径。
2. 构建记录来源 URL、抓取/核验日期、证据等级、源文件 SHA-256、构建文件 SHA-256，以及版本/施行日期的证据对象。
3. `server/scripts/corpus_selfcheck.py` 校验结构、条号、哈希和日期证据。机器自检通过并不替代人工核对官方原文。
4. 案例摘要是项目结构化转述，不是裁判文书全文；页面始终提供原始来源入口。
5. 未获明确许可的数据不得复制进产品。此前附带、但上游未提供许可证且未被运行时使用的 LawRefBook 数据副本已经移除。

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

不要把开发服务绑定到公网地址。敏感接口需要长度不少于 32 个字符的 `LH_ADMIN_TOKEN`，并在请求头中发送 `X-LegalHigh-Admin-Token`。身份、角色与律师执业证号必须由服务端环境提供，不能由请求正文自报。

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
证据快照 ──构建/哈希校验──> 法条语料 ──BM25──> 引用卡片
用户文本 ──确定性规则────> 审查/草稿 ──使用者复核并确认责任──> 定稿产物（平台外独立复核）
可选远程模型 ──红线/引用/审计 gate──> 明确标识的 AI 草稿
```

- 后端只允许明确列出的本地前端来源，并设置安全响应头和静态路径边界。
- 自定义 AI URL 禁止明文 HTTP、公网白名单外主机、私网/回环/链路本地/元数据地址；本机固定开发端点不允许携带用户密钥。
- DOCX 回传限制体积、ZIP 结构和解压规模，格式错误返回 4xx。
- 收藏、浏览历史和研究标记保存在本机 `localStorage`，读取时校验类型与字段；损坏数据会降级为空集合。
- 当前认证是单机管理员边界，不是成熟的租户、用户和资源所有权模型。公网部署前必须重新设计身份、会话、授权、CSRF、密钥托管与数据隔离。

## 开源项目与论文参考

以下资料用于方法、文档结构和评测设计参考；本仓库没有复制它们的数据或代码：

| 参考 | 借鉴点 | 许可/使用判断（核验于 2026-09-02） |
|---|---|---|
| [LegalBench-RAG](https://github.com/zeroentropy-cc/legalbenchrag) / [论文](https://arxiv.org/abs/2408.10343) | 检索任务拆分、可复现评测 | 仅参考方法，不导入数据。证据等级：强（作者仓库/论文）。 |
| [LegalBench](https://hazyresearch.stanford.edu/legalbench/tasks/) | 按法律推理能力组织任务、公开评测边界 | 各任务许可证不同，必须逐任务判断。证据等级：强（项目官网）。 |
| [LawBench](https://github.com/open-compass/LawBench) | 中英文 README 导航、任务矩阵和可复现命令 | Apache-2.0 仓库；仅参考文档组织。证据等级：强（项目仓库）。 |
| [DISC-LawLLM](https://github.com/FudanDISC/DISC-LawLLM) | 中文法律模型的可验证检索与评测分层 | Apache 许可；未引入其模型或数据。证据等级：强（项目仓库）。 |

许可证缺失意味着默认保留权利，不能因仓库公开就复制。第三方依赖和本仓库许可状态见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 贡献、声明与许可

提交前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。安全问题按 [SECURITY.md](SECURITY.md) 私下报告，不要在公开 Issue 中放入个人信息、合同、案件材料、密钥或漏洞利用细节。

LegalHigh 仅用于法律信息检索、研究和软件工程验证。任何输出均可能不完整、过期或错误；正式使用前请核对有权机关最新发布文本，并就具体事项咨询具备相应资格的专业人士。

本仓库当前未附开源许可证，因此未授予复制、修改、分发或商业使用代码的许可。法律文本、裁判文书及第三方材料的权利和使用条件分别由其来源决定。
