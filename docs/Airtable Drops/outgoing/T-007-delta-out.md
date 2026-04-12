# Delta Out — T-007 (Unattended incremental sync)

## 1. Delta

- **Worker (canonical):** `src/patreon/incremental-sync-worker.ts` — `runIncrementalAutosyncCycle` (watermark-aware `scrapeOrSync`, optional upstream probe skip, bounded parallelism across creators, per-creator serialization via `PatreonSyncService.scrapeOrSync` + `createExclusivePerKeyRunner`), `startIncrementalAutosyncWorker` (interval loop, overlap guard).
- **Import alias:** `src/patreon/incremental-autosync-worker.ts` re-exports the same module.
- **Enable autosync:** `src/main.ts` starts the worker when **`RELAY_AUTOSYNC_ENABLED`** *or* **`RELAY_PATREON_INCREMENTAL_AUTOSYNC_MS`** ≥ 10000 (no need for both).
- **Interval / boot behavior:** `RELAY_PATREON_INCREMENTAL_AUTOSYNC_MS` (min 10s) overrides `RELAY_AUTOSYNC_INTERVAL_MS` when set. If the Patreon-prefixed interval is set, first tick on boot is controlled by **`RELAY_PATREON_INCREMENTAL_AUTOSYNC_RUN_ON_START`** (unset defaults to **no** immediate run); legacy **`RELAY_AUTOSYNC_SKIP_INITIAL_RUN`** applies when the Patreon interval is **not** set.
- **Env aliases:** `RELAY_PATREON_INCREMENTAL_AUTOSYNC_MAX_POST_PAGES`, `RELAY_PATREON_INCREMENTAL_AUTOSYNC_PROBE_SKIP` mirror `RELAY_AUTOSYNC_*` (see root `.env.example`).
- **Health + webhook index:** `main.ts` passes **`patreonSyncHealthStore`** and **`patreonCampaignCreatorIndex`** into the worker so unattended runs record sync health and upsert campaign routing like `POST /api/v1/patreon/scrape`.
- **One-shot:** `npm run autosync:once` → `src/autosync-once.ts` (same cycle as worker; exits 1 if any creator failed).

**Validation (operator):** from repo root: `npm run test`, `npm run build`. Staging-style run: `RELAY_PATREON_INCREMENTAL_AUTOSYNC_MS=600000` `RELAY_PATREON_INCREMENTAL_AUTOSYNC_RUN_ON_START=1` `npm start` (or `npm run autosync:once` for a single cycle).

## 2. Risks / blockers

- **Multi-instance:** File-backed stores + in-process overlap guard; multiple API replicas need external coordination or a shared queue (out of scope).
- **Probe skip:** Reduces Patreon calls when caught up; new posts right after probe can lag until the next cycle or T-006 webhook.

## 3. Next step hint

Continue the autopipeline **Sort Order**; if the next task is Fan Relay entitlement refresh at scale, confirm it stays out of T-007’s non-goals.

---

## Airtable **Runs** log (paste)

| Field | Suggested value |
|-------|------------------|
| **Outcome** | `success` (after `npm run test` + `npm run build`) |
| **Output Summary** | T-007: autosync enable via `RELAY_PATREON_INCREMENTAL_AUTOSYNC_MS` or `RELAY_AUTOSYNC_ENABLED`; interval/boot/probe/post-pages Patreon env aliases; main passes health + campaign index to worker. |
| **CLI Exit Code** | `0` |
