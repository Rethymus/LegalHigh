# Source Registry（来源治理）

**数据**：`server/data/source_registry.json`（14 来源）。**机械检查**：`test_architecture_invariants.py::test_source_registry_covers_corpus`——语料 source 域名与案例 host 必须全部落在 approved 来源；`test_reference_only_never_a_build_source`——参照库（lttxzmj）永不作构建源。

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
