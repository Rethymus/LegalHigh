# Changelog / 更新记录

## Unreleased

### Added / 新增

- Corpus expansion (S2-T1): Public Security Administration Punishments Law (2025 revision, 144 articles), Minor Protection Law (2024 amendment, 132 articles), Women's Rights Protection Law (2022 revision, 86 articles), Administrative Penalties Law (2021 revision, 86 articles), the Cybersecurity Law (2025 amendment, 81 articles, CAC republished text), the Data Security Law (2021, 55 articles, CAC authorized release), the Labor Dispute Mediation and Arbitration Law (2007, 54 articles, petition-bureau legal library), the Criminal Procedure Law (2018 amendment, 308 articles), the State Compensation Law (2012 second amendment, 42 articles), the Constitution (2018 amendment, 143 articles) and the Criminal Law (2023 twelfth amendment, 452 articles) — the last three via Wikisource transcription, grade 【中】; gold set extended by 56 cases (10 lexical-gap rewordings recorded); version registries for all eleven. The priority backlog is now empty. Controlled corpus: 25 instruments / 3,963 base provisions (4,016 entries including sub-numbered articles; 2026-09-14). Sub-article splitting (之N) now yields independent entries with a sub field; search dedupe and gold matching are sub-aware. Performance budget for laws.json revised 1.5→3.5MB per the documented revision protocol.
- Deterministic evaluation metrics (S2-T2): abstention-correct rate (5 out-of-corpus probes) and citation entity completeness (four required fields), both live in `/api/evals`; law-version registry API `GET /api/laws/{id}/versions` (S2-T4 PoC) with corpus-selfcheck integration.
- Accessibility probe `qa_a11y.mjs` (WCAG 2.2 AA subset: 24px target size, focus not obscured) wired as QA gate 7; performance budget gate in `qa_gates` (gate 6); corpus freshness SOP; CHANGELOG link checker.
- In-app usage guide `/guide` (three views) reusing the README media pool.
- Corpus expansion continuation (S2-T1): Anti-Domestic Violence Law (2015, 38 articles), Social Insurance Law (2018 amendment, 98 articles) and Food Safety Law (2021 amendment, 154 articles) via Wikisource transcription — controlled corpus now 28 instruments / 4,306 entries (2026-09-14); priority backlog remains empty. Version registries extended to full coverage (28/28 instruments), including multi-version timelines for the Constitution (5 versions + 5 amendments), Criminal Law (4 versions + 12 amendments), Civil Procedure Law (6 versions), Minor Protection Law (5 versions), Women's Rights Law (4 versions) and Attorney Law (5 versions); historical texts are registry-recorded only and do not enter the current retrieval corpus.
- Case library expansion (R86–R89): Supreme People's Court guiding cases 18 (last-place performance reviews are not "incompetence"), 93 (Yu Huan — defense against unlawful deprivation of liberty), 183 (year-end bonus after departure), 184 (non-compete clause extending the period by litigation time is void), 185 (regional hiring discrimination), 27 (theft vs fraud in network schemes), 38 (Tian Yong — diploma denial is justiciable) and 99 (defamation of heroes and martyrs). The case library now holds 15 records — 12 guiding cases across civil, labor, criminal, administrative and network/data domains plus 3 foreign cases for comparative study — each with full-text evidence snapshots (Wikisource transcriptions, grade 【中】) and corpus-verified statute references.
- Read-only offline shell (v6 S4-T1): installable PWA (web manifest, brand icons) with a service worker — navigation falls back to the cached shell when offline, `/api/` stays network-only (honest degradation, never fabricated), `data/laws.json` is precached with background refresh; registration is production-build only. Offline acceptance is enforced by a new QA gate 8 (`qa_offline.mjs`: real network-condition emulation over `vite preview`, 7 assertions).
- `/llms.txt` and `/llms-full.txt` (v6 S4-T2, llms.txt v2 spec): generated at build time from the term-card data source and corpus manifest so external AI assistants can cite this project correctly; all counts are derived at build time (decision 23-A: public read-only pages only).
- Process guides `/process` (v6 S4-T3): civil first-instance procedure in 8 steps and labor arbitration in 6 steps, every step bound to program-verified corpus articles (14 deep links); case-lineage navigation on `/cases` groups the library by derived domain (v6 S4-T4).
- Strict evaluation metrics (v6 S5, "evaluation 3.0"): `rank1_rate` (gold article ranked first — 68.45% vs hit@5 95.83%) and a lexical-gap subset metric derived from the 11 colloquial-phrasing gold records (hit@5 90.91%), both deterministic and published on `/quality`; monotonicity pinned by tests.
- Friendlier edges (v6 polish): synonym-writing hints on search results (e.g. 「两年」→「二年」, gap-record derived, frontend-only); case-library composition card on `/quality` (live-derived); unknown routes now render a proper 404 with search/guide entry points and the 12348 hotline instead of a silent redirect.
- AI-generated content labeling compliance (S6-T2): design document mapping the AI content labeling measures (effective 2025-09-01) onto the project's tiered AI-expansion policy (docs/compliance/AI生成内容标识合规预案-设计稿.md). Implemented so far — ① implicit metadata marks per Article 5 on contract-review DOCX exports (`category=AI-assisted`, `comments=LegalHigh AI 修订建议 · 内容编号 {review id}` linking the file to its audit trail; pinned by `test_review_docx_ai_metadata`); ② structured `drafted_by` field on article explains (existing AI-drafted entries migrated; the API normalizes a missing field to `human`) with an `AIContentBadge` component replacing the old author-string convention — a reviewer name containing "AI" can no longer mislabel, and `test_drafted_by_structured_field` pins the honest-degradation semantics.

- Public-facing content: 60 glossary cards on `/terms` (each bound to a program-verified corpus article with deep links, covering every citizen-facing instrument in the corpus); quality transparency page `/quality` publishing live retrieval metrics, dated historical runs and registry statistics; search results carry source-grade badges and provenance links; THUOCL legal-lexicon BM25 A/B experiment recorded as a negative result (bigram tokenization retained).

### Fixed / 修复

- OWASP LLM Top-10 (2025) gaps: prompt-injection probe suite in `llm_eval`, outbound personal-information scanning (counts only, never echoes values), per-actor daily call quota (`LH_AI_DAILY_LIMIT`, 429).
- Local pre-commit now runs oxlint (aligned with CI Gate 2); performance-budget gate skips cleanly when no dist exists (Pages workflow).
- Motion-probe assertion count corrected to the real 11 (a previously logged "20" never landed in git history); README quality table updated.
- Glossary card count corrected to the real 60 (earlier round notes drifted to "63"); ledger numbers must come from measured output, not session memory.
- Quality page loading state de-duplicated and its stale hardcoded gold-count removed (now neutral wording; the live count renders with the metrics).
- Corpus tail decontamination (via lawtext/laws full-corpus cross-verification): 8 instruments carried source-page furniture (Wikisource copyright templates/navigation, People.cn editor footers) inside their final articles, and one law had a section-heading fragment bleeding into article text — all stripped at the build clean layer (`strip_source_furniture`), corpus rebuilt (28 instruments / 4,306 entries unchanged), article counts and gold metrics intact.
- Law detail version-tab placeholder copy updated to match the fully-covered version-registry state (single-version laws now honestly read "no collected historical versions" instead of "registry pending").

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
