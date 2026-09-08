# Changelog / 更新记录

## v1.1.0-rc.1 — 2026-09-08

Source and static-site prerelease / 源码与静态站点预发布。

### Added / 新增

- Four official NPC evidence snapshots: Personal Information Protection, Legal Aid, Administrative Reconsideration and Administrative Litigation laws. Controlled corpus: 14 instruments / 2,380 provisions.
- 具名专业解读登记与法条关联；来源、身份依据和摘要范围可追溯。Evidence coverage is explicitly not accuracy; calibrated legal accuracy remains unavailable.
- Six-step fact preparation, explicit candidate selection and audience-specific navigation. No default claim model or fictional user identity.
- Public coverage inventory and a clearly separated not-yet-imported queue.

### Fixed / 修复

- Removed runtime design-system pages and fictional contract records.
- Hardened AI output checks with server-owned citations, per-clause evidence matching and conservative outcome-language checks. These lexical checks are not semantic correctness guarantees.
- Draft transitions consistently use draft → reviewed → finalized with responsibility confirmation; the platform does not verify credentials or issue documents.
- Corrected clause rendering, local-state validation, segmented-control movement and theme-switch remounts.
- Desktop candidate packaging includes the professional-commentary and corpus-coverage registries.

### Verification / 验证

- Local backend: 182 tests passed; build and lint passed; discipline 5/5; contrast 32/32.
- [48-route local browser report](docs/qa-evidence/goal-2026-09-08-auth/report.json) and [professional commentary report](docs/qa-evidence/goal-2026-09-08-expert/report.json).
- [Corpus selfcheck](docs/qa-evidence/corpus_selfcheck_2026-09-08.json). These results cover listed engineering assertions, not legal correctness or full legal-system coverage.
- Cloud run results: [QA](https://github.com/Rethymus/LegalHigh/actions/workflows/qa.yml), [Pages](https://github.com/Rethymus/LegalHigh/actions/workflows/pages.yml).

### Upgrade and limits / 升级与限制

Back up local SQLite before upgrading. Restore that backup when rolling back legacy draft migrations. 本次附件不包含桌面安装器；三平台签名、安装、卸载与升级验收仍未完成。Pages has no backend, online AI or user-material upload service. No production filing or legal-services authorization is claimed.

## v1.0.0 — 2026-09-01

Historical initial distribution. Its installers do not include the later audit fixes. The original “formal release” / “zero hallucination” descriptions are not current quality guarantees. See v1.1.0-rc.1 for the present scope and limitations.
