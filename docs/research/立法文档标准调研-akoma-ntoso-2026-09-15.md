# 立法文档结构化标准调研 —— Akoma Ntoso 生态（2026-09-15，R117）

> 承接 R106/R114 开源调研。本轮新方向：**立法文档机器可读格式的国际开放标准**，
> 直接关系 v7 S1 开放数据（markdown 导出之外的标准格式选型）。

## 一、Akoma Ntoso 生态（当日核验）

| 资源 | 星/状态 | 说明 |
|---|---|---|
| OASIS legaldocml TC（Akoma Ntoso 规范） | oasis-open.org 200 | OASIS 开放标准：立法/司法文档的 XML 语义标记格式，语言无关，联合国/欧盟/多国议会采用 |
| oasis-open/legaldocml-akomantoso | 84★ | OASIS TC 官方仓库：XSD schema + examples |
| laws-africa/indigo | 77★（2026-09 仍活跃） | 立法发布平台（Django），Akoma Ntoso 原生；laws.africa 用于非洲多国 |
| laws-africa/cobalt | 27★ Python | 轻量 Akoma Ntoso 文档处理库 |
| laws-africa/slaw | 28★ Ruby | 从纯文本渲染 Akoma Ntoso |
| nyaayaIN/laws-of-india | 39★ | 印度法律全文的 Akoma Ntoso XML 化实践 |
| SenatoDellaRepubblica/AkomaNtosoBulkData | 39★ | 意大利参议院批量数据 |

## 二、对本项目的适用性判定

- **适用层**：Akoma Ntoso 是「法条原文 + 结构（编/章/节/条/款/项）+ 元数据（机关/日期/版本）」的语义容器——
  与本项目语料模型（articles[].no/sub/text/chapter + 注册表元数据）概念同构。
- **不引入**：零新依赖原则 + 现有 markdown/JSON 已满足 llms/检索消费面；XSD 校验与 XML 序列化
  对当前 28 部语料是过度工程。**登记为 v7 S1 数据格式可选扩展**（若有下游消费者要求标准格式，写
  `export_akn.py` 按 cobalt 库或 XSD 直出即可，语料模型到 AKN 的映射是机械的：doc→act，articles→hierarchy）。
- **参考价值**：nyaayaIN/laws-of-india 是「把一个法域全部法律转成 AKN」的完整先例——若未来扩展
  语料规模（v7 S1 数据集增长），AKN 批量转换是现成路径。

## 三、Semantic Scholar 论文检索

api.semanticscholar.org/graph/v1 本轮调用返回空（限流/不可达），如实跳过；
法律 RAG 幻觉/引用核验论文存量已由 R90（LegalBench-RAG arXiv:2408.10343）与
R79（斯坦福 JLA 2024、Charlotin 幻觉案例库）覆盖。

## 四、可行动项

| # | 动作 | 状态 |
|---|---|---|
| 1 | Akoma Ntoso 登记为 v7 S1 数据格式可选扩展（gated on 下游需求） | ✅ 本轮登记 |
| 2 | cobalt（Python）登记为 AKN 处理候选库（若实施） | ✅ 本轮登记 |
| 3 | 现有 markdown 导出不变（llms/检索消费面已覆盖） | ✅ 维持 |
