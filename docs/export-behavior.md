# Media export (blob fetch + Library thumbnails)

Relay keeps **canonical** post/media metadata in `canonical.json` (from Patreon ingest). **Binary files** are copied from Patreon `upstream_url` into **creator export storage** and indexed in **`export_index.json`** per creator.

## Files

| File | Role |
|------|------|
| `canonical.json` | `MediaRow.current.upstream_url` — may expire (signed Patreon URLs). |
| `{export_root}/{creator_id}/export_index.json` | `media` map: successful exports (sha256, paths, `upstream_revision`). Optional `export_failures`: last error per `media_id` after retries. |
| `{export_root}/{creator_id}/media/{media_id}/asset` | Stored blob. |

## Fetch retries

`ExportService.exportMedia` downloads with **bounded retries** (defaults: 3 attempts, exponential backoff, 60s timeout per attempt). Retries apply to **429**, **408**, **5xx**, and **network/timeout** errors. **401 / 403 / 404** are **not** retried (usually expired or forbidden URL — run a **Patreon sync** to refresh `upstream_url`).

Configure via **repo root** `.env` (see root `.env.example`): `RELAY_EXPORT_MAX_ATTEMPTS`, `RELAY_EXPORT_BASE_DELAY_MS`, `RELAY_EXPORT_FETCH_TIMEOUT_MS`.

## Failures and Library UI

If all attempts fail, the service writes **`export_failures[media_id]`** and throws. Gallery list items get `has_export: false`, `export_status: "missing"`, and **`export_error`** with a short message. The Library shows **Retry** (calls `POST /api/v1/export/media`). On success, the failure entry is cleared.

## Related

- [relay-artist-metadata.md](relay-artist-metadata.md) — overrides vs canonical (tags/visibility).
