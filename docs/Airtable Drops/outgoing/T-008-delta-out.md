# Delta Out — T-008 (Fallback sync cadence / webhook safety net)

## 1. Delta

- **Role:** The existing `startIncrementalAutosyncWorker` interval is documented as the **scheduled fallback** when webhooks are missed or delayed (complements T-006; does not replace it). Module banner in `src/patreon/incremental-sync-worker.ts` states idempotency (watermarks + probe skip + per-creator exclusivity with webhooks).
- **Scheduling:** Replaced `setInterval` with a **single `setTimeout` chain** so spacing can vary per cycle.
- **Jitter:** `RELAY_AUTOSYNC_INTERVAL_JITTER_MS` (alias `RELAY_PATREON_INCREMENTAL_AUTOSYNC_JITTER_MS`) adds uniform random 0..N ms to each **next** cycle delay (default 0).
- **Backoff (optional):** `RELAY_AUTOSYNC_FAILURE_BACKOFF=1` or `RELAY_PATREON_INCREMENTAL_FALLBACK_BACKOFF=1` — after any cycle with `creators_failed > 0`, multiply base interval by 2^streak up to `RELAY_AUTOSYNC_FAILURE_BACKOFF_MAX_MULTIPLIER` (default 8). Streak resets after a cycle with zero failures. Overlap skips (previous cycle still running) reschedule with base+jitter only (no streak bump).
- **Test helpers:** `computeAutosyncDelayAfterCycle` exported for tests; `tests/incremental-autosync-schedule.test.ts` covers delay math; `tests/incremental-autosync-worker.test.ts` adds two-cycle idempotency when probe reports caught up.

## 2. Risks / blockers

- Backoff is **per-process**; multi-instance deployments still need external coordination for global rate limits (same as T-007).

## 3. Next step hint

Proceed to **T-009** per Sort Order; confirm its scope does not pull in patron-scale entitlement refresh if that remains a separate track.

---

## Airtable **Runs** log (paste)

| Field | Suggested value |
|-------|------------------|
| **Outcome** | `success` |
| **Output Summary** | T-008: fallback cadence docs + jitter/backoff env; recursive autosync timer; schedule + idempotency tests. |
| **CLI Exit Code** | `0` |
