# 检索引擎（ADR-0001：确定性 BM25 单引擎）

**决策**：服务端 BM25（bigram 分词）为唯一检索引擎（决策2；R83 THUOCL 词典 A/B 回退 -4.16% 数据再确认）。前端禁止重建第二检索路径（C7；api_parity 门钉住）。MCP 与 HTTP 共用同一语料单例（parity 测试钉住）。

**多路形态的现状映射**：Exact/Metadata（law_id 过滤、get_article 精确取条）✅；BM25 ✅；Graph（同章 related、article_links、案例 research_refs）🟡；官方原生检索指针（needs official_entry → flk 入口）🟡；Dense/Sparse **不引入**（ADR-0001：benchmark-gated，语义检索再评估以鸿沟实录数据集为资产）。

**评测**：金标 248 组（hit@5 0.9556/MRR 0.7724），拒答正确率 1.0（5 乱码探针），引用四要素 1.0。金标纪律：语料/分词变更前必须先加金标（决策13）；改题保留真实问法形态并把鸿沟写进 note。

**已知白区**：案例按字段加权检索（Facts↔Facts）；AS_OF_DATE 时间过滤（见 temporal-model.md）。
