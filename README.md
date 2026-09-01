<div align="center">

# LegalHigh

### 让法律更有温度，让正义触手可及

**真实可溯源的法律信息检索与文书辅助系统**

[在线预览](https://rethymus.github.io/LegalHigh/) · [下载桌面版](https://github.com/Rethymus/LegalHigh/releases) · [报告问题](https://github.com/Rethymus/LegalHigh/issues)

</div>

---

## 这是什么

LegalHigh 是一个面向普通人和法律从业者的法律信息工具。它不是聊天机器人——每一条回答都绑定法条原文和官方来源链接，检索不到就明说，从不编造。

**核心理念**：模型只是引擎，系统架构决定可靠性。检索 → 引用绑定 → 人工核验 → 留痕交付，每一步都是程序化的质量关卡，不是自由生成。

## 能做什么

| 功能 | 说明 |
|---|---|
| **法条检索** | 10 部法律 2,042 条，覆盖民法典、劳动合同法、消费者权益保护法、民事诉讼法等 |
| **引用式问答** | 回答 = 命中的法条原文卡片（含法律名/条号/施行日期/来源链接），非 AI 生成文本 |
| **前提纠错** | 自动识别错误前提（如"三十日无理由退货"→ 纠正为七日并附消保法第25条） |
| **场景指引** | 5 个高频法律场景的完整路径（拖欠工资/网购退货/不签合同/押金纠纷/离职补偿） |
| **司法解释** | 合同编通则解释（69条）、网络消费纠纷规定（20条）已入库，法条页关联展示 |
| **合同审查** | 16 个审查点扫描（费用/账户/责任三类），输出风险等级 + 依据条文 + 建议改法 |
| **文书起草** | 7 种模板：律师函/合同/民事起诉状/答辩状/授权委托书/法律意见书/财产保全申请书 |
| **合规保障** | AI 内容显著标识 + 免责声明 + 投诉通道 + PIPL 数据删除/导出 |

## 使用方式

### 方式一：在线预览（无需安装）

访问 **[rethymus.github.io/LegalHigh](https://rethymus.github.io/LegalHigh/)**

> ⚠️ 静态部署的能力边界：在线预览支持法条检索、场景指引和引用式问答。合同审查、文书起草等功能需要后端服务，请下载桌面版使用。

### 方式二：桌面版（全功能）

从 **[Releases](https://github.com/Rethymus/LegalHigh/releases)** 下载对应平台安装包：

| 平台 | 文件 |
|---|---|
| Windows | `LegalHigh-Setup-1.0.0.exe` |
| macOS (Apple Silicon) | `LegalHigh-1.0.0-arm64.dmg` |
| Linux | `LegalHigh-1.0.0.AppImage` |

桌面版在本地运行全部功能，数据不出本机。

### 方式三：本地开发

```bash
# 后端（Python 3.12+）
cd server
python -m venv .venv
.venv/bin/pip install fastapi "uvicorn[standard]" rank-bm25 python-docx pytest httpx python-multipart openai
.venv/bin/python build_corpus.py
.venv/bin/python -m uvicorn app.main:app --port 8000

# 前端（Node 18+）
cd web
npm install
npm run dev          # http://localhost:5173
```

## 数据来源与可信度

| 来源 | 说明 |
|---|---|
| **法条语料** | 从维基文库证据快照构建（2026-08-29 抓取），顺序递增校验切条，机器自检 0 问题 |
| **司法解释** | 合同编通则解释（法释〔2023〕13号）、网络消费纠纷规定（法释〔2022〕8号），从维基文库快照入库 |
| **案例样本** | 仅收录可公开查证的指导案例（最高法发布），以官方文本为准 |
| **评测指标** | 检索金标 106 组，hit@5 = 0.97，MRR = 0.80（实时计算，可复现） |

## 质量保障

| 指标 | 数值 |
|---|---|
| 自动化测试 | 129 项全部通过 |
| 检索金标 | 106 组（hit@5 ≥ 0.97） |
| 审查点判定 | 58 组正反例 |
| LLM 抽样评测 | 50 题（句级引用覆盖 100%，红线词 0） |
| 安全扫描 | 高危 0 / 中危 0 |
| 无障碍 | WCAG AA 对比度 28 组合全达标 |

## 重要声明

> **⚠ AI 生成内容，可能犯错，请核查重要信息。**
>
> 本系统仅提供法律科普与信息检索，**不能替代执业律师**。输出内容不构成法律意见，请以官方发布文本为准。具体个案请咨询执业律师或拨打 **12348** 公共法律服务热线。

- AI 生成的内容会标注「AI 起草」或「AI 生成」标识
- 如发现内容存在错误或侵权，请通过 **[Issues](https://github.com/Rethymus/LegalHigh/issues)** 或系统内投诉通道联系我们，我们将及时删改
- 本项目不以律师名义执业，不提供诉讼代理服务

## 反馈与贡献

- 🐛 **发现 Bug**：[提交 Issue](https://github.com/Rethymus/LegalHigh/issues)
- 💡 **功能建议**：[发起 Discussion](https://github.com/Rethymus/LegalHigh/discussions)
- 📖 **内容纠错**：系统内「设置 → 隐私 → 投诉与纠错」通道

我们重视每一条反馈。法律信息的准确性关乎用户的切身权益——如果你发现任何错误，无论多小，都请告诉我们。

## 技术栈

**后端**：Python 3.12 · FastAPI · rank-bm25（BM25 检索）· python-docx（Word 修订）· SQLite（append-only 审计）

**前端**：React 19 · react-router 7 · Vite · 单一样式表（无 UI 框架依赖）

**桌面端**：Electron + PyInstaller（本地 sidecar）

**质量**：pytest（129 项）· GitHub Actions CI（五道门）· WCAG AA · Mimosa 安全扫描

## License

本项目仅供学习研究使用。法条内容来自公开渠道，不含任何受版权保护的原创性内容。
