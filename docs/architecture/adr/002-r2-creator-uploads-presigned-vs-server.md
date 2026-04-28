# ADR 002 — Creator media uploads: presigned R2 (preferred) vs server-side multipart, keys, and limits

**Status:** Accepted  
**Date:** 2026-04-23  
**Context:** Relay-native posts / `MediaAsset` with `currentStorageKey` (see `prisma/schema.prisma`); T-3.1 (storage) → T-3.2 (upload init + commit API). S3 client wiring: [`src/storage/r2-config.ts`](../../../src/storage/r2-config.ts).

## Context

Cloudflare R2 is accessed via the **S3-compatible API** (SigV4, same as [`r2-config.ts`](../../../src/storage/r2-config.ts)). Creators will upload binary assets (video, image, audio) for Relay posts. The API must choose **where** bytes flow and **how** object keys are formed so that:

- the **API host** is not a **long‑lived proxy** for multi‑gigabyte uploads,
- `MediaAsset` rows in Postgres remain the **source of truth** for id and `currentStorageKey`,
- objects are **not world-readable** from predictable URLs unless a separate decision adds signed GETs or a CDN in front (export already documents key vs public URL),
- a future **antivirus** / content pipeline can be added without renegotiating the key model.

## Decision

### 1. Default path: **presigned direct upload to R2**

- The server issues a **time-limited** `PUT` (or `POST` policy) URL using S3-style signing against the R2 endpoint and bucket from env (`R2_*` in [`.env.example`](../../../.env.example)).
- The **browser or native client** uploads bytes **directly to R2**; the app then **commits** metadata (e.g. `key`, `mime`, `size`, `ETag` / checksum as available) in a small JSON request that creates/updates `MediaAsset` and ties it to a post. **T-3.2** implements the concrete routes; this ADR only fixes the pattern.

**Rationale:** Scales with object size, avoids tying worker memory and HTTP timeouts to upload duration, and matches common S3/R2 practice.

### 2. **Fallback / auxiliary path: server‑mediated upload (stream or multipart API)**

- The server may accept a **single** `PUT` or **multipart** upload to the API, then write to R2 using the same SDK. Use for **ops**, **extremely** strict “scan before store” future workflows, or clients that cannot use presigns.

**Rationale:** Flexibility; default product path remains presigned.

### 3. **Object key layout (tenant-scoped, opaque to clients)**

- Keys are **server-generated** and never trust client file paths. Recommended shape (adjust only with a new ADR or migration if persisted keys exist):

`relay/tenants/{relay_creator_id}/media/{media_id}/{segment}`

- `segment` is a stable name for the object at the current `PostVersion` / `currentVersionSeq` (e.g. `asset`, `v3/asset`). Exact segment naming is an implementation detail of T-3.2; the invariant is **creator + media id** in the path for isolation and support tracing.
- `media_id` is the `MediaAsset.id` **after** the row is created (or reserved in the same transaction as key issuance) so the key cannot collide across creators.

**Rationale:** Aligns with existing comments in schema (“tenant storage”, not public premium URL); supports future lifecycle and backfill.

### 4. **MIME allowlist and size cap**

- **Allowlist** at **init/commit** (not only on presign): e.g. allow `image/*`, `video/*`, `audio/*` for v1; reject `text/html` and other executable-friendly types. Prefer prefix checks in code; optional env `RELAY_UPLOAD_ALLOWED_MIME_PREFIXES` to tune without deploy for ops (see [`.env.example`](../../../.env.example)).
- **Max size** enforced at API (`Content-Length` / declared size) and again on **commit** if the client reports R2’s reported size. Default **suggested** cap documented in env (e.g. hundreds of MB for video); product may raise later.

**Rationale:** Reduces abuse surface; R2 is not a generic blob store for this feature.

### 5. **Security follow-ups (not blocking M2 wiring)**

- **AV / malware scanning** on a **queue** after put (or on a “staging” prefix + promote) — tracked as future work, not a blocker for T-3.2 happy path.
- **Bucket** remains **private**; public delivery uses application routes, signed URLs, or a separate CDN policy decided per surface (patron video vs internal).

## Consequences

- **Shipped (T-3.2):** `POST /api/v1/relay/upload/init` and `POST /api/v1/relay/upload/commit` in the API server (`src/server.ts`), with `MediaAsset` `ingestOrigin=RELAY_UPLOAD` and `currentStorageKey` set on successful commit. Optional `post_id` to attach to a `RELAY` `Post` when the row exists; `primaryPostId` may start null and be set on commit.
- **Export read path (T-3.3):** `GET /api/v1/export/media/{creator_id}/{media_id}/content` and `/preview` use `ExportService.getExportContent()` (`src/export/export-service.ts`), which loads bytes in one pass. **Priority when Postgres is available:** (1) `media_assets.current_storage_key` — if the key starts with `relay/`, the server reads the object from R2 via `GetObject`; otherwise it is treated as a path relative to the export storage root (legacy on-disk materialization). (2) If there is no DB key, the **file export index** and on-disk `relative_blob_path` (Patreon export flow). (3) If the row has `current_upstream_url` and no materialized key/index entry, the server fetches the URL (with the creator Patreon token when the host is Patreon), same as export download. R2 is required in env for `relay/…` keys; misconfiguration surfaces as a failed read (handler returns 404 with the error text).
- T-3.2+ may add server-proxy upload as optional.
- New env variables for upload policy may be introduced (defaults in app); see [`.env.example`](../../../.env.example) section “Relay native uploads (T-3.1)”.
- Operational docs: root [`r2:smoke`](../../../package.json) path remains the connectivity check; upload routes add separate monitoring.

## Related

- **T-4.1 / T-4.2** — `POST /api/v1/relay/posts` contract + implementation: [`docs/api/relay-native-posts.md`](../../api/relay-native-posts.md) (JSON Schemas in [`docs/api/schemas/`](../../api/schemas/), OpenAPI fragment [`docs/api/openapi-fragments/relay-posts.yaml`](../../api/openapi-fragments/relay-posts.yaml); server: `src/relay/create-relay-post.ts`).
- [`src/storage/r2-config.ts`](../../../src/storage/r2-config.ts)
- [`MIG-30`](../supabase-migration-work-items.md) and [`multi-tenant-cloud-runtime.md`](../multi-tenant-cloud-runtime.md) (R2 env)
- [`docs/database/operations-and-security.md`](../../database/operations-and-security.md) (R2 key rotation)
- Airtable **T-3.1** / **T-3.2** (batting order)
