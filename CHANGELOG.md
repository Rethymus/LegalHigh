# Changelog / 更新记录

## Unreleased

### Added / 新增

- Corpus expansion (S2-T1): Public Security Administration Punishments Law (2025 revision, 144 articles), Minor Protection Law (2024 amendment, 132 articles) and Women's Rights Protection Law (2022 revision, 86 articles) from official republication snapshots, grade 【强】; gold set extended by 16 cases (5 lexical-gap rewordings recorded); version registries for all three. Controlled corpus: 17 instruments / 2,742 provisions (2026-09-13).
- Deterministic evaluation metrics (S2-T2): abstention-correct rate (5 out-of-corpus probes) and citation entity completeness (four required fields), both live in `/api/evals`; law-version registry API `GET /api/laws/{id}/versions` (S2-T4 PoC) with corpus-selfcheck integration.
- Accessibility probe `qa_a11y.mjs` (WCAG 2.2 AA subset: 24px target size, focus not obscured) wired as QA gate 7; performance budget gate in `qa_gates` (gate 6); corpus freshness SOP; CHANGELOG link checker.
- In-app usage guide `/guide` (three views) reusing the README media pool.

### Fixed / 修复

- OWASP LLM Top-10 (2025) gaps: prompt-injection probe suite in `llm_eval`, outbound personal-information scanning (counts only, never echoes values), per-actor daily call quota (`LH_AI_DAILY_LIMIT`, 429).
- Local pre-commit now runs oxlint (aligned with CI Gate 2); performance-budget gate skips cleanly when no dist exists (Pages workflow).
- Motion-probe assertion count corrected to the real 11 (a previously logged "20" never landed in git history); README quality table updated.

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
- Pages uses hash routes (`#/laws/...`) so shared links and refreshes request the real index document instead of a 404 fallback.

### Verification / 验证

- Local backend: 182 tests passed; build and lint passed; discipline 5/5; contrast 32/32.
- [48-route local browser report](docs/qa-evidence/goal-2026-09-08-auth/report.json) and [professional commentary report](docs/qa-evidence/goal-2026-09-08-expert/report.json).
- [Corpus selfcheck](docs/qa-evidence/corpus_selfcheck_2026-09-08.json). These results cover listed engineering assertions, not legal correctness or full legal-system coverage.
- Cloud run results: [QA](https://github.com/Rethymus/LegalHigh/actions/workflows/qa.yml), [Pages](https://github.com/Rethymus/LegalHigh/actions/workflows/pages.yml).

### Upgrade and limits / 升级与限制

Back up local SQLite before upgrading. Restore that backup when rolling back legacy draft migrations. 本次附件不包含桌面安装器；三平台签名、安装、卸载与升级验收仍未完成。Pages has no backend, online AI or user-material upload service. No production filing or legal-services authorization is claimed.

## v1.0.0 — 2026-09-01

Historical initial distribution. Its installers do not include the later audit fixes. The original “formal release” / “zero hallucination” descriptions are not current quality guarantees. See v1.1.0-rc.1 for the present scope and limitations.
