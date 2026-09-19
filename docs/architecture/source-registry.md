# Source Registry（来源治理）

**数据**：`server/data/source_registry.json`（14 来源）。**机械检查**：`test_architecture_invariants.py::test_source_registry_covers_corpus`——语料 source 域名与案例 host 必须全部落在 approved 来源；`test_reference_only_never_a_build_source`——参照库（lttxzmj）永不作构建源。**服务层**（R164）：`app/source_registry.py` fail-closed 校验（schema_version/权威等级枚举/id 唯一/approved 必为布尔，任一不满足即 ValueError→500）+ 公开只读端点 `GET /api/sources`，数据源页消费为「来源登记册」区块。

## 权威等级（authority_class）

| 等级 | 含义 | 例 |
|---|---|---|
| OFFICIAL_PRIMARY | 官方一手 | flk.npc.gov.cn、court.gov.cn、gov.cn、cac.gov.cn |
| OFFICIAL_REPRINT | 官方媒体受权转载 | politics.people.com.cn（仅「受权发布」栏目） |
| COMMUNITY_TRANSCRIPTION | 社区转录（grade 降【中】） | zh.wikisource.org、lawtext/laws（bbbs 须经 flk API 独立核验） |
| REFERENCE_ONLY | 只读交叉核验，禁作构建源 | lttxzmj/chinese-law-corpus（其元数据不可信，scl 先例） |
| FOREIGN_OFFICIAL | 域外官方法源（比较研究） | tile.loc.gov、bailii.org |

## 访问纪律（LEGAL-005/006）

- 只读、按需、低频；不逆向接口、不绕反爬（全仓无绕过代码）。
- 未来任何运行时 Fetcher 只允许访问本表 approved=true 来源；`compliance.approved != true` 即拒绝运行。
- 已知被拦先例如实登记：flk DOCX 直连下载（食品安全法 2025 强级直证待补 pending_note）。

## Canary（Source Drift 监控，R164）

`server/scripts/source_canary.py` 对携带 `canary`（url+expect 标记）的 approved 来源做只读结构指纹检测：HTTP 200 + 标记齐全 + 体积档位（4KB 分档，±1 档容忍）与 `source_canary_state.json` 基线相比无突变；异常报 SOURCE_DEGRADED（停止刷新、保留已验证快照、生成 parser repair 任务），永不写语料。网络走 curl 子进程（Python 零网络导入，与 ARCH-001 同口径）。显式手动运行；canary 增删走人工审批。首跑教训：canary 标记必须先人工核实目标页当前文案再入表（gov_cn 标记初选错误造成误报 DEGRADED，站点本身健康）。
