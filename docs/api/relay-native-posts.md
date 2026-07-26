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

**Tier validation (T-4.2 / Option B):** each value in `tier_ids` (and `required_tier_id` when set) must resolve to exactly one `Tier` for the request `creator_id` whose `Tier.campaignId` matches the resolved `Post.campaignId`. The request may send **Prisma `Tier.id`** or **`Tier.relayTierId`** (same disambiguation rules as `resolveRelayPostTier` in `src/relay/create-relay-post.ts`). Otherwise **`400 INVALID_TIER_REF`**. **Persisted rows:** `PostVersion.tierIds` and `Post.requiredTierId` store canonical **`tiers.relay_tier_id`**; **`PostTier`** junction rows continue to reference **`Tier.id`** only.

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
| `required_tier_id` | string \| null | no | **Request:** same resolution as `tier_ids` (**`Tier.id`** or **`relayTierId`**). **Persisted:** `Post.requiredTierId` is the canonical **`relay_tier_id`** (RLS / membership); **null** when `is_public` is true or for “followers” semantics per product. **`201` response:** gate field is relay-key space (see envelope note below). |
| `tier_ids` | string[] | **yes** | **Request:** pass **Prisma `Tier.id`** from `GET /api/v1/relay/compose-tiers` (`tier_id` on each row), *or* a **`relayTierId`**. **Do not** use `GET /api/v1/gallery/facets` `tiers[].tier_id` for compose unless you intend relay keys (also accepted when they resolve uniquely). **Persisted:** `PostVersion.tierIds` holds **`relay_tier_id`** values (gallery snapshot / entitlement / facet titles). **`PostTier`** rows are still created from Prisma **`Tier.id`**. **`201`:** `version.tier_ids` reflects persisted **relay** keys, not necessarily the strings sent in the request. Open-web: `is_public: true` and `tier_ids: []`. |
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
      "campaignId": "string",
      "creatorId": "string",
      "source": "RELAY",
      "isPublic": false,
      "requiredTierId": null
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

**Option B — tier id space in `201`:** `version.tier_ids` are **`relay_tier_id`** strings. `post.requiredTierId` when set is **`relay_tier_id`** space, not Prisma `Tier.id`.

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
- `web/lib/relay-api.ts` calls this route after `upload/init` + `upload/commit` when `media_id` values are known.

### Tier ids: compose vs gallery facets vs create response

| Surface | Endpoint / data | `tier_id` / tier list meaning |
|---------|----------------|------------------------------|
| **Relay compose** (request body) | `GET /api/v1/relay/compose-tiers` | Response `tier_id` = Prisma **`Tier.id`** — convenient for `POST /relay/posts` **`tier_ids`**; `relay_tier_id` on the same row is the canonical key persisted on `PostVersion` / returned on **`201`**. |
| **Gallery filters / chips** | `GET /api/v1/gallery/facets` → `tiers[]` | Relay keys — same namespace as **`GalleryItem.tier_ids`**. |
| **Create post success** | **`201`** `data.version.tier_ids` | **`relay_tier_id`** strings (aligned with facets / entitlement), regardless of whether the client sent Prisma ids or relay keys in the request. |

Analytics helpers in `web/lib/tier-access.ts` may bucket “free/public” tiers for chips; they must **not** replace the compose catalog above.

## Related

- Prisma: `Post`, `PostVersion`, `PostTier`, `Campaign`, `Tier`, `MediaAsset`, `PostSource`, `MediaIngestOrigin`
- **Compose tier catalog:** `GET /api/v1/relay/compose-tiers` in `src/server.ts` (same session/guard pattern as `POST /api/v1/relay/posts`).
- **Shipped (T-4.2):** `POST /api/v1/relay/posts` in `src/server.ts`; domain logic in `src/relay/create-relay-post.ts` (`createRelayPostTransaction`, `resolveCampaignIdForRelayPost`, `RelayCreatePostError`). Tests: `tests/relay-create-post.test.ts`.
- ADR: `docs/architecture/adr/002-r2-creator-uploads-presigned-vs-server.md` (upload) — R2 + native post read path; write path is Relay HTTP + Prisma.
