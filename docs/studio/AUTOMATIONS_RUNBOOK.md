# Schedule Rail Automations — operations runbook

Engineering and on-call reference for flags, workers, migration order, rollback, and support recovery. Product contract: [`automation-build-plans/PRODUCT-CONTRACT.md`](automation-build-plans/PRODUCT-CONTRACT.md). Program: [`automation-build-plans/00-README.md`](automation-build-plans/00-README.md).

**Secrets:** Name env vars only. Never paste real keys into tickets or commits.

**Incident owner (local/staging):** Relay API on-call — Automations VS8 until human release sign-off.

**Release package / human checklist:** [`../qa/AUTOMATIONS_RELEASE_EVIDENCE.md`](../qa/AUTOMATIONS_RELEASE_EVIDENCE.md). Do not flip production flags or apply production migrations without signed rows there.

**Automated AU matrix (B19):** [`../qa/AUTOMATIONS_VS8_B19_EVIDENCE.md`](../qa/AUTOMATIONS_VS8_B19_EVIDENCE.md).

---

## 1. Feature flags and kill switches

| Variable | Default (`.env.example`) | Effect when off / constrained |
|----------|--------------------------|-------------------------------|
| `RELAY_FEATURE_AUTOMATIONS` | `false` | Master gate. Off → lifecycle service returns `AUTOMATION_DISABLED` (404); `reconcileAutomations` returns empty counters (no claim, materialize, skip, or **expiry sweep**). Prepared connectors/runs/drafts/events **remain** in DB. |
| `RELAY_AUTOPOST_AUTOMATIONS_MS` | unset → `3600000` (1h) | Worker/BullMQ repeat interval. `0` or invalid (&lt; 60000) → **no scheduled reconcile** even if the feature flag is on. Minimum interval: 60000 ms. |

Related independent kill switches (do not treat as Automations substitutes):

| Variable | Role |
|----------|------|
| `RELAY_FEATURE_SCHEDULE_SERIES` / `RELAY_AUTOPOST_SCHEDULE_SERIES_MS` | Ordinary + trigger series horizon |
| `RELAY_FEATURE_DISTRIBUTION_RULES` / `RELAY_AUTOPOST_DISTRIBUTION_RULES_MS` | Legacy + owned distribution rules |
| Autopost plan entitlement | `AUTOMATION_PLAN_REQUIRED` when creator lacks Autopost |

Flag parsing: `src/autopost/automation-contract.ts` → `isAutomationsFeatureEnabled` (`true`/`1`/`yes`/`on` enable; default false).

Worker interval: `src/autopost/automation-worker.ts` → `automationsRepeatEveryMsFromEnv`.

**UI note:** Schedule Rail modal shell may still open when the API flag is off (host does not currently pass a public env prop). Mutations and list APIs fail closed via `AUTOMATION_DISABLED`. Prefer API/worker flags as the source of truth.

---

## 2. Workers and queues

| Path | When | Entry |
|------|------|--------|
| In-process timer | `RELAY_JOB_BACKEND=memory` (API `main.ts` and/or `worker.ts`) | `startAutomationsWorker` → `runAutomationsReconcileOnce` |
| BullMQ repeat | `RELAY_JOB_BACKEND=bullmq` | Queue `autopost_automations` scheduled from `schedule-bullmq-repeat.ts`; consumed in `register-workers.ts` |

Each tick:

1. No-op immediately if `RELAY_FEATURE_AUTOMATIONS` is off.
2. Else `reconcileAutomations` — expire stale materialized runs → claim due `automation_trigger` occurrences → prepare/skip.
3. Deliver `notification_intents` via `deliverAutomationNotificationIntents` (once-ever `sourceEventId` = intent `dedupe_key`).

Log line: `autopost-automations: reconcile` with counters `expired`, `claimed`, `materialized`, `skipped_no_post`, `skipped_awaiting_review`, `failed`, `notification_intents`, `notifications_delivered`.

Safe replay: ticks are idempotent on occurrence claim, run `idempotency_key` (`occurrence:{id}`), and notification `dedupe_key`. Re-running a tick must not create duplicate drafts/events/plans.

---

## 3. Migration sequence (human-controlled)

Apply **only** with release-owner authorization. Never from an agent batch.

1. Review Prisma migrations:
   - `prisma/migrations/20260720070000_creator_automations_connector`
   - `prisma/migrations/20260720120000_automation_notification_kinds`
2. Staging first: `npx prisma migrate deploy` (or your host’s equivalent).
3. Validate: `npx prisma validate`; spot-check `creator_automations` empty (no auto-adoption of legacy series/rules).
4. Deploy API + worker images that include Automations code **with flag still false**.
5. Confirm flag-off: create automation API → `AUTOMATION_DISABLED`; no reconcile counters advancing.
6. Only then consider flag activation (checklist in release evidence).

Rollback of schema is **not** a first-line response — prefer flag/worker kill switches. Schema rollback requires DBA plan (enum values `expired`/`cancelled`, new tables/columns).

---

## 4. Rollback rehearsal (preferred order)

Goal: **stop new discovery and materialization** without deleting connectors, runs, drafts, events, or distribution history.

### Soft stop (preferred)

1. Set `RELAY_AUTOPOST_AUTOMATIONS_MS=0` — stops scheduled reconcile (memory + BullMQ reschedule after restart).
2. Restart API (and worker process if separate) so env reloads.
3. Verify: no new `autopost-automations: reconcile` ticks with non-zero `claimed`/`materialized`.
4. Existing ready-for-review drafts/events remain; creators can still open Library / Previewizer paths already prepared (approval APIs still require flag **on** — see hard stop).

### Hard stop (feature off)

1. Set `RELAY_FEATURE_AUTOMATIONS=false`.
2. Restart API + workers.
3. Effect: lifecycle mutations/reads that call `assertAutomationsAccess` fail with `AUTOMATION_DISABLED`; reconcile returns empty (**including** no expiry sweep).
4. DB rows preserved; ordinary series, legacy rules, playbooks, Add Event unchanged.

### After rollback

- Confirm no new `creator_automations` creates during the freeze window.
- Confirm publishing still requires human confirmation (Previewizer export ≠ publish; extension does not auto-publish).
- Do **not** bulk-delete automation-owned drafts/events as part of rollback.

---

## 5. Observability signals

| Signal | Where | How to verify |
|--------|-------|---------------|
| Reconcile throughput | Log `autopost-automations: reconcile` | Watch `claimed` / `materialized` / `failed` after flag-on |
| No-new-post skips | `skipped_no_post` + notification kind `automation_no_new_post` | Fixture with no eligible post; once-ever `dedupe_key` |
| Approval expiry | `expired` + `automation_approval_expired` | Runs with `expires_at` ≤ now (default TTL **72h** via `approval_ttl_hours`) |
| Notification delivery gaps | `notification_intents` vs `notifications_delivered` | Log when account resolve fails |
| Worker disabled | No schedule when `RELAY_AUTOPOST_AUTOMATIONS_MS=0` | Confirm queue has no repeat / timer not started |
| Flag off | Empty reconcile + API 404 `AUTOMATION_DISABLED` | `tests/automations/automation-reconcile.test.ts`, `automation-service.test.ts` |

**Health endpoints today:** no dedicated `/health/automations`. Use API `/api/v1/health` liveness plus log scrape.

**Dashboards:** none in-repo for Automations counters.

---

## 6. Support recovery (common cases)

| Symptom | Safe action |
|---------|-------------|
| Creator cannot create Automations | Check Autopost plan + `RELAY_FEATURE_AUTOMATIONS`; do not bypass plan gate in UI only |
| Due tick produced nothing | Check cadence/timezone; pending awaiting-review run (one-open guard); no eligible Patreon post (expect skip + notify) |
| Missing Previewizer template | Use modal repair / re-bind `CreatorPreviewTemplate`; do not use `PostTemplate` |
| Lost toast | Rail `manual_event` + deep link `automation_id` + `automation_run_id` (same as toast CTA) |
| Duplicate worry after retry | Idempotency on occurrence key + notification `sourceEventId`; inspect single run per occurrence |
| Stale ready work past TTL | With flag **on**, reconcile expires untouched materialized runs; creator can wait for next cadence or create a one-off |
| Pause without delete | `pause` / `resume` / `archive` via lifecycle API — archive keeps run history |

Never paste private media URLs or post bodies into tickets; notification payloads carry IDs only.

---

## 7. Quick verify commands

```bash
npx prisma validate
npx vitest run tests/automations
npx vitest run tests/web/automations-modal.test.tsx tests/web/automations-flow.test.tsx tests/web/automation-previewizer.test.tsx
npm run build
npm run lint --prefix web
npm run build --prefix web
npm run build --prefix extension
```

Flag-off / kill-switch focus:

```bash
npx vitest run tests/automations/contracts.test.ts tests/automations/automation-service.test.ts tests/automations/automation-reconcile.test.ts -t "flag"
```

Stack: API `:8787`, web `:3000`. After env changes: `npm run dev:stack:restart`.

---

## 8. Known gaps (do not invent passes)

1. Browser a11y + live extension offline matrix — human gate (B19 evidence).
2. Production migration apply + flag activation — human gate.
3. Live OAuth / destination unlink under real credentials — human gate.
4. Live 72h expiry against wall clock — human gate.
5. No Automations-specific health `gates.alerts` or pager board.
6. Web host does not wire `automationsFeatureEnabled` from server env (API remains authoritative).

---

## 9. Related docs

- Acceptance: [`../qa/AUTOMATIONS_ACCEPTANCE.md`](../qa/AUTOMATIONS_ACCEPTANCE.md)
- B19 matrix: [`../qa/AUTOMATIONS_VS8_B19_EVIDENCE.md`](../qa/AUTOMATIONS_VS8_B19_EVIDENCE.md)
- Release checklist: [`../qa/AUTOMATIONS_RELEASE_EVIDENCE.md`](../qa/AUTOMATIONS_RELEASE_EVIDENCE.md)
- Traceability: [`automation-build-plans/TRACEABILITY.md`](automation-build-plans/TRACEABILITY.md)
- Extension ops: [`../operations/extension-runbook.md`](../operations/extension-runbook.md)
- Sticky reminders: [`PLAN_PHASE_5_EXTENSION_STICKY_REMINDERS.md`](PLAN_PHASE_5_EXTENSION_STICKY_REMINDERS.md)
