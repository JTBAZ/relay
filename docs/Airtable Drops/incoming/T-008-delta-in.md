Implementing T-007 (unattended incremental sync). Exploring the codebase and documentation to understand the current sync and watermark architecture.





























Implementing an incremental autosync worker, per-creator serialization in `PatreonSyncService.scrapeOrSync` (coordination with webhooks), and `listCreatorIds` on the token store. Reading the class structure and tests that call `scrapeOrSync`.




















Implementing: adding `runExclusivePerKey`, refactoring `scrapeOrSync` for per-creator serialization, and building the autosync worker.


Extracting env config into `src/relay-server-env.ts` to avoid circular imports between `main.ts` and `autosync-once.ts`.


Creating the files.
















































































Here’s what was implemented for **T-007** and how to validate it locally.

## Summary

1. **Per-creator serialization** — `PatreonSyncService.scrapeOrSync` now queues work by creator so **webhooks (T-006)** and the **autosync worker** cannot interleave ingest for the same creator:

```502:520:src/patreon/patreon-sync-service.ts
  /**
   * Watermark-aware incremental sync. Serialized per `creator_id` so concurrent calls
   * (webhooks + unattended worker) do not interleave ingest for the same creator.
   */
  public scrapeOrSync(
    creatorId: string,
    traceId: string,
    options: PatreonSyncOptions = {}
  ): Promise<PatreonScrapeResult> {
    const id = creatorId.trim();
    return this.runScrapeOrSyncExclusive(id, () =>
      this.scrapeOrSyncImpl(id, traceId, options)
    );
  }

  private async scrapeOrSyncImpl(
```

2. **Credential listing** — `PatreonTokenStore.listCreatorIds()` on file + DB stores for enumerating creators with OAuth.

3. **Worker** — `runIncrementalAutosyncCycle` / `startIncrementalAutosyncWorker` in `src/patreon/incremental-sync-worker.ts`: watermark-aware incremental `scrapeOrSync` (no `force_refresh_post_access`), bounded parallelism across **different** creators, optional skip of `refresh_failed` credentials, and a guard so a new cycle does not start if the previous one is still running.

4. **Process integration** — `RELAY_AUTOSYNC_ENABLED=1` starts the worker from `src/main.ts` after the HTTP server is created; `createApp` now returns **`tokenStore`** for that wiring.

5. **CLI** — `npm run autosync:once` runs `dist/src/autosync-once.js` (JSON summary; exits `1` if any creator fails).

6. **Shared env config** — `src/relay-server-env.ts` (`relayServerConfigFromEnv`) used by `main.ts` and `autosync-once.ts`.

7. **Docs / handoff** — `docs/Airtable Drops/outgoing/T-007-delta-out.md` (delta-only handoff + suggested **Runs** row text). Root `.env.example` documents autosync env vars.

8. **Tests** — `tests/run-exclusive-per-key.test.ts`, `tests/incremental-autosync-worker.test.ts`, `tests/token-store-list-creators.test.ts`.

Terminal execution was **not available** in this environment, so **`npm run build` and `npm run test` were not run here**. Please run them locally from the repo root:

```powershell
Set-Location "C:\Users\jorda\Documents\Coding Projects\Rescue"
npm run build
npm run test
```

**Staging-style check:** with a filled `.env`, `npm run autosync:once` performs one real incremental cycle (calls Patreon).

Copy **Delta Out** from `docs/Airtable Drops/outgoing/T-007-delta-out.md` into the next task’s **Delta In** / Airtable and append the **Runs** row as described there.