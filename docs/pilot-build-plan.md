# Relay Pilot Build Plan

**Version:** 0.1  
**Last updated:** 2026-05-08  
**Audience:** agentic coding runs, Airtable (Phases → Runs → Work items), human pilot owners  

**Primary references:**

- Strategic narrative & workstreams: [road map.md](../road%20map.md)
- Packaging, COGS, operational milestones M1–M5: [monetization-scheme-infrastructure-plan.md](../monetization-scheme-infrastructure-plan.md)
- Machine dependency graph (regenerate): `node scripts/relay-dependency-audit.mjs` → [relay_audit.json](../relay_audit.json), [audit/dependency_report.md](../audit/dependency_report.md)
- Sync hardening context: [docs/part1-sync-hardening-ledger.md](part1-sync-hardening-ledger.md)
- DB verification: [docs/database/M10_VERIFICATION.md](database/M10_VERIFICATION.md)

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
| Optional ghost deps: `patreon-dl`, `happy-dom` — verify CLI-only or remove | **P0** |

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

### P0-base-005 — Verify `happy-dom` usage

- **Depends on:** —
- **Owner:** qa
- **Exit:** Same pattern as P0-base-004 for [package.json](../package.json) `happy-dom`.
- **Code:** `rg happy-dom` in vitest config and tests; keep if Vitest env uses it; else remove.
- **Tests:** `npm run test`.

### P0-base-006 — Record Express vs NestJS technical debt

- **Depends on:** P0-base-001
- **Owner:** backend
- **Exit:** ADR-style subsection added **below this Phase** (2–5 bullets): why Express remains for pilot; when Nest evaluation happens.
- **Code:** Markdown only in this file (append “ADR: HTTP framework”).
- **Tests:** N/A.

### P0-base-007 — Pilot feature flag matrix

- **Depends on:** P0-base-001
- **Owner:** devops
- **Exit:** Table-as-list in Airtable or here: flag name, default, pilot value, owner.
- **Code:** Enumerate `RELAY_*` from [.env.example](../.env.example) relevant to pilot; mark required vs optional.

### P0-base-008 — Smoke: `npm run build` + `npm run test` on clean clone

- **Depends on:** P0-base-007
- **Owner:** qa
- **Exit:** Documented PASS/FAIL with commit SHA; failures become new work items.
- **Tests:** CI or manual log attached.

### P0-base-009 — Cross-check `web/tsconfig.json` exclude list vs repo

- **Depends on:** P0-base-002
- **Owner:** frontend
- **Exit:** Table: each `exclude` glob → folder exists?, intended quarantine label, owner.
- **Code:** [web/tsconfig.json](../web/tsconfig.json) (`onboarding_enhancement`, `b_i0ofEW9bMcy`, etc.).
- **Retrofit:** None; feeds P3-web-002 decision.
- **Tests:** N/A.

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

### P1-queue-002 — Add BullMQ dependencies

- **Depends on:** P1-queue-001
- **Owner:** backend
- **Exit:** `package.json` lists `bullmq`, `ioredis` (if not transitive); lockfile updated.
- **Code:** `npm install bullmq ioredis` (versions pinned per repo policy).
- **Tests:** `npm run build` passes.

### P1-queue-003 — Define queue names and job payload types

- **Depends on:** P1-queue-002
- **Owner:** backend
- **Exit:** `src/jobs/queue-names.ts` (or similar) exports const enum/string union for: `patreon_incremental_autosync`, `patron_entitlement_stale_refresh`, `notification_delivery`, `account_deletion_sweep`, `media_storage_purge`.
- **Code:** TypeScript interfaces for each job `data` (min: `{ traceId?: string }` + worker-specific ids).
- **Wiring:** Imported by producers and consumers only.
- **Tests:** Typecheck.

### P1-queue-004 — Extract “unit of work” from incremental autosync worker

- **Depends on:** P1-queue-003
- **Owner:** backend
- **Exit:** Pure async function `runIncrementalAutosyncOnce(args)` callable from timer **or** BullMQ processor; existing `startIncrementalAutosyncWorker` delegates to it.
- **Code:** Refactor [src/patreon/incremental-sync-worker.ts](../src/patreon/incremental-sync-worker.ts) without behavior change.
- **Retrofit:** [src/main.ts](../src/main.ts) still calls `startIncrementalAutosyncWorker` when flag `memory`.
- **Tests:** Existing tests if any; add one unit test calling `runIncrementalAutosyncOnce` with mocks.

### P1-queue-005 — Extract unit of work: patron entitlement stale refresh

- **Depends on:** P1-queue-003
- **Owner:** backend
- **Exit:** Same pattern for [src/patron/patron-entitlement-stale-worker.ts](../src/patron/patron-entitlement-stale-worker.ts).
- **Tests:** Mock Prisma + Patreon client.

### P1-queue-006 — Extract unit of work: notification delivery tick

- **Depends on:** P1-queue-003
- **Owner:** backend
- **Exit:** `processNotificationOutboxOnce(prisma)` (or existing internal) invokable from processor; reference PE-G comment in [src/main.ts](../src/main.ts).
- **Code:** [src/patron/notification-delivery-worker.ts](../src/patron/notification-delivery-worker.ts).
- **Tests:** Cover idempotent tick with empty outbox.

### P1-queue-007 — Extract unit of work: account deletion sweep

- **Depends on:** P1-queue-003
- **Owner:** backend
- **Exit:** [src/patron/account-deletion-worker.ts](../src/patron/account-deletion-worker.ts) refactored.
- **Tests:** Mock DB.

### P1-queue-008 — Extract unit of work: media storage purge sweep

- **Depends on:** P1-queue-003
- **Owner:** backend
- **Exit:** [src/storage/media-storage-purge-worker.ts](../src/storage/media-storage-purge-worker.ts) refactored.
- **Tests:** Mock queue + R2.

### P1-queue-009 — Implement `RELAY_JOB_BACKEND` flag

- **Depends on:** P1-queue-004 — P1-queue-008
- **Owner:** backend
- **Exit:** `memory` (default) preserves current [src/main.ts](../src/main.ts) behavior; `bullmq` requires `REDIS_URL` and registers processors.
- **Code:** [src/relay-server-env.ts](../src/relay-server-env.ts) or new `src/jobs/config.ts` parses flag; validate at bootstrap.
- **Wiring:** [src/main.ts](../src/main.ts) branches before starting workers.
- **Retrofit:** None for default.
- **Tests:** Unit tests for parse.

### P1-queue-010 — BullMQ Queue + Worker registration module

- **Depends on:** P1-queue-009
- **Owner:** backend
- **Exit:** `src/jobs/register-workers.ts` (name flexible) creates `Worker` instances with shared connection; logs queue name on ready.
- **Code:** Use `defaultJobOptions` for `removeOnComplete`, `removeOnFail`, backoff; set concurrency per queue (configurable via env).
- **Wiring:** Called from `src/worker-entry.ts` (see P1-queue-011) **or** from [src/main.ts](../src/main.ts) when single-process pilot explicitly chosen.
- **Tests:** Mock Redis.

### P1-queue-011 — Add optional `src/worker.ts` process entry

- **Depends on:** P1-queue-010
- **Owner:** backend
- **Exit:** `npm run worker` runs workers only; API runs via `npm start` without workers when split deploy.
- **Code:** New file + [package.json](../package.json) script `"worker": "node dist/src/worker.js"` (align with `tsc` outDir); document **dual-process** pilot topology.
- **Wiring:** Docker/k8s manifest snippet in `docs/pilot-deploy-notes.md` **optional** — if forbidden, document in Airtable only.
- **Retrofit:** [src/main.ts](../src/main.ts): when `RELAY_SPLIT_WORKER_PROCESS=1`, skip starting in-process loops.
- **Tests:** Smoke: worker starts without listening HTTP.

### P1-queue-012 — Producer: schedule repeat jobs for each queue

- **Depends on:** P1-queue-010
- **Owner:** backend
- **Exit:** Repeat interval mirrors current env MS semantics (normalize to cron or ms via BullMQ `repeat`).
- **Code:** Use `Queue.add` with `repeat: { every: N }` or cron; **disable** repeat when env says `MS=0` for that worker.
- **Wiring:** Producers run in API process on startup **or** one-shot “scheduler” process — **document choice**; prefer API emits schedules for pilot simplicity.
- **Retrofit:** Remove duplicate timers when `bullmq` active.
- **Tests:** Integration with test Redis.

### P1-queue-013 — Graceful shutdown: drain workers

- **Depends on:** P1-queue-010
- **Owner:** backend
- **Exit:** SIGINT closes Workers with `close()`; awaits pending jobs with timeout; then Redis disconnect.
- **Code:** Extend `shutdown()` in [src/main.ts](../src/main.ts) and mirror in `src/worker.ts`.
- **Wiring:** Align with existing `notificationRunner?.stop()` pattern.
- **Retrofit:** Order: stop HTTP → stop timers → close BullMQ → prisma disconnect.
- **Tests:** Manual or integration.

### P1-queue-014 — propagate `traceId` into job data

- **Depends on:** P1-queue-012
- **Owner:** backend
- **Exit:** Every job `data` includes optional `traceId`; processors log it (placeholder until Pino in P2).
- **Code:** When producer lacks HTTP context, generate `job_${uuid}`.
- **Tests:** Log assertion in integration test.

### P1-queue-015 — Idempotency review: notification outbox tick

- **Depends on:** P1-queue-006
- **Owner:** backend
- **Exit:** Written note in code or doc: two ticks cannot double-send same notification; add DB constraint test if missing.
- **Tests:** Concurrency test.

### P1-queue-016 — Document pilot ops runbook for Redis

- **Depends on:** P1-queue-011
- **Owner:** devops
- **Exit:** “If Redis down, set `RELAY_JOB_BACKEND=memory` fallback” procedure; max memory guidance.
- **Code:** Markdown subsection under Phase P1 below fold.
- **Tests:** N/A.

### P1-queue-017 — CI: Redis service container for job integration test

- **Depends on:** P1-queue-012
- **Owner:** qa
- **Exit:** GitHub Actions / local doc: optional job `test:jobs` with Redis.
- **Code:** `vitest` `describe.skip` if `REDIS_URL` unset in CI without service.
- **Tests:** One happy-path job.

### P1-queue-018 — Remove or gate stray `incremental-autosync-worker` duplicate

- **Depends on:** P1-queue-004
- **Owner:** backend
- **Exit:** [src/patreon/incremental-autosync-worker.ts](../src/patreon/incremental-autosync-worker.ts) either consolidated with `incremental-sync-worker` or documented as single entry; no duplicate timers.
- **Code:** Grep imports of `incremental-autosync-worker`; unify.
- **Tests:** Grep + build.

### P1-queue-019 — Stalled job recovery policy

- **Depends on:** P1-queue-010
- **Owner:** backend
- **Exit:** Documented `stalledInterval` / `maxStalledCount` (or BullMQ defaults) per queue; ops note when to `moveToFailed`.
- **Code:** `register-workers.ts` or queue options.
- **Tests:** Doc-only or integration with artificial stall.

### P1-queue-020 — Failed-job after-retry hook (dead-letter pattern)

- **Depends on:** P1-queue-010
- **Owner:** backend
- **Exit:** After N failures, job lands in `failed` with reason; optional webhook or log line for pilot on-call.
- **Code:** `Worker` `on('failed')` + Sentry breadcrumb (after P2-obs-003).
- **Tests:** Unit with mock processor throw.

### P1-queue-021 — Redis prod checklist (TLS, ACL, memory)

- **Depends on:** P1-queue-016
- **Owner:** devops
- **Exit:** Bullet list: `rediss://` when required; maxmemory policy; key prefix `relay:pilot:` if multi-tenant Redis.
- **Tests:** N/A.

### P1-queue-022 — Bull Board / metrics dashboard (optional defer)

- **Depends on:** P1-queue-010
- **Owner:** devops
- **Exit:** Either **scoped** read-only `/admin/queues` behind IP allowlist **or** explicit “deferred post-pilot” sentence in runbook.
- **Code:** If built, separate Express mount or sidecar; never public without auth.
- **Tests:** Smoke if implemented.

**Phase P1 — v0 Mandatory Assets (delta):** _None._

---

# Phase P2 — Observability (Pino + Sentry)

**Purpose:** Meet road map reliability expectations: debuggable pilot, capture unhandled failures, correlate API and worker traces.

**Road map alignment:** Architecture baseline Sentry + structured logs; supports “support runbook” and M4/M5 ops narrative later.

**Gap closed:** Production logs JSON; error tracking with scrubbing; trace IDs across HTTP and jobs.

---

### P2-obs-001 — Add Pino dependency and base logger

- **Depends on:** P1-queue-009 (optional but nice for worker logs)
- **Owner:** backend
- **Exit:** `src/lib/logger.ts` exports `createLogger()` with level from `LOG_LEVEL`, pretty in dev via `pino-pretty` devDependency.
- **Code:** `npm install pino`; avoid logging secrets (token scrub list).
- **Wiring:** Import in [src/main.ts](../src/main.ts) first line after env load.
- **Retrofit:** Replace `console.warn` in worker callbacks with `logger.warn` incrementally (batch PR).
- **Tests:** Logger redacts `Authorization` header in fixture.

### P2-obs-002 — Express request logging middleware

- **Depends on:** P2-obs-001
- **Owner:** backend
- **Exit:** Each request logs method, path, status, duration, `traceId`.
- **Code:** [src/server.ts](../src/server.ts) — middleware after `traceIdFrom` available; use `AsyncLocalStorage` for trace context if needed.
- **Retrofit:** Remove duplicate console logs.
- **Tests:** supertest hit logs object (spy).

### P2-obs-003 — Wire Sentry for Node / Express

- **Depends on:** P2-obs-001
- **Owner:** backend
- **Exit:** `@sentry/node` init in [src/main.ts](../src/main.ts); `SENTRY_DSN` optional; scrub PII in `beforeSend`.
- **Code:** Express error handler last; capture unhandledRejection with Sentry (sample rate configurable).
- **Wiring:** [.env.example](../.env.example).
- **Retrofit:** None.
- **Tests:** Mock transport; assert event not sent when DSN empty.

### P2-obs-004 — Correlate BullMQ jobs with trace IDs

- **Depends on:** P1-queue-014, P2-obs-001
- **Owner:** backend
- **Exit:** Processor logs include `traceId` and `jobId`; Sentry scope per job optional.
- **Code:** `src/jobs/*` processors.
- **Tests:** Integration log assertions.

### P2-obs-005 — HTTP 5xx alerting policy (doc)

- **Depends on:** P2-obs-003
- **Owner:** devops
- **Exit:** Sentry alert rule or “manual watch” for pilot documented.
- **Tests:** N/A.

### P2-obs-006 — Replace top 10 `console.*` hotspots in `src/server.ts`

- **Depends on:** P2-obs-002
- **Owner:** backend
- **Exit:** Grep `console.` count reduced in largest route file without behavior change.
- **Tests:** Existing route tests.

### P2-obs-007 — High-volume route log sampling

- **Depends on:** P2-obs-002
- **Owner:** backend
- **Exit:** Health/metrics polling routes logged at `trace` or sampled (e.g. 1%) in prod; doc env `RELAY_LOG_SAMPLE_*` if added.
- **Tests:** Unit for sampler.

### P2-obs-008 — PII scrubbing rules for logs + Sentry

- **Depends on:** P2-obs-003
- **Owner:** backend
- **Exit:** Patreon tokens, email, IP: redact in `pino` serializers and Sentry `beforeSend`.
- **Tests:** Snapshot: serialized error object has no raw token.

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

### P3-web-002 — Classify `web/b_i0ofEW9bMcy` and `web/onboarding_enhancement`

- **Depends on:** P3-web-001
- **Owner:** product + frontend
- **Exit:** Decision: **Archive** (move out of repo), **Quarantine** (keep excluded), or **Merge** (port components into `web/components`).
- **Code:** If archive: `git mv` to `design-archive/` or separate branch; update [web/tsconfig.json](../web/tsconfig.json) exclude.
- **Retrofit:** Fix any CI paths referencing old folders.
- **Tests:** `npm run build --prefix web`.

### P3-web-003 — Import boundary ESLint rule (no app imports from quarantine)

- **Depends on:** P3-web-002
- **Owner:** frontend
- **Exit:** `eslint` rule or `no-restricted-imports` blocking `**/b_i0ofEW9bMcy/**` and `**/onboarding_enhancement/**` from `web/app/**` and `web/components/**` except allowlist file.
- **Code:** Next.js / ESLint config under `web/` (project-local `eslint.config.*` or `.eslintrc` if present).
- **Tests:** Lint in CI.

### P3-web-004 — Consolidate `patron-mock` vs real patron routes

- **Depends on:** P3-web-001
- **Owner:** frontend
- **Exit:** Doc: which components are **story-only** vs **production**; list dead re-exports.
- **Code:** Reduce duplicate shadcn only where merge safe (batch 5 components max per PR).
- **Tests:** Build.

### P3-web-005 — Single `components/ui` ownership

- **Depends on:** P3-web-004
- **Owner:** frontend
- **Exit:** Barrel `web/components/ui/index.ts` policy: either banned or canonical; document.
- **Tests:** Lint.

### P3-web-006 — Public asset dedupe pass

- **Depends on:** P3-web-002
- **Owner:** frontend
- **Exit:** Remove confirmed ghost assets from [relay_audit.json](../relay_audit.json) re-run; update `web/public` README.
- **Code:** Delete or move HTML previews to `docs/` if unused.
- **Tests:** Visual smoke.

### P3-web-007 — Next `basePath` / env for API origin

- **Depends on:** —
- **Owner:** frontend
- **Exit:** `.env.local.example` for `NEXT_PUBLIC_RELAY_API_*` documented; single source for dev proxy.
- **Code:** `web/next.config.mjs` env validation if present.
- **Tests:** Patron feed fetch against local API.

### P3-web-008 — Documentation: “Canonical web” in AGENTS / UI specialist doc

- **Depends on:** P3-web-002
- **Owner:** frontend
- **Exit:** [docs/UI_SPECIALIST_RELAY.md](UI_SPECIALIST_RELAY.md) points to canonical paths only.
- **Tests:** N/A.

### P3-web-009 — Pilot i18n stance (English-only lock)

- **Depends on:** P3-web-001
- **Owner:** product
- **Exit:** Doc line: pilot ships **en-US** only; no new locale files; defer `next-intl` until post-pilot unless already present.
- **Tests:** N/A.

### P3-web-010 — Visual/component dev tool decision (Storybook vs none)

- **Depends on:** P3-web-005
- **Owner:** frontend
- **Exit:** One paragraph: “no Storybook for pilot” **or** minimal `stories/` for shells only—no duplicate shadcn.
- **Tests:** N/A.

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

### P4-onb-002 — API `GET /api/v1/creator/onboarding`

- **Depends on:** P4-onb-001
- **Owner:** backend
- **Exit:** Returns current step + sub-status (import progress pointer from sync health if available).
- **Code:** [src/server.ts](../src/server.ts) route + small service module `src/creator/onboarding-service.ts`.
- **Retrofit:** Use existing auth guard for creator.
- **Tests:** `supertest` happy path.

### P4-onb-003 — API `PATCH /api/v1/creator/onboarding`

- **Depends on:** P4-onb-002
- **Owner:** backend
- **Exit:** Validates allowed transitions; rejects skip-ahead.
- **Code:** State machine table in code.
- **Tests:** Illegal transition 409.

### P4-onb-004 — Advance step on successful Patreon OAuth callback

- **Depends on:** P4-onb-002
- **Owner:** backend
- **Exit:** After creator token store success, set step ≥ `import_started`.
- **Code:** Hook in existing OAuth success path in [src/server.ts](../src/server.ts) or auth service.
- **Retrofit:** None.
- **Tests:** Integration with mock OAuth.

### P4-onb-005 — Advance “Organize” when Library first visit or manual CTA

- **Depends on:** P4-onb-003
- **Owner:** frontend + backend
- **Exit:** `POST` “ack organize” or auto on first library load (product choice — **document**).
- **Tests:** E2E optional.

### P4-onb-006 — Block publish until gates

- **Depends on:** P4-onb-003, P5-sync-001
- **Owner:** backend
- **Exit:** Publish layout endpoint returns 400 with structured error if onboarding incomplete or sync `failed` (policy — align with product).
- **Code:** Gallery/layout mutate routes in [src/server.ts](../src/server.ts).
- **Tests:** Unit.

### P4-onb-007 — Frontend: onboarding stepper component

- **Depends on:** P4-onb-002
- **Owner:** frontend
- **Exit:** Reads GET onboarding; shows 4 steps; highlights current.
- **Code:** `web/app/.../OnboardingStepper.tsx` + embed in creator dashboard layout.
- **Wiring:** React Query or SWR fetch.
- **Retrofit:** Remove duplicate progress UIs.
- **Tests:** Storybook or RTL optional.

### P4-onb-008 — Frontend: gate “Publish” button disabled + tooltip

- **Depends on:** P4-onb-006, P4-onb-007
- **Owner:** frontend
- **Exit:** Disabled + reason from API error code.
- **Tests:** RTL.

### P4-onb-009 — Returning creator: resume vs reset policy

- **Depends on:** P4-onb-003
- **Owner:** product + backend
- **Exit:** Doc + API behavior: if step `published`, show “You’re live” not stepper; optional `POST /onboarding/reset` **staff-only** or absent.
- **Tests:** supertest for idempotent GET after publish.

### P4-onb-010 — Email / marketing step placeholder (explicit defer)

- **Depends on:** P0-base-001
- **Owner:** product
- **Exit:** One-line deferral: no “confirm email” gating in pilot unless compliance mandates; link to M3 narrative in monetization doc.
- **Tests:** N/A.

**Phase P4 — v0 Mandatory Assets (delta):**

- **Onboarding stepper** — 4 steps, mobile-first; checkmarks; error on failed sync.
- **Import progress panel** — ties to sync health API; non-technical copy.
- **Publish blocked modal** — lists missing gates.

---

# Phase P5 — Sync health and degradation (creator trust)

**Purpose:** Road map “degradation modes” and creator-visible sync status.

**Road map alignment:** Part 1 sync narrative; [docs/part1-sync-hardening-ledger.md](part1-sync-hardening-ledger.md).

**Gap closed:** API + UI for health, read-only mode when unsafe to edit.

---

### P5-sync-001 — Normalize sync health DTO for web

- **Depends on:** —
- **Owner:** backend
- **Exit:** Single JSON shape: `status`, `last_success_at`, `last_error`, `campaign_id`, human message key.
- **Code:** Map from [src/patreon/patreon-sync-health-store.ts](../src/patreon/patreon-sync-health-store.ts) / DB store.
- **Tests:** Serializer unit test.

### P5-sync-002 — Expose DTO on existing gallery or health endpoint

- **Depends on:** P5-sync-001
- **Owner:** backend
- **Exit:** Documented in OpenAPI fragment or `docs/api` if exists.
- **Code:** Extend route used by Library (grep `sync_health` in server).
- **Tests:** supertest.

### P5-sync-003 — Frontend: Library top banner

- **Depends on:** P5-sync-002
- **Owner:** frontend
- **Exit:** Banner colors: green / yellow / red; action link “View details”.
- **Code:** `web/components/library/SyncHealthBanner.tsx`.
- **Tests:** RTL with mocked fetch.

### P5-sync-004 — Read-only mode flag on mutations

- **Depends on:** P5-sync-002
- **Owner:** backend + frontend
- **Exit:** When `degraded` or `failed`, PATCH routes return 503 or 423 with code `SYNC_DEGRADED`; UI disables edit controls.
- **Code:** Central helper `assertCreatorSyncWritable`.
- **Tests:** supertest.

### P5-sync-005 — Operator copy deck

- **Depends on:** P5-sync-003
- **Owner:** qa
- **Exit:** 10 short strings in `docs/copy/sync-health.md` or CMS JSON; linked for v0.

### P5-sync-006 — Health signal source-of-truth note (webhook vs poll)

- **Depends on:** P5-sync-001
- **Owner:** backend
- **Exit:** 5–10 lines in pilot doc: which timestamp drives `last_success` (incremental worker completion vs Patreon webhook); avoids contradictory banners.
- **Tests:** N/A.

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

### P5a-db-003 — Dedupe constraints and indexes for idempotent ingest

- **Depends on:** P5a-db-002
- **Owner:** backend
- **Exit:** Unique partial index or composite unique for membership events: e.g. `(creator_id, patreon_member_id, event_type, occurred_at)` **or** `(creator_id, dedupe_key)` with `dedupe_key` hash from upstream payload—**document chosen rule** in code comment; indexes on `(creator_id, occurred_at)` for cohort queries; indexes on `(creator_id, patreon_post_id)` for Insights joins; `(creator_id, occurred_at)` on engagement events.
- **Code:** Follow-up migration if P5a-db-002 missed constraints (prefer folding into P5a-db-002 if still in PR).
- **Tests:** Unit or integration proving duplicate sync does not double-insert.

### P5a-db-004 — Privacy / retention note for CSV-derived and engagement rows

- **Depends on:** P5a-db-002
- **Owner:** product + backend
- **Exit:** Bullet list in `docs/` or here: retention window for `PatreonInsightsPostMetric` (align creator export promises); deletion on account delete; engagement aggregates vs raw rows for pilot.
- **Tests:** Linked from P8 export/delete backlog if applicable.

### P5a-ins-001 — Migration rollout smoke (staging)

- **Depends on:** P5a-db-002, P5a-db-003
- **Owner:** backend / devops
- **Exit:** Staging `prisma migrate deploy` clean; new tables visible; rollback / forward-only policy documented for pilot.
- **Code:** Runbook snippet.
- **Tests:** Manual or CI migration step against ephemeral Postgres.

### P5a-ins-002 — Ingest membership events from Patreon sync

- **Depends on:** P5a-ins-001, P5-sync-001
- **Owner:** backend
- **Exit:** Each successful member/pledge sync pass appends **deduped** events (`join`, `upgrade`, `downgrade`, `cancel`) into ledger; idempotent on replay.
- **Code:** Hook in existing [src/patreon](../src/patreon) sync pipeline (match current ingest module layout).
- **Wiring:** Document ordering vs incremental autosync jobs (**P1**).
- **Tests:** Fixture JSON → expected event rows.

### P5a-ins-003 — API: `GET` creator analytics summary KPIs

- **Depends on:** P5a-ins-002
- **Owner:** backend
- **Exit:** JSON: active members, adds/cancels in window, net growth, tier breakdown; scoped to authenticated creator.
- **Code:** [src/server.ts](../src/server.ts) or `src/analytics/` router module.
- **Tests:** `supertest` with seeded ledger.

### P5a-ins-004 — API: cohort retention by join month (aggregates only)

- **Depends on:** P5a-ins-002
- **Owner:** backend
- **Exit:** Cohort grid or series: join month × months-since-join → **retained %** (pilot may cap history depth, e.g. 12 months).
- **Tests:** Golden aggregate on small synthetic population.

### P5a-ins-005 — API: tier stickiness / tenure statistics

- **Depends on:** P5a-ins-002
- **Owner:** backend
- **Exit:** Per-tier: median tenure, churn rate proxy, member count; labeled “estimated from Patreon sync timestamps.”
- **Tests:** Unit on tier bucketing.

### P5a-ins-006 — Patreon Insights **CSV** import (post metrics)

- **Depends on:** P5a-ins-001, P5a-db-002
- **Owner:** backend
- **Exit:** `POST` multipart or signed upload: parse Patreon export columns (**Impressions**, **Seen**, **Likes**, **Comments** per post); store per `patreon_post_id` + period; idempotent file hash.
- **Code:** Parser + validation errors surfaced to UI; **no** scraping Patreon web.
- **Retrofit:** Link rows to Relay ingested posts when IDs match.
- **Tests:** Fixture CSV from sanitized sample; reject malformed headers.

### P5a-ins-007 — Join imported post metrics to creator content graph

- **Depends on:** P5a-ins-006
- **Owner:** backend
- **Exit:** API or view model: “post performance” merges CSV metrics + Relay publish/sync metadata where possible; document **gaps** when post only exists on one side.
- **Tests:** Integration with two fixture posts.

### P5a-ins-008 — Frontend: creator **Analytics** overview route

- **Depends on:** P3-web-001, P5a-ins-003, P5a-ins-004
- **Owner:** frontend
- **Exit:** Canonical `web/app/.../analytics` (exact path in routing doc): KPI cards, cohort chart, tier table; empty states when CSV not uploaded.
- **Code:** Reuse design tokens with Library/Action Center patterns.
- **Tests:** RTL with mocks.

### P5a-ins-009 — Frontend: **Pulse** sidebar / strip (pilot scope)

- **Depends on:** P5a-ins-007, P5a-ins-003
- **Owner:** frontend
- **Exit:** Collapsible strip: e.g. “What’s hot” = top post by **Seen/hour** or **likes+comments** from **CSV + publish time**; “Recent momentum” = net adds last 7d from ledger; supporter / Subshop activity only if API provides it—**do not** fake data.
- **Tests:** RTL.

### P5a-ins-010 — Product copy: Patreon API limits & data freshness

- **Depends on:** P5a-ins-008
- **Owner:** product + frontend
- **Exit:** In-dashboard footnotes: impressions/seen source = **imported CSV**; membership metrics from **sync**; stale-data warning when last CSV > N days.
- **Tests:** Copy review.

### P5a-ins-011 — Relay-first-party engagement events (minimal)

- **Depends on:** P5a-ins-001
- **Owner:** backend
- **Exit:** Append-only **`RelayEngagementEvent`** rows (see **P5a-db-002**) where visitor endpoints exist; privacy: aggregate in API for pilot unless product approves per-viewer drill-down.
- **Wiring:** Align with **P8** RLS and public vs creator routes.
- **Tests:** Unit + one integration.

### P5a-ins-012 — Tests: analytics API bundle in CI

- **Depends on:** P5a-ins-003 — P5a-ins-007
- **Owner:** qa
- **Exit:** `describe` blocks for summary, cohort, tier, CSV import error paths; fixtures in `tests/fixtures/patreon-insights-sample.csv`.
- **Tests:** CI.

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

### P6-patron-002 — Patron layout: dedicated shell (no designer chrome)

- **Depends on:** P6-patron-001
- **Owner:** frontend
- **Exit:** `web/app/patron/layout.tsx` provides nav: Feed, Profile, Settings.
- **Code:** Adjust shared layout imports.
- **Tests:** Build.

### P6-patron-003 — Feed card: badge “Subscribed” vs “Discover”

- **Depends on:** P6-patron-001
- **Owner:** frontend + backend
- **Exit:** API includes `feed_item_source` enum; UI renders badge.
- **Code:** [src/patron/assemble-patron-feed.ts](../src/patron/assemble-patron-feed.ts) + types in [web/lib/patron-feed-api.ts](../web/lib/patron-feed-api.ts).
- **Retrofit:** JSON fixtures [web/lib/patron-relay-feed-bundle.json](../web/lib/patron-relay-feed-bundle.json) updated.
- **Tests:** Unit + snapshot.

### P6-patron-004 — Degraded: stale Patreon link banner

- **Depends on:** P5-sync-001 pattern
- **Owner:** frontend + backend
- **Exit:** API returns `entitlement_stale_since` or similar; UI banner + CTA “Reconnect Patreon”.
- **Code:** Patron OAuth refresh worker integration fields.
- **Tests:** Integration.

### P6-patron-005 — Empty feed state copy

- **Depends on:** P6-patron-002
- **Owner:** frontend
- **Exit:** Three variants: no follows, no posts, OAuth missing.
- **Tests:** RTL.

### P6-patron-006 — Patron E2E smoke (optional)

- **Depends on:** P6-patron-003
- **Owner:** qa
- **Exit:** Single Playwright: login mock → feed visible.
- **Tests:** Mark `optional` in CI.

### P6-patron-007 — Post detail route or modal (thin)

- **Depends on:** P6-patron-003
- **Owner:** frontend
- **Exit:** One screen: deep-link from feed row; shows asset + entitlement strip; 404 for gated if API says so.
- **Tests:** RTL with mock.

### P6-patron-008 — Patron settings stub (notifications opt-out placeholder)

- **Depends on:** P6-patron-002
- **Owner:** frontend
- **Exit:** Static “Coming soon” or toggle persisted **no-op**—document no backend in pilot.
- **Tests:** Build.

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

### P7-bill-002 — If M1-lite: Prisma `UsageEvent` model

- **Depends on:** P7-bill-001
- **Owner:** backend
- **Exit:** Append-only events: `tenant_id`, `metric`, `quantity`, `meta`, `occurred_at`.
- **Tests:** migration.

### P7-bill-003 — Instrument: R2 egress hook (if available)

- **Depends on:** P7-bill-002
- **Owner:** backend
- **Exit:** On signed GET or proxy log, emit event (sampled if volume high).
- **Code:** Export routes in [src/server.ts](../src/server.ts).
- **Tests:** Unit with mock.

### P7-bill-004 — Instrument: API request counter per tenant (rate limiter)

- **Depends on:** P7-bill-002
- **Owner:** backend
- **Exit:** Daily rollup job or materialized query documented.
- **Code:** [src/middleware/rate-limits.ts](../src/middleware/rate-limits.ts) hook.
- **Tests:** Unit.

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

**Phase P7 — v0 Mandatory Assets (delta):**

- **Usage preview card** (only if M1-lite shipping) — simple bar chart, non-binding estimates.

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

### P8-sec-002 — Cross-tenant negative tests (patron cannot read other creator)

- **Depends on:** P8-sec-001
- **Owner:** qa
- **Exit:** Vitest or integration: 403/404 on foreign `creator_id`.
- **Code:** `tests/security/tenant-isolation.test.ts`.
- **Tests:** CI.

### P8-sec-003 — Patron session cannot mutate creator resources

- **Depends on:** P8-sec-002
- **Owner:** qa
- **Exit:** POST gallery mutate with patron cookie fails.
- **Tests:** CI.

### P8-sec-004 — Export signed URL TTL and replay test

- **Depends on:** —
- **Owner:** backend
- **Exit:** Document TTL; test expired URL rejected.
- **Tests:** Unit.

### P8-sec-005 — Security backlog CSV from JSDoc tags

- **Depends on:** P8-sec-001
- **Owner:** backend
- **Exit:** Script `rg @security-audit-required src` → CSV with file + symbol; import to Airtable.
- **Tests:** N/A.

### P8-sec-006 — Next.js + API CSP / security headers review

- **Depends on:** P8-sec-001
- **Owner:** devops + frontend
- **Exit:** Table: header name → value for `web/` (Next `headers()`), API `helmet` or manual; pilot “good enough” vs full hardening deferred.
- **Tests:** Manual checklist row in P9.

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

### P9-test-002 — Contract tests bundle: onboarding + sync + feed + analytics

- **Depends on:** P4-onb-002, P5-sync-002, P6-patron-003, P5a-ins-003, P5a-db-002
- **Owner:** qa
- **Exit:** One describe block per domain; snapshot JSON schemas optional.
- **Tests:** CI.

### P9-test-003 — Pilot exit checklist (scaled Part 1 gates)

- **Depends on:** P9-test-001
- **Owner:** product
- **Exit:** Checklist markdown: e.g. “10 creators OAuth without support” **pilot = 5**; “5k media” **pilot = 500**; document consciously.
- **Tests:** Human sign-off.

### P9-test-004 — Load smoke (optional)

- **Depends on:** P1-queue-017
- **Owner:** devops
- **Exit:** k6 or Artillery script for 5 min at X RPS on health + feed read.
- **Tests:** Manual run recorded.

### P9-test-005 — Flaky test triage policy

- **Depends on:** P9-test-001
- **Owner:** qa
- **Exit:** `docs/` note: retry count in CI; quarantine label; owner must file fix-by date.
- **Tests:** N/A.

### P9-test-006 — Browser matrix for pilot UX

- **Depends on:** P9-test-003
- **Owner:** qa
- **Exit:** One table: Chrome desktop, Safari iOS, Android Chrome (versions); “best effort” vs blocking bugs.
- **Tests:** Human sign-off.

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
We added **Redis** and **BullMQ** (a job runner). Background tasks—like syncing Patreon, refreshing fan access, sending notifications, cleaning up accounts, and deleting old files—run as **real jobs** instead of only hidden timers. That means we can run **more than one server**, restart safely, and retry failed work. **Result:** The system behaves more like a grown-up app. **Still needed:** Someone must host Redis and learn the “split worker” layout if we use it. **What’s next:** Better logs and error tracking.

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
We either start **counting usage** (storage, requests) in the database **or** we officially say “we track usage in a spreadsheet for the pilot.” **Result:** We know if we are ready to charge later. **Still needed:** Legal/commerce sign-off. **What’s next:** Security hardening.

**Phase P8 — Security gate**  
We prove **User A cannot see User B’s private stuff** and patrons cannot change creator settings. **Result:** Safer pilot. **Still needed:** Ongoing checks as we add routes. **What’s next:** Final automated tests.

**Phase P9 — Tests & launch checklist**  
One **`npm run verify:pilot`** command and a **short checklist** tell us “ready for cohort.” **Result:** Repeatable “go / no-go.” **Still needed:** Humans still sign off for UX and legal.

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
