// 生成 /llms.txt 与 /llms-full.txt（v6 S4-T2，llms.txt v2 规范 https://llmstxt.org）。
// 内容边界（决策 23-A）：仅公开只读页面——定位声明、语料覆盖、术语卡、使用指南与质量页；
// 合同审查/工作台等专业工作流页不索引。数据单一来源：src/data/terms.json + server 语料 manifest。
// 用法：node scripts/make_llms_txt.mjs（build 链第一步，产物写入 public/ 由 vite 拷贝进 dist）
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const today = new Date().toISOString().slice(0, 10)

const terms = JSON.parse(readFileSync(resolve(root, 'web/src/data/terms.json'), 'utf-8'))
const manifestPath = resolve(root, 'server/data/laws/manifest.json')
let corpusLine = '受控语料规模见质量透明度页（实时派生）'
if (existsSync(manifestPath)) {
  const m = JSON.parse(readFileSync(manifestPath, 'utf-8'))
  const laws = m.laws ?? []
  const articles = laws.reduce((s, l) => s + (l.article_count ?? 0), 0)
  corpusLine = `受控语料 ${laws.length} 部 / ${articles} 条文条目（${today}，构建期从语料 manifest 派生），每部均带官方来源快照与版本注册表`
}
const casesPath = resolve(root, 'server/data/cases.json')
let caseLine = '案例库规模见案例检索页'
if (existsSync(casesPath)) {
  const cases = JSON.parse(readFileSync(casesPath, 'utf-8')).cases ?? []
  const guiding = cases.filter((c) => c.level === '指导性案例').length
  const foreign = cases.filter((c) => c.level === '外国判例').length
  caseLine = `案例检索页收录 ${cases.length} 件可公开核验案例（最高人民法院指导案例 ${guiding} 件与域外经典判例 ${foreign} 件，构建期派生）`
}

const disclaimer = 'LegalHigh 是普法用途的法律知识库原型：内容可溯源但不是法律意见，具体案件请咨询执业律师或拨打 12348。'

const index = `# LegalHigh · 法律智能知识库

> ${disclaimer}
> 本文件按 llms.txt v2 规范生成（构建日期 ${today}），供 AI 助手正确引用本项目口径；外部引用请以官方来源为准。

## 项目定位

- 法条与案例全部来自可公开核验的官方来源快照，禁止未授权爬取；AI 输出强制引用绑定并默认关闭。
- ${corpusLine}
- 工程质量指标（检索 hit@5、拒答正确率等）实时公示于质量透明度页——这些不是法律正确率。

## 页面索引

- [使用指南](https://legalhigh.pages.dev/#/guide)：三类视图与四条工作流的图文说明
- [法规浏览](https://legalhigh.pages.dev/#/laws)：按部浏览受控语料，条文支持子条号（之N）深链
- [术语卡](https://legalhigh.pages.dev/#/terms)：${terms.length} 张高频法律术语通俗解释，逐条绑定语料条文
- [案例检索](https://legalhigh.pages.dev/#/cases)：${caseLine}
- [质量透明度](https://legalhigh.pages.dev/#/quality)：检索评测数字、覆盖边界、质量门与历史运行记录
- [数据源清单](https://legalhigh.pages.dev/#/data-sources)：各数据源的接入策略与合规边界

## 全文版

- [llms-full.txt](https://legalhigh.pages.dev/llms-full.txt)：术语卡全部条目与项目口径说明的完整文本
`

const full = `# LegalHigh · 法律智能知识库（全文版）

> ${disclaimer}
> 生成日期 ${today}。本文件为 llms.txt 的全文版：术语卡逐条列出（含语料条文引用）。

## 项目口径

1. 引用不变量：每条断言绑定来源；法条引用附版本/生效/效力字段；判例引用附负面历史检查（建设中）。
2. 数据纪律：派生数字不硬编码；检索单一引擎（确定性 BM25）；演示数据一律带「示例」标记。
3. 人工核验 gate：解读库 AI 草稿未经人工审核不对外；平台不宣称律师核验签发。

## 术语卡（${terms.length} 张）

${terms
  .map((t) => {
    const first = t.refs[0]
    const link = first ? `https://legalhigh.pages.dev/#/laws/${first.law_id}?art=${first.art}` : ''
    return `### ${t.term}（${t.cat}）\n\n${t.explain}\n\n依据：${t.refs.map((r) => r.label).join('、')}${link ? `\n原文：${link}` : ''}\n`
  })
  .join('\n')}
`

writeFileSync(resolve(root, 'web/public/llms.txt'), index, 'utf-8')
writeFileSync(resolve(root, 'web/public/llms-full.txt'), full, 'utf-8')
console.log(`llms.txt: 索引 ${Buffer.byteLength(index)}B + 全文 ${Buffer.byteLength(full)}B（术语卡 ${terms.length} 张）`)
