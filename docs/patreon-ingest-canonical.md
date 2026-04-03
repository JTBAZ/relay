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

## Tests (read or run before changing ingest)

| Area | Test file |
|------|-----------|
| URL normalize + URL merge | [`tests/patreon-media-url-normalize.test.ts`](../tests/patreon-media-url-normalize.test.ts) |
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
