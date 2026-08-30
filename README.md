# LegalHigh

便民、惠民的法律知识库系统原型：以**真实、可溯源**的法条为底座，提供**引用式 AI 问答**、**法律研究**、**案件分析**、**合同审查（费用/账户/责任条款 + 律师管理批注留痕）**与**文书起草（律师函/合同/诉讼文书，实务格式排版、生成即可交付）**。

> 核心理念：**模型只是引擎，harness 决定可靠性**——检索 → 引用绑定 → 人工核验 gate → 批注签发 → 留痕交付，每一步都是带程序化 gate 的工作流，不是聊天。这套流水线在 UI 上是**一等公民**（首页「打开黑盒」活体证据链），不是藏在代码里的实现细节。
>
> 设计语言 **「纸与玻璃」Paper × Glass**（`docs/design/设计理念v2-纸与玻璃.md`）：纸=法（暖纸色、墨色、宋体衬线、印章红、法典版式、竖排格言），玻璃=AI（材质层、accent 蓝、mono 数据声音）。朱砂印泥红只用于效力语义（签发章/高险/人工节点）；宋体标题 × mono 数据同屏即「法与 AI 的碰撞」本身。内置**大字模式**（适老化，localStorage 持久）与明暗双模式（纸/墨）。
>
> **自适应架构 v3**（`docs/design/设计规格v3-自适应架构.md`）：一套语言、两种形态——桌面（≥768px）保持顶栏导航 + 双栏文书布局；窄屏（<768px，`html[data-sizeclass=narrow]`）切换为**应用母语**：底部玻璃标签栏（问答/研究/分析/审查/起草 + 更多 BottomSheet）、主 CTA 进**底部动作栏**（拇指区）、选择器降为 **BottomSheet**、44pt 触摸目标、16px 输入（防 iOS 缩放）、`env(safe-area-inset)` 避让刘海/Home Indicator、`theme-color` 随主题。依据 Apple HIG（size classes/大标题折叠/触摸目标/安全区）与移动 Web 框架实践（Framework7 18.7k★、ant-design-mobile 12k★、Ionic 52.6k★，GitHub 2026-08-29 实测）。
>
> **控件层 v4：腾讯 TDesign**（`docs/design/设计规格v4-TDesign组件库.md`）——不再手搓控件：`tdesign-react` 1.18（`Tencent/tdesign` 4.0k★ 企业级设计系统，npm 活跃维护）承担全部表单控件/表格/弹窗，经 `td-bridge.css` 主题桥映射到「纸与玻璃」token（`--td-brand-color→--accent`、`--td-bg-color-*→paper 系`、`--td-text-color-*→ink 系`），`theme-mode` 属性与 `data-theme` 双属性同步。身份组件（DocHeader/EvidenceChain/Stamp/CitationCard/Masthead/移动壳层）保留。已知适配：TDesign 插件通道（MessagePlugin/DialogPlugin）与 React 19 不兼容，反馈层以树内 `notify`+ToastHost、核验 gate 以声明式 `<Dialog>` 实现（`components/toast.tsx` 注记）。

## 快速开始

```bash
# 后端（Python 3.12，首次需安装依赖）
cd server
python -m venv .venv
.venv/Scripts/pip install fastapi "uvicorn[standard]" rank-bm25 python-docx pytest httpx python-multipart   # Windows
# Linux/macOS: .venv/bin/pip install ...
python build_corpus.py          # 从证据快照构建法条语料（幂等）
.venv/Scripts/python -m uvicorn app.main:app --port 8000

# 前端（Node 18+；开发模式）
cd web && npm install && npm run dev    # http://localhost:5173，API 代理到 8000
# 生产模式
npm run build                            # 产物 web/dist，由后端 8000 端口直接托管（SPA 回退已内置）
```

启动后访问 `http://127.0.0.1:8000`（生产）或 `http://localhost:5173`（开发）。

```bash
# 测试与评测（39 项自动化测试，含检索金标 gate 与案件分析红线自检）
cd server && .venv/Scripts/python -m pytest tests -q
```

## 功能总览

| 模块 | 路由 | 说明 |
|---|---|---|
| 引用式问答 | `/qa` | BM25 检索 7 部法规 1,647 条，回答=命中条文原文卡片（法律名/条号/施行日期/来源链接）；**错误前提自动纠正**（如「三十日无理由退货」→ 纠正为七日并附消保法25条）；检索不到明说，不生成 |
| 法律研究 | `/research` | 三组查询扩展检索（原句/关键词/编章扩展）→ 结构化研究备忘录（问题界定/法律框架聚类/相关条文/诚实缺口）→ **一键下载 DOCX 研究报告**（含参考依据附录表，全程溯源） |
| 案件分析 | `/case` | 三视角分析用户粘贴的案情文本（**无状态**，不落库）：① 当事人人像（角色/线索/主张抗辩承诺违约行为/时间线，全带原文片段）② 沟通行为模式分析（六指标分级 + 证据片段，**固定非心理学诊断声明**）③ 请求权要件矩阵（4 类模型：民间借贷/违约责任/消费欺诈/劳动报酬；每要件=状态+证据片段+依据条文全文）→ 案件分析报告 DOCX |
| 合同审查 | `/review` | 14 个审查点（费用/账户/责任三类，范式对齐 CUAD），输出【风险等级\|位置\|依据条文\|建议改法】；律师逐条采纳/修改/驳回，全部操作写入 append-only 审计日志 |
| 文书起草 | `/drafting` | 律师函/合同/民事起诉状结构化模板 → 实务排版 DOCX（A4、仿宋正文、黑体标题、两字符缩进、公文式页边距）；**律师函强制双轨**：草稿（红色水印横幅）→ 执业律师核验 → 签发后才能去除警示对外发送 |
| 合规中心 | `/compliance` | 系统定位声明、大模型状态如实公示（原型未接入模型，备案号公示位留空不虚构）、合规红线清单、数据来源公示、检索评测看板（实时计算）、投诉通道（真实落库留痕） |
| 设计系统 | `/design` | Apple 风格视觉系统的可视化验收面：15 级中性色阶、语义色、五级材质、阴影四档、圆角/焦点环/字阶，明暗双模式对照 |

端到端截图见 `docs/e2e-screenshots/`（34 张：v2 设计语言 19-23 号；v3 自适应 24-28 号；v4 TDesign 组件层 29-34 号——墨模式控件/TDesign 表格与风险 Tag/核验 Dialog+玻璃 toast/朱砂核验章/朱砂签发章/浅色主题桥）。

## 数据真实性与溯源（项目铁律）

- **语料来源**：全部法条从 `docs/research/evidence/` 的原始快照构建（维基文库转写页 + 政府网公报转载页，2026-08-29 抓取，快照原件入库）。
- **构建管线**：`server/build_corpus.py` 采用**顺序递增校验**切条（第 N+1 条必须紧跟第 N 条，交叉引用不误切）+ 标题行分类提取编/章上下文；7 部法律条数与预期一致（民法典 1260 / 消保法 63 / 劳动合同法 98 / 律师法 60 / 电商法 89 / 消保条例 53 / 生成式AI办法 24）。
- **三源交叉核验**：调研期间曾预设「消保法 83 条」，经维基文库/LawRefBook/gov.cn 三源核对实为 **63 条**——已更正并记录于 `docs/research/开源与论文调研核验-2026-08-29.md` §四（这正是「不编造」纪律的价值实证）。
- **证据分级**：【强】官方原文一手抓取（gov.cn/court.gov.cn/Charlotin 数据库）；【中】忠实转写层（维基文库，已经多源交叉 + 关键条文内容核对）；正式发布前应与国家法律法规数据库（flk.npc.gov.cn）逐条人工比对。

## 评测 harness（真实、可复现）

- 金标集：`server/tests/gold/gold_retrieval.json`，30 组「问题 → 应命中条文」（逐条与语料原文核对后标注）。
- 当前指标（实时计算，可在合规中心查看）：**hit@5 = 93.3%，MRR = 0.800**（条文级口径；LegalBench-RAG 为字符级 span 口径，见 `docs/plan/开发计划.md` §四）。
- 回归门：pytest 断言 hit@5 ≥ 0.90、MRR ≥ 0.70，语料完整性、审查规则、状态机、DOCX 生成共 19 项测试。

## 合规红线（硬约束，映射见开发计划 §六）

不以律师名义执业、不提供诉讼代理（律师函=AI 草稿+律师核验签发双轨）；输出不构成法律意见；内容责任不转嫁（引用不变量：无引用不渲染）；投诉通道真实可用；不虚构备案号与评测成绩；禁止未授权爬取（语料仅来自白名单快照源）。

## 目录结构

```
docs/
  research/            # 深度调研报告 + 开源/论文/法规核验 + evidence/ 证据快照
  plan/                # 开发计划（架构/里程碑/合规映射/评测）
  design/              # 视觉系统规范（Apple 风格 token 参数表）
  e2e-screenshots/     # 端到端验证截图（明暗双模式）
server/
  build_corpus.py      # 证据快照 → 结构化法条语料
  lib/textparse.py     # 纯文本解析（中文数字/清洗/顺序切条）
  app/                 # FastAPI：corpus/qa/review/storage/drafting/docxgen
                       #        research+research_report（法律研究）
                       #        legalmodel/profiling/behavior/case_analysis+case_report（案件分析）
  data/laws/           # 生成的语料 JSON（带溯源元数据）
  tests/               # pytest（39 项）+ 金标集
web/
  src/                 # v6 多路由应用（22+ 独立页面 Frame + AppShell + 单一 global.css；真实 API 驱动）
  scripts/qa_shots.mjs # 无头 Chrome CDP 视觉巡检（29 路由截图 + console/网络错误报告，产出 docs/qa-evidence/）
  src-legacy-v1/       # v4 全功能前端存档（TDesign + server API 接线 + v3 自适应形态；窄屏移植时的参考实现）
```

## 当前状态与下一步

- **2026-08-29（第一轮）**：完成外部核验调研（16 开源仓库 / 10 论文 / 7 部法规）→ 开发计划 → 原型 M1-M3：四模块全交互、19/19 测试绿、浏览器端到端截图核验通过。
- **2026-08-29（M4 轮）**：按 `docs/plan/M4-任务分解-研究与分析平台.md` 以三 agent 顺序分派实施「法律研究 → 报告生成 → 案件人像/行为/法律建模」完整流程；39/39 测试绿；新增端点与页面全部经浏览器端到端实测（截图 12-18 号）；两份 DOCX（研究报告 40KB / 案件分析报告 42KB）验证有效且含参考依据附录。
- **2026-08-29（UI v2 轮）**：GitHub 设计系统调研（shadcn/Ant Design/Inter/Geist 实测）+ 四学科反思 → 设计语言 v2「纸与玻璃」（`docs/design/设计理念v2-纸与玻璃.md`）→ 三 agent 顺序实施（基座 token/组件 → Home 重构 → 七页适配）；首页重构为报头+宣言+活体证据链+法典目录，全站 DocHeader/EvidenceChain/CitationCard v2/状态印章/大字模式落地；截图 19-23 号验收。
- **2026-08-29（v3 自适应轮）**：深度调研（Apple HIG 数值 + Ionic 52.6k★/Framework7 18.7k★/ant-design-mobile 12k★ 实测）→ `docs/design/设计规格v3-自适应架构.md` → 两 agent 实施：壳层（尺寸类系统/底部标签栏/底部动作栏/BottomSheet/安全区/触摸目标）+ 八页移动形态；主会话集成修复 BottomSheet Portal（材质 backdrop-filter 包含块陷阱）与语料 [编辑] 残留；390×844 与 1440×900 双形态验收（截图 24-28 号），39/39 测试保持绿。
- **2026-08-29（v5 重构轮）**：按创始人提供的新原型设计图「一比一精准复刻」彻底重构前端为 **LawEdge AI 桌面工作台**（`web/src`：React 19 手写组件 + 单一 global.css，无组件库；1548px 设计幅面 + fit-scale 小视口等比整幅呈现；1560/1280 双视口截图比对通过，见 `docs/design/preview-*.png`）。v4 全功能版式整体归档 `web/src-legacy-v1`（含 server API 接线，后端 39 项测试不受影响）；**功能页回接新外壳列为 M5 前置任务**（页面↔API 映射见 `docs/2026-08-29-前端重构-原型复刻记录.md`）。
- 后续（见开发计划 M5+）：接入已备案大模型（登记与公示）、flk 逐条比对、Word 修订双轨批注、法条历史版本库、判例库（需授权数据）。
