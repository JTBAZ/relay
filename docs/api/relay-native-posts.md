# Relay native posts — `POST /api/v1/relay/posts` (T-4.1)

Contract for **M3** implementation (`T-4.2` transactional create). Aligns with Prisma: `Post` (`source = RELAY`), `PostVersion`, `PostTier`, `MediaAsset` (existing rows from upload/commit).

## Authentication

- **Session:** same creator studio session as `POST /api/v1/relay/upload/*` (Bearer, account linked, `Account.primaryRelayCreatorId` set).
- **Scope:** the authenticated account must own `creator_id` in the request body (or the route may take no `creator_id` and infer from account — see below).

## Campaign assignment (required decision for `T-4.2`)

`Post.campaignId` is **NOT NULL** and **FK** to `Campaign` (`onDelete: Restrict`). Every `Post` and every gated `Tier` is scoped to a campaign.

| Rule | Behavior |
|------|------------|
| **Default (v1)** | If the request **omits** `campaign_id`, the server resolves the campaign in order: (1) `CreatorProfile.patreonCampaignId` (must match a row in `Campaign` with the same `id` and `creatorId` as the request creator); (2) if the profile has **no** `patreonCampaignId` but exactly **one** `Campaign` exists for `creatorId`, use that; (3) otherwise respond **`400`** with a clear error (e.g. `CAMPAIGN_AMBIGUOUS` or `CAMPAIGN_REQUIRED`) asking the client to pass `campaign_id`. |
| **Explicit** | If the client sends `campaign_id`, it must be a `Campaign.id` where `Campaign.creatorId` equals the request `creator_id`. Otherwise **`400`**. |
| **Not in v1** | A free-floating “synthetic” Relay campaign with no Patreon link is **out of scope** for this design; add a separate spike/migration if product requires Relay-only creators with no Patreon campaign. |

**Tier validation (from Airtable T-4.2):** every id in `tier_ids` must be a `Tier.id` with `Tier.campaignId` equal to the resolved `Post.campaignId` (and `Tier.creatorId` = creator). Otherwise **`400 INVALID_TIER_REF`**.

## Request

**`POST /api/v1/relay/posts`**

```http
Content-Type: application/json
```

### Body (JSON)

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| `creator_id` | string | **yes** | Relay creator id (`cr_…` / tenant scope). Must match `Account.primaryRelayCreatorId` for the session. |
| `campaign_id` | string | no | `Campaign.id` — see campaign rules above. |
| `title` | string | **yes** | `PostVersion.title` (v1, non-empty; max length TBD in `T-4.2`, suggest 500). |
| `description` | string \| null | no | HTML or plain per product; `PostVersion.description`. |
| `is_public` | boolean | **yes** | Maps to `Post.isPublic`. If `true`, `Post.requiredTierId` is null. |
| `required_tier_id` | string \| null | no | `Post.requiredTierId` — single tier for “must have this tier (or public)” RLS/feed; **null** when `is_public` is true or for “followers” semantics per `T-4.2` product. |
| `tier_ids` | string[] | **yes** | Version-level access: `PostVersion.tierIds` and drives `PostTier` rows. Each id must be a stable **catalog** tier id: same strings as `TierFacet.tier_id` from `GET /api/v1/gallery/facets?creator_id=…` (Prisma `Tier.id`). **Web (T-6.2):** `CreatorTierCatalogMultiselect` + `fetchCreatorGalleryFacets` in `web/lib/relay-api.ts`. |
| `tag_ids` | string[] | no | `PostVersion.tagIds`; default `[]`. |
| `media_ids` | string[] | no | References `MediaAsset.id` (same `creatorId`). Must be **`RELAY_UPLOAD`** + committed (`currentStorageKey` set) for v1, or as relaxed in `T-4.2`. |
| `publish` | boolean | **yes** | `false` = draft. **`PostVersion.publishedAt` is non-null in Prisma today** — `T-4.2` must either (a) use an agreed **sentinel** datetime for “not yet published,” (b) add a migration to make `published_at` nullable, or (c) ship v1 with **`publish: true` only** until drafts are unblocked. |
| `published_at` | string (ISO 8601) | no | If `publish` is true, server may use `now()` or this value. If false, ignore or store for “scheduled” later. |

**`upstream_revision` (server-generated):** first Relay version should use a stable pattern such as `relay:v1:<created_at_ms>` (see Airtable T-4.1 note), not client-supplied, to match snapshot/`MediaVersionRow` expectations.

## Success response

**`201 Created`**

```json
{
  "ok": true,
  "data": {
    "post": {
      "id": "string",
      "creator_id": "string",
      "campaign_id": "string",
      "source": "RELAY",
      "is_public": false,
      "required_tier_id": null
    },
    "version": {
      "id": "string",
      "version_seq": 1,
      "upstream_revision": "relay:v1:…",
      "title": "string",
      "description": null,
      "published_at": "2026-04-23T12:00:00.000Z",
      "tag_ids": [],
      "tier_ids": ["…"],
      "media_ids": ["…"]
    }
  }
}
```

Wrapped in the same `success` / `trace_id` pattern as other Relay API JSON (`src/server.ts` `successEnvelope`).

## Error responses

| HTTP | Code (examples) | When |
|------|-------------------|------|
| 400 | `VALIDATION_ERROR` | Malformed body, empty title, etc. |
| 400 | `CAMPAIGN_REQUIRED` | Cannot resolve campaign. |
| 400 | `CAMPAIGN_AMBIGUOUS` | Multiple campaigns, no `campaign_id`. |
| 400 | `INVALID_CAMPAIGN` | `campaign_id` not found or wrong `creatorId`. |
| 400 | `INVALID_TIER_REF` | Tier not in campaign or wrong creator. |
| 400 | `INVALID_MEDIA_REF` | Unknown media, wrong creator, or upload not committed. |
| 403 | `FORBIDDEN` | Session not creator / wrong studio. |
| 503 | `SERVICE_UNAVAILABLE` | DB / Prisma not configured. |

(Exact `error` codes to match existing `errorEnvelope` conventions in `T-4.2`.)

## Web client (T-4.1 agreement)

- Types should mirror **`docs/api/schemas/relay-posts.request.schema.json`** and **`docs/api/schemas/relay-posts.response.schema.json`** (or a single bundle).
- `web/lib/relay-api.ts` (or follow-on `T-6.3`) will call this route after `upload/init` + `upload/commit` + `media_id` is known.

## Related

- Prisma: `Post`, `PostVersion`, `PostTier`, `Campaign`, `Tier`, `MediaAsset`, `PostSource`, `MediaIngestOrigin`
- **Shipped (T-4.2):** `POST /api/v1/relay/posts` in `src/server.ts`; domain logic in `src/relay/create-relay-post.ts` (`createRelayPostTransaction`, `resolveCampaignIdForRelayPost`, `RelayCreatePostError`). Tests: `tests/relay-create-post.test.ts`.
- ADR: `docs/architecture/adr/002-r2-creator-uploads-presigned-vs-server.md` (upload) — R2 + native post read path; write path is Relay HTTP + Prisma.
