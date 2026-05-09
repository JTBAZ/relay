# Relay Pilot Build Plan

**Version:** 0.1  
**Last updated:** 2026-05-08  
**Audience:** agentic coding runs, Airtable (Phases → Runs → Work items), human pilot owners  

**Pilot cohort & success metrics:** 2026-05-08 — [canonical definition & outcomes](#pilot-cohort-success-metrics).

**Primary references:**

- Strategic narrative & workstreams: [road map.md](../road%20map.md)
- Packaging, COGS, operational milestones M1–M5: [monetization-scheme-infrastructure-plan.md](../monetization-scheme-infrastructure-plan.md)
- Machine dependency graph (regenerate): `node scripts/relay-dependency-audit.mjs` → [relay_audit.json](../relay_audit.json), [audit/dependency_report.md](../audit/dependency_report.md)
- Sync hardening context: [docs/part1-sync-hardening-ledger.md](part1-sync-hardening-ledger.md)
- DB verification: [docs/database/M10_VERIFICATION.md](database/M10_VERIFICATION.md)

<a id="pilot-cohort-success-metrics"></a>

## Pilot cohort & success metrics

*P0-base-001 — canonical store for cohort definition and measurable pilot outcomes (Airtable **Pilot Build Plan** points here).*

**Definition.** The Relay pilot is a bounded (~two-month) production exercise with a small cohort of Patreon-backed creators and their patrons. It proves end-to-end value for **Part 1** (creator OAuth, ingest, Library, Designer and public projection, export/R2, creator-visible sync health, and the **P5a** analytics / action-center MVP) and a **thin Part 3** patron feed (Relay account + Patreon link, honest entitlement and degradation UX), without blocking on Part 2 clone campaigns, Stripe live checkout, or audience monetization features deferred in this doc.

**Measurable outcomes (pilot scale; adjust targets with product sign-off):**

1. **Creators onboarded:** At least **5** creators complete Patreon creator OAuth, reach a published public layout, and do so without routine engineering intervention for the documented happy path (scaled from full-road-map “10 creators” per P9 exit checklist).
2. **Patrons active:** At least **25** patron Relay accounts link Patreon OAuth and use the unified feed shell (empty/degraded states are acceptable if documented; fraud or blocking bugs are not).
3. **Sync trust surfaced:** Library (or equivalent) shows Patreon sync health (green/yellow/red or equivalent) with operator-facing copy; creators can tell when import/sync is degraded (P5).
4. **Security baseline:** No **new** P1-class security regressions during the pilot window (cross-tenant access, patron mutating creator assets, broken signed-URL assumptions—see P8 items).
5. **Build & test bar:** Repo **`npm run build`**, **`npm run test`**, **`web`** lint + build per [AGENTS.md](../AGENTS.md) / `.docs/anthropic/BUILD_BRIEF.md`; add **`verify:pilot`** when P9-test-001 lands—pilot promotion branch stays green on that script.

---

## How to use this doc in Airtable

| Field | Value |
| --- | --- |
| **Phase** | Top-level heading here (e.g. `P1 — Durable jobs`) |
| **Run** | Optional sprint label you assign (e.g. `Sprint-A-queue`) |
| **Work item ID** | Stable ID from each `P{n}-{slug}-{nnn}` block |
| **Title** | First line under the ID |
| **Depends on** | List of other Work item IDs (must complete first) |
| **Owner skill** | `backend` \| `frontend` \| `devops` \| `qa` |
| **Exit criteria** | Bullets under **Exit** for that item |

Import: one Airtable row per work item ID; link **Depends on** as a linked record field (future) or comma-separated text in **Depends On** for agent ordering.

**Live table — Batting Order:** Base **Batting Order** (`apprid6UGT9E1KlkN`), table **Pilot Build Plan** (`tblzwAuy02t1yFOE0`). Schema includes **Work Item ID**, **Phase**, **Depends On**, **Owner Skill**, **Exit Criteria**, **Notes** (use for Code / Wiring / Retrofit / Tests when longer than a single line), **Status** (`Todo` \| `In progress` \| `Done`), **Source Doc** (optional URL), plus original **Assignee** and **Attachments**. **Imported:** **109** rows covering **P0** (`P0-base-001` … `009`) and **P1–P9** / **P5a** work items per `docs/pilot-build-plan.md` (regenerate batches with `node scripts/parse-pilot-build-plan-items.mjs .tmp-pilot-items.json` then `node scripts/split-pilot-airtable-batches.mjs`). Delete any legacy empty rows in the table if they remain from early setup.

---

## Pilot scope (authoritative)

**In pilot (target ~2 months):**

- **Part 1** — Gallery export: creator OAuth, ingest, Library, Designer/public projection, export/R2, sync health **surfaced to users**, plus a **creator Analytics / Action Center MVP** (see **Phase P5a**): Patreon API–backed membership insights, optional **Patreon Insights CSV** import for post-level impressions/seen/likes/comments Patreon does not expose on API v2, first-party Relay engagement where the gallery/visitor path is live, and a dashboard with **growth + cohort-style views** and **action-oriented** copy (full prescriptive engine is capped—see P5a experimental notes).
- **Part 3 (thin)** — Patron Network: Relay account + Patreon patron link, unified feed **shell** with honest entitlement/degraded states, **no** deep Browse ranking, **no** paid boost/premium viewer.

**Explicitly deferred (do not block pilot closure):**

- Smart Tag Assistant (road map Part 1 ledger)
- Full **Part 2** Clone / Re-Populate / email migration campaigns / Stripe live checkout for independence
- **Workstream N** audience monetization (premium/boost)
- **Full** multi-channel growth analytics arc, third-party metric scrapers, and “perfect” first-party coverage before ship
- **Relay as exclusive SoT** for Patreon impressions (API cannot supply them without CSV); do **not** block pilot on API parity with Patreon Insights
- **Deep** prescriptive co-pilot (multi-week auto calendars, one-click multi-platform distribution, vulnerability-marketing playbooks)
- Architecture doc says NestJS — **do not** rewrite Express for pilot; track as tech debt

---

## Gap inventory → Phase map

| Gap | Phase(s) |
| --- | --- |
| Road map names BullMQ + Redis; code uses in-process timers in [src/main.ts](../src/main.ts) | **P1** |
| Road map names Sentry + Pino; minimal structured observability | **P2** |
| Dependency audit: duplicate Next trees (`web/b_i0ofEW9bMcy`, `web/onboarding_enhancement`), excluded in [web/tsconfig.json](../web/tsconfig.json) | **P3** |
| Onboarding steps (Connect → Import → Organize → Publish) not enforced as one UX state machine | **P4** |
| Sync trust / degradation UX not at roadmap “creator-visible health” level | **P5** |
| Creator analytics: Patreon API gaps (e.g. impressions/seen on v2); need **ledger + CSV bridge + dashboard** beyond Patreon UI | **P5a** |
| Existing `AnalyticsSnapshotRow` / `generateSnapshot()` = **content rollups** only (posts/tiers/tags); pilot suite needs **normalized** membership, CSV post metrics, and Relay engagement tables (**P5a-db***) | **P5a** |
| Patron shell, subscription vs discovery labeling, stale-OAuth UX | **P6** |
| Monetization **M1** usage metering / billing primitives vs pilot | **P7** |
| Tenant isolation / RLS / `M10` gates for Supabase-backed pilot | **P8** |
| CI matrix & pilot-scale exit criteria vs full roadmap SLOs | **P9** |
| Audit script false positives: import-like strings in error messages (e.g. [src/patron/load-patron-relay-feed-bundle.ts](../src/patron/load-patron-relay-feed-bundle.ts)) | **P0** |
| Optional ghost deps: `patreon-dl` (removed 2026-05-08); `happy-dom` retained for Vitest DOM tests | **P0** (done) |

---

## Pilot environment checklist (inline)

Agents paste into `.env` / deployment; pilot owner verifies before cohort:

- `DATABASE_URL`, `RELAY_TOKEN_ENCRYPTION_KEY`, Patreon OAuth client IDs/secrets and redirect URIs for **creator** and **patron** flows.
- `RELAY_DB_STORE_*` flags aligned with [docs/database/migration-from-relay-data.md](database/migration-from-relay-data.md) for pilot tenant.
- Supabase: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` when identity path active.
- R2 / S3: bucket keys for media and purge worker.
- **Post P1:** `REDIS_URL` when `RELAY_JOB_BACKEND=bullmq`.
- **Post P2:** `SENTRY_DSN` (optional in dev; on in staging/pilot).
- Workers: `RELAY_AUTOSYNC_ENABLED` or `RELAY_PATREON_INCREMENTAL_AUTOSYNC_MS` (≥10000); `RELAY_NOTIFICATION_DELIVERY_MS` (`0` disables); `RELAY_ACCOUNT_DELETION_SWEEP_MS`; `RELAY_MEDIA_STORAGE_PURGE_SWEEP_MS`; patron stale refresh envs per [src/patron/patron-entitlement-stale-worker.ts](../src/patron/patron-entitlement-stale-worker.ts).

---

# Phase P0 — Baseline, audit honesty, dependency hygiene

**Purpose:** Lock pilot boundaries, fix tooling false positives, trim or document unused packages so later phases build on trustworthy signals.

**Road map / monetization alignment:** Prerequisite for all; supports honest “what’s wired” before M1 metering narrative.

**Gap closed:** Audit noise, ghost-dep ambiguity, written pilot scope.

---

### P0-base-001 — Document pilot cohort & success metrics

- **Depends on:** —
- **Owner:** qa (with product)
- **Exit:** One-paragraph pilot definition + 3–5 measurable outcomes (e.g. N creators, M patrons, zero P1 security regressions) stored in Airtable or team wiki; **linked from this doc’s header** (date + link only).

### P0-base-002 — Regenerate dependency audit baseline

- **Depends on:** P0-base-001
- **Owner:** backend
- **Exit:** Fresh `relay_audit.json` committed or attached to release tag; `brokenImports` list reviewed.
- **Code:** Run `node scripts/relay-dependency-audit.mjs` from repo root; archive output next to release notes.
- **Wiring:** None.
- **Retrofit:** None.
- **Tests:** N/A (tooling).

### P0-base-003 — Harden `relay-dependency-audit.mjs` import extraction

- **Depends on:** P0-base-002
- **Owner:** backend
- **Exit:** String literals in template errors (e.g. `getPatronFeedFixtureBundle` hint in `load-patron-relay-feed-bundle.ts`) do **not** create `brokenImports` rows.
- **Code:** In [scripts/relay-dependency-audit.mjs](../scripts/relay-dependency-audit.mjs), strip `//` and `/* */` comments before regex import scan **or** ignore matches inside quoted strings **or** only match at line-start / after `import` keyword with simpler AST-free heuristic; add unit test on a fixture file snippet if you add `tests/` for scripts.
- **Wiring:** None.
- **Retrofit:** Re-run audit; confirm single false positive eliminated.
- **Tests:** Small node test or manual: run script, assert `load-patron-relay-feed-bundle` not in brokenImports.

### P0-base-004 — Verify `patreon-dl` usage

- **Depends on:** —
- **Owner:** backend
- **Exit:** Decision recorded: remove from [package.json](../package.json) **or** document `scripts/*.mjs` usage with grep evidence in pilot notes.
- **Code:** `rg patreon-dl` across repo; if only in lockfile/package.json, remove dep and run `npm run test` + `npm run build`.
- **Wiring:** None.
- **Retrofit:** Lockfile update.
- **Tests:** CI green.
- **Logged (2026-05-08):** Removed from root `package.json` `dependencies`; `rg` shows no imports under `src/` or `scripts/` (only docs/audit/lockfile). Third-party mention retained in [docs/cookie-auth-legal-rationale.md](cookie-auth-legal-rationale.md).

### P0-base-005 — Verify `happy-dom` usage

- **Depends on:** —
- **Owner:** qa
- **Exit:** Same pattern as P0-base-004 for [package.json](../package.json) `happy-dom`.
- **Code:** `rg happy-dom` in vitest config and tests; keep if Vitest env uses it; else remove.
- **Tests:** `npm run test`.
- **Logged (2026-05-08):** Kept in `devDependencies`; Vitest uses per-file `@vitest-environment happy-dom` in `tests/web/*.test.ts(x)` (DOM hooks and RTL).

### P0-base-006 — Record Express vs NestJS technical debt

- **Depends on:** P0-base-001
- **Owner:** backend
- **Exit:** ADR-style subsection added **below this Phase** (2–5 bullets): why Express remains for pilot; when Nest evaluation happens.
- **Code:** Markdown only in this file (append “ADR: HTTP framework”).
- **Tests:** N/A.
- **Logged (2026-05-08):** Subsection **ADR: HTTP framework (Express vs NestJS)** at end of Phase P0 (after P0-base-009).

### P0-base-007 — Pilot feature flag matrix

- **Depends on:** P0-base-001
- **Owner:** devops
- **Exit:** Table-as-list in Airtable or here: flag name, default, pilot value, owner.
- **Code:** Enumerate `RELAY_*` from [.env.example](../.env.example) relevant to pilot; mark required vs optional.
- **Logged (2026-05-08):** Subsection **Pilot feature flag matrix** at end of Phase P0 (after P0-base-009).

### P0-base-008 — Smoke: `npm run build` + `npm run test` on clean clone

- **Depends on:** P0-base-007
- **Owner:** qa
- **Exit:** Documented PASS/FAIL with commit SHA; failures become new work items.
- **Tests:** CI or manual log attached.
- **Logged (2026-05-08):** **PASS** — `npm run build`, `npm run test` (root Vitest). **Code revision:** `80156e9110c78ac01f3936ee0899fe4d4d2be628` on `chore/pilot-plan-baseline` (tip immediately before the doc-only commit that adds this line; markdown-only delta does not affect compile/test).

### P0-base-009 — Cross-check `web/tsconfig.json` exclude list vs repo

- **Depends on:** P0-base-002
- **Owner:** frontend
- **Exit:** Table: each `exclude` glob → folder exists?, intended quarantine label, owner.
- **Code:** [web/tsconfig.json](../web/tsconfig.json) (`onboarding_enhancement`, `b_i0ofEW9bMcy`, etc.).
- **Retrofit:** None; feeds P3-web-002 decision.
- **Tests:** N/A.
- **Logged (2026-05-08):** See **Web `tsconfig` exclude inventory** below.

#### Web `tsconfig` exclude inventory (P0-base-009)

| `exclude` glob | Present under `web/`? | Role / label | Owner |
| --- | --- | --- | --- |
| `node_modules` | Yes (after `npm install` in `web/`) | Standard; dependencies not typechecked | — |
| `lib/__tests__/**` | Yes (`web/lib/__tests__/`) | Keep test-only TS out of Next project compilation; root **Vitest** still runs these via root `vitest.config.ts` | frontend |
| `__tests__/**` | Yes (`web/__tests__/`) | Same pattern for app-level tests | frontend |
| `onboarding_enhancement/**` | Yes | **Quarantine** (P3-web-002) — sandbox Next app; excluded from canonical compile; see [web-quarantine-trees.md](web-quarantine-trees.md) | frontend |
| `b_i0ofEW9bMcy/**` | Yes | **Quarantine** (P3-web-002) — v0 / duplicate Next tree; same | frontend |

### ADR: HTTP framework (Express vs NestJS)

- **Context:** Strategic docs mention NestJS; the shipping API is **Express** (`src/server.ts`, boot from `src/main.ts`) with existing Prisma, Patreon, Supabase, and gallery/patron routes under test.
- **Decision (pilot):** Stay on **Express** for the full pilot window. A Nest migration would be multi-sprint, high-risk, and adds no pilot-facing capability by itself.
- **Deferral:** Revisit Nest (or another structured server framework) **after pilot exit**, if the team standardizes on Nest for new services, splits the monolith, or hits maintainability limits with Express routing.
- **Until then:** Prefer **routers + shared middleware** and small modules; do **not** introduce a second HTTP framework in-process.

### Pilot feature flag matrix (`RELAY_*` and pilot-critical env)

Canonical descriptions live in [.env.example](../.env.example). **Pilot** column is the **recommended** posture for the cohort host; override with product / security sign-off.

**Core (required for a real pilot host)**

| Variable | Typical default | Pilot | Owner |
| --- | --- | --- | --- |
| `DATABASE_URL` | local Docker example in `.env.example` | Supabase **pooler** URI for the pilot project (see [M10_VERIFICATION.md](database/M10_VERIFICATION.md)) | devops |
| `PATREON_CLIENT_ID` / `PATREON_CLIENT_SECRET` | empty | Set from Patreon developer portal | devops |
| `RELAY_TOKEN_ENCRYPTION_KEY` | empty | Set (32-byte base64); required for token encryption | devops |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | commented | Set when Supabase Auth + RLS path is active (same project as `DATABASE_URL`) | devops |

**Postgres-backed stores (`RELAY_DB_STORE_*`)**

| Variable | Typical default | Pilot | Owner |
| --- | --- | --- | --- |
| `RELAY_DB_STORE_IDENTITY` | off | **On (`1`)** when identity is migrated; prerequisite for most DB paths | devops |
| `RELAY_DB_STORE_CREATOR_OAUTH` | off | **On** after OAuth credential migration when using DB token store | devops |
| `RELAY_DB_STORE_CANONICAL`, `RELAY_DB_STORE_WATERMARK`, `RELAY_DB_STORE_SYNC_HEALTH`, `RELAY_DB_STORE_OVERRIDES`, `RELAY_DB_STORE_COLLECTIONS`, `RELAY_DB_STORE_SAVED_FILTERS`, `RELAY_DB_STORE_LAYOUT`, `RELAY_DB_STORE_DLQ`, `RELAY_DB_STORE_EVENTS` | off each | **On** per store only after `prisma migrate deploy` + documented backfill for that store | devops |
| `RELAY_DB_STORE_ANALYTICS`, `RELAY_DB_STORE_PATRON_ENGAGEMENT` | off | **On** when analytics / engagement migrations applied and backfilled | devops |
| `RELAY_DB_STORE_CLONE`, `RELAY_DB_STORE_PAYMENTS`, `RELAY_DB_STORE_MIGRATION`, `RELAY_DB_STORE_DEPLOY` | off | **Off** unless Part 2 surfaces are in scope for this pilot | devops |

**Session, gates, OAuth hardening**

| Variable | Typical default | Pilot | Owner |
| --- | --- | --- | --- |
| `RELAY_COOKIE_DOMAIN` / `RELAY_COOKIE_SECURE` / `RELAY_SESSION_TTL_SECONDS` / `RELAY_COOKIE_SESSION_DUAL_WRITE` | commented / prod-oriented | Set per host: secure cookies in staging/prod; localhost omits domain | devops |
| `RELAY_CREATOR_ROUTE_SECRET` / `RELAY_ENFORCE_CREATOR_TENANT` | empty / `0` | Align with tenant/enforcement policy ([operations-and-security.md](database/operations-and-security.md)) | devops + backend |
| `RELAY_PATREON_OAUTH_STATE_SECRET`, `RELAY_EXTENSION_CONSENT_SECRET`, `RELAY_EXTENSION_ORIGINS` | empty | Set when creator OAuth / extension consent routes are live | devops |
| `RELAY_ENFORCE_CREATOR_OAUTH_BIND` | `0` | Product chooses; tighten for production | product + backend |
| `RELAY_PATREON_LINK_REQUIRE_VERIFIED_EMAIL` | `1` in example | Keep **on** unless compliance/product waives | product + backend |

**Patron freshness / workers (intervals in ms; `0` often disables)**

| Variable | Typical default | Pilot | Owner |
| --- | --- | --- | --- |
| `RELAY_PATRON_ENTITLEMENT_STALE_AFTER_MS` | 6h | Default or product-tuned | backend |
| `RELAY_PATRON_ENTITLEMENT_REFRESH_MS` / `RELAY_PATRON_ENTITLEMENT_REFRESH_BATCH` | 300000 / 20 | Enable for pilot if patron tier freshness is required | devops |
| `RELAY_AUTOSYNC_ENABLED` or `RELAY_PATREON_INCREMENTAL_AUTOSYNC_MS` | unset / commented | Set one path so incremental sync runs in production (≥10000 ms); see `.env.example` aliases | devops |
| `RELAY_AUTOSYNC_*` tuning (concurrency, pages, backoff, jitter) | various | Tune for cohort size; document non-default values in runbook | devops |
| `RELAY_NOTIFICATION_DELIVERY_MS` | default poll in worker | Set explicitly; use `0` only if notifications disabled | devops |
| `RELAY_ACCOUNT_DELETION_SWEEP_MS` / `RELAY_ACCOUNT_DELETION_GRACE_DAYS` | 1h sweep / 7d grace | Defaults usually fine; document if changed | devops |
| `RELAY_MEDIA_STORAGE_PURGE_SWEEP_MS` / `RELAY_MEDIA_STORAGE_PURGE_DELAY_MS` / `RELAY_MEDIA_STORAGE_PURGE_BATCH` | 1h / 0 / 25 | Enable when R2 purge queue is live | devops |

*Worker envs in the last block are read by `src/main.ts` and worker modules; extend root `.env.example` when gaps confuse operators.*

**R2 / uploads / Discord / export / health tuning**

| Variable | Typical default | Pilot | Owner |
| --- | --- | --- | --- |
| `R2_*` presign / bucket | empty | Required when serving Relay-native uploads or export to R2 | devops |
| `RELAY_UPLOAD_MAX_BYTES` / `RELAY_UPLOAD_ALLOWED_MIME_PREFIXES` | 500 MiB / video,audio,image | Enforce pilot limits | devops + product |
| `RELAY_DISCORD_INGEST_HMAC_SECRET` (+ optional bot token) | empty | Set if Discord capture bridge is in scope | devops |
| `RELAY_PUBLIC_WEBHOOK_BASE_URL`, `RELAY_CREATOR_DISPLAY_NAME` | empty | Set for webhook + display consistency with web | devops |
| `RELAY_EXPORT_REQUIRE_TIER_ACCESS`, `RELAY_EXPORT_*` retry | see example | Defaults unless export SLO requires tuning | backend |
| `RELAY_INGEST_*`, `RELAY_PART1A_*`, `RELAY_INSIGHT_JOB_*`, `RELAY_EXPORT_HEALTH_*` | see example | Enable thresholds when health routes are used in on-call | devops |

**Post P1 (jobs)**

| Variable | Typical default | Pilot | Owner |
| --- | --- | --- | --- |
| `REDIS_URL` | see [.env.example](../.env.example) | Set when `RELAY_JOB_BACKEND=bullmq` (Phase P1); parsed by [src/lib/redis.ts](../src/lib/redis.ts) | devops |

**Phase P0 — v0 Mandatory Assets (delta):** _None._

---

# Phase P1 — Durable jobs (Redis + BullMQ)

**Purpose:** Align runtime with road map “queue and jobs” baseline so pilot can claim multi-instance safety, retries, and drain-on-shutdown.

**Road map alignment:** Architecture baseline — BullMQ + Redis; [src/main.ts](../src/main.ts) comments already anticipate BullMQ for notifications.

**Gap closed:** In-process `setInterval` / timer workers replaced or feature-flagged behind BullMQ when Redis present.

**Current workers (migration sources):**

1. `src/patreon/incremental-sync-worker.ts` — `startIncrementalAutosyncWorker` (env: `RELAY_AUTOSYNC_ENABLED`, `RELAY_PATREON_INCREMENTAL_AUTOSYNC_MS`)
2. `src/patron/patron-entitlement-stale-worker.ts` — `startPatronEntitlementStaleRefreshWorker` (interval/batch from env)
3. `src/patron/notification-delivery-worker.ts` — `startNotificationDeliveryWorker` (`RELAY_NOTIFICATION_DELIVERY_MS`, `0` disables)
4. `src/patron/account-deletion-worker.ts` — `startAccountDeletionWorker` (`RELAY_ACCOUNT_DELETION_SWEEP_MS`)
5. `src/storage/media-storage-purge-worker.ts` — `startMediaStoragePurgeWorker` (`RELAY_MEDIA_STORAGE_PURGE_SWEEP_MS`)

---

### P1-queue-001 — Add Redis connection configuration

- **Depends on:** P0-base-007
- **Owner:** devops
- **Exit:** `REDIS_URL` documented; connection test passes in staging.
- **Code:** Add to [.env.example](../.env.example) `REDIS_URL=redis://localhost:6379`; add `src/lib/redis.ts` (or `src/jobs/redis.ts`) exporting `getRedisConnectionOptions()` using `ioredis` or BullMQ’s `ConnectionOptions`; no secrets in repo.
- **Wiring:** Read URL in worker process only (or shared bootstrap).
- **Retrofit:** None.
- **Tests:** Unit: mock URL parse; optional integration behind `SKIP_REDIS_IT=0`.
- **Logged (2026-05-08):** [.env.example](../.env.example) Redis block; [src/lib/redis.ts](../src/lib/redis.ts) (`parseRedisUrl`, `getRedisConnectionOptions`, `getRedisConnectionOptionsIfConfigured`); [tests/redis-connection.test.ts](../tests/redis-connection.test.ts) (unit + `SKIP_REDIS_IT=0` TCP/TLS probe). Staging: run worker host with Redis reachable and `REDIS_URL` set — same probe or `redis-cli -u "$REDIS_URL" ping`.

### P1-queue-002 — Add BullMQ dependencies

- **Depends on:** P1-queue-001
- **Owner:** backend
- **Exit:** `package.json` lists `bullmq`, `ioredis` (if not transitive); lockfile updated.
- **Code:** `npm install bullmq ioredis` (versions pinned per repo policy).
- **Tests:** `npm run build` passes.
- **Logged (2026-05-08):** Root [package.json](../package.json) + [package-lock.json](../package-lock.json); direct deps `bullmq`, `ioredis`; `npm run build` OK.

### P1-queue-003 — Define queue names and job payload types

- **Depends on:** P1-queue-002
- **Owner:** backend
- **Exit:** `src/jobs/queue-names.ts` (or similar) exports const enum/string union for: `patreon_incremental_autosync`, `patron_entitlement_stale_refresh`, `notification_delivery`, `account_deletion_sweep`, `media_storage_purge`.
- **Code:** TypeScript interfaces for each job `data` (min: `{ traceId?: string }` + worker-specific ids).
- **Wiring:** Imported by producers and consumers only.
- **Tests:** Typecheck.
- **Logged (2026-05-08):** [src/jobs/queue-names.ts](../src/jobs/queue-names.ts) — `RELAY_JOB_QUEUE_NAMES`, `RelayJobQueueName`, `ALL_RELAY_JOB_QUEUE_NAMES`, payload types + `RelayJobPayloadByQueue`.

### P1-queue-004 — Extract “unit of work” from incremental autosync worker

- **Depends on:** P1-queue-003
- **Owner:** backend
- **Exit:** Pure async function `runIncrementalAutosyncOnce(args)` callable from timer **or** BullMQ processor; existing `startIncrementalAutosyncWorker` delegates to it.
- **Code:** Refactor [src/patreon/incremental-sync-worker.ts](../src/patreon/incremental-sync-worker.ts) without behavior change.
- **Retrofit:** [src/main.ts](../src/main.ts) still calls `startIncrementalAutosyncWorker` when flag `memory`.
- **Tests:** Existing tests if any; add one unit test calling `runIncrementalAutosyncOnce` with mocks.
- **Logged (2026-05-08):** `runIncrementalAutosyncOnce` is the canonical pass; `runIncrementalAutosyncCycle` = alias; optional `creatorId` on [RunIncrementalAutosyncCycleOptions](../src/patreon/incremental-sync-worker.ts) for targeted BullMQ jobs; [tests/incremental-autosync-worker.test.ts](../tests/incremental-autosync-worker.test.ts); [src/autosync-once.ts](../src/autosync-once.ts) calls `runIncrementalAutosyncOnce`.

### P1-queue-005 — Extract unit of work: patron entitlement stale refresh

- **Depends on:** P1-queue-003
- **Owner:** backend
- **Exit:** Same pattern for [src/patron/patron-entitlement-stale-worker.ts](../src/patron/patron-entitlement-stale-worker.ts).
- **Tests:** Mock Prisma + Patreon client.
- **Logged (2026-05-08):** `runPatronEntitlementStaleRefreshOnce`; `runPatronEntitlementStaleRefreshCycle` = alias; optional `patronMembershipId` on [RunPatronEntitlementStaleRefreshOnceArgs](../src/patron/patron-entitlement-stale-worker.ts); [tests/patron/patron-entitlement-stale-worker.test.ts](../tests/patron/patron-entitlement-stale-worker.test.ts).

### P1-queue-006 — Extract unit of work: notification delivery tick

- **Depends on:** P1-queue-003
- **Owner:** backend
- **Exit:** `processNotificationOutboxOnce(prisma)` (or existing internal) invokable from processor; reference PE-G comment in [src/main.ts](../src/main.ts).
- **Code:** [src/patron/notification-delivery-worker.ts](../src/patron/notification-delivery-worker.ts).
- **Tests:** Cover idempotent tick with empty outbox.
- **Logged (2026-05-08):** [processNotificationOutboxOnce](../src/patron/notification-delivery-worker.ts) + `ProcessNotificationOutboxOnceOptions` (`outboxEventId` for targeted BullMQ jobs; cursor advance only when strictly after cursor); `InProcessNotificationDeliveryRunner.processOnce` delegates; [tests/patron/notification-delivery-worker.test.ts](../tests/patron/notification-delivery-worker.test.ts).

### P1-queue-007 — Extract unit of work: account deletion sweep

- **Depends on:** P1-queue-003
- **Owner:** backend
- **Exit:** [src/patron/account-deletion-worker.ts](../src/patron/account-deletion-worker.ts) refactored.
- **Tests:** Mock DB.
- **Logged (2026-05-08):** [processAccountDeletionSweepOnce](../src/patron/account-deletion-worker.ts); [listDueDeletions](../src/patron/account-deletion-service.ts) accepts optional `accountDeletionId`; [tests/patron/account-deletion-worker.test.ts](../tests/patron/account-deletion-worker.test.ts).

### P1-queue-008 — Extract unit of work: media storage purge sweep

- **Depends on:** P1-queue-003
- **Owner:** backend
- **Exit:** [src/storage/media-storage-purge-worker.ts](../src/storage/media-storage-purge-worker.ts) refactored.
- **Tests:** Mock queue + R2.
- **Logged (2026-05-08):** [processMediaStoragePurgeSweepOnce](../src/storage/media-storage-purge-worker.ts); [processMediaStoragePurgeBatch](../src/storage/media-storage-purge-service.ts) optional `purgeQueueRowId`; [tests/media-storage-purge-worker.test.ts](../tests/media-storage-purge-worker.test.ts), [tests/media-storage-purge-service.test.ts](../tests/media-storage-purge-service.test.ts).

### P1-queue-009 — Implement `RELAY_JOB_BACKEND` flag

- **Depends on:** P1-queue-004 — P1-queue-008
- **Owner:** backend
- **Exit:** `memory` (default) preserves current [src/main.ts](../src/main.ts) behavior; `bullmq` requires `REDIS_URL` and registers processors.
- **Code:** [src/relay-server-env.ts](../src/relay-server-env.ts) or new `src/jobs/config.ts` parses flag; validate at bootstrap.
- **Wiring:** [src/main.ts](../src/main.ts) branches before starting workers.
- **Retrofit:** None for default.
- **Tests:** Unit tests for parse.
- **Logged (2026-05-08):** [src/jobs/relay-job-backend.ts](../src/jobs/relay-job-backend.ts); [src/jobs/register-workers.ts](../src/jobs/register-workers.ts); [src/main.ts](../src/main.ts) branches + shutdown closes BullMQ; [.env.example](../.env.example); [tests/relay-job-backend.test.ts](../tests/relay-job-backend.test.ts). **Follow-up:** shared Redis client + worker defaults refined in **P1-queue-010** ([src/jobs/bullmq-shared.ts](../src/jobs/bullmq-shared.ts), [tests/register-workers.test.ts](../tests/register-workers.test.ts)).

### P1-queue-010 — BullMQ Queue + Worker registration module

- **Depends on:** P1-queue-009
- **Owner:** backend
- **Exit:** `src/jobs/register-workers.ts` (name flexible) creates `Worker` instances with shared connection; logs queue name on ready.
- **Code:** Use `defaultJobOptions` for `removeOnComplete`, `removeOnFail`, backoff; set concurrency per queue (configurable via env).
- **Wiring:** Called from `src/worker-entry.ts` (see P1-queue-011) **or** from [src/main.ts](../src/main.ts) when single-process pilot explicitly chosen.
- **Tests:** Mock Redis.
- **Logged (2026-05-08):** Shared [ioredis](https://github.com/redis/ioredis) `Redis` for all workers ([src/jobs/register-workers.ts](../src/jobs/register-workers.ts)); retention + producer-oriented `RELAY_BULLMQ_DEFAULT_JOB_OPTIONS` in [src/jobs/bullmq-shared.ts](../src/jobs/bullmq-shared.ts); per-queue `RELAY_BULLMQ_CONCURRENCY[_<QUEUE>]` in [.env.example](../.env.example); [tests/bullmq-shared.test.ts](../tests/bullmq-shared.test.ts), [tests/register-workers.test.ts](../tests/register-workers.test.ts).

### P1-queue-011 — Add optional `src/worker.ts` process entry

- **Depends on:** P1-queue-010
- **Owner:** backend
- **Exit:** `npm run worker` runs workers only; API runs via `npm start` without workers when split deploy.
- **Code:** New file + [package.json](../package.json) script `"worker": "node dist/src/worker.js"` (align with `tsc` outDir); document **dual-process** pilot topology.
- **Wiring:** Docker/k8s manifest snippet in `docs/pilot-deploy-notes.md` **optional** — if forbidden, document in Airtable only.
- **Retrofit:** [src/main.ts](../src/main.ts): when `RELAY_SPLIT_WORKER_PROCESS=1`, skip starting in-process loops.
- **Tests:** Smoke: worker starts without listening HTTP.
- **Logged (2026-05-08):** [src/worker.ts](../src/worker.ts); `npm run worker` ([package.json](../package.json)); [src/jobs/relay-job-backend.ts](../src/jobs/relay-job-backend.ts) `relaySplitWorkerProcessFromEnv()`; [src/main.ts](../src/main.ts) gates timers + BullMQ; [.env.example](../.env.example); [tests/worker-entry.test.ts](../tests/worker-entry.test.ts); [tests/relay-job-backend.test.ts](../tests/relay-job-backend.test.ts) split flag.

### P1-queue-012 — Producer: schedule repeat jobs for each queue

- **Depends on:** P1-queue-010
- **Owner:** backend
- **Exit:** Repeat interval mirrors current env MS semantics (normalize to cron or ms via BullMQ `repeat`).
- **Code:** Use `Queue.add` with `repeat: { every: N }` or cron; **disable** repeat when env says `MS=0` for that worker.
- **Wiring:** Producers run in API process on startup **or** one-shot “scheduler” process — **document choice**; prefer API emits schedules for pilot simplicity.
- **Retrofit:** Remove duplicate timers when `bullmq` active.
- **Tests:** Integration with test Redis.
- **Logged (2026-05-08):** [src/jobs/schedule-bullmq-repeat.ts](../src/jobs/schedule-bullmq-repeat.ts); [src/main.ts](../src/main.ts) async boot registers repeats + shared Redis for workers when in-process; env helpers on worker modules; [tests/bullmq-repeat-scheduler.integration.test.ts](../tests/bullmq-repeat-scheduler.integration.test.ts) (`SKIP_REDIS_IT=0`).

### P1-queue-013 — Graceful shutdown: drain workers

- **Depends on:** P1-queue-010
- **Owner:** backend
- **Exit:** SIGINT closes Workers with `close()`; awaits pending jobs with timeout; then Redis disconnect.
- **Code:** Extend `shutdown()` in [src/main.ts](../src/main.ts) and mirror in `src/worker.ts`.
- **Wiring:** Align with existing `notificationRunner?.stop()` pattern.
- **Retrofit:** Order: stop HTTP → stop timers → close BullMQ → prisma disconnect.
- **Tests:** Manual or integration.
- **Logged (2026-05-08):** [src/jobs/bullmq-shutdown.ts](../src/jobs/bullmq-shutdown.ts) (`RELAY_BULLMQ_WORKER_CLOSE_GRACE_MS`); [src/jobs/register-workers.ts](../src/jobs/register-workers.ts) `RelayBullMqWorkersClose`; [src/main.ts](../src/main.ts) + [src/worker.ts](../src/worker.ts) shutdown; [.env.example](../.env.example); [tests/bullmq-shutdown.test.ts](../tests/bullmq-shutdown.test.ts).

### P1-queue-014 — propagate `traceId` into job data

- **Depends on:** P1-queue-012
- **Owner:** backend
- **Exit:** Every job `data` includes optional `traceId`; processors log it (placeholder until Pino in P2).
- **Code:** When producer lacks HTTP context, generate `job_${uuid}`.
- **Tests:** Log assertion in integration test.
- **Logged (2026-05-08):** [src/jobs/relay-job-trace.ts](../src/jobs/relay-job-trace.ts); [src/jobs/register-workers.ts](../src/jobs/register-workers.ts) logs `relay-bullmq: job start`; [src/jobs/queue-names.ts](../src/jobs/queue-names.ts) `RelayJobTraceFields`; [src/jobs/schedule-bullmq-repeat.ts](../src/jobs/schedule-bullmq-repeat.ts) template note; [tests/relay-job-trace.test.ts](../tests/relay-job-trace.test.ts); [tests/register-workers-trace-log.test.ts](../tests/register-workers-trace-log.test.ts); [tests/bullmq-job-trace.integration.test.ts](../tests/bullmq-job-trace.integration.test.ts) (`SKIP_REDIS_IT=0`).

### P1-queue-015 — Idempotency review: notification outbox tick

- **Depends on:** P1-queue-006
- **Owner:** backend
- **Exit:** Written note in code or doc: two ticks cannot double-send same notification; add DB constraint test if missing.
- **Tests:** Concurrency test.
- **Logged (2026-05-08):** Partial unique index [prisma/migrations/20260508160000_notifications_nonclustered_source_recipient_unique](../prisma/migrations/20260508160000_notifications_nonclustered_source_recipient_unique/migration.sql); [src/patron/notification-service.ts](../src/patron/notification-service.ts) `P2002` handling; [src/patron/notification-delivery-worker.ts](../src/patron/notification-delivery-worker.ts) idempotency note; [prisma/schema.prisma](../prisma/schema.prisma); [tests/patron/notification-service.test.ts](../tests/patron/notification-service.test.ts); [tests/patron/notification-outbox-idempotency.test.ts](../tests/patron/notification-outbox-idempotency.test.ts).

### P1-queue-016 — Document pilot ops runbook for Redis

- **Depends on:** P1-queue-011
- **Owner:** devops
- **Exit:** “If Redis down, set `RELAY_JOB_BACKEND=memory` fallback” procedure; max memory guidance.
- **Code:** Markdown subsection under Phase P1 below fold.
- **Tests:** N/A.
- **Logged (2026-05-08):** [docs/pilot-build-plan.md — Pilot ops runbook: Redis and BullMQ](pilot-build-plan.md#pilot-ops-runbook-redis-and-bullmq) (this file).

### P1-queue-017 — CI: Redis service container for job integration test

- **Depends on:** P1-queue-012
- **Owner:** qa
- **Exit:** GitHub Actions / local doc: optional job `test:jobs` with Redis.
- **Code:** `vitest` `describe.skip` if `REDIS_URL` unset in CI without service.
- **Tests:** One happy-path job.
- **Logged (2026-05-08):** [.github/workflows/ci.yml](../.github/workflows/ci.yml) job `redis-jobs`; [package.json](../package.json) `test:jobs`; [.env.example](../.env.example) Redis / `SKIP_REDIS_IT` note.

### P1-queue-018 — Remove or gate stray `incremental-autosync-worker` duplicate

- **Depends on:** P1-queue-004
- **Owner:** backend
- **Exit:** [src/patreon/incremental-autosync-worker.ts](../src/patreon/incremental-autosync-worker.ts) either consolidated with `incremental-sync-worker` or documented as single entry; no duplicate timers.
- **Code:** Grep imports of `incremental-autosync-worker`; unify.
- **Tests:** Grep + build.
- **Logged (2026-05-08):** Removed unused re-export shim `src/patreon/incremental-autosync-worker.ts`; canonical [src/patreon/incremental-sync-worker.ts](../src/patreon/incremental-sync-worker.ts); [docs/Airtable Drops/outgoing/T-007-delta-out.md](../docs/Airtable%20Drops/outgoing/T-007-delta-out.md); [audit/dependency_report.md](../audit/dependency_report.md); [relay_audit.json](../relay_audit.json).

### P1-queue-019 — Stalled job recovery policy

- **Depends on:** P1-queue-010
- **Owner:** backend
- **Exit:** Documented `stalledInterval` / `maxStalledCount` (or BullMQ defaults) per queue; ops note when to `moveToFailed`.
- **Code:** `register-workers.ts` or queue options.
- **Tests:** Doc-only or integration with artificial stall.
- **Logged (2026-05-08):** [src/jobs/bullmq-shared.ts](../src/jobs/bullmq-shared.ts) `relayBullMqWorkerStallRecoveryOptions`; [src/jobs/register-workers.ts](../src/jobs/register-workers.ts); [.env.example](../.env.example); pilot [runbook — Stalled jobs](pilot-build-plan.md#stalled-jobs-bullmq); [tests/bullmq-shared.test.ts](../tests/bullmq-shared.test.ts).

### P1-queue-020 — Failed-job after-retry hook (dead-letter pattern)

- **Depends on:** P1-queue-010
- **Owner:** backend
- **Exit:** After N failures, job lands in `failed` with reason; optional webhook or log line for pilot on-call.
- **Code:** `Worker` `on('failed')` + Sentry breadcrumb (after P2-obs-003).
- **Tests:** Unit with mock processor throw.
- **Logged (2026-05-08):** [src/jobs/register-workers.ts](../src/jobs/register-workers.ts) Worker `failed` listener + `logBullMqJobFailed`; pilot [runbook — Final job failures](pilot-build-plan.md#final-job-failures-failed-set); [tests/register-workers.test.ts](../tests/register-workers.test.ts).

### P1-queue-021 — Redis prod checklist (TLS, ACL, memory)

- **Depends on:** P1-queue-016
- **Owner:** devops
- **Exit:** Bullet list: `rediss://` when required; maxmemory policy; key prefix `relay:pilot:` if multi-tenant Redis.
- **Tests:** N/A.
- **Logged (2026-05-08):** Pilot [runbook — Production checklist (TLS, ACL, key isolation)](pilot-build-plan.md#production-checklist-tls-acl-key-isolation); [.env.example](../.env.example) pointer; [`src/lib/redis.ts`](../src/lib/redis.ts) TLS mapping reference.

### P1-queue-022 — Bull Board / metrics dashboard (optional defer)

- **Depends on:** P1-queue-010
- **Owner:** devops
- **Exit:** Either **scoped** read-only `/admin/queues` behind IP allowlist **or** explicit “deferred post-pilot” sentence in runbook.
- **Code:** If built, separate Express mount or sidecar; never public without auth.
- **Tests:** Smoke if implemented.
- **Logged (2026-05-08):** Explicit pilot deferral — [runbook — Queue dashboard (Bull Board)](pilot-build-plan.md#queue-dashboard-bull-board).

### Pilot ops runbook: Redis and BullMQ

This subsection is the **operator-facing** companion to Phase P1. It does not replace vendor runbooks for ElastiCache, Upstash, or self-hosted Redis.

#### Production checklist (TLS, ACL, key isolation)

- **`rediss://`:** Use TLS in production when the provider requires it (ElastiCache in-transit encryption, Upstash, Redis Cloud, etc.). Relay maps `rediss:` to ioredis `tls` via [`src/lib/redis.ts`](../src/lib/redis.ts) `parseRedisUrl`. Custom CA / mTLS is vendor-specific—extend options or terminate TLS ahead of the app if needed.
- **ACL / passwords:** Prefer Redis 6+ **ACL** URLs (`username:password@host`, often with `rediss://`). Keep the full `REDIS_URL` in a secret manager; rotate credentials without committing them.
- **`maxmemory`:** Size instances so BullMQ metadata and working set rarely approach the cap. **Eviction policies** (`allkeys-lru`, …) can delete BullMQ keys and corrupt job state—see [Redis memory (pilot)](#redis-memory-pilot). **`noeviction`** avoids silent key loss but fails writes if memory is full; the safe fix is usually **more RAM** or **fewer retained jobs** (`src/jobs/bullmq-shared.ts`), not aggressive eviction.
- **Shared Redis / “multi-tenant” clusters:** Prefer a **dedicated Redis endpoint or logical DB** (`REDIS_URL` path `/0`, `/1`, …) per Relay environment so BullMQ keys do not collide with other apps. If you must share one cluster across teams, isolate at **infrastructure** (separate databases, ACL rules, VPC). An application-level BullMQ **`prefix`** (e.g. `relay:pilot:`) is **not** exposed as a `RELAY_*` env in pilot code—Queue and Worker would both need the same prefix in a follow-up change.

#### When Redis is down or unavailable

1. **Fail over to in-process jobs (break-glass):** Set `RELAY_JOB_BACKEND=memory` on the API host and **restart** the API process. Background work then uses the same in-process timers as a “no Redis” deploy (see the worker list at the top of Phase P1). Queued BullMQ jobs are **not** drained automatically—expect backlog or stuck repeats until Redis returns and you reconcile manually if needed.
2. **`RELAY_SPLIT_WORKER_PROCESS=1`:** The dedicated `npm run worker` process only consumes queues when `RELAY_JOB_BACKEND=bullmq`. During a Redis outage, that process cannot do useful work; you can stop it to reduce log noise. After Redis is healthy, restart the API (repeat **schedulers** live there) **then** workers.
3. **Returning to BullMQ:** Set `RELAY_JOB_BACKEND=bullmq`, ensure `REDIS_URL` is correct (often `rediss://` in production), restart API then workers if split.

#### Redis memory (pilot)

- **Ballpark:** Many pilots fit in **256–512 MB** `maxmemory` on a dedicated instance; scale up if `used_memory` routinely exceeds ~70% or you see evictions.
- **`maxmemory-policy`:** If you must cap memory, **`allkeys-lru`** or **`volatile-lru`** are common—but **evicting BullMQ keys can break or lose jobs**. Prefer **growing memory** or **lowering retention** over relying on eviction for BullMQ data. Completed/failed job retention is influenced by shared BullMQ options in code (`src/jobs/bullmq-shared.ts`).
- **Monitoring:** Watch **used_memory**, **evicted_keys**, and **connected_clients** (API + worker each open connections).

#### Stalled jobs (BullMQ)

Relay workers all use the same stall policy from [`src/jobs/bullmq-shared.ts`](../src/jobs/bullmq-shared.ts): **`stalledInterval`** (default **30s**) and **`maxStalledCount`** (default **1**), matching BullMQ v5 defaults.

- **What “stalled” means:** An **active** job did not heartbeat in time (crash, event-loop blocked too long, or network blip). BullMQ moves it back to **wait** for another attempt, or to **failed** after too many stalls.
- **Failure text:** `job stalled more than allowable limit` — then normal retry / `removeOnFail` retention apply (see `RELAY_BULLMQ_DEFAULT_JOB_OPTIONS`).
- **Ops:** Prefer fixing the root cause (e.g. unblock or shorten long synchronous work). Optionally raise **`RELAY_BULLMQ_STALLED_INTERVAL_MS`** (bounded in code) or **`RELAY_BULLMQ_MAX_STALLED_COUNT`** (cap 10) if jobs are falsely stalling during legitimately long work.
- **Manual intervention:** Use [BullMQ’s job APIs](https://docs.bullmq.io/) (e.g. **`moveToFailed`**) or a queue dashboard if a job is wedged in **active**; there is no separate “stalled” Redis state to clear.

#### Final job failures (failed set)

After **exhausted retries**, **stall limits**, or other permanent errors, BullMQ moves work to the **failed** list (subject to `removeOnFail` caps in [`src/jobs/bullmq-shared.ts`](../src/jobs/bullmq-shared.ts)). Every Relay worker emits **`relay-bullmq: job failed (final — …)`** via the Worker **`failed`** event so on-call can grep logs (queue, `jobId`, `traceId`, `failedReason`, `attemptsMade`). **P2-obs-003:** wire the same hook to Sentry.

#### Queue dashboard (Bull Board)

**Pilot decision:** Relay does **not** ship an in-process **Bull Board** (or other queue UI) on the API. There is **no** `/admin/queues` route in pilot builds—avoids exposing queue metadata without a full auth + network story.

**Until post-pilot:** Rely on **structured logs** (e.g. `relay-bullmq: job failed`), **`redis-cli`** / managed Redis metrics, failed-job retention settings in [`src/jobs/bullmq-shared.ts`](../src/jobs/bullmq-shared.ts), and vendor tooling.

**When you add a dashboard later:** Run **[Bull Board](https://github.com/felixmosh/bull-board)** (or equivalent) as a **separate** Node app or sidecar with **`REDIS_URL`**, **never** on the public internet without **auth** (SSO, mutual TLS, VPN, or **IP allowlist** only). Do not mount read-write queue admin on the same Express surface as patron/creator traffic without hard gates.

#### Quick verification

- From a shell with the same `REDIS_URL` as the app: `redis-cli -u "$REDIS_URL" ping` → `PONG`.
- Repo probe: see Redis notes in [.env.example](../.env.example) and [tests/redis-connection.test.ts](../tests/redis-connection.test.ts) (`SKIP_REDIS_IT=0`).
- **CI:** On every push/PR, workflow [.github/workflows/ci.yml](../.github/workflows/ci.yml) runs job **`redis-jobs`** (Redis `7-alpine` service) and `npm run test:jobs` — TCP probe + BullMQ repeat registration + one-shot worker trace.

**Phase P1 — v0 Mandatory Assets (delta):** _None._

---

# Phase P2 — Observability (Pino + Sentry)

**Purpose:** Meet road map reliability expectations: debuggable pilot, capture unhandled failures, correlate API and worker traces.

**Road map alignment:** Architecture baseline Sentry + structured logs; supports “support runbook” and M4/M5 ops narrative later.

**Gap closed:** Production logs JSON; error tracking with scrubbing; trace IDs across HTTP and jobs.

#### HTTP 5xx alerting (pilot)

**Goal:** Know when the Relay API is failing requests before users report it. Pair with **P2-obs-002** (`http_request` logs include `status`, `traceId`, `path`) and **P2-obs-003** (optional `SENTRY_DSN` via [`src/lib/relay-sentry.ts`](../src/lib/relay-sentry.ts)).

**Option A — Sentry (recommended when `SENTRY_DSN` is set)**

1. In the Sentry project, create an **Issue Alert** (or use a metric / error-count alert if you standardize on that) scoped to this service’s **environment** (`SENTRY_ENVIRONMENT` or `NODE_ENV` as sent by [`src/lib/relay-sentry.ts`](../src/lib/relay-sentry.ts)).
2. Pilot-practical triggers: **new issues** regressions, or **event volume** above a baseline for tags such as server/runtime errors and 5xx-related issue types. Refine filters so **local** and **CI** noise stays out (environment filter).
3. Triage: use **event `traceId`** / scope tags and match to Pino **`http_request`** lines and client **`X-Trace-Id`** (P2-obs-002).

**Option B — Manual watch (pilot when Sentry is off or as redundancy)**

1. **Logs:** Stream or tail JSON logs and alert when **`http_request`** entries show **`status` ≥ 500** (sustained rate or N hits in a window — set a threshold for pilot traffic).
2. **Synthetic probe:** Hit **`GET /api/v1/health`** from uptime or load balancer checks; alert on non-200 or elevated latency.
3. **Runbook:** Assign an on-call rotation or weekly review until Option A is in place.

---

### P2-obs-001 — Add Pino dependency and base logger

- **Depends on:** P1-queue-009 (optional but nice for worker logs)
- **Owner:** backend
- **Exit:** `src/lib/logger.ts` exports `createLogger()` with level from `LOG_LEVEL`, pretty in dev via `pino-pretty` devDependency.
- **Code:** `npm install pino`; avoid logging secrets (token scrub list).
- **Wiring:** Import in [src/main.ts](../src/main.ts) first line after env load.
- **Retrofit:** Replace `console.warn` in worker callbacks with `logger.warn` incrementally (batch PR).
- **Tests:** Logger redacts `Authorization` header in fixture.

- **Logged (2026-05-08):** [src/lib/logger.ts](../src/lib/logger.ts) (`createLogger`, `LOG_LEVEL`, dev `pino-pretty`, redact paths); [package.json](../package.json) / [package-lock.json](../package-lock.json) (`pino`, dev `pino-pretty`); [src/main.ts](../src/main.ts), [src/worker.ts](../src/worker.ts); [.env.example](../.env.example); [tests/logger.test.ts](../tests/logger.test.ts).

### P2-obs-002 — Express request logging middleware

- **Depends on:** P2-obs-001
- **Owner:** backend
- **Exit:** Each request logs method, path, status, duration, `traceId`.
- **Code:** [src/server.ts](../src/server.ts) — middleware after `traceIdFrom` available; use `AsyncLocalStorage` for trace context if needed.
- **Retrofit:** Remove duplicate console logs.
- **Tests:** supertest hit logs object (spy).

- **Logged (2026-05-08):** Global middleware in [src/server.ts](../src/server.ts) (`ensureRelayTraceId`, `X-Trace-Id`, `res.on("finish")` → `http_request` with `method`, `path`, `status`, `durationMs`, `traceId`); optional `AppConfig.http_request_logger`; [tests/http-request-logging.test.ts](../tests/http-request-logging.test.ts).

### P2-obs-003 — Wire Sentry for Node / Express

- **Depends on:** P2-obs-001
- **Owner:** backend
- **Exit:** `@sentry/node` init in [src/main.ts](../src/main.ts); `SENTRY_DSN` optional; scrub PII in `beforeSend`.
- **Code:** Express error handler last; capture unhandledRejection with Sentry (sample rate configurable).
- **Wiring:** [.env.example](../.env.example).
- **Retrofit:** None.
- **Tests:** Mock transport; assert event not sent when DSN empty.

- **Logged (2026-05-08):** [src/lib/relay-sentry.ts](../src/lib/relay-sentry.ts) (`initRelaySentry`, `beforeSend` PII scrub, `attachRelaySentryExpressErrorHandler`, `captureRelaySentryException`); [src/main.ts](../src/main.ts), [src/worker.ts](../src/worker.ts) (init after `loadEnv`; rejection/exception capture); [src/server.ts](../src/server.ts) (`setupExpressErrorHandler` after routes); [package.json](../package.json) `@sentry/node`; [.env.example](../.env.example); [tests/relay-sentry.test.ts](../tests/relay-sentry.test.ts).

### P2-obs-004 — Correlate BullMQ jobs with trace IDs

- **Depends on:** P1-queue-014, P2-obs-001
- **Owner:** backend
- **Exit:** Processor logs include `traceId` and `jobId`; Sentry scope per job optional.
- **Code:** `src/jobs/*` processors.
- **Tests:** Integration log assertions.

- **Logged (2026-05-08):** [src/jobs/register-workers.ts](../src/jobs/register-workers.ts) `runRelayBullMqJob` — `relay-bullmq: job complete` with `traceId` / `jobId`; optional `Sentry.withScope` tags `relay.bullmq.queue`, `relay.trace_id`, `relay.bullmq.job_id`; [tests/register-workers-trace-log.test.ts](../tests/register-workers-trace-log.test.ts), [tests/register-workers-sentry-scope.test.ts](../tests/register-workers-sentry-scope.test.ts).

### P2-obs-005 — HTTP 5xx alerting policy (doc)

- **Depends on:** P2-obs-003
- **Owner:** devops
- **Exit:** Sentry alert rule or “manual watch” for pilot documented.
- **Tests:** N/A.

- **Logged (2026-05-08):** [Phase P2 — HTTP 5xx alerting (pilot)](pilot-build-plan.md#http-5xx-alerting-pilot) (subsection above).

### P2-obs-006 — Replace top 10 `console.*` hotspots in `src/server.ts`

- **Depends on:** P2-obs-002
- **Owner:** backend
- **Exit:** Grep `console.` count reduced in largest route file without behavior change.
- **Tests:** Existing route tests.

- **Logged (2026-05-08):** [src/server.ts](../src/server.ts) — `createLogger({ name: "relay-server" })` replaces all three prior `console.warn` sites (webhook base unset, Patreon campaign index collision ×2) with Pino `warn` (structured fields on collisions).

### P2-obs-007 — High-volume route log sampling

- **Depends on:** P2-obs-002
- **Owner:** backend
- **Exit:** Health/metrics polling routes logged at `trace` or sampled (e.g. 1%) in prod; doc env `RELAY_LOG_SAMPLE_*` if added.
- **Tests:** Unit for sampler.

- **Logged (2026-05-08):** [src/lib/http-access-log-policy.ts](../src/lib/http-access-log-policy.ts) + [src/server.ts](../src/server.ts) HTTP middleware — production high-volume paths (`/api/v1/health*`, `/api/v1/metrics*`, `/api/v1/patron/entitlements/health*`) emit `http_request` at `trace` by default; optional `RELAY_LOG_SAMPLE_RATE` (0–1) logs a fraction at `info`. [tests/http-access-log-policy.test.ts](../tests/http-access-log-policy.test.ts); [.env.example](../.env.example).

### P2-obs-008 — PII scrubbing rules for logs + Sentry

- **Depends on:** P2-obs-003
- **Owner:** backend
- **Exit:** Patreon tokens, email, IP: redact in `pino` serializers and Sentry `beforeSend`.
- **Tests:** Snapshot: serialized error object has no raw token.

- **Logged (2026-05-08):** [src/lib/pii-scrub.ts](../src/lib/pii-scrub.ts) (shared scrub helpers); [src/lib/logger.ts](../src/lib/logger.ts) Pino `serializers.req` / `serializers.err` via `pino-std-serializers` wrappers + expanded `redact.paths`; [src/lib/relay-sentry.ts](../src/lib/relay-sentry.ts) `applyRelaySentryPiiScrub` (`beforeSend`): headers (incl. `x-forwarded-for`, `x-real-ip`), `user` email/IP, `message` / `logentry.message`, `extra`, `contexts`. Tests: [tests/pii-scrub.test.ts](../tests/pii-scrub.test.ts), [tests/logger.test.ts](../tests/logger.test.ts), [tests/relay-sentry.test.ts](../tests/relay-sentry.test.ts).

**Phase P2 — v0 Mandatory Assets (delta):**

- **Asset:** Error reference strip (optional)
  - **Purpose:** User-facing “Something went wrong — reference `abc123`” for support.
  - **v0 prompt:** Minimal banner, inline on patron/creator error boundary; WCAG AA contrast; copy ≤120 chars.
  - **Ships:** `web/app/...` global error or segment error UI.
  - **API:** Reads `x-trace-id` or error body field from standardized error envelope [src/contracts/api.ts](../src/contracts/api.ts).

---

# Phase P3 — Single canonical Next.js product surface

**Purpose:** One dependency graph for UI; stop drift between `web/app` and excluded experimental trees.

**Road map alignment:** [design-archive/preflight/PREFLIGHT.txt](../design-archive/preflight/PREFLIGHT.txt) remains reference-only; production is `web/`.

**Gap closed:** Quarantine/archival policy; import boundaries; design-system singular.

---

### P3-web-001 — Inventory routes under canonical `web/app`

- **Depends on:** P0-base-002
- **Owner:** frontend
- **Exit:** Markdown list: route file → primary user (creator | patron | public).
- **Code:** `glob web/app/**/page.tsx` + layout tree.
- **Tests:** N/A.

- **Logged (2026-05-08):** [docs/web-route-inventory.md](web-route-inventory.md) — 37 routes; layout summary (`layout.tsx`, `patron/layout.tsx`, `patreon/patron/layout.tsx`, `landing/layout.tsx`); primary user per `page.tsx`.

### P3-web-002 — Classify `web/b_i0ofEW9bMcy` and `web/onboarding_enhancement`

- **Depends on:** P3-web-001
- **Owner:** product + frontend
- **Exit:** Decision: **Archive** (move out of repo), **Quarantine** (keep excluded), or **Merge** (port components into `web/components`).
- **Code:** If archive: `git mv` to `design-archive/` or separate branch; update [web/tsconfig.json](../web/tsconfig.json) exclude.
- **Retrofit:** Fix any CI paths referencing old folders.
- **Tests:** `npm run build --prefix web`.

- **Logged (2026-05-08):** **Quarantine** both trees. Rationale, evidence, and rules: [docs/web-quarantine-trees.md](web-quarantine-trees.md). [web/tsconfig.json](../web/tsconfig.json) unchanged (already excludes both). CI: no `.github` references; no imports from `web/app` or `web/components`.

### P3-web-003 — Import boundary ESLint rule (no app imports from quarantine)

- **Depends on:** P3-web-002
- **Owner:** frontend
- **Exit:** `eslint` rule or `no-restricted-imports` blocking `**/b_i0ofEW9bMcy/**` and `**/onboarding_enhancement/**` from `web/app/**` and `web/components/**` except allowlist file.
- **Code:** Next.js / ESLint config under `web/` (project-local `eslint.config.*` or `.eslintrc` if present).
- **Tests:** Lint in CI.

- **Logged (2026-05-08):** [web/.eslintrc.json](../web/.eslintrc.json) — override on `app/**/*.{ts,tsx}` and `components/**/*.{ts,tsx}`: `no-restricted-imports` patterns for `b_i0ofEW9bMcy` and `onboarding_enhancement`; exception [web/components/quarantine-import-allowlist.ts](../web/components/quarantine-import-allowlist.ts). [docs/web-quarantine-trees.md](web-quarantine-trees.md) updated. Verified: `npm run lint --prefix web`.

### P3-web-004 — Consolidate `patron-mock` vs real patron routes

- **Depends on:** P3-web-001
- **Owner:** frontend
- **Exit:** Doc: which components are **story-only** vs **production**; list dead re-exports.
- **Code:** Reduce duplicate shadcn only where merge safe (batch 5 components max per PR).
- **Tests:** Build.

- **Logged (2026-05-08):** [docs/patron-mock-inventory.md](patron-mock-inventory.md) — production: `patron-mock.css` + layouts; relay UI is `components/patron/relay/*`; `patron-mock/ui` + `theme-provider` unused by app/relay. [web/hooks/use-toast.ts](../web/hooks/use-toast.ts) decoupled from `patron-mock/ui/toast` (types from `@radix-ui/react-toast`). Verified: `npm run build --prefix web`.

### P3-web-005 — Single `components/ui` ownership

- **Depends on:** P3-web-004
- **Owner:** frontend
- **Exit:** Barrel `web/components/ui/index.ts` policy: either banned or canonical; document.
- **Tests:** Lint.

- **Logged (2026-05-08):** **Barrel banned** — [docs/web-components-ui-policy.md](web-components-ui-policy.md). [web/.eslintrc.json](../web/.eslintrc.json): `no-restricted-imports` `paths` (`@/components/ui`) + `patterns` (`**/components/ui/index(.ts|.tsx)?`, same for `patron-mock/ui`). `npm run lint --prefix web`.

### P3-web-006 — Public asset dedupe pass

- **Depends on:** P3-web-002
- **Owner:** frontend
- **Exit:** Remove confirmed ghost assets from [relay_audit.json](../relay_audit.json) re-run; update `web/public` README.
- **Code:** Delete or move HTML previews to `docs/` if unused.
- **Tests:** Visual smoke.

- **Logged (2026-05-08):** Moved `gallery-inspect-preview.html`, `post-batch-expand-preview.html`, `single-post-grid-tile-preview.html` → [`docs/web-public-previews/`](web-public-previews/) (+ README). Deleted ghost placeholders: `placeholder.jpg`, `placeholder-logo.{png,svg}`, `placeholder-user.jpg` from [`web/public`](../web/public). Added [`web/public/README.md`](../web/public/README.md). Regenerated [`relay_audit.json`](../relay_audit.json) + [`audit/dependency_report.md`](../audit/dependency_report.md) via `node scripts/relay-dependency-audit.mjs`. `npm run build --prefix web`.

### P3-web-007 — Next `basePath` / env for API origin

- **Depends on:** —
- **Owner:** frontend
- **Exit:** `.env.local.example` for `NEXT_PUBLIC_RELAY_API_*` documented; single source for dev proxy.
- **Code:** `web/next.config.mjs` env validation if present.
- **Tests:** Patron feed fetch against local API.

- **Logged (2026-05-08):** [`web/.env.local.example`](../web/.env.local.example) — minimal `NEXT_PUBLIC_RELAY_API_URL` + pointer to `web/.env.example` and `next.config.mjs` rewrites. [`web/lib/relay-api-env.ts`](../web/lib/relay-api-env.ts) — shared normalize/validate for `relay-api.ts`; [`web/next.config.mjs`](../web/next.config.mjs) mirrors validation so bad URLs fail `next build`. Tests: [`tests/web/relay-api-env.test.ts`](../tests/web/relay-api-env.test.ts), [`tests/web/patron-relay-feed-fetch.test.ts`](../tests/web/patron-relay-feed-fetch.test.ts). `npm test` + `npm run build --prefix web`.

### P3-web-008 — Documentation: “Canonical web” in AGENTS / UI specialist doc

- **Depends on:** P3-web-002
- **Owner:** frontend
- **Exit:** [docs/UI_SPECIALIST_RELAY.md](UI_SPECIALIST_RELAY.md) points to canonical paths only.
- **Tests:** N/A.

- **Logged (2026-05-08):** [docs/UI_SPECIALIST_RELAY.md](UI_SPECIALIST_RELAY.md) — new **Canonical web** section: route inventory, `web/app` + `web/components` + `web/lib`, quarantine trees + policy links, UI import policy, `.env.local.example` / `.env.example`.

### P3-web-009 — Pilot i18n stance (English-only lock)

- **Depends on:** P3-web-001
- **Owner:** product
- **Exit:** Doc line: pilot ships **en-US** only; no new locale files; defer `next-intl` until post-pilot unless already present.
- **Tests:** N/A.

- **Logged (2026-05-08):** [docs/UI_SPECIALIST_RELAY.md](UI_SPECIALIST_RELAY.md) — **Canonical web** bullet *i18n (pilot)*: en-US only; no `next-intl` / locale bundles for pilot (`next-intl` not in web deps).

### P3-web-010 — Visual/component dev tool decision (Storybook vs none)

- **Depends on:** P3-web-005
- **Owner:** frontend
- **Exit:** One paragraph: “no Storybook for pilot” **or** minimal `stories/` for shells only—no duplicate shadcn.
- **Tests:** N/A.

- **Logged (2026-05-08):** [docs/UI_SPECIALIST_RELAY.md](UI_SPECIALIST_RELAY.md) — **Canonical web** bullet *Component dev tooling*: no Storybook; use routes + `web/app/dev/bench` + dev/build.

**Phase P3 — v0 Mandatory Assets (delta):**

- **Library shell frame** — chrome, nav, account menu; loading skeleton; responsive.
- **Designer shell frame** — canvas chrome, save/publish affordances (states: dirty, saving, error).
- **Patron shell frame** — feed header, empty state, connect CTA.
- **Shared modals** — Patreon connect (creator), Patreon link (patron).

---

# Phase P4 — Creator onboarding state machine (Part 1-A)

**Purpose:** Enforce roadmap onboarding: Connect Patreon → Initial Import → Organize → Publish Gallery.

**Road map alignment:** Part 1 **Workstream A** onboarding progress states.

**Gap closed:** Persistent step + gating before publish.

---

### P4-onb-001 — Prisma model (or reuse) for `CreatorOnboardingState`

- **Depends on:** P0-base-001 (coordinate with DBA/security before merge — see P8-sec-001)
- **Owner:** backend
- **Exit:** Migration adds table or columns: `creator_id`, `step` enum, `updated_at`, optional JSON `metadata`.
- **Code:** `prisma/schema.prisma` + migration SQL.
- **Wiring:** Regenerate client.
- **Retrofit:** Backfill default `connected` for existing creators.
- **Tests:** Migration apply on empty DB.

- **Logged (2026-05-08):** [`prisma/schema.prisma`](../prisma/schema.prisma) — `CreatorOnboardingStep` enum (`connected` | `import_started` | `organized` | `published`) + `CreatorOnboardingState` (`creator_id` PK, `metadata` JSON, `updated_at`). Migration [`20260508180000_creator_onboarding_state`](../prisma/migrations/20260508180000_creator_onboarding_state/migration.sql): backfill `connected` from `tenants.relay_creator_id` + `campaigns.creator_id`. Tests: [`tests/prisma-creator-onboarding-migration.test.ts`](../tests/prisma-creator-onboarding-migration.test.ts). `npx prisma generate` + `npm test -- tests/prisma-creator-onboarding-migration.test.ts`.

### P4-onb-002 — API `GET /api/v1/creator/onboarding`

- **Depends on:** P4-onb-001
- **Owner:** backend
- **Exit:** Returns current step + sub-status (import progress pointer from sync health if available).
- **Code:** [src/server.ts](../src/server.ts) route + small service module `src/creator/onboarding-service.ts`.
- **Retrofit:** Use existing auth guard for creator.
- **Tests:** `supertest` happy path.

- **Logged (2026-05-08):** `GET /api/v1/creator/onboarding` — `requireAccountWithRole` **creator** + `primaryRelayCreatorId`; 503 without Prisma; 404 when no studio. [`src/creator/onboarding-service.ts`](../src/creator/onboarding-service.ts) — `getCreatorOnboardingForStudio`: loads/ creates `CreatorOnboardingState`, attaches `import_progress` from `CreatorSyncState.lastPostScrape` (`finished_at`, `ok`, `apply_result.posts_written`). Tests: [`tests/creator-onboarding-service.test.ts`](../tests/creator-onboarding-service.test.ts), [`tests/creator-onboarding-route.test.ts`](../tests/creator-onboarding-route.test.ts) (503).

### P4-onb-003 — API `PATCH /api/v1/creator/onboarding`

- **Depends on:** P4-onb-002
- **Owner:** backend
- **Exit:** Validates allowed transitions; rejects skip-ahead.
- **Code:** State machine table in code.
- **Tests:** Illegal transition 409.

- **Logged (2026-05-08):** `PATCH /api/v1/creator/onboarding` — body: optional `step` + optional `metadata` (replace; `null` clears). Linear order `connected` → `import_started` → `organized` → `published`; **409 CONFLICT** on skip-ahead / backward; **400** on bad `step`. [`src/creator/onboarding-service.ts`](../src/creator/onboarding-service.ts) — `CREATOR_ONBOARDING_STEP_ORDER`, `assertCreatorOnboardingTransition`, `patchCreatorOnboarding`. Tests: [`tests/creator-onboarding-transition.test.ts`](../tests/creator-onboarding-transition.test.ts), [`tests/creator-onboarding-service.test.ts`](../tests/creator-onboarding-service.test.ts) (patch), [`tests/creator-onboarding-route.test.ts`](../tests/creator-onboarding-route.test.ts) (PATCH 503).

### P4-onb-004 — Advance step on successful Patreon OAuth callback

- **Depends on:** P4-onb-002
- **Owner:** backend
- **Exit:** After creator token store success, set step ≥ `import_started`.
- **Code:** Hook in existing OAuth success path in [src/server.ts](../src/server.ts) or auth service.
- **Retrofit:** None.
- **Tests:** Integration with mock OAuth.

- **Logged (2026-05-08):** After `POST /api/v1/auth/patreon/exchange` successfully runs `exchangeCodeAndPersist`, when Prisma is configured the server calls `ensureCreatorOnboardingAtLeastImportStarted`: new `CreatorOnboardingState` rows start at **`import_started`**; existing **`connected`** rows advance to **`import_started`**; steps already at or past **`import_started`** are unchanged. Failures are **non-fatal** (warn log; OAuth response still 200). [`src/creator/onboarding-service.ts`](../src/creator/onboarding-service.ts) — `ensureCreatorOnboardingAtLeastImportStarted`. Tests: [`tests/creator-onboarding-service.test.ts`](../tests/creator-onboarding-service.test.ts).

### P4-onb-005 — Advance “Organize” when Library first visit or manual CTA

- **Depends on:** P4-onb-003
- **Owner:** frontend + backend
- **Exit:** `POST` “ack organize” or auto on first library load (product choice — **document**).
- **Tests:** E2E optional.

- **Product (implemented):** **Auto on first Library load** — canonical creator Library is [`web/app/GalleryView.tsx`](../web/app/GalleryView.tsx) (home/studio). When onboarding **`step` is `import_started`**, the client calls **`PATCH /api/v1/creator/onboarding`** with `{ "step": "organized" }` once per browser (localStorage `relay.library.organize_ack.v1:<creatorId>`). If the user is already **`organized`** or **`published`**, the flag is set without PATCH. **Manual / other surfaces** may call the same PATCH. No separate POST route.
- **Logged (2026-05-08):** Client helpers [`fetchCreatorOnboarding` / `patchCreatorOnboarding`](../web/lib/relay-api.ts) + GalleryView effect above.

### P4-onb-006 — Block publish until gates

- **Depends on:** P4-onb-003, P5-sync-001
- **Owner:** backend
- **Exit:** Publish layout endpoint returns 400 with structured error if onboarding incomplete or sync `failed` (policy — align with product).
- **Code:** Gallery/layout mutate routes in [src/server.ts](../src/server.ts).
- **Tests:** Unit.

- **Policy (implemented):** `POST /api/v1/gallery/layout/publish` — when **Prisma** is configured, [`getLayoutPublishBlock`](../src/creator/onboarding-service.ts) runs after creator auth: **(1)** If a `CreatorOnboardingState` row exists and `step !== published`, respond **400** `ONBOARDING_INCOMPLETE` with `details` `[{ field: "onboarding_step", issue: "<step>" }]`. **No row** → onboarding gate skipped (legacy studios). **(2)** If `CreatorSyncState.lastPostScrape` is present with **`ok: false`**, respond **400** `SYNC_POST_SCRAPE_FAILED` (`details`: `last_post_scrape_failed`). File-backed layout (no Prisma) unchanged. Does not yet use P5-sync-001 DTO normalization.
- **Logged (2026-05-08):** [`src/server.ts`](../src/server.ts) publish handler + [`tests/creator-onboarding-service.test.ts`](../tests/creator-onboarding-service.test.ts) (`getLayoutPublishBlock`).

### P4-onb-007 — Frontend: onboarding stepper component

- **Depends on:** P4-onb-002
- **Owner:** frontend
- **Exit:** Reads GET onboarding; shows 4 steps; highlights current.
- **Code:** `web/app/.../OnboardingStepper.tsx` + embed in creator dashboard layout.
- **Wiring:** React Query or SWR fetch.
- **Retrofit:** Remove duplicate progress UIs.
- **Tests:** Storybook or RTL optional.

- **Logged (2026-05-08):** [`CreatorOnboardingStepper`](../web/app/components/studio/CreatorOnboardingStepper.tsx) — fetches `GET /api/v1/creator/onboarding`, renders four steps (`CREATOR_ONBOARDING_STEP_ORDER` in [`web/lib/relay-api.ts`](../web/lib/relay-api.ts)), **current** step with `aria-current="step"`, prior steps with checkmarks. **`published`** → compact **You’re live** strip (P4-onb-009-style). **`organized`** → **Mark ready to publish** (`PATCH` → `published`). **`connected`** → link to `/creator/connect`. Embedded under **Library** [`GalleryView`](../web/app/GalleryView.tsx) below `LibraryTopBar`; **quiet refetch** after P4-onb-005 auto-organize (`reloadKey`).

### P4-onb-008 — Frontend: gate “Publish” button disabled + tooltip

- **Depends on:** P4-onb-006, P4-onb-007
- **Owner:** frontend
- **Exit:** Disabled + reason from API error code.
- **Tests:** RTL.

- **Logged (2026-05-08):** Designer [`DesignerView`](../web/app/designer/DesignerView.tsx) — `fetchCreatorOnboarding` + [`describeCreatorGalleryPublishBlock`](../web/lib/relay-api.ts) disable **Publish gallery** when onboarding isn’t **`published`** or **`import_progress.last_post_scrape_ok === false`**; wrapper **`title`** explains why (native tooltip). While gate status is **pending**, button disabled with “Checking…”. If GET onboarding fails (e.g. 503), **no client gate** (matches file-only API). **400** from publish maps **`ONBOARDING_INCOMPLETE`** / **`SYNC_POST_SCRAPE_FAILED`** to short copy under the buttons. Unit tests: [`tests/web/creator-gallery-publish-gate-copy.test.ts`](../tests/web/creator-gallery-publish-gate-copy.test.ts).

### P4-onb-009 — Returning creator: resume vs reset policy

- **Depends on:** P4-onb-003
- **Owner:** product + backend
- **Exit:** Doc + API behavior: if step `published`, show “You’re live” not stepper; optional `POST /onboarding/reset` **staff-only** or absent.
- **Tests:** supertest for idempotent GET after publish.

- **Policy (implemented / documented):**
  - **Resume:** `GET /api/v1/creator/onboarding` is **read-only** from the client’s perspective (no `POST` body). It always returns the **current** `step`, `metadata`, `import_progress`, and `updated_at`. Safe to poll when the Library or designer loads; **`getCreatorOnboardingForStudio`** creates a **`connected`** row on first read if none exists (bootstrap), then subsequent GETs return the same studio state until **`PATCH`** or server hooks (OAuth, etc.) change it.
  - **`published` UI:** Library **[`CreatorOnboardingStepper`](../web/app/components/studio/CreatorOnboardingStepper.tsx)** replaces the 4-step nav with the **“You’re live”** strip (no checklist).
  - **Reset:** **`POST /api/v1/creator/onboarding/reset`** is **not shipped** in the pilot. Rewinding onboarding would be **operator/staff-only** if introduced later (product gate), not self-serve.
- **Tests:** [`tests/creator-onboarding-service.test.ts`](../tests/creator-onboarding-service.test.ts) — consecutive `getCreatorOnboardingForStudio` calls return an **identical** read model when Prisma rows are unchanged (idempotent read semantics for returning creators).

### P4-onb-010 — Email / marketing step placeholder (explicit defer)

- **Depends on:** P0-base-001
- **Owner:** product
- **Exit:** One-line deferral: no “confirm email” gating in pilot unless compliance mandates; link to M3 narrative in monetization doc.
- **Tests:** N/A.

- **Logged (2026-05-08):** **Deferred** — the studio **4-step onboarding funnel** does **not** add a separate “confirm email” or marketing-opt-in **step**; email verification stays in **existing auth** paths (e.g. Supabase / session rules) unless **compliance** requires a dedicated gate. Operational **M3** (“Deliverability and compliance automation”) for longer-term email/compliance posture: [`monetization-scheme-infrastructure-plan.md`](../monetization-scheme-infrastructure-plan.md) (section **Operational Milestones to Support Monetization**).

**Phase P4 — v0 Mandatory Assets (delta):**

- **Onboarding stepper** — 4 steps, mobile-first; checkmarks; error on failed sync.
- **Import progress panel** — ties to sync health API; non-technical copy.
- **Publish blocked modal** — lists missing gates.

---

# Phase P5 — Sync health and degradation (creator trust)

**Purpose:** Road map “degradation modes” and creator-visible sync status.

**Road map alignment:** Part 1 sync narrative; [docs/part1-sync-hardening-ledger.md](part1-sync-hardening-ledger.md).

**Gap closed:** API + UI for health, read-only mode when unsafe to edit.

**`sync_health.last_success_at` (source of truth):** The field is the latest **`finished_at`** among **successful** post scrape and member sync snapshots in `CreatorSyncHealthState` (see [`patreon-sync-health-store.ts`](../src/patreon/patreon-sync-health-store.ts) / DB `CreatorSyncState`). Those snapshots are written when **`recordPostScrapeSuccess`** runs after a completed scrape or ingest path (e.g. [`incremental-sync-worker.ts`](../src/patreon/incremental-sync-worker.ts), `POST /api/v1/patreon/scrape` in [`server.ts`](../src/server.ts)) and when **`recordMemberSyncSuccess`** runs after member sync ([`patreon-member-sync-coordinator.ts`](../src/patreon/patreon-member-sync-coordinator.ts)). It does **not** track “last Patreon webhook HTTP request” by itself—webhooks may update content elsewhere without updating this timestamp until a scrape/member job records success. Avoid product copy that implies webhook receipt time equals `last_success_at`.

---

### P5-sync-001 — Normalize sync health DTO for web

- **Depends on:** —
- **Owner:** backend
- **Exit:** Single JSON shape: `status`, `last_success_at`, `last_error`, `campaign_id`, human message key.
- **Code:** Map from [src/patreon/patreon-sync-health-store.ts](../src/patreon/patreon-sync-health-store.ts) / DB store.
- **Tests:** Serializer unit test.

- **Logged (2026-05-08):** [`src/patreon/sync-health-web-dto.ts`](../src/patreon/sync-health-web-dto.ts) — `creatorSyncHealthStateToWebDto` maps `CreatorSyncHealthState` → **`SyncHealthWebDto`**: `status` (`unknown` | `healthy` | `degraded` | `failed`), `last_success_at` (max successful post scrape / member sync `finished_at`), `last_error` (structured + `source`: post scrape vs member sync; post failure wins), `campaign_id`, `message_key` (`sync_health.*` keys for copy). **`failed`** = last post scrape `ok: false`; **`degraded`** = scrape warnings or member sync failed while posts OK. Tests: [`tests/sync-health-web-dto.test.ts`](../tests/sync-health-web-dto.test.ts).

### P5-sync-002 — Expose DTO on existing gallery or health endpoint

- **Depends on:** P5-sync-001
- **Owner:** backend
- **Exit:** Documented in OpenAPI fragment or `docs/api` if exists.
- **Code:** Extend route used by Library (grep `sync_health` in server).
- **Tests:** supertest.

- **Logged (2026-05-08):** [`GET /api/v1/patreon/sync-state`](../src/server.ts) adds **`sync_health`** via `creatorSyncHealthStateToWebDto` (same shape as P5-sync-001). Web types: [`SyncHealthWebDto`](../web/lib/relay-api.ts) on **`PatreonSyncStateData`**. Tests: [`tests/patreon-sync-state-watermark.test.ts`](../tests/patreon-sync-state-watermark.test.ts), [`tests/patreon-sync-health.test.ts`](../tests/patreon-sync-health.test.ts).

### P5-sync-003 — Frontend: Library top banner

- **Depends on:** P5-sync-002
- **Owner:** frontend
- **Exit:** Banner colors: green / yellow / red; action link “View details”.
- **Code:** `web/components/library/SyncHealthBanner.tsx`.
- **Tests:** RTL with mocked fetch.

- **Logged (2026-05-08):** [`SyncHealthBanner`](../web/app/components/SyncHealthBanner.tsx) under the Library header when **`sync_health.status`** is **`failed`**, **`degraded`**, or **`unknown`** — red / amber / muted styling; **View details** bumps a signal so [`PatreonSyncMenu`](../web/app/components/PatreonSyncMenu.tsx) opens and reloads sync state. Helpers [`shouldShowSyncHealthBanner`](../web/lib/relay-api.ts), [`formatSyncHealthRollupBanner`](../web/lib/relay-api.ts). Tests: [`tests/web/sync-health-banner-helpers.test.ts`](../tests/web/sync-health-banner-helpers.test.ts).

### P5-sync-004 — Read-only mode flag on mutations

- **Depends on:** P5-sync-002
- **Owner:** backend + frontend
- **Exit:** When `degraded` or `failed`, PATCH routes return 503 or 423 with code `SYNC_DEGRADED`; UI disables edit controls.
- **Code:** Central helper `assertCreatorSyncWritable`.
- **Tests:** supertest.

- **Logged (2026-05-08):** [`assertCreatorSyncWritable`](../src/patreon/creator-sync-writable.ts) + route wrapper `guardStudioSyncWritable` in [`src/server.ts`](../src/server.ts) — **423** `SYNC_DEGRADED` when [`sync_health`](../src/patreon/sync-health-web-dto.ts) rollup is **`failed`** or **`degraded`** (health store read only; **unknown/healthy** allows writes). Applied to gallery mutations (tags, visibility, presentation, collections, layout, publish, triage, Discover opt-in PATCH, clone generate) and Relay studio paths (`POST /relay/posts`, upload init/commit, Discord link codes, staging deletes). **Not** applied to `POST /api/v1/patreon/scrape` (recovery). Web: [`syncHealthBlocksStudioWrites`](../web/lib/relay-api.ts), Library [`LibraryPowerPanel`](../web/app/components/LibraryPowerPanel.tsx) disables visibility/tag/media-edit actions when blocked. Tests: [`tests/creator-sync-writable-route.test.ts`](../tests/creator-sync-writable-route.test.ts), [`tests/web/sync-health-studio-writes.test.ts`](../tests/web/sync-health-studio-writes.test.ts).

### P5-sync-005 — Operator copy deck

- **Depends on:** P5-sync-003
- **Owner:** qa
- **Exit:** 10 short strings in `docs/copy/sync-health.md` or CMS JSON; linked for v0.

- **Logged (2026-05-08):** [`docs/copy/sync-health.md`](copy/sync-health.md) — 10 keyed strings (`sync_health.*`, `SYNC_DEGRADED`, banner CTA, trace hint, OAuth/cookie studio lines) in a table + v0/CMS notes; links to DTO and web helpers.

### P5-sync-006 — Health signal source-of-truth note (webhook vs poll)

- **Depends on:** P5-sync-001
- **Owner:** backend
- **Exit:** 5–10 lines in pilot doc: which timestamp drives `last_success` (incremental worker completion vs Patreon webhook); avoids contradictory banners.
- **Tests:** N/A.

- **Logged (2026-05-08):** **`sync_health.last_success_at` (source of truth)** paragraph under the **Phase P5 — Sync health and degradation** section header in this file (scrape/member **`record*Success`** vs webhook-only delivery).

**Phase P5 — v0 Mandatory Assets (delta):**

- **Sync status banner** (variant set: success, syncing, error, stale).
- **Sync detail drawer** (optional) — timestamps, Patreon campaign id, “contact support” with trace id.

---

# Phase P5a — Creator analytics & insights (pilot MVP)

**Purpose:** Ship a **creator-facing analytics experience** during the pilot even though Relay-native engagement history is still maturing. **Primary inputs:** Patreon member + pledge data available via the **creator OAuth** integration (join/change/cancel events, tiers, revenue proxies where the API allows), plus an **optional CSV import** of Patreon Insights exports for post-level **impressions / seen / likes / comments** (not on Patreon API v2 for posts). **Relay-first-party** metrics (e.g. public gallery views, reveal interactions) accrue over time and become the long-term SoT—pilot messaging should **not** promise parity with every Patreon dashboard tile.

**Road map alignment:** Part 1 **Workstream E** (Analytics Foundation) in **pilot-sized** form; Action Center–style insights without the full multi-phase growth analytics arc.

**Gap closed:** **PostgreSQL schema** (see **P5a-db***) for append-only membership events, Patreon Insights import + per-post metric rows, and minimal Relay engagement events—plus defined ingest/API/UI on top. Dashboard surfaces **growth, retention/cohort views, tier stickiness**, and a thin **Pulse** surface; **rule-based** “next step” copy where reliability allows (cap prescriptive complexity—see experimental items).

**Database batching (best practice):** **P5a-db-001 — P5a-db-004** define and ship **DDL first** (one reviewed migration, or two only if you split membership vs insights for rollback clarity). **P5a-ins-002**, **P5a-ins-006**, and **P5a-ins-011** must not merge until **P5a-db-002** (and **P5a-db-003** for dedupe keys) land. **Optional:** combine P5a-db with unrelated Prisma work **only** in one migration if the team explicitly wants a single “pilot schema cut” deploy—otherwise keep analytics DDL in its own migration file for reviewability.

**Experimental cap (pick ≤2 for pilot, scoped + tested):** Prefer **high signal, low surprise** rules (e.g. “no post in N days” from **Patreon post dates** or synced content vs **engagement drop** from CSV). Avoid shipping unbounded “AI co-pilot” or multi-channel execution in pilot.

---

## P5a — Database migration batch (before ingest & CSV wiring)

### P5a-db-001 — Design note: analytics tables, keys, and tenancy

- **Depends on:** —
- **Owner:** backend (with product + security if RLS)
- **Exit:** Short doc (this section + `docs/database/` optional stub): for each new model, **creator scope** (`creator_id` as Relay ingest scope string, aligned with [prisma/schema.prisma](../prisma/schema.prisma) `Post.creatorId` / `Campaign`), FK strategy (optional FK to `Post` via `providerPostId` + `campaignId` match where stable), and **no PII** in `RelayEngagementEvent` beyond opaque session keys unless product approves.
- **Code:** Markdown only.
- **Tests:** Peer review sign-off.

- **Logged (2026-05-08):** [`docs/database/p5a-analytics-pilot-schema.md`](p5a-analytics-pilot-schema.md) — per-model tenancy (`creator_id`), membership ledger / Insights import / post metrics / Relay engagement shapes, optional `Post` linkage for Insights rows, PII bar for engagement events, and separation from `AnalyticsSnapshotRow`.

### P5a-db-002 — Prisma + migration: membership ledger, Insights import, engagement events

- **Depends on:** P5a-db-001
- **Owner:** backend
- **Exit:** One migration (preferred) applying:
  1. **`CreatorMembershipEvent`** (name flexible): append-only; `creator_id`; Patreon member id string; `event_type` enum (`join`, `upgrade`, `downgrade`, `cancel`, …); `occurred_at`; optional `tier_id`, `amount_cents`, `source` (`sync` | `webhook` | `backfill`); optional `payload` Json for edge cases.
  2. **`PatreonInsightsImport`**: per upload — `id`, `creator_id`, `file_hash`, `uploaded_at`, optional `label`; unique `(creator_id, file_hash)` for idempotency.
  3. **`PatreonInsightsPostMetric`** (child): `import_id` FK; `creator_id`; `patreon_post_id`; numeric columns **Impressions**, **Seen**, **Likes**, **Comments** (map to DB-safe names); `as_of` or period; optional nullable FK to `Post` when `posts.provider_post_id` matches.
  4. **`RelayEngagementEvent`**: append-only; `creator_id`; `event_type` (`gallery_view`, `reveal_interaction`, … pilot-minimal set); `occurred_at`; optional `post_id` / `media_id`; optional `session_key` (opaque); **no** raw Patreon user id.
- **Code:** `prisma/schema.prisma` + `prisma/migrations/*/migration.sql`; `npx prisma migrate` / generate in CI.
- **Retrofit:** Existing [AnalyticsSnapshotRow](../prisma/schema.prisma) **unchanged** for Action Center **content** rollups; new tables are **additional** SoT for P5a dashboard—not a substitute stuffed into `payload` Json blobs.
- **Tests:** `prisma migrate deploy` on empty DB; smoke SELECT.

- **Logged (2026-05-09):** Prisma models **`CreatorMembershipEvent`**, **`PatreonInsightsImport`**, **`PatreonInsightsPostMetric`**, **`RelayEngagementEvent`** + migration **[`prisma/migrations/20260509130000_p5a_analytics_pilot_schema/migration.sql`](../prisma/migrations/20260509130000_p5a_analytics_pilot_schema/migration.sql)**; back-relations on **`Post`** / **`MediaAsset`**; CI smoke **[`tests/prisma-p5a-analytics-pilot-migration.test.ts`](../tests/prisma-p5a-analytics-pilot-migration.test.ts)**.

### P5a-db-003 — Dedupe constraints and indexes for idempotent ingest

- **Depends on:** P5a-db-002
- **Owner:** backend
- **Exit:** Unique partial index or composite unique for membership events: e.g. `(creator_id, patreon_member_id, event_type, occurred_at)` **or** `(creator_id, dedupe_key)` with `dedupe_key` hash from upstream payload—**document chosen rule** in code comment; indexes on `(creator_id, occurred_at)` for cohort queries; indexes on `(creator_id, patreon_post_id)` for Insights joins; `(creator_id, occurred_at)` on engagement events.
- **Code:** Follow-up migration if P5a-db-002 missed constraints (prefer folding into P5a-db-002 if still in PR).
- **Tests:** Unit or integration proving duplicate sync does not double-insert.

- **Logged (2026-05-09):** Composite **`@@unique([creatorId, patreonMemberId, eventType, occurredAt])`** on **`CreatorMembershipEvent`** + migration **[`prisma/migrations/20260509140000_p5a_membership_event_dedupe/migration.sql`](../prisma/migrations/20260509140000_p5a_membership_event_dedupe/migration.sql)**; SQL/assertion smoke in **[`tests/prisma-p5a-analytics-pilot-migration.test.ts`](../tests/prisma-p5a-analytics-pilot-migration.test.ts)**; optional DB proof with **`P5A_DB_INTEGRATION=1`** in **[`tests/p5a-membership-event-dedupe.integration.test.ts`](../tests/p5a-membership-event-dedupe.integration.test.ts)**. Cohort/list indexes from P5a-db-002 already cover **`(creator_id, occurred_at)`** and **`(creator_id, patreon_post_id)`**.

### P5a-db-004 — Privacy / retention note for CSV-derived and engagement rows

- **Depends on:** P5a-db-002
- **Owner:** product + backend
- **Exit:** Bullet list in `docs/` or here: retention window for `PatreonInsightsPostMetric` (align creator export promises); deletion on account delete; engagement aggregates vs raw rows for pilot.
- **Tests:** Linked from P8 export/delete backlog if applicable.

- **Logged (2026-05-09):** Pilot retention/decisions (execute in product + P8 as needed):
  - **`PatreonInsightsImport` / `PatreonInsightsPostMetric`:** Operational dashboard data from creator-uploaded CSVs; **no long-term archival promise** in pilot—define a retention window in privacy/export copy before scale; **deleting an import** (when UI/API exists) should cascade metrics rows.
  - **`RelayEngagementEvent`:** **Aggregate-first APIs** in pilot unless product explicitly approves per-session drill-down; **opaque `session_key` only**; raw-row TTL vs rollups TBD with storage review.
  - **`CreatorMembershipEvent`:** **Opaque Patreon member ids** only (no email/name); **hard delete / anonymization** on creator or patron account deletion follows **`P8`** export/delete / legal review—do not ad-hoc purge without that backlog.
  - **Action Center rollups** (`AnalyticsSnapshotRow`, etc.) **unchanged**; P5a tables are **additional** SoT, not merged into snapshot `payload` as primary history.

### P5a-ins-001 — Migration rollout smoke (staging)

- **Depends on:** P5a-db-002, P5a-db-003
- **Owner:** backend / devops
- **Exit:** Staging `prisma migrate deploy` clean; new tables visible; rollback / forward-only policy documented for pilot.
- **Code:** Runbook snippet.
- **Tests:** Manual or CI migration step against ephemeral Postgres.

- **Logged (2026-05-09):** Runbook § *Staging rollout smoke* in [`docs/database/p5a-analytics-pilot-schema.md`](p5a-analytics-pilot-schema.md) (`migrate deploy`, `migrate status`, SQL table check, forward-only / rollback policy). **CI:** [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) already runs **`npx prisma migrate deploy`** on empty Postgres before **`npm test`**; [`tests/p5a-ci-migrate-tables.smoke.test.ts`](../tests/p5a-ci-migrate-tables.smoke.test.ts) (when **`CI=true`**) asserts the four P5a tables are queryable after that deploy.

### P5a-ins-002 — Ingest membership events from Patreon sync

- **Depends on:** P5a-ins-001, P5-sync-001
- **Owner:** backend
- **Exit:** Each successful member/pledge sync pass appends **deduped** events (`join`, `upgrade`, `downgrade`, `cancel`) into ledger; idempotent on replay.
- **Code:** Hook in existing [src/patreon](../src/patreon) sync pipeline (match current ingest module layout).
- **Wiring:** Document ordering vs incremental autosync jobs (**P1**).
- **Tests:** Fixture JSON → expected event rows.

- **Logged (2026-05-10):** After each member row is applied, **`syncMembers`** appends deduped **`CreatorMembershipEvent`** rows (`source: sync`) when **`config.prisma`** is wired — see [`src/patreon/membership-ledger-sync.ts`](../src/patreon/membership-ledger-sync.ts) + [`src/patreon/patreon-sync-service.ts`](../src/patreon/patreon-sync-service.ts). Handles **active** patrons (join / rejoin / upgrade / downgrades via tier-floor + Patreon cents) and **non-active** former patrons with prior paid tiers (**cancel** + clear tiers). Tests: [`tests/membership-ledger-sync.test.ts`](../tests/membership-ledger-sync.test.ts). **`IdentityService.getPatronAccountByPatreonUserId`** exposes the pre-sync snapshot.

### P5a-ins-003 — API: `GET` creator analytics summary KPIs

- **Depends on:** P5a-ins-002
- **Owner:** backend
- **Exit:** JSON: active members, adds/cancels in window, net growth, tier breakdown; scoped to authenticated creator.
- **Code:** [src/server.ts](../src/server.ts) or `src/analytics/` router module.
- **Tests:** `supertest` with seeded ledger.

- **Logged (2026-05-10):** **`GET /api/v1/creator/analytics/membership-summary`** (creator Bearer; optional **`?days=`** 1–366, default **30**). JSON: **`active_paying_members`**, **`free_patrons`**, **`total_patrons`**, per-type event counts in the window, **`adds_in_window`**, **`cancels_in_window`**, **`net_growth_events`**, **`tier_breakdown`**, freshness hint **`estimated_from_sync`**. Implementation: [`src/analytics/creator-membership-kpis.ts`](../src/analytics/creator-membership-kpis.ts); tests [`tests/creator-membership-kpis.test.ts`](../tests/creator-membership-kpis.test.ts).

### P5a-ins-004 — API: cohort retention by join month (aggregates only)

- **Depends on:** P5a-ins-002
- **Owner:** backend
- **Exit:** Cohort grid or series: join month × months-since-join → **retained %** (pilot may cap history depth, e.g. 12 months).
- **Tests:** Golden aggregate on small synthetic population.

- **Logged (2026-05-10):** **`GET /api/v1/creator/analytics/membership-cohorts`** (creator Bearer; **`?cohort_months=`** 1–36 default **12**, **`?max_offset=`** 1–24 default **12**). Returns **`cohorts[]`** with **`cohort_month`**, **`cohort_size`**, and **`retention[]`** (`months_since_join`, counts, **`retained_pct`**), plus UTC **`as_of`** and a **`note`**. Logic: [`src/analytics/creator-membership-cohorts.ts`](../src/analytics/creator-membership-cohorts.ts); tests [`tests/creator-membership-cohorts.test.ts`](../tests/creator-membership-cohorts.test.ts).

### P5a-ins-005 — API: tier stickiness / tenure statistics

- **Depends on:** P5a-ins-002
- **Owner:** backend
- **Exit:** Per-tier: median tenure, churn rate proxy, member count; labeled “estimated from Patreon sync timestamps.”
- **Tests:** Unit on tier bucketing.

- **Logged (2026-05-08):** **`GET /api/v1/creator/analytics/tier-stickiness`** (creator Bearer; **`?days=`** 1–366, default **30**). JSON: **`as_of`**, **`window_days`**, **`tiers[]`** (`tier_id`, `title`, `amount_cents`, **`member_count`**, **`median_tenure_days`**, **`churn_proxy`**, **`cancel_events_in_window`**), **`estimated_from_sync`**, **`note`**. Logic: [`src/analytics/creator-tier-stickiness.ts`](../src/analytics/creator-tier-stickiness.ts); tests [`tests/creator-tier-stickiness.test.ts`](../tests/creator-tier-stickiness.test.ts).

### P5a-ins-006 — Patreon Insights **CSV** import (post metrics)

- **Depends on:** P5a-ins-001, P5a-db-002
- **Owner:** backend
- **Exit:** `POST` multipart or signed upload: parse Patreon export columns (**Impressions**, **Seen**, **Likes**, **Comments** per post); store per `patreon_post_id` + period; idempotent file hash.
- **Code:** Parser + validation errors surfaced to UI; **no** scraping Patreon web.
- **Retrofit:** Link rows to Relay ingested posts when IDs match.
- **Tests:** Fixture CSV from sanitized sample; reject malformed headers.

- **Logged (2026-05-08):** **`POST /api/v1/creator/analytics/patreon-insights-csv`** — **`multipart/form-data`** field **`file`** (CSV); optional field **`label`**; optional query **`as_of`** (ISO datetime stored on each metric row). **SHA-256** of raw file bytes → idempotent **`PatreonInsightsImport`** per **`(creator_id, file_hash)`**; child **`PatreonInsightsPostMetric`** rows (impressions / seen / likes / comments); **`post_id`** FK set when a **`Post`** matches id / `provider_post_id` / numeric id. Responses: **`import_id`**, **`file_hash`**, **`rows_written`**, **`already_imported`**, **`filename`**. Parser + ingest: [`src/analytics/patreon-insights-csv.ts`](../src/analytics/patreon-insights-csv.ts); tests [`tests/patreon-insights-csv.test.ts`](../tests/patreon-insights-csv.test.ts). Dependency: **`busboy`** (multipart).

### P5a-ins-007 — Join imported post metrics to creator content graph

- **Depends on:** P5a-ins-006
- **Owner:** backend
- **Exit:** API or view model: “post performance” merges CSV metrics + Relay publish/sync metadata where possible; document **gaps** when post only exists on one side.
- **Tests:** Integration with two fixture posts.

- **Logged (2026-05-08):** **`GET /api/v1/creator/analytics/post-performance`** (creator Bearer). Query: optional **`import_id`** (must belong to studio; **404** if not); **`metrics_limit`** (default **500**, max **2000**); **`relay_only_limit`** (default **40**, max **200**); **`include_relay_only=`** `0` / `false` to omit Relay-only rows. JSON: latest Insights import context (**`import_id`**, **`import_uploaded_at`**, **`label`**) or **`null`** if none; **`rows[]`** with **`patreon_post_id`**, **`post_id`**, **`insights`** (CSV numbers + **`as_of`**), **`relay`** (title, **`published_at`**, **`source`**, **`upstream_status`**, **`is_public`**), **`gap`** (`none` \| `metrics_without_relay` \| `relay_without_metrics`); **`relay_only_count`**, **`relay_only_truncated`**, explanatory **`note`**. Implementation: [`src/analytics/creator-post-performance.ts`](../src/analytics/creator-post-performance.ts); tests [`tests/creator-post-performance.test.ts`](../tests/creator-post-performance.test.ts).

### P5a-ins-008 — Frontend: creator **Analytics** overview route

- **Depends on:** P3-web-001, P5a-ins-003, P5a-ins-004
- **Owner:** frontend
- **Exit:** Canonical `web/app/.../analytics` (exact path in routing doc): KPI cards, cohort chart, tier table; empty states when CSV not uploaded.
- **Code:** Reuse design tokens with Library/Action Center patterns.
- **Tests:** RTL with mocks.

- **Logged (2026-05-08):** Route **`/analytics`** — [`web/app/analytics/page.tsx`](../web/app/analytics/page.tsx) + client [`web/app/analytics/AnalyticsOverviewClient.tsx`](../web/app/analytics/AnalyticsOverviewClient.tsx). Nav + middleware gate with other studio routes. Fetches **`membership-summary`**, **`membership-cohorts`**, **`tier-stickiness`**, **`post-performance`**; CSV upload UI calls **`POST .../patreon-insights-csv`**. API helpers in [`web/lib/relay-api.ts`](../web/lib/relay-api.ts). RTL: [`tests/web/analytics-overview.test.tsx`](../tests/web/analytics-overview.test.tsx). Route row: [`docs/web-route-inventory.md`](web-route-inventory.md).

### P5a-ins-009 — Frontend: **Pulse** sidebar / strip (pilot scope)

- **Depends on:** P5a-ins-007, P5a-ins-003
- **Owner:** frontend
- **Exit:** Collapsible strip: e.g. “What’s hot” = top post by **Seen/hour** or **likes+comments** from **CSV + publish time**; “Recent momentum” = net adds last 7d from ledger; supporter / Subshop activity only if API provides it—**do not** fake data.
- **Tests:** RTL.

- **Logged (2026-05-08):** Collapsible **Pulse** on **`/analytics`** — [`web/app/analytics/AnalyticsPulseStrip.tsx`](../web/app/analytics/AnalyticsPulseStrip.tsx) + wiring in [`web/app/analytics/AnalyticsOverviewClient.tsx`](../web/app/analytics/AnalyticsOverviewClient.tsx). **What’s hot:** top post by **Seen/hour** (fallback **(likes+comments)/hour**) using Insights CSV + **`relay.published_at`** only — [`web/lib/analytics-pulse.ts`](../web/lib/analytics-pulse.ts) + unit tests [`web/lib/analytics-pulse.test.ts`](../web/lib/analytics-pulse.test.ts). **Recent momentum:** second **`membership-summary`** call **`days=7`**. Explicit note when Subshop/supporter extras are unavailable. RTL extended [`tests/web/analytics-overview.test.tsx`](../tests/web/analytics-overview.test.tsx).

### P5a-ins-010 — Product copy: Patreon API limits & data freshness

- **Depends on:** P5a-ins-008
- **Owner:** product + frontend
- **Exit:** In-dashboard footnotes: impressions/seen source = **imported CSV**; membership metrics from **sync**; stale-data warning when last CSV > N days.
- **Tests:** Copy review.

- **Logged (2026-05-08):** [`web/lib/analytics-data-freshness.ts`](../web/lib/analytics-data-freshness.ts) (default **14** days, optional **`NEXT_PUBLIC_RELAY_INSIGHTS_STALE_DAYS`**). Stale banner + source copy on **`/analytics`** — [`web/app/analytics/AnalyticsOverviewClient.tsx`](../web/app/analytics/AnalyticsOverviewClient.tsx), Pulse footnotes — [`web/app/analytics/AnalyticsPulseStrip.tsx`](../web/app/analytics/AnalyticsPulseStrip.tsx). Unit: [`web/lib/analytics-data-freshness.test.ts`](../web/lib/analytics-data-freshness.test.ts). RTL: [`tests/web/analytics-overview.test.tsx`](../tests/web/analytics-overview.test.tsx).

### P5a-ins-011 — Relay-first-party engagement events (minimal)

- **Depends on:** P5a-ins-001
- **Owner:** backend
- **Exit:** Append-only **`RelayEngagementEvent`** rows (see **P5a-db-002**) where visitor endpoints exist; privacy: aggregate in API for pilot unless product approves per-viewer drill-down.
- **Wiring:** Align with **P8** RLS and public vs creator routes.
- **Tests:** Unit + one integration.

- **Logged (2026-05-08):** Fire-and-forget writes from visitor gallery APIs when **`RELAY_DB_STORE_ANALYTICS`** (or **`relay_db_store_analytics`**) is on — [`src/analytics/relay-engagement-event.ts`](../src/analytics/relay-engagement-event.ts); **`GET /api/v1/gallery/facets?visitor=true`** → **`profile_view`**; **`GET /api/v1/gallery/items`** first page (**no `cursor`**) → **`gallery_view`**; **`GET /api/v1/gallery/post-detail?visitor=true`** → **`gallery_view`** with **`postId`**. Unit: [`tests/relay-engagement-event.test.ts`](../tests/relay-engagement-event.test.ts).

### P5a-ins-012 — Tests: analytics API bundle in CI

- **Depends on:** P5a-ins-003 — P5a-ins-007
- **Owner:** qa
- **Exit:** `describe` blocks for summary, cohort, tier, CSV import error paths; fixtures in `tests/fixtures/patreon-insights-sample.csv`.
- **Tests:** CI.

- **Logged (2026-05-08):** [`tests/creator-analytics-api-bundle.test.ts`](../tests/creator-analytics-api-bundle.test.ts) — **`membership-summary`**, **`membership-cohorts`**, **`tier-stickiness`**, **`post-performance`** (503 + 401 paths); **`patreon-insights-csv`** (503, 401 with multipart attach, fixture **`parseInsightsCsv`**, **`readPatreonInsightsMultipart`** `NOT_MULTIPART`). Fixture: [`tests/fixtures/patreon-insights-sample.csv`](../tests/fixtures/patreon-insights-sample.csv).

**Optional experimental (count toward “≤2” pilot cap — ship only after P5a-ins-008 is green):**

### P5a-exp-001 — Rule-based **quiet-period** insight card

- **Depends on:** P5a-ins-008, P5a-ins-006
- **Owner:** backend + product
- **Exit:** If no Patreon publish activity in **N** days (from synced posts or CSV row dates), show **one** card: “Consider a short update or poll” + link to Library; **no** auto-posting; configurable N; note in UI that this is a **heuristic**.
- **Tests:** Unit on date logic; PM sign-off on false positives.

### P5a-exp-002 — Rule-based **churn risk** highlight (heuristic)

- **Depends on:** P5a-ins-002, P5a-ins-008
- **Owner:** backend + product
- **Exit:** Simple score: e.g. elevated cancel rate in trailing 30d vs prior 30d + tier-down events; **informational** tone; link to cohort view.
- **Tests:** Synthetic ledger edge cases.

**Phase P5a — v0 Mandatory Assets (delta):**

- **Analytics overview** — KPI row, cohort chart, tier table, CSV upload CTA, footnotes on data sources.
- **Pulse strip** — What’s hot / momentum widgets; loading/error; WCAG contrast.
- **CSV import modal** — File picker, column mapping errors, success recap.

---

# Phase P6 — Patron shell + feed honesty (thin Part 3)

**Purpose:** Dedicated patron experience with honest labeling and degraded entitlements.

**Road map alignment:** Part 3 **Workstreams K, L** (subset); no full Browse.

**Gap closed:** Shell routes, copy for subscription vs discovery, stale OAuth messaging.

---

### P6-patron-001 — Audit existing `web/app/patron/**` routes

- **Depends on:** P3-web-001
- **Owner:** frontend
- **Exit:** Markdown map: URL → purpose; list gaps vs road map K.
- **Tests:** N/A.

- **Logged (2026-05-08):** [`docs/web-patron-route-audit.md`](../docs/web-patron-route-audit.md) — table of **`/patron/*`** pages, related **`/patreon/patron/*`**, gaps vs Workstream **K / L / M**, pilot P6 notes (nav vs P6-patron-002 wording).

### P6-patron-002 — Patron layout: dedicated shell (no designer chrome)

- **Depends on:** P6-patron-001
- **Owner:** frontend
- **Exit:** `web/app/patron/layout.tsx` provides nav: Feed, Profile, Settings.
- **Code:** Adjust shared layout imports.
- **Tests:** Build.

- **Logged (2026-05-08):** [`web/app/patron/layout.tsx`](../web/app/patron/layout.tsx) + [`PatronTopNav`](../web/app/patron/PatronTopNav.tsx) — **Feed**, **Profile**, **Settings** plus Library, Discover, Inbox. [`ConditionalAppNav`](../web/app/components/ConditionalAppNav.tsx) now hides studio nav for exact **`/patron`** (previously only `/patron/...` children), so the supporter landing page never shows creator **AppNav**.

### P6-patron-003 — Feed card: badge “Subscribed” vs “Discover”

- **Depends on:** P6-patron-001
- **Owner:** frontend + backend
- **Exit:** API includes `feed_item_source` enum; UI renders badge.
- **Code:** [src/patron/assemble-patron-feed.ts](../src/patron/assemble-patron-feed.ts) + types in [web/lib/patron-feed-api.ts](../web/lib/patron-feed-api.ts).
- **Retrofit:** JSON fixtures [web/lib/patron-relay-feed-bundle.json](../web/lib/patron-relay-feed-bundle.json) updated.
- **Tests:** Unit + snapshot.

- **Logged (2026-05-08):** API field **`feed_item_source`** (`subscribed` \| `discover`) on each feed post — [`src/patron/patron-feed-types.ts`](../src/patron/patron-feed-types.ts), set in [`assemblePatronFeed`](../src/patron/assemble-patron-feed.ts) from **`Post.is_public`** (public → discover; membership-gated → subscribed). **`kind`** stays aligned for layout. Web types + fixture bundle — [`web/lib/relay-fixtures.ts`](../web/lib/relay-fixtures.ts), regenerated [`web/lib/patron-relay-feed-bundle.json`](../web/lib/patron-relay-feed-bundle.json). UI — [`web/components/patron/relay/feed-card.tsx`](../web/components/patron/relay/feed-card.tsx) (“Discover” strip + “Subscribed” chip); [`discoverItemToPost`](../web/components/patron/relay/relay-app.tsx). Re-export [`PatronFeedItemSource`](../web/lib/patron-feed-api.ts). Tests: [`tests/patron/assemble-patron-feed.test.ts`](../tests/patron/assemble-patron-feed.test.ts), [`tests/web/feed-card-source-badge.test.tsx`](../tests/web/feed-card-source-badge.test.tsx).

### P6-patron-004 — Degraded: stale Patreon link banner

- **Depends on:** P5-sync-001 pattern
- **Owner:** frontend + backend
- **Exit:** API returns `entitlement_stale_since` or similar; UI banner + CTA “Reconnect Patreon”.
- **Code:** Patron OAuth refresh worker integration fields.
- **Tests:** Integration.

- **Logged (2026-05-08):** Feed bundle adds **`entitlement_degraded`** and **`entitlement_stale_since`** (missing snapshot for a followed creator, or `stale_after` in the past) — [`src/patron/assemble-patron-feed.ts`](../src/patron/assemble-patron-feed.ts), [`src/patron/patron-feed-types.ts`](../src/patron/patron-feed-types.ts). Web types + fixtures — [`web/lib/relay-fixtures.ts`](../web/lib/relay-fixtures.ts); live shell defaults in [`relay-app.tsx`](../web/components/patron/relay/relay-app.tsx). Banner + CTA — [`patron-entitlement-stale-banner.tsx`](../web/components/patron/relay/patron-entitlement-stale-banner.tsx) (shown when **`dataSource === "live"`** and bundle flags degraded). Regenerate [`web/lib/patron-relay-feed-bundle.json`](../web/lib/patron-relay-feed-bundle.json). Tests: [`tests/patron/assemble-patron-feed.test.ts`](../tests/patron/assemble-patron-feed.test.ts), [`tests/web/patron-entitlement-stale-banner.test.tsx`](../tests/web/patron-entitlement-stale-banner.test.tsx).

### P6-patron-005 — Empty feed state copy

- **Depends on:** P6-patron-002
- **Owner:** frontend
- **Exit:** Three variants: no follows, no posts, OAuth missing.
- **Tests:** RTL.

- **Logged (2026-05-08):** Live home feed empty state uses **`PatronEmptyFeedState`** — [`patron-empty-feed-state.tsx`](../web/components/patron/relay/patron-empty-feed-state.tsx) — three scenarios: **Patreon not linked** (`live_oauth`, copy + Continue to Patreon), **linked but no follows** (`live_no_follows`, Discover CTA), **follows but no visible posts** (`live_no_posts`, reconnect hint). Filter chip mismatch + fixture fallback unchanged at component level. Wired from [`relay-app.tsx`](../web/components/patron/relay/relay-app.tsx). Tests: [`tests/web/patron-empty-feed-state.test.tsx`](../tests/web/patron-empty-feed-state.test.tsx).

### P6-patron-006 — Patron E2E smoke (optional)

- **Depends on:** P6-patron-003
- **Owner:** qa
- **Status:** **Deferred — Playwright not in scope** for this repo right now. Treat patron smoke as **manual** or extend **RTL / integration** tests instead of browser E2E.
- **Exit (if ever revived):** Single browser E2E: login mock → feed visible.
- **Tests:** N/A unless tooling changes.

### P6-patron-007 — Post detail route or modal (thin)

- **Depends on:** P6-patron-003
- **Owner:** frontend
- **Exit:** One screen: deep-link from feed row; shows asset + entitlement strip; 404 for gated if API says so.
- **Tests:** RTL with mock.

- **Logged (2026-05-08):** Shareable post URL **`/patron/feed/post/[creatorId]/[postId]`** — [`page.tsx`](../web/app/patron/feed/post/[creatorId]/[postId]/page.tsx), [`patron-post-detail-client.tsx`](../web/components/patron/relay/patron-post-detail-client.tsx): loads **`GET /api/v1/gallery/post-detail`** with **`visitor: true`** + session cookie; **`notFound()`** on HTTP 404 (gated/missing); maps DTO → **`GalleryView`** via [`patron-post-detail-mapper.ts`](../web/lib/patron-post-detail-mapper.ts); tier strip [`patron-post-entitlement-strip.tsx`](../web/components/patron/relay/patron-post-entitlement-strip.tsx) via new optional **`entitlementStrip`** on [`gallery-view.tsx`](../web/components/patron/relay/gallery-view.tsx). Live feed card navigates to this route; fixtures keep the in-app modal. [`not-found.tsx`](../web/app/patron/feed/post/[creatorId]/[postId]/not-found.tsx). Tests: [`tests/web/patron-post-detail-mapper.test.ts`](../tests/web/patron-post-detail-mapper.test.ts), [`tests/web/patron-post-entitlement-strip.test.tsx`](../tests/web/patron-post-entitlement-strip.test.tsx).

### P6-patron-008 — Patron settings stub (notifications opt-out placeholder)

- **Depends on:** P6-patron-002
- **Owner:** frontend
- **Exit:** Static “Coming soon” or toggle persisted **no-op**—document no backend in pilot.
- **Tests:** Build.

- **Logged (2026-05-08):** Patron **`/patron/settings`** adds **Notifications** section with a **Quiet mode (pilot placeholder)** switch — local UI state only (resets on refresh); copy explains no server save. Link to real **`/patron/notifications/preferences`** for API-backed per-type toggles. [`PatronSettingsClient.tsx`](../web/app/patron/settings/PatronSettingsClient.tsx), [`page.tsx`](../web/app/patron/settings/page.tsx) comment.

**Phase P6 — v0 Mandatory Assets (delta):**

- **Patron feed row** — thumbnail, title, creator, badge, timestamp.
- **Patron empty states** — illustrations or simple icon; 6th-grade copy.
- **Reconnect Patreon** — full-width mobile CTA.

---

# Phase P7 — Pilot billing / metering (Monetization M1) or waiver

**Purpose:** [monetization-scheme-infrastructure-plan.md](../monetization-scheme-infrastructure-plan.md) **M1** — *“Usage metering and billing primitives”* (Operational Milestones section) — **or** explicit pilot waiver.

**Gap closed:** Legal/product stance + minimal events **or** documented manual metering.

---

### P7-bill-001 — Stakeholder decision: M1-lite vs Pilot Waiver

- **Depends on:** P0-base-001
- **Owner:** product
- **Exit:** Sign-off in Airtable: implement `usage_events` **or** waiver with owner + renewal date.
- **Tests:** N/A.
- **Logged (2026-05-08):** Engineering track **M1-lite** — `usage_events` table + instrumentation (P7-bill-002–004). **Airtable:** record same sign-off on Production Ledger / Batting Order as your process requires.

### P7-bill-002 — If M1-lite: Prisma `UsageEvent` model

- **Depends on:** P7-bill-001
- **Owner:** backend
- **Exit:** Append-only events: `tenant_id`, `metric`, `quantity`, `meta`, `occurred_at`.
- **Tests:** migration.
- **Logged (2026-05-08):** [prisma/schema.prisma](../prisma/schema.prisma) `UsageEvent`; migration [prisma/migrations/20260508200000_usage_events/migration.sql](../prisma/migrations/20260508200000_usage_events/migration.sql); helper [src/usage/usage-events.ts](../src/usage/usage-events.ts).

### P7-bill-003 — Instrument: R2 egress hook (if available)

- **Depends on:** P7-bill-002
- **Owner:** backend
- **Exit:** On signed GET or proxy log, emit event (sampled if volume high).
- **Code:** Export routes in [src/server.ts](../src/server.ts).
- **Tests:** Unit with mock.
- **Logged (2026-05-08):** Export GETs [src/server.ts](../src/server.ts) — `export.media.content|thumb|preview.bytes` (quantity = bytes sent; range requests use partial length), `export.library_zip.completed` (quantity 1, `http_status` in meta). [tests/usage-events.test.ts](../tests/usage-events.test.ts) covers emit helpers.

### P7-bill-004 — Instrument: API request counter per tenant (rate limiter)

- **Depends on:** P7-bill-002
- **Owner:** backend
- **Exit:** Daily rollup job or materialized query documented.
- **Code:** [src/middleware/rate-limits.ts](../src/middleware/rate-limits.ts) hook.
- **Tests:** Unit.
- **Logged (2026-05-08):** Shared 429 JSON handler calls `scheduleRateLimit429ForRequest` → metric `api.rate_limited` (tenant from `relayRateLimitKey` → `Account.primaryRelayCreatorId` when present). Rollup SQL: [docs/database/usage-events-rollups.md](database/usage-events-rollups.md). [tests/usage-events.test.ts](../tests/usage-events.test.ts).

### P7-bill-005 — If Waiver: document manual spreadsheet template

- **Depends on:** P7-bill-001
- **Owner:** product
- **Exit:** Link to Google Sheet template + who updates weekly.
- **Tests:** N/A.

### P7-bill-006 — GDPR / data-export hook (pilot placeholder)

- **Depends on:** P7-bill-001
- **Owner:** product + backend
- **Exit:** Doc: “export my data” either **not in pilot** or single JSON dump path—align with [monetization-scheme-infrastructure-plan.md](../monetization-scheme-infrastructure-plan.md) compliance themes (M3); no Stripe.
- **Tests:** N/A (or one supertest if endpoint exists).
- **Logged (2026-05-08):** **Single JSON path in pilot:** authenticated **GET** [`/api/v1/patron/me/export`](../src/server.ts) → [`buildPatronExportBundle`](../src/patron/data-export-service.ts). Plain-English pilot note: [docs/pilot-patron-data-export.md](pilot-patron-data-export.md). Unit: [tests/patron/data-export-service.test.ts](../tests/patron/data-export-service.test.ts).

**Phase P7 — v0 Mandatory Assets (delta):**

- **Usage preview card** (only if M1-lite shipping) — simple bar chart, non-binding estimates.
- **Logged (2026-05-08):** **GET** [`/api/v1/creator/analytics/usage-preview`](../src/server.ts) → [`getCreatorUsagePreview`](../src/usage/usage-preview-service.ts) (tenant-scoped `usage_events` rollup). **Web:** Analytics → **Usage preview (beta)** bars ([`AnalyticsOverviewClient`](../web/app/analytics/AnalyticsOverviewClient.tsx), [`fetchCreatorUsagePreview`](../web/lib/relay-api.ts)). **Tests:** [`tests/usage-preview-service.test.ts`](../tests/usage-preview-service.test.ts).

---

# Phase P8 — Security & RLS verification gate

**Purpose:** Pilot-safe tenant isolation for Supabase + Prisma paths.

**Road map alignment:** Security defaults; [docs/database/M10_VERIFICATION.md](database/M10_VERIFICATION.md).

**Gap closed:** Documented RLS context usage + tests; backlog for `@security-audit-required` routes.

---

### P8-sec-001 — RLS context audit in [src/server.ts](../src/server.ts)

- **Depends on:** —
- **Owner:** backend
- **Exit:** Table: route prefix → `setSupabaseRlsContext` called? y/n; link to Prisma path.
- **Code:** Manual pass; optional script grep `setSupabaseRlsContext`.
- **Tests:** N/A.

- **Logged (2026-05-08):** RLS is **not** duplicated on every route handler — shared **session gates** set Postgres `relay.account_id` for Prisma:
  | Entry | Sets context? | Mechanism |
  |-------|---------------|-----------|
  | `requireAccount` / `requireAccountWithRole` | **Yes** when Account resolves | [`setSupabaseRlsContext`](../src/identity/require-account.ts) on the app `prisma` client |
  | `requireAccountMatchesCreator` | **Yes** | Calls `requireAccount`, then checks `primaryRelayCreatorId` |
  | `requirePatronBearerSession` | **When session links to Account** | [`applyRelayAccountRlsIfPresent`](../src/identity/require-account.ts) after `resolveSession` (try/catch; stubs may skip) |
  | Patron PE-J data routes (`/api/v1/patron/me/export`, membership delete, account deletion) | **Yes** in normal flow | `requirePatronBearerSession` **before** account-scoped Prisma calls |
  | Unauthenticated / visitor reads | **No** | Intentional unless another path sets context |
  **Refs:** [`src/server.ts`](../src/server.ts) (`requirePatronBearerSession`), [`docs/architecture/rls-context-usage.md`](architecture/rls-context-usage.md), [`src/lib/supabase-rls-context.ts`](../src/lib/supabase-rls-context.ts).

### P8-sec-002 — Cross-tenant negative tests (patron cannot read other creator)

- **Depends on:** P8-sec-001
- **Owner:** qa
- **Exit:** Vitest or integration: 403/404 on foreign `creator_id`.
- **Code:** `tests/security/tenant-isolation.test.ts`.
- **Tests:** CI.
- **Logged (2026-05-08):** [tests/security/tenant-isolation.test.ts](../tests/security/tenant-isolation.test.ts) — file-identity patron session for `creator_id` A; calls favorites list, collections list, favorites PUT, collections POST, entitlements health with creator B → **403 FORBIDDEN** (session not entitled for this creator).

### P8-sec-003 — Patron session cannot mutate creator resources

- **Depends on:** P8-sec-002
- **Owner:** qa
- **Exit:** POST gallery mutate with patron cookie fails.
- **Tests:** CI.
- **Logged (2026-05-08):** [tests/relay-creator-tenant-authz.test.ts](../tests/relay-creator-tenant-authz.test.ts) — **P8-sec-003** describe: Postgres patron-only session (Supabase sync + relay-session, **no** creator workspace); **POST** `/api/v1/gallery/collections` → **403** with **Bearer** or **`relay_session`** cookie; **POST** `/api/v1/gallery/media/bulk-tags` → **403**.

### P8-sec-004 — Export signed URL TTL and replay test

- **Depends on:** —
- **Owner:** backend
- **Exit:** Document TTL; test expired URL rejected.
- **Tests:** Unit.
- **Logged (2026-05-08):** [docs/export-r2-presigned-ttl.md](export-r2-presigned-ttl.md) (library **GET** export = Relay-proxied, not R2 presigned; **presigned PUT** TTL = `R2_PRESIGN_EXPIRES_SEC` / `getPresignExpiresSec`). Helpers [presignedUrlSigningExpiresAt](../src/storage/relay-upload-r2.ts) / [isPresignedUrlExpired](../src/storage/relay-upload-r2.ts); unit tests in [tests/relay-upload-r2.test.ts](../tests/relay-upload-r2.test.ts) (`isPresignedUrlExpired` for past window = same rule R2 uses to **403** replay).

### P8-sec-005 — Security backlog CSV from JSDoc tags

- **Depends on:** P8-sec-001
- **Owner:** backend
- **Exit:** Script `rg @security-audit-required src` → CSV with file + symbol; import to Airtable.
- **Tests:** N/A.
- **Logged (2026-05-09):** [scripts/security-audit-required-csv.mjs](../scripts/security-audit-required-csv.mjs) scans `src/**/*.ts`, CSV columns `file`, `line`, `symbol`, `note`. Run `npm run security:audit-csv` → [docs/security-audit-required-backlog.csv](security-audit-required-backlog.csv). Manual: `rg "@security-audit-required" src`.

### P8-sec-006 — Next.js + API CSP / security headers review

- **Depends on:** P8-sec-001
- **Owner:** devops + frontend
- **Exit:** Table: header name → value for `web/` (Next `headers()`), API `helmet` or manual; pilot “good enough” vs full hardening deferred.
- **Tests:** Manual checklist row in P9.
- **Logged (2026-05-09):** [docs/pilot-security-headers.md](pilot-security-headers.md) — inventory: **no** `helmet`; **no** app-defined CSP / `X-Frame-Options` / `X-Content-Type-Options` in repo; API sets **CORS** + **`X-Trace-Id`** + per-route **Cache-Control**; `web/middleware.ts` is auth routing only. Manual steps appended for P9.

**Phase P8 — v0 Mandatory Assets (delta):** _None (unless security settings screen scoped)._

---

# Phase P9 — Unified test strategy & pilot exit

**Purpose:** Single CI truth; pilot Definition of Done scaled from roadmap gates.

**Road map alignment:** Testing and Release Gates section (scaled down for pilot N).

**Gap closed:** Repeatable verify script; explicit pilot exit checklist.

---

### P9-test-001 — Document `verify:pilot` script

- **Depends on:** P1-queue-017, P2-obs-003, P3-web-003
- **Owner:** qa
- **Exit:** `npm run verify:pilot` runs `npm run build`, `npm run test`, `npm run lint --prefix web`, `npm run build --prefix web`.
- **Code:** [package.json](../package.json).
- **Tests:** Self.
- **Logged:** `verify:pilot` + `verify:m10` in [package.json](../package.json). **CI parity:** [docs/pilot-exit-checklist.md](pilot-exit-checklist.md) § *CI vs local verify:pilot* ↔ [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).

### P9-test-002 — Contract tests bundle: onboarding + sync + feed + analytics + usage preview

- **Depends on:** P4-onb-002, P5-sync-002, P6-patron-003, P5a-ins-003, P5a-db-002
- **Owner:** qa
- **Exit:** One describe block per domain; snapshot JSON schemas optional.
- **Tests:** CI.
- **Logged:** [tests/pilot-contract-bundle.test.ts](../tests/pilot-contract-bundle.test.ts) — five domains: onboarding read-model, sync health web DTO, patron feed bundle keys, `GET /api/v1/health/analytics` envelope, `getCreatorUsagePreview` read-model (stable bar order for usage-preview API).

### P9-test-003 — Pilot exit checklist (scaled Part 1 gates)

- **Depends on:** P9-test-001
- **Owner:** product
- **Exit:** Checklist markdown: e.g. “10 creators OAuth without support” **pilot = 5**; “5k media” **pilot = 500**; document consciously.
- **Tests:** Human sign-off.
- **Manual — security headers (P8-sec-006):** Follow the three steps at the end of [docs/pilot-security-headers.md](pilot-security-headers.md) (host HSTS, API trace/cache headers, post-pilot helmet/CSP decision).
- **Logged (2026-05-09):** Template + scale table [docs/pilot-exit-checklist.md](pilot-exit-checklist.md). Product completes “Met?” + dated sign-off.

### P9-test-004 — Load smoke (optional)

- **Depends on:** P1-queue-017
- **Owner:** devops
- **Exit:** k6 or Artillery script for 5 min at X RPS on health + feed read.
- **Tests:** Manual run recorded.
- **Logged (2026-05-09):** Node driver [scripts/pilot-load-smoke.mjs](../scripts/pilot-load-smoke.mjs); `npm run load:smoke:pilot`; how-to + recording [docs/pilot-load-smoke.md](pilot-load-smoke.md) (health + analytics; optional gallery / patron feed via env).

### P9-test-005 — Flaky test triage policy

- **Depends on:** P9-test-001
- **Owner:** qa
- **Exit:** `docs/` note: retry count in CI; quarantine label; owner must file fix-by date.
- **Tests:** N/A.
- **Logged (2026-05-09):** [docs/flaky-test-triage.md](flaky-test-triage.md) — current CI has no Vitest retries; policy for `flaky-test` label, fix-by, quarantine.

### P9-test-006 — Browser matrix for pilot UX

- **Depends on:** P9-test-003
- **Owner:** qa
- **Exit:** One table: Chrome desktop, Safari iOS, Android Chrome (versions); “best effort” vs blocking bugs.
- **Tests:** Human sign-off.
- **Logged (2026-05-09):** [docs/pilot-browser-matrix.md](pilot-browser-matrix.md).

**Phase P9 — v0 Mandatory Assets (delta):** _None._

---

# Appendix A — v0 Mandatory Assets Register (consolidated)

Feed these prompts to v0 (or your UI generator) in batches; include **Relay** tokens, **dark/light** if product supports, and **mobile-first**.

| # | Asset name | Purpose | v0 constraints | Ships (route) | Data / API |
| --- | --- | --- | --- | --- | --- |
| A1 | Library shell frame | Creator Library chrome | Nav, responsive, skeleton | `web/app/.../library` | Gallery list APIs |
| A2 | Designer shell frame | Layout editing | Save states, dirty indicator | `web/app/.../designer` | Layout PATCH |
| A3 | Patron shell frame | Fan experience | Bottom nav optional | `web/app/patron/...` | Session |
| A4 | Shared modals — Patreon | Connect / link | OAuth explainer, errors | Multiple | OAuth endpoints |
| A5 | Onboarding stepper | Part 1-A | 4 steps, icons | Creator home | Onboarding GET/PATCH |
| A6 | Import / sync panel | Trust | Non-technical copy | Library | Sync health DTO |
| A7 | Publish blocked modal | Gating | List missing steps | Designer | Onboarding + sync |
| A8 | Sync status banner | Health | Color tokens, a11y | Library | Sync health DTO |
| A9 | Sync detail drawer | Deep status | Timestamps | Library | Sync health DTO |
| A10 | Patron feed row | Feed | Badges | Patron feed | Feed API |
| A11 | Patron empty states | Onboarding | Illustration or icon | Patron feed | — |
| A12 | Reconnect Patreon CTA | Degraded | Full width mobile | Patron | OAuth |
| A13 | Error reference strip | Support | Small text, copy ID | Global error | trace id |
| A14 | Usage preview card | M1-lite only | “Beta estimates” | Creator dashboard | Usage rollup |
| A15 | Analytics overview | Workstream E pilot | KPI + cohort + tier + source footnotes | `web/app/.../analytics` | P5a APIs + CSV |
| A16 | Pulse strip | Momentum UX | Collapsible; What’s hot; no fake social proof | Library or analytics shell | P5a summary + post metrics |
| A17 | Patreon Insights CSV import | Bridge API gaps | Error states; column help | Analytics route | Upload API |

---

# Appendix B — Plain English summary (for non-coders)

**Phase P0 — Baseline**  
We wrote down exactly what the pilot includes and what we are **not** doing yet. We fixed the **dependency report** so it does not cry wolf about fake broken imports. We checked whether some npm packages are **truly unused** and can be removed. **Result:** The team agrees on scope; reports are trustworthy. **Still needed:** People must keep the pilot doc updated when scope changes. **What’s next:** Start the job queue work.

**Phase P1 — Durable jobs**  
We added **Redis** and **BullMQ** (a job runner). Background tasks—like syncing Patreon, refreshing fan access, sending notifications, cleaning up accounts, and deleting old files—run as **real jobs** instead of only hidden timers. That means we can run **more than one server**, restart safely, and retry failed work. A short **Redis / BullMQ ops runbook** (fail over to `RELAY_JOB_BACKEND=memory` when Redis is down, memory sizing, sanity checks) lives in the Phase P1 section of this doc. **Result:** The system behaves more like a grown-up app. **Still needed:** Someone must host Redis and learn the “split worker” layout if we use it. **What’s next:** Better logs and error tracking.

**Phase P2 — Observability**  
We added **structured logs** and **Sentry** (error reporting). Problems are easier to find and share with support using an ID. **Result:** When something breaks in the pilot, we can see why. **Still needed:** Set up Sentry projects and alerts. **What’s next:** Clean up duplicate web prototypes.

**Phase P3 — One web app**  
We stop treating three different Next folders as “maybe production.” **One** main `web/` app is the product; the others move or are blocked by lint rules. **Result:** Faster work, fewer duplicate buttons that do different things. **Still needed:** Designers must agree which screens survive. **What’s next:** Creator onboarding steps.

**Phase P4 — Onboarding steps**  
Creators must **Connect Patreon → wait for import → organize → publish** in order. The app remembers where they are and blocks **Publish** if things are unsafe. **Result:** Fewer half-done sites going public. **Still needed:** Clear words on each step. **What’s next:** Honest sync status.

**Phase P5 — Sync health**  
Creators see **green / yellow / red** status for Patreon sync. If sync is broken, the app can become **read-only** so bad edits do not stack up. **Result:** Trust during the pilot. **Still needed:** Support replies for common errors. **What’s next:** Analytics dashboard.

**Phase P5a — Creator analytics**  
Creators get a **real dashboard**: growth from **Patreon membership data**, **cohorts** and **tier** insights, and optional **CSV import** for post stats Patreon’s API does not give you. **The database migration batch runs first** so ingest and imports have real tables—not ad-hoc JSON. A small **Pulse** area highlights momentum and “what’s working.” **Result:** Insights beyond default Patreon views without pretending we have every metric on day one. **Still needed:** Creators must upload CSV if they want impression charts; honest footnotes about **where** each number comes from. **What’s next:** Patron experience.

**Phase P6 — Patron honesty**  
Fans see a **separate simple shell**. Posts say if they come from **subscription** or **discovery**. If Patreon needs reconnecting, we say so plainly. **Result:** Less confusion and fewer “I paid but can’t see” moments. **Still needed:** Copy review and real user tests. **What’s next:** Billing tracking decision.

**Phase P7 — Metering or waiver**  
We either start **counting usage** (storage, requests) in the database **or** we officially say “we track usage in a spreadsheet for the pilot.” Creators who get metering also see a **simple usage preview** on the **Analytics** page—export traffic and rate-limit hits shown as **beta** charts that are **not** invoices. **Result:** We know if we are ready to charge later. **Still needed:** Legal/commerce sign-off. **What’s next:** Security hardening.

**Phase P8 — Security gate**  
We prove **User A cannot see User B’s private stuff** and patrons cannot change creator settings. **Result:** Safer pilot. **Still needed:** Ongoing checks as we add routes. **What’s next:** Final automated tests.

**Phase P9 — Tests & launch checklist**  
One **`npm run verify:pilot`** command and a **short checklist** tell us “ready for cohort.” **GitHub Actions** on each PR runs the same kind of checks (plus database migrations, a **token-in-logs** scan, and Redis job tests), spelled out in the exit checklist. **Result:** Repeatable “go / no-go.” **Still needed:** Humans still sign off for UX and legal.

---

# Appendix C — “What next?” relative to [road map.md](../road%20map.md)

After this pilot plan is **fully executed**:

- **Milestone Build Order items 1–3** (Part 1 foundation, value, hardening) are **advanced** to a **pilot-appropriate** level—not every numeric SLO from the roadmap, but **the same shape** of product (OAuth, ingest, gallery, analytics foundation-lite, reliability).
- **Item 4** (Smart Tag Assistant) remains **explicitly later**.
- **Items 5–7** (Part 2 Clone / migrate / payments at scale) stay **mostly unstarted** unless the pilot explicitly includes a **single** migration experiment—plan those as a **separate** program.
- **Item 8** (Part 3 foundation) is **started in thin form** (patron identity, feed, honesty); **items 9–10** (discovery depth, paid audience products) stay **post-pilot** unless scope changes.

**Monetization plan:** **M1** is either **implemented lightly** or **waived with paperwork**. **M2–M5** remain **after** a successful pilot cohort unless you deliberately pull forward email/compliance work for a migration pilot.

---

**Work item count (quick index):** P0×9 + P1×22 + P2×8 + P3×10 + P4×10 + P5×6 + **P5a-db×4** + **P5a-ins×12** + P6×8 + P7×6 + P8×6 + P9×6 = **107** required cards; add **P5a-exp×1–2** only if you ship prescriptive insight rules in pilot (**109** max). Expand sub-bullets as separate Airtable rows → **~135–175** rows when split.

---

*End of Pilot Build Plan v0.1.*
