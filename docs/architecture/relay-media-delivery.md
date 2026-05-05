# Relay media delivery (roadmap)

**Scope:** Intended path for upload, creator validation, and patron playback. **This document is not an implementation checklist** for a single release; it aligns with the Media Now plan (early creator UX and API-visible processing state) versus later CDN, workers, and adaptive streaming.

## Upload path (current pattern)

- **Browser → R2:** The product path is **presigned `PUT`** direct to object storage; the API **does not** terminate large upload byte streams. Authorization, MIME/size policy, and `MediaAsset` metadata live on the API (`POST /api/v1/relay/upload/init`, `…/commit`). See [ADR 002 — R2 creator uploads](adr/002-r2-creator-uploads-presigned-vs-server.md).
- **API owns auth and metadata:** Sessions, creator scoping, keys, and rows in Postgres remain the contract; R2 holds opaque blobs under server-chosen keys.

## Creator read path (today)

- **Export API + Range:** Creator-side validation and Library/Inspect flows can use **`GET /api/v1/export/media/{creator_id}/{media_id}/content`** (with **byte Range** where supported) so browsers can seek in video without loading the full object through a custom client. This is **acceptable for early creator validation** and internal tooling.
- This path is an **application-controlled** read: not a public CDN URL; access is enforced in the API layer.

## Patron / production playback (later)

- **Move to signed delivery:** For **production patron playback** at scale, reads should shift to **short-lived signed URLs** served from **R2 and/or a CDN in front of R2**, with the API issuing GET credentials after entitlement checks. Today’s export route can remain for compatibility, migration, and creator tools; the north star is **not** proxying full video to every viewer through the app server.

## Out of scope near term (requires a worker pipeline)

The following are **intentionally deferred** until a background worker and storage policy exist:

- **Poster / thumbnail extraction** from video (e.g. first frame).
- **Transcoding** and **adaptive bitrate** delivery (**HLS**, DASH, multiple renditions).
- **Long-running jobs** that would block HTTP request/response.

These belong in a **pipeline** (queue + workers) after objects land in R2, not in synchronous upload or read handlers.

## Related

- [ADR 002 — presigned R2 vs server upload](adr/002-r2-creator-uploads-presigned-vs-server.md)
- `MediaAsset.processing_status` / pipeline errors (Prisma) and gallery `processing_status` (API) for UI that distinguishes **processing** vs **entitlement** locks.
- [`docs/database/operations-and-security.md`](../database/operations-and-security.md) — R2 operational notes where applicable.
