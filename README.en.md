<div align="center">
<a name="readme-top"></a>

# LegalHigh (English)

**A local-first legal-information and document-assistance prototype: evidence snapshots → deterministic retrieval → citation binding → human review → audit trail**

**English** · [简体中文](README.zh-CN.md) · [Project home](README.md) · [Security policy](SECURITY.md) · [Contributing](CONTRIBUTING.md) · [Changelog](CHANGELOG.md) · [v1.1.0-rc.1 prerelease](https://github.com/Rethymus/LegalHigh/releases/tag/v1.1.0-rc.1) · [Static statute browsing](https://rethymus.github.io/LegalHigh/)

</div>

## Contents

<div align="center">

[Installation & editions](#installation--editions) · [Who it serves](#who-it-serves-how-to-use-it) · [Interface gallery](#interface-gallery) · [Core workflows](#core-workflows) · [Actual capabilities](#actual-capabilities) · [What cannot be claimed](#what-cannot-be-claimed) · [Data & evidence discipline](#data-and-evidence-discipline) · [Local development](#local-development) · [Quality gates](#quality-gates) · [Architecture & security boundary](#architecture--security-boundary) · [References](#open-source-projects-and-papers) · [Contributing, disclaimer & license](#contributing-disclaimer--license)

</div>

> [!IMPORTANT]
> LegalHigh is not a law firm. It does not practise law, does not provide legal advice, and does not predict case outcomes. Any high-risk output must be independently reviewed outside the platform by someone authorised and qualified; the platform only records the local user's own review and finalisation progress and never verifies credentials or issues documents.

## Installation & editions

For plain statute reading, use [GitHub Pages](https://rethymus.github.io/LegalHigh/) — a static site with browsing and product information only. The full retrieval, fact preparation, contract review, drafting, professional commentary and optional AI features require running the Python backend locally as described in [Local development](#local-development). Releases ship source plus a static-site ZIP with SHA-256 checksums; the static ZIP is not a desktop installer. v1.1.0-rc.1 is a prerelease; three-platform signed-installer verification is incomplete. The old v1.0.0 does not contain subsequent fixes.

Before upgrading, back up the local SQLite database, save model configuration and stop the old service; reinstall dependencies from the new lock files, then restart. Legacy verified/issued drafts migrate to reviewed/finalized, which records only the local user's progress, not platform issuance. To roll back, use the pre-upgrade database backup and never let the old build read a migrated database directly.

## Who it serves, how to use it

On first launch the full application requires an explicit local view choice; no default audience is assigned silently and no name is collected. You can switch later in Settings → usage view. Statute and case search are available in all three views. Source research, study and comparative-law tools appear by purpose; contract review, document drafting, the professional workspace and the audit log appear only in the Professional Lawyer view — direct URL entry is blocked by the view gate. "Professional Lawyer" is a UI-purpose choice, not an account, credential or organisational verification.

- **General public**: record the cause, timeline, current outcome, people involved, materials, claims and questions in the six-step fact-and-evidence preparation flow. The system retrieves traceable sources solely from your own statements and returns fact-backed provisional issue directions plus missing-material checklists; it does not classify the case automatically and never defaults to a single claim model. Results live on the page only and can be exported as JSON to bring to legal aid or a lawyer.
- **Law students**: practise fact-to-norm analysis with real-source statutes, verified cases, citation chains and documented retrieval gaps; foreign cases are always presented as a separate layer from PRC legal grounds.
- **Professional users**: run local rule checks on fees, accounts and liability clauses with annotation state and audit records, and generate lawyer-letter, contract and litigation drafts from fixed templates. Firm, lawyer and licence fields are filled in by the user; the platform neither verifies them nor substitutes for a qualified person's review or issuance.

The project does not build lawyer onboarding, referrals, online consultation or platform issuance. It is a legal-literacy and fact-preparation tool before professional legal aid, and an inspectable research/review/drafting assistant for professionals and students.

## Interface gallery

<div align="center">

Captured 2026-09-09 against a real backend with an isolated throwaway database.

</div>

<p align="center"><b>Home (light)</b> · <b>Home (dark)</b></p>
<p align="center"><img src="docs/readme/hero-light.png" alt="Home light" width="48.8%"> <img src="docs/readme/hero-dark.png" alt="Home dark" width="48.8%"></p>

<div align="center">

<sup>▲ Home · Professional Lawyer view (light / dark)</sup>

</div>

<p align="center"><b>Fact & evidence preparation</b> · <b>Statute search</b> · <b>Law detail (evidence fields)</b></p>
<p align="center"><img src="docs/readme/needs.png" alt="Needs" width="32.5%"> <img src="docs/readme/search-results.png" alt="Search" width="32.5%"> <img src="docs/readme/law-evidence.png" alt="Law detail" width="32.5%"></p>
<p align="center"><b>Case search (source + grade)</b> · <b>Contract review</b> · <b>Professional workspace</b></p>
<p align="center"><img src="docs/readme/case-detail.png" alt="Case detail" width="32.5%"> <img src="docs/readme/contract-review.png" alt="Contract review" width="32.5%"> <img src="docs/readme/workspace.png" alt="Workspace" width="32.5%"></p>

<details>
<summary><kbd>Expand all screenshots</kbd> (12 more · 3 dark · 3 at 390×844)</summary>

<p align="center"><b>Claim-element check</b> · <b>Statute browse</b> · <b>Foreign precedent (layered)</b></p>
<p align="center"><img src="docs/readme/case-analysis.png" alt="Case analysis" width="32.5%"> <img src="docs/readme/laws-browse.png" alt="Laws browse" width="32.5%"> <img src="docs/readme/case-foreign.png" alt="Foreign case" width="32.5%"></p>
<p align="center"><b>Legal research</b> · <b>Comparative law</b> · <b>Learning centre (student view)</b></p>
<p align="center"><img src="docs/readme/research.png" alt="Research" width="32.5%"> <img src="docs/readme/comparative.png" alt="Comparative" width="32.5%"> <img src="docs/readme/learning.png" alt="Learning" width="32.5%"></p>
<p align="center"><b>Document drafting</b> · <b>Contract library</b> · <b>Data & evidence sources</b></p>
<p align="center"><img src="docs/readme/draft.png" alt="Draft" width="32.5%"> <img src="docs/readme/contracts.png" alt="Contracts" width="32.5%"> <img src="docs/readme/data-sources.png" alt="Data sources" width="32.5%"></p>
<p align="center"><b>Operation audit</b> · <b>Settings</b> · <b>Collections</b></p>
<p align="center"><img src="docs/readme/audit.png" alt="Audit" width="32.5%"> <img src="docs/readme/settings.png" alt="Settings" width="32.5%"> <img src="docs/readme/collections.png" alt="Collections" width="32.5%"></p>
<p align="center"><b>Search results (dark)</b> · <b>Law detail (dark)</b> · <b>Workspace (dark)</b></p>
<p align="center"><img src="docs/readme/dark-search-results.png" alt="Dark search" width="32.5%"> <img src="docs/readme/dark-law-detail.png" alt="Dark law" width="32.5%"> <img src="docs/readme/dark-workspace.png" alt="Dark workspace" width="32.5%"></p>
<p align="center"><b>Narrow · home</b> · <b>Narrow · search</b> · <b>Narrow · law detail</b></p>
<p align="center"><img src="docs/readme/narrow-dashboard.png" alt="Narrow home" width="26%"> <img src="docs/readme/narrow-search-results.png" alt="Narrow search" width="26%"> <img src="docs/readme/narrow-law-detail.png" alt="Narrow law" width="26%"></p>

</details>

Motion serves real product interactions only: toasts, dialogs, segmented controls, switches, lists and scroll navigation are covered by headless-browser behaviour probes; reduced motion, keyboard focus, contrast and motion duration are QA-gated. No internal design-spec or component-showcase page is exposed to end users.

## Core workflows

<div align="center">

The demo GIFs below were recorded 2026-09-09 against the real frontend and backend (isolated throwaway database); each ends on an actual result state.

</div>

<div align="center">

**① Statute search → citation cards** (all views): BM25 retrieval across the 14-law controlled corpus; every hit carries source, validity and evidence grade. Summaries show programmatic statistics only — no generative model.

</div>

<div align="center">

![Search workflow](docs/readme/gif-search.gif)

</div>

<p align="center"><b>② Fact & evidence preparation (public)</b> · <b>③ Claim-element check</b></p>
<p align="center"><img src="docs/readme/gif-needs.gif" alt="Needs" width="48.8%"> <img src="docs/readme/gif-case-analysis.gif" alt="Case analysis" width="48.8%"></p>
<p align="center"><sub>Left: The six-step wizard retrieves traceable sources from the user's own statements and returns provisional issue directions plus missing materials; unknowns are labelled unknown — no automatic case classification;Right: A stateless check that runs only after the user explicitly picks a direction: each element links back to the original text snippet and the current statute; it only reports "lead found / not found in text".</sub></p>

<p align="center"><b>④ Contract rule review (professional view)</b> · <b>Appearance & motion</b></p>
<p align="center"><img src="docs/readme/gif-contract.gif" alt="Contract" width="48.8%"> <img src="docs/readme/gif-theme.gif" alt="Theme" width="48.8%"></p>
<p align="center"><sub>Left: Local rule scan over fee, account and liability clauses: 16 checkpoints → Risk Inspector annotation state machine → DOCX redline export;Right: The UI follows system light/dark and reduced-motion settings; spring motion, contrast and focus rings are all QA-gated.</sub></p>

The AI plugin is off by default: requests reach a controlled remote endpoint only after explicit user configuration and authorisation, and every output passes red-line, citation-binding and audit gates; generation is withheld when the citation gate fails.

## Actual capabilities

| Capability | Current boundary |
|---|---|
| Fact & evidence preparation | Six steps record cause, timeline, outcome, people, materials and claims; every provisional direction must quote the user's own words it rests on, and unknowns are labelled unknown. Claims/questions are excluded from fact retrieval so leading content cannot pollute hits. Results are not auto-persisted; the user can export them. |
| Claim-element check | Runs only after the user explicitly selects a direction; no default loan model. Results distinguish only "lead found / not found in text", with original snippets linked to current statutes; no case-cause determination, right-establishment or outcome prediction. |
| Statute browse & BM25 search | Built from in-repo evidence snapshots; the current build is 57 laws, 6,748 base articles (6,801 entries including sub-numbered articles like 之N, as of 2026-09-16; recent additions: the Road Traffic Safety Law (2021 amendment), the Labor Law (2018 amendment), the Product Quality Law (2018 amendment), the Food Safety Law (2025 amendment), the Law on Prevention of Juvenile Delinquency (2020 revision), the Elderly Rights Protection Law (2018 amendment), the People's Mediation Law, the Advertising Law (2021), the Fire Protection Law (2021), the Drug Administration Law (2019) and the Copyright/Patent/Trademark trio (the Trademark Law being the 2026 revision effective 2027-01-01, status-marked accordingly); includes the Constitution and the Criminal Law; the priority backlog is now empty), adding NPC official snapshots of the Personal Information Protection Law, Legal Aid Law, Administrative Reconsideration Law and Administrative Litigation Law, plus the Public Security Administration Punishments Law (2025 revision), Minor Protection Law (2024 amendment) Women's Rights Protection Law (2022 revision), Administrative Penalties Law (2021 revision), the Cybersecurity Law (2025 amendment, CAC republished), the Data Security Law (2021, CAC authorized release), the Labor Dispute Mediation and Arbitration Law (2007, petition-bureau legal library), the Criminal Procedure Law (2018 amendment), the State Compensation Law (2012 second amendment), the Constitution (2018 amendment) and the Criminal Law (2023 twelfth amendment) from Wikisource/official republications. Pages expose source, snapshot date, file hash and effective/version-date evidence. The NPC catalogue as of 2026-03-16 lists 310 laws in force — the two counts use different scopes; this project is neither a complete PRC law database nor a historical-version archive. |
| Citation-bound Q&A | Deterministic retrieval returns statute-text cards; false premises are corrected only by tested rules. No hits must surface as an explicit gap. |
| Case search | Shows only records with a direct source, verification date and evidence grade. Foreign precedents serve comparative study only and are not PRC adjudication grounds. |
| Live inventory | The sidebar footer derives counts live from the controlled corpus, verified cases and approved commentary via the public read-only `/api/inventory`; it never reads reviews, drafts, complaints or audit records and shows no fabricated identities. |
| Contract review | Local rule scan over user-submitted text producing a review record, annotation state and a DOCX redline; the result is not a lawyer's review. The repository no longer ships fictional client contracts. |
| Document drafting | Drafts are generated from user input and fixed templates and pass deterministic validation. Review/finalisation progress is recorded by the local user with an explicit responsibility confirmation; the server rejects client-asserted identities. |
| AI plugin | Off by default. Requests go to a controlled remote endpoint only after explicit configuration and authorisation; custom public endpoints additionally require server-side host allow-listing. The server injects statute text, direct judicial interpretations and registered named professional-opinion summaries first, and demotes client-asserted system prompts; output is withheld if the citation gate fails. Without an independent expert gold set, accuracy shows "n/a" and only an evidence-coverage score explicitly labelled "not accuracy" is displayed. |
| Privacy & audit | SQLite local storage; sensitive export, deletion and state transitions require a server-authenticated principal. There is no multi-user account system yet, so shared public deployment is not appropriate. |

## What cannot be claimed

- There is no evidence that this project completed generative-AI service filing, algorithm filing, app-launch registration or legal-practice licensing.
- The GitHub Pages workflow builds the static statute-browsing site only and is manual-trigger only; backend contract, drafting, audit, AI and privacy endpoints never run on the static site.
- The desktop workflow only produces `unsigned-desktop-candidate-*` artefacts for manual inspection and never publishes a Release; local verification does not equal signed-installers-published verification on three operating systems.
- The local corpus is not a mirror of the national legal database; public snapshots must be re-verified against the listed sources before formal citation.
- Automated tests, retrieval evaluation and security checks prove only the assertions they cover — not that the system "never errs".

The in-app [quality transparency page](/quality) publishes live-derived metrics and dated historical records read-only.

## Data & evidence discipline

1. Raw evidence lives in `docs/research/evidence/`; `server/build_corpus.py` is the only path that produces `server/data/laws/`.
2. The build records source URL, fetch/verification date, evidence grade, source-file SHA-256, build-file SHA-256, and evidence objects for version/effective dates.
3. `server/scripts/corpus_selfcheck.py` validates structure, article numbers, hashes and date evidence. A passing machine self-check does not replace manual comparison with official texts.
4. Case digests are the project's structured paraphrase, not full judgment texts; pages always link the original source.
5. Data without explicit permission must not be copied into the product. A previously bundled LawRefBook copy (no upstream licence, unused at runtime) has been removed.
6. Professional commentary registers only named authors, verifiable credentials, source links, access dates, original project-written summaries and scope limits; full texts are not copied without reprint permission. Academic views and judicial interpretations are layered separately and never impersonate each other.

## Local development

Requirements: Python 3.12, Node.js 22 (Vite 8 compatibility baseline) and npm.

```bash
# Backend
cd server
python3.12 -m venv .venv
.venv/bin/python -m pip install --require-hashes -r requirements-dev.lock   # Windows: .venv\Scripts\python.exe
.venv/bin/python build_corpus.py
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000

# Frontend (Vite proxies /api to 127.0.0.1:8000)
cd web
npm ci
npm run dev
```

Do not bind dev servers to public addresses. Sensitive endpoints require an `LH_ADMIN_TOKEN` of at least 32 characters sent as the `X-LegalHigh-Admin-Token` header; without configuration they fail closed with 503. Audit attribution comes from the server-side `LH_ADMIN_PRINCIPAL` and cannot be self-asserted in request bodies; it identifies local operation records only — not verified identity, organisation or licence.

Desktop shell:

```bash
cd desktop
npm ci
npm run check
```

The desktop shell launches a PyInstaller sidecar with a random loopback port, a random admin token and instance proof; the renderer never receives the admin token. SQLite lives in the OS user-data directory, never inside install resources. Full packaging also needs the platform backend sidecar, so a plain source checkout cannot claim completed installer builds.

To regenerate README screenshots and GIFs (the only sanctioned media pipeline — never hand-compose imagery that misrepresents product state):

```bash
# with the backend running against a unique throwaway LH_DB_PATH:
cd web && node scripts/readme_media.mjs   # outputs docs/readme/*.png and *.gif
```

## Quality gates

Recommended on an isolated database:

```powershell
$env:LH_DB_PATH = Join-Path $env:TEMP "legalhigh-qa-$([guid]::NewGuid()).db"
server\run_tests.cmd -q
server\.venv\Scripts\python.exe server\scripts\final_verify.py
cd web
npm run build
node scripts\qa_gates.mjs
node scripts\qa_contrast.mjs --strict
node scripts\qa_motion.mjs
node scripts\qa_a11y.mjs --strict
node scripts\qa_offline.mjs
```

The last three are behavior probes (headless Chrome): motion physics, WCAG 2.2 AA subset, and a real-offline PWA acceptance (the offline probe requires `npm run build` first).

`final_verify.py` creates and cleans up its own temporary SQLite and never touches `server/data/app.db`. Visual sweeps are read-only by default; creating test records requires both `--write-e2e --isolated-db`.

Lock files split into runtime `requirements.lock`, acceptance `requirements-dev.lock` and desktop `requirements-desktop.lock`, all with versions and download hashes. Web and desktop use the committed `package-lock.json`; CI uses `npm ci`.

## MCP Server · AI assistant integration

LegalHigh's citation-bound statute retrieval is available as a **Model Context Protocol server** for any MCP client (Claude, Cursor, etc.) — zero third-party dependencies (pure stdlib stdio transport):

```bash
python server/mcp_server.py
```

Four tools: `search_articles` (BM25 full-text statute retrieval), `get_article` (single article with full metadata), `list_laws` (corpus inventory), `search_cases` (guiding cases and foreign precedents). **Retrieval only, no generative tools**; output always carries article text + metadata + official source URL, with a "not legal advice" disclaimer. HTTP endpoint `POST /mcp` also available (JSON-RPC 2.0).

## Open data

- `web/public/data/laws-md/`: full-corpus markdown export (57 instruments, one file per law, with official metadata headers), same source as `data/laws.json`.
- [llms.txt](web/public/llms.txt) / [llms-full.txt](web/public/llms-full.txt): LLM-friendly corpus index and full text.

## Architecture & security boundary

```text
evidence snapshots ──build/hash check──> statute corpus ──controlled topics/BM25──> citation cards
user text ──deterministic rules──> review/draft ──user review + responsibility──> final artefact (independent review outside the platform)
optional remote model ──red-line/citation/audit gates──> clearly-labelled AI draft
```

- The backend allows only explicitly listed local frontend origins and sets security headers and static-path boundaries.
- Custom AI URLs reject plain HTTP, hosts outside the public allow-list, private/loopback/link-local/metadata addresses; the fixed local dev endpoint may not carry user keys.
- DOCX return-uploads are bounded in size, ZIP structure and decompression volume; malformed files return 4xx.
- Favourites, browse history and research marks stay in `localStorage` with type/field validation on read; corrupt data degrades to empty collections.
- The current authentication is a single-machine admin boundary, not a tenant/user/resource-ownership model. Public deployment requires redesigning identity, sessions, authorisation, CSRF, key custody and data isolation first.

## Open-source projects and papers

These references inform method, documentation structure and evaluation design; no data or code was copied. On 2026-09-08 we additionally reviewed [CourtListener](https://github.com/freelawproject/courtlistener) (project structure, contribution and rights notes) and [docassemble](https://github.com/jhpyle/docassemble) (guided-interview positioning, documentation entry). README presentation patterns (image-led hero, collapsible galleries, GitHub Alerts) follow the public README conventions of LobeChat, Langfuse, Dub, NextChat and LawBench (checked 2026-09-09). Evidence grade: strong (official repositories); not an endorsement.

| Reference | What we took | Licence/use judgement (verified 2026-09-07) |
|---|---|---|
| [LegalBench-RAG](https://github.com/ZeroEntropy-AI/legalbenchrag) / [paper](https://arxiv.org/abs/2408.10343) | Evaluating retrieval separately from generation; deterministic gold sets | Method only, no data imported. Grade: strong (author repo/paper). |
| [LegalBench](https://hazyresearch.stanford.edu/legalbench/tasks/) | Organising tasks by legal-reasoning skill; open evaluation boundaries | Per-task licences vary; judge per task. Grade: strong (project site). |
| [LawBench](https://github.com/open-compass/LawBench) | Bilingual README navigation; knowledge/comprehension/application matrix; abstention rate as a first-class metric | Downstream data still needs per-item licence checks; we reference evaluation/docs organisation only. Grade: strong (repo). |
| [DISC-LawLLM](https://github.com/FudanDISC/DISC-LawLLM) | Retrieval augmentation for Chinese legal systems; the "cannot replace a lawyer" boundary | Apache licence; no models or data imported. Grade: strong (repo). |
| [CUAD](https://github.com/TheAtticusProject/cuad) | Expert-annotated clause taxonomy informing our fee/account/liability rule categories and gold sets | Task design only; no contract data, models or code copied. Grade: strong (author repo). |

A missing licence means all rights reserved by default; public availability is not permission to copy. Third-party dependencies and this repository's licence status are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Contributing, disclaimer & license

Please read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting. Report security issues privately per [SECURITY.md](SECURITY.md); do not put personal information, contracts, case materials, keys or exploit details in public issues.

LegalHigh is for legal-information retrieval, research and software-engineering validation only. Any output may be incomplete, outdated or wrong; verify against the latest authoritative publications and consult a qualified professional on specific matters.

This repository currently ships no open-source licence, so no right to copy, modify, distribute or commercially use the code is granted. Rights to legal texts, judgments and third-party materials remain with their sources.

<div align="center">

[« Back to top](#readme-top)

</div>
