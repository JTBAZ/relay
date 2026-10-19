# Patreon ingest — canonical contract (non-legacy)

This document is the **source of truth** for how Patreon-sourced media enters Relay’s **canonical ingest** and how the **Library** presents duplicate-looking rows. It exists so future work does not reintroduce **legacy** behavior: dropping duplicate covers during ingest, or deduplicating so aggressively that metadata and post-batch views lose rows.

---

## What “legacy” means here (do not restore)

| Legacy mistake | Why it breaks the product |
|----------------|---------------------------|
| Dropping “duplicate” **cover** rows inside ingest so only one URL remains in canonical storage | Patreon often exposes the **same asset** as **cover** and **attachment** with **different signed URLs** or query variants. Removing the cover row at ingest loses the explicit cover relationship and makes reconciliation harder. |
| Cookie / scrape path deduping with a **`seenUrls` Set** before items reach merge | Previously caused the **attachment** to win and the **cover** row to never appear. The cookie mapper must **push** relationship media and cover **without** URL-level short-circuiting; consolidation happens in **`finalizePatreonPostMedia`**. |
| Treating **gallery thumbnails** as the only copy of truth for “is this duplicate?” | Duplicates are a **read-model / presentation** concern (`shadow_cover`), not an excuse to delete canonical rows silently. |
| Skipping **`normalizePatreonMediaUrl`** when comparing Patreon CDN URLs | Same file can appear with different width/height query params; normalization is required for stable dedupe keys. |

If you are about to add URL dedupe inside `cookie-scraper.ts`’s `pushUrl`, or remove rows from `media[]` before `finalizePatreonPostMedia`, **stop** and read the **Current pipeline** section below.

---

## Current pipeline (authoritative)

### 1. URL normalization

- **Module:** [`src/patreon/media-url-normalize.ts`](../src/patreon/media-url-normalize.ts)  
- **Function:** `normalizePatreonMediaUrl(url)` — strips/transforms Patreon CDN query noise so two URLs that point at the same asset often collapse to one key.

### 2. Per-post media finalization (both OAuth-mapped posts and cookie-scraped posts)

- **Module:** [`src/patreon/merge-ingest-media.ts`](../src/patreon/merge-ingest-media.ts)  
- **Entry point:** `finalizePatreonPostMedia(media)` — documented in-file. It calls `mergeIngestMediaByNormalizedUrl`, which **merges rows that share the same normalized URL** and **prefers `role: "cover"`** when choosing the surviving row.
- **Call sites:**  
  - OAuth JSON → ingest: [`mapPatreonPostToIngest`](../src/patreon/map-patreon-to-ingest.ts) (applies `finalizePatreonPostMedia` to the built `media[]`).  
  - Cookie session fetch: [`cookie-scraper.ts`](../src/patreon/cookie-scraper.ts) (same).

**Important:** The **OAuth** mapper still uses a **`seenUrls`** set inside `pushUrl` while scanning embed/content URLs — that is **only** to avoid pushing the same normalized URL multiple times from overlapping fields. It is **not** a substitute for `finalizePatreonPostMedia`, and the **cookie** path intentionally does **not** mirror that pre-filter for cover vs attachment ordering. Do not “align” cookie back to aggressive pre-dedupe without re-reading tests below.

### 3. Gallery presentation: `shadow_cover`

- **Canonical** rows may still include more than one entry that refers to the same effective asset (e.g. cover + attachment with different URLs).  
- The **Library list** marks duplicates for **thumbnail collapse** using **`shadow_cover`** on items in the **query / list** layer — see [`markShadowCoverDuplicates` / `shadow_cover`](../src/gallery/query.ts) and [`GalleryItem`](../src/gallery/types.ts).  
- **UI:** Library and [`PostBatchModal`](../web/app/components/PostBatchModal.tsx) may hide shadow rows by default with a toggle to reveal them — do not assume duplicates are absent from the API.

### 4. SHA-based dedupe (optional, not hot-path)

- **Helper:** [`src/gallery/media-sha-dedupe.ts`](../src/gallery/media-sha-dedupe.ts) — `collapseDuplicateMediaIdsBySha` is for **explicit / job-time** reconciliation, **not** something every gallery list request should run. See [`docs/agent-handoff-library-v2.md`](agent-handoff-library-v2.md) *Deferred / risky*.

### 5. Related helper (not the default finalize path)

- `collapseDuplicatePatreonCoverByAssetKey` in `merge-ingest-media.ts` exists for **asset-key** collapse scenarios; **`finalizePatreonPostMedia` does not call it**. Do not wire it back into the default path without tests and this doc updated.

---

## API / default behavior notes

- **`GET /api/v1/gallery/items`:** With **`display` omitted**, the server returns **all media rows** (non–post-primary view). **`display=post_primary`** is used by the Library for collapsed-by-post behavior. Third-party clients may depend on the default — see constraints in [`agent-handoff-library-v2.md`](agent-handoff-library-v2.md).

---

## Sync batches — idempotent upsert (`applySyncBatchToSnapshot`)

HTTP ingest (`POST /api/v1/ingest/batches`) applies Patreon-shaped **`SyncBatchInput`** to the canonical snapshot via **`applySyncBatchToSnapshot`** ([`src/ingest/apply-batch.ts`](../src/ingest/apply-batch.ts)). **Idempotency** is enforced with **SHA-256 keys** ([`src/ingest/idempotency.ts`](../src/ingest/idempotency.ts)) stored on `snapshot.ingest_idempotency`:

| Replay namespace | Distinguishes |
|------------|----------------|
| `ingest_campaign` | creator, `campaign_id`, `upstream_updated_at` |
| `ingest_tier` | creator, `tier_id`, `upstream_updated_at` |
| `ingest_post` | creator, `post_id`, `upstream_revision` |
| `ingest_media_rev` | creator, `media_id`, `upstream_revision` (per media row) |
| `ingest_deletion:v1:` (stored prefix) | creator, entity type, entity ID, normalized `deleted_at` |

Campaign, tier, post, and media-revision markers now use `ingest:v2:<SHA-256(JSON.stringify([namespace, creator, entity ID, revision/timestamp]))>`. The JSON tuple keeps opaque fields distinct even when they contain `|`. Identity values retain their existing validation and normalization. New imports write v2 markers only. Existing bare legacy hashes remain stored and readable; deletion markers keep their existing encoding.

Compatibility checks run before snapshot mutations or event publication. A matching v2 marker follows the normal replay rules. A legacy marker is sufficient when none of the tuple fields contains `|`; otherwise, exact current entity or revision-history evidence must establish the replay. Proven replays may add a v2 marker with the legacy first-seen time while retaining the old marker and content. Finding another tuple with the same legacy hash does not prove the incoming tuple is new. Missing or incomplete evidence raises `INGEST_REPLAY_CONFLICT` and stops the whole batch. The synchronous HTTP route retains its generic INTERNAL 500 response; queued failures follow the existing bounded retry and dead-letter path.

File snapshots preserve raw campaign/tier timestamps, but database DateTime loading normalizes them. Database-loaded snapshots carry `legacy_timestamps_normalized: true`, so normalized campaign/tier timestamps cannot establish an exact delimiter-bearing legacy identity. Posts and media retain their revision history for exact checks. Unreadable or corrupt canonical files now fail ingestion instead of becoming empty snapshots; a missing file can still initialize a new store. No marker reset, bulk reimport, database schema migration, or new concurrency guarantee is included.

Replaying the **same** campaign/tier/post revision **increments `idempotent_skips`** and **does not** append duplicate post versions, re-emit duplicate `post_published` for that revision, or re-count media rows already tied to that revision. A new **`upstream_revision`** normally appends history; all-paid access transitions follow the additional rule below. **MIG-32** — contract tests: [`tests/ingest-idempotency-apply-batch.test.ts`](../tests/ingest-idempotency-apply-batch.test.ts); HTTP slice: [`tests/workstream-b.ingest.test.ts`](../tests/workstream-b.ingest.test.ts).

Database-backed `mutateForCreator` reserves the creator with a PostgreSQL transaction advisory lock before loading any canonical rows. Loading, applying, and saving use one transaction connection at Read Committed isolation, so overlapping imports for that creator read the preceding committed state and retain both batches' content and replay markers. The lock releases on commit or rollback; different creators use separate locks. The existing 30-second transaction budget now covers the reservation, load, callback, and save. HTTP, queued ingestion, and export storage-key callbacks use this path.

File-store behavior and explicit snapshot replacement through `save`, `saveForCreator`, or global `mutate` are unchanged; those maintenance operations still require stopped writers. Drain and replace all API/worker writers together when deploying, because old code does not take this lock. This does not make event publication atomic with canonical saving. Live PostgreSQL regressions: [`tests/canonical-store-concurrency.integration.test.ts`](../tests/canonical-store-concurrency.integration.test.ts), enabled with `CANONICAL_STORE_TEST_DATABASE_URL` pointing to a disposable loopback database named `relay_ingest_test_` followed by 32 lowercase hexadecimal characters, with the current schema applied.

Database saves reject foreign ownership before writes and recheck after writes, including campaign/post references. Ordinary ingestion and explicit snapshot saves cannot automatically evict another creator's campaigns, posts, media, or stored tier identities, even when that creator is named `dev_creator` or the content is Relay-native. Campaign and tier updates include the saving creator; missing owned rows use inserts, so another creator winning the ID causes rollback instead of a foreign update. Ownership checks after a unique-key failure run only after that transaction has rolled back. Direct synchronous ingestion and creator sync routes return a generic HTTP 409 `INGEST_OWNERSHIP_CONFLICT`; owner details stay in operator logs and ingest dead letters. Queued failures retain their existing bounded retry behavior.

Legacy ownership repair is an explicit operator decision under the [identity reconciliation runbook](database/identity-reconciliation-runbook.md#canonical-import-ownership-conflicts). The approved policy authorizes no content transfer, automatic legacy exemption, override flag, schema migration, or replay-marker reset. Prefer verified identity/routing repair with stable canonical IDs. Backfill/global saves still commit each creator separately, so inventory conflicts before offline bulk work. Persisted data rolls back for a rejected creator batch; event publication before saving remains a separate follow-up.

For an incoming post marked solely `relay_tier_all_patrons`, enrichment expands the supplied paid Patreon catalog and derives `<provider revision>:tier_expand:v2:<SHA-256 of sorted unique tier IDs>`. Equivalent sets have the same identity regardless of catalog order, duplicate rows, or price ordering. Under the current provider revision, a changed set appends one normal post version and emits `post_published`; an equivalent set is a replay. Returning to a previously seen set also updates access, with the original replay marker retained. Stored legacy `<provider revision>:tier_expand` rows with equivalent access stay unchanged, so rollout does not republish them. A previously imported provider revision found only in history cannot replace newer post content through a changed tier set.

The existing paid-tier filters, concrete-list behavior, no-usable-catalog behavior, and notes remain unchanged. Tier-only batches do not rescan stored posts. Each accepted transition uses the supplied catalog; this does not add catalog timestamp ordering or concurrent-write guarantees. The tier-expansion revision suffix is separate from the v2 replay-key encoding above. Regressions: [`tests/ingest-all-paid-replay.test.ts`](../tests/ingest-all-paid-replay.test.ts), [`tests/auto-enrich.test.ts`](../tests/auto-enrich.test.ts), and [`tests/canonical-store-db-save.test.ts`](../tests/canonical-store-db-save.test.ts).

A duplicate post may refresh a nonempty upstream URL for media already in its current media list, provided the incoming media revision matches the stored current media revision. This changes only the current URL; it does not import media, change post content or access, restore deleted entities, or add versions or events. An older, already-seen media revision cannot replace the current revision's URL, even when it arrives through a new post. File and database stores retain URL-only refreshes; database writes preserve unchanged posts and update only the matching media URL. Regression coverage: [`tests/ingest-media-url-replay.test.ts`](../tests/ingest-media-url-replay.test.ts) and [`tests/canonical-store-db-save.test.ts`](../tests/canonical-store-db-save.test.ts).

Accepting a fresh media revision marks that media active, including after a deletion, so the gallery can show the asset again. Unchanged or already-seen revisions and URL-only refreshes leave deleted media deleted. A duplicate post cannot introduce a fresh media revision, and an explicit deletion later in the same batch still wins. Media reactivation preserves version sequencing, associations, and existing metadata/storage-key fallback. Post restoration rules stay the same: a deleted post remains deleted when the fresh media arrives through another post. Media reactivation adds no blob invalidation or redownload. The previously identified database limit for a fresh shared-media revision whose primary post is preserved remains separate; the normal fresh-post-revision save path persists the active media and its history.

Deletion records require a caller-supplied `deleted_at` in ISO date-time form with seconds, an explicit timezone (`Z` or an offset), and at most three fractional second digits. Validation rejects missing or unusable values with a field-scoped 400 before any batch content is applied or queued. Valid timestamps normalize to UTC milliseconds, so equivalent timezone representations match the same deletion. Callers using a detection time must retain that original time on retries. No active first-party producer currently creates these deletion records.

The first processing of a deletion records its identity even when the target is absent. A repeated deletion increments `idempotent_skips`, adds no `tombstones_applied`, and leaves restored content intact. A distinct deletion still applies after posts and media in its batch. `tombstones_applied` counts newly processed deletion records, including absent targets. File and database stores retain the markers. Database media deletions also update the status under preserved posts without replacing media history or blobs; a failed guarded deletion aborts the transaction so its marker cannot commit alone. Synchronous ingest failures return a generic INTERNAL 500; queued batches retain their existing retry and dead-letter handling.

Deletion markers use a hash of an unambiguous JSON tuple, prefixed with `ingest_deletion:v1:`. Their encoding is unchanged by the campaign/tier/post/media compatibility rollout. A stale deletion arriving for the first time can still delete newer content, and deletions processed before markers existed cannot be reconstructed. These markers do not add timestamp ordering, media reactivation, or concurrency guarantees to the existing stores. Regression coverage: [`tests/ingest-deletion-replay.test.ts`](../tests/ingest-deletion-replay.test.ts), [`tests/workstream-b.ingest.test.ts`](../tests/workstream-b.ingest.test.ts), and [`tests/canonical-store-db-save.test.ts`](../tests/canonical-store-db-save.test.ts).

### Replay rollout and operator reconciliation

Drain ingestion and stop all API/worker writers before deploying the new encoder together. Back up the canonical file or database. Keep old markers; do not run old writers alongside v2 writers. Rolling back to old code after v2-only imports could repeat those imports, so rollback requires preserving a reader that understands v2 or a separately reviewed recovery plan.

For an unresolved legacy key, verify the exact tuple against retained history, provider records, or backups. Prepare the failed batch and a decisions JSON array. `already_processed` records replay protection without inventing entity history; `import_once` admits an otherwise unresolved tuple once through normal ingestion. Decisions supply missing legacy replay evidence; the existing all-paid access-transition rule still permits a previously seen set to become current again. Import authorization cannot force a duplicate version outside that rule. Decisions must match the batch creator and processed identities; duplicates, unused identities, stale decisions without a marker, and invalid actions fail before writes. Reconciliation fields in public HTTP bodies have no effect.

Example decision for the second identity in the `post|part` / `part|r1` collision:

```json
[{ "parts": ["ingest_post", "c1", "post", "part|r1"], "action": "import_once" }]
```

After building the approved code and stopping writers, use the operator-only command with an explicit backend:

```bash
node scripts/reconcile-ingest-replay.mjs --batch batch.json --decisions decisions.json --canonical path/to/canonical.json
node scripts/reconcile-ingest-replay.mjs --batch batch.json --decisions decisions.json --database
```

The file path must already exist. Database mode uses the configured `DATABASE_URL`. Resolve every conflict in the batch before retrying; an unlisted conflict still stops the entire batch. Keep the original dead-letter record as audit evidence. The command does not clear legacy keys, delete jobs, deploy code, or repair missing history. Coverage: [`tests/ingest-replay-compatibility.test.ts`](../tests/ingest-replay-compatibility.test.ts), database save/reload tests, and the HTTP ingestion suite.

---

## Tests (read or run before changing ingest)

| Area | Test file |
|------|-----------|
| URL normalize + URL merge | [`tests/patreon-media-url-normalize.test.ts`](../tests/patreon-media-url-normalize.test.ts) |
| Sync batch idempotency (apply-batch) | [`tests/ingest-idempotency-apply-batch.test.ts`](../tests/ingest-idempotency-apply-batch.test.ts) |
| `finalizePatreonPostMedia` / cover vs attachment | [`tests/patreon-ingest-cover-collapse.test.ts`](../tests/patreon-ingest-cover-collapse.test.ts) |
| `shadow_cover` in gallery shaping | [`tests/shadow-cover-gallery.test.ts`](../tests/shadow-cover-gallery.test.ts) |
| Cross-module integration slice | [`tests/library-refinement.integration.test.ts`](../tests/library-refinement.integration.test.ts) |
| Cookie ingest + cover dedupe story | [`tests/cookie-ingest-cover-dedupe.test.ts`](../tests/cookie-ingest-cover-dedupe.test.ts) |

Suggested run:

```bash
npx vitest run patreon-media-url-normalize patreon-ingest-cover-collapse shadow-cover-gallery library-refinement cookie-ingest-cover-dedupe
```

---

## Relay-only tags and visibility (not in canonical)

Artist tag edits and gallery visibility are **not** stored in `canonical.json`. They live in **`gallery_post_overrides.json`** and are merged at read time — see **[relay-artist-metadata.md](relay-artist-metadata.md)**.

## When you change this document

Update **[`docs/agent-handoff-library-v2.md`](agent-handoff-library-v2.md)** if batch notes diverge, and add a one-line pointer in **[`docs/pattern-library.md`](pattern-library.md)** if the **product** behavior (what artists see) changes — not for every typo fix.
