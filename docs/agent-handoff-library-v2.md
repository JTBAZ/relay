# Agent handoff — Library refinement (post–batch 8)

**Canonical ingest + duplicate-cover contract:** read **[patreon-ingest-canonical.md](patreon-ingest-canonical.md)** first so you do not reintroduce legacy pre-dedupe or “drop cover at ingest.” **Artist tags / visibility:** **[relay-artist-metadata.md](relay-artist-metadata.md)** (overrides vs canonical). Repo root **[AGENTS.md](../AGENTS.md)** lists both.

## Hardening slices 1–4 (shipped)

Cross-slice summary (export retries, tier alignment, watermark + Patreon menu, sync health): **[part1-sync-hardening-ledger.md](part1-sync-hardening-ledger.md)**. Prefer updating that ledger over growing this file into a second changelog.

## Done (batches 1–8)

- **Ingest:** `normalizePatreonMediaUrl` strips sizing query params on Patreon CDN; `mergeIngestMediaByNormalizedUrl` collapses duplicate URLs and prefers `role: "cover"`. Cookie path no longer pre-dedupes with `seenUrls` so cover can win over attachments.
- **SHA helper:** `collapseDuplicateMediaIdsBySha` in `src/gallery/media-sha-dedupe.ts` (optional reconciliation; not wired to every list request).
- **Gallery list:** Query param `display=post_primary` (default server-side omit = all rows). `galleryItemsPostPrimaryView` picks hero per post.
- **Web:** Library uses `display=post_primary` and `inspectFromLibrary`: multi-asset posts open `PostBatchModal` with full `post-detail` media; single-asset opens `InspectModal`.
- **Visibility:** `flagged` renamed to **`review`** in API/types/UI. Legacy: JSON overrides `flagged` → `review` on load; GET `visibility=flagged` and PATCH body `visibility=flagged` normalize to `review`.
- **Triage:** `total_review_items`; auto-clean sets `review`.

## Files of truth

`src/patreon/media-url-normalize.ts`, `src/patreon/merge-ingest-media.ts`, `src/patreon/map-patreon-to-ingest.ts`, `src/patreon/cookie-scraper.ts`, `src/gallery/query.ts`, `src/gallery/types.ts`, `src/server.ts`, `web/app/GalleryView.tsx`, `tests/library-refinement.integration.test.ts`

## Deferred / risky

- Wire `collapseDuplicateMediaIdsBySha` after export (job or endpoint), not on hot list path.
- **Spin-off:** single attachment → new post/slug.
- Grid keyboard: Enter on grid focus may still need parity with list (if not already handled at tile level).

## Next task

Implement export-time or explicit **SHA-based merge** into canonical/gallery rows, or **spin-off media** from a post into its own library entry with stable URLs.

## Constraints

- Default gallery API remains **`display` omitted = all media rows** for non-Library clients.
- Do not change Patreon OAuth field sets without documenting payload gaps.

## Verify

```bash
npx vitest run library-refinement
npx vitest run workstream-d.gallery-api
```
