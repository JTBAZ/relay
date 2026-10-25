# Local selected-piece performance check

Run: 2026-10-23, Europe/Berlin. This checks the running app and configured model, following the fixture acceptance in [SPP-04](SPP-04-IMPLEMENTATION.md).

## Local configuration

The ignored root `.env` now enables `RELAY_GALLERY_EDITOR_PERFORMANCE_ENABLED=1` and `RELAY_GALLERY_EDITOR_AI_ENABLED=1`. The existing editor enable flag, creator allowlist, database connection and verified pricing map are preserved. API port is 8788; the web app at port 3000 already points there.

The API initially refused startup because split-worker mode requires shared Patreon session storage. `RELAY_DB_STORE_PATREON_COOKIE=1` supplies that existing configuration requirement. Split-worker mode stays enabled, so the restarted API starts no background timers. No migration, account synchronization or metric refresh was run.

The default Astra request was rejected by the existing development budget before a model call. Remaining development allowance was about $0.326, which could not cover its reservation. The local model was set to the already-priced `gpt-6-sol`; budget limits and the durable ledger were preserved. The successful request added one settled reservation: $0.075766 reserved, $0.005790 settled according to the configured pricing. No second synthesis call was needed for no-data evidence.

## Observed flow

Signed into the existing Dev Ava account through its normal local dev-account login. In `/studio/lab2`, selected “Collect test — Test 1 (public)” (`pilot_post_ava_intro`) and submitted:

> How is this post performing over the last 30 days? Show the recorded metrics and explain any gaps in the data.

The real authenticated turn returned HTTP 200 in approximately 4.3 seconds. Its saved subject is that post alone, with `range: "30d"`, `status: "no_data"`, and `synthesis: { status: "deterministic", reason: "no_data" }`. Evidence cutoff is `2026-10-22T23:23:20.299Z`, equivalent to 01:23:20 on October 23 in Berlin. The displayed UTC date is intentional.

Read-only SQL against the configured `relay_dev` database found no metric snapshots, Patreon Insights CSV rows, Relay engagement events or platform telemetry events. The selected post also has no platform instances. The answer contains unavailable Relay views, likes and comments, with null values, unknown confidence, empty evidence and a no-observations coverage notice. It invents no counters, capture times or performance conclusions. Source failures are empty, distinguishing absence of observations from a failed read.

The existing editor session advanced from revision 5 to 6, and message count from 6 to 8. The complete stored cart hash is identical; cart revision remains 5, with zero actions. Other inspected editor sessions were unchanged. The report was stored in the actual session JSON, rather than a fixture response. Local SQL audits and screenshots are under `.impeccable/review/spp-live/`.

Reloading the Studio fetched and displayed the same report, subject, cutoff and unavailable metric rows with no new model call. Current gallery selection reset on reload while the saved report retained its post subject. `saved-no-data-report.png` records the backend-backed answer, and the Studio tab was left open for inspection.

## Remaining real-data comparison

The current database contains seven pilot posts across Dev Ava, Dev Milo and Dev Quinn. These are seeded pieces, and the analytics evidence tables are empty. This run verifies the live selection, model routing, evidence read, no-data answer and persistence path. It does not establish a comparison against a real creator's collected metrics or AI selection of findings from nonempty evidence.

A real creator/post or the intended data environment is required to complete that comparison. No synthetic observations were inserted to make this test appear successful, and the local app was not repointed to another database without identifying the intended source. Local feature flags remain enabled and the API/web processes are left running.

## Real account located

The user identified `relaytestcreator`. A subsequent read-only check found that account in **RELAY - STAGING**, rather than the configured local database or RELAY - ISOLATED STAGING. Its creator profile is linked to Patreon campaign `15913895`. The stored Patreon credential record is marked healthy; that status alone does not prove the credential currently works, and no credential value was retrieved.

The account has six stored posts, including the Patreon post “Test 1 Free” (`patreon_post_156582642`). At inspection, this creator has zero external metric snapshots, zero Patreon Insights metric rows/imports, zero external daily rollups, zero Relay engagement events, zero platform telemetry events and zero legacy analytics snapshots. Its selected example currently has a Relay platform instance with no refresh timestamp; that is not a Patreon metrics capture.

The real account is therefore identified, but a comparison against nonempty stored analytics is still unavailable. The remaining prerequisites are a local test path to this account's data and an actual captured observation for one of its Patreon posts. Existing collection supports an authenticated extension refresh handoff or Patreon Insights CSV import; the performance question itself does not trigger collection. No remote row, account credential, platform link or database configuration was changed during this investigation.
