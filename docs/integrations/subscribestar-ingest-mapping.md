# SubscribeStar ingest — spike notes and Relay mapping

**Status:** §2A public-reference synthesis documented; hypothesis GraphQL → ingest wire adapters in `src/subscribestar/` (+ Vitest fixtures). **Explorer + counsel** rows in §9 still gate replacing §5 **TBD** fields and dropping real query text into env.

**References**

- SubscribeStar OAuth + GraphQL overview: [API, OAuth2 and GraphQL](https://www.subscribestar.adult/api)
- Relay ingest shapes: [`src/ingest/types.ts`](../../src/ingest/types.ts)
- Patreon reference mapper: [`src/patreon/map-patreon-to-ingest.ts`](../../src/patreon/map-patreon-to-ingest.ts)
- Idempotent batch rules: [`docs/patreon-ingest-canonical.md`](../patreon-ingest-canonical.md)

---

## 1. Legal / usage gate (blocker before user-facing launch)

Official API copy states (**read-only** API; usage terms):

- You will **not** use the API **to provide any benefits outside the platform**.
- You will **not** use the API to **manage subscriptions** or change the platform.
- You will **not** distribute **confidential or sensitive information**.

**Relay posture (product + counsel):**

- Confirm that **creator import**, **subscriber entitlements**, and **merged consumption on Relay** are permitted under SubscribeStar policies and OAuth app approval.
- **Engineering:** keep `SUBSCRIBESTAR_INGEST_ENABLED` (or equivalent) **off** in production until this is cleared; internal/staging spikes are fine.

---

## 2. OAuth spike checklist

Complete in **Profile Settings → OAuth applications** (`#oauth2_applications`).

| Step | Detail |
|------|--------|
| App registration | `client_id`, `client_secret`, registered `redirect_uri` |
| Creator ingest | Authorization URL with **`content_provider_profile.read`** (+ any Explorer-required scopes for posts/media/tiers — **confirm in Explorer**) |
| Subscriber / patron linkage | Separate redirect or scopes as needed — e.g. **`user.subscriptions.read`**, **`user.read`**, **`subscriber.read`** — **combinable scopes** per docs |
| Token URL | Docs show `POST …/oauth2/token` — **same registrable host** as your app (.adult vs .com); mismatched host rejects exchange |
| Access token TTL | Typical `expires_in` in response — implement refresh before expiry |
| Refresh | `grant_type=refresh_token` — store `refresh_token` encrypted (same posture as Patreon `OAuthCredential`) |

Copy from official docs:

- Authorization: `https://subscribestar.adult/oauth2/authorize?…&scope=SCOPE_ONE+SCOPE_TWO`
- GraphQL: `POST https://…/api/graphql/v1` with `Authorization: Bearer …` and JSON body `{ "query": "…", "variables": … }`.

---

## 2A. Public documentation synthesis (automated prerequisite)

The following **does not replace** API Explorer validation with live tokens; it records what SubscribeStar publishes without logging in:

- **Transport:** Bearer token, **`POST`** to **`…/api/graphql/v1`** (same host pattern as OAuth; [**official overview**](https://www.subscribestar.adult/api)).
- **Nature of API:** **Read-only** — no edits to the platform or subscription management via this API channel.
- **Usage terms:** No “benefits outside the platform,” no subscription management/changes via API, no distributing confidential info — Relay needs **counsel/product** vs creator-import / merged entitlement UX (see §1).
- **OAuth scopes (official table):** `content_provider_profile.read` plus optional creator-side `content_provider_profile.subscriptions.read`, `.payments.read`, `.payouts.read`; patron-side scopes include **`user.subscriptions.read`**, **`subscriber.read`**, combinable extras (`user.read`, payment scopes, etc.).
- **Pagination:** Connections with **`edges` / `cursor` / `pageInfo`** documented on the official page.
- **Code hooks (Relay):** Env-driven ingest query loaders and a **hypothesis** GraphQL → Explorer-wire mapper (`subscribestar-ingest-queries`, `subscribestar-graphql-response-to-wire`, `subscribestar-graphql-ingest-fetch`) — validated only against **`tests/fixtures/subscribestar-hypothesis-posts-graphql.json`** until real Explorer shapes arrive.

Replace placeholder field names once §3 is exercised.

---


Execute in **API Explorer** with:

1. **Creator token** (content provider scopes) — can this user see **full gated posts**, **attachments / media URLs**, and **tier / plan linkage**?
2. **Subscriber token** (`user.subscriptions.read` etc.) — list of subscribed creators/plans for **Relay patron entitlement** + merged feed?

Record in a **private appendix** (not this repo):

- Screenshots or paste of resolved types for roots you will query (avoid PII in git).
- Pagination cursors (`Connection` pattern per their docs).

**Minimum questions to answer:**

| Question | Pass criteria |
|----------|----------------|
| Stable post id | Opaque string or integer usable as **`substar_post_{id}`** |
| Publication time | Maps to **`IngestPost.published_at`** (ISO 8601) |
| Title / body | Maps to **`title`**, **`description`** |
| Access / tiers | List of tier/plan identifiers → **`tier_ids`** as **`substar_tier_{id}`** |
| Media | Ordered list with **URLs fetchable server-side**, MIME if available → **`IngestMediaItem`** |
| Revisions | Field or fingerprint for **`upstream_revision`** (post + media) |
| Deletes | Signal for **`IngestTombstone`** (`post` / `media`) or polling diff strategy |
| Rates / limits | Backoff defaults for BullMQ |

If **creator token cannot return gated binaries or tier mapping**, capture gap explicitly — agreed v1 fallback is **manual Relay bulk/bootstrap upload** alongside API where possible.

---

## 4. Relay id and batch conventions (canonical)

-prefix all SubscribeStar-derived ids ingested into Relay so they never collide with Patreon or Relay-native IDs:

| Entity | Stable `campaign_id` | Stable `tier_id` (relay key) | Stable `post_id` | Stable `media_id` |
|--------|----------------------|-------------------------------|------------------|-------------------|
| Pattern | `substar_campaign_{X}` | `substar_tier_{X}` | `substar_post_{X}` | `substar_media_{X}` |

- **`creator_id`** in every batch: existing Relay **`Tenant.relayCreatorId`** studio scope (unchanged — same string Patreon ingest uses).

**Campaign row**

SubscribeStar maps to exactly **one** logical `Campaign` per connected creator page/account for that provider (spike confirms what `X` is — numeric page id vs slug).

---

## 5. Field mapping → `SyncBatchInput`

Types are defined in [`src/ingest/types.ts`](../../src/ingest/types.ts). Below: **intent** + **Explorer TBD**.

### 5.1 `IngestCampaign`

| Relay field | Source (SubscribeStar GraphQL — TBD) | Notes |
|-------------|--------------------------------------|-------|
| `campaign_id` | **TBD root** → stable external id wrapped as `substar_campaign_*` | One per connected Substar creator profile |
| `name` | Display name | May come from provider profile query |
| `upstream_updated_at` | Last modified or `now()` if unavailable | Prefer real updated-at for sync |

### 5.2 `IngestTier`

| Relay field | Source (TBD) | Notes |
|-------------|----------------|-------|
| `tier_id` | `substar_tier_{upstream_id}` | Must match ids referenced on posts |
| `title` | Tier/plan title | Required for UX + `tier-rules.js` fallbacks |
| `campaign_id` | Same `substar_campaign_*` | Ties tiers to SubscribeStar campaign |
| `amount_cents` | **TBD** (price/minimum) | Optional; patron analytics + free-vs-paid heuristic |
| `upstream_updated_at` | Tier updated at or ingest time | |

### 5.3 `IngestPost`

| Relay field | Source (TBD) | Notes |
|-------------|----------------|-------|
| `post_id` | `substar_post_*` | Primary idempotency key with campaign |
| `title` | Post title |
| `description` | Body / HTML / markdown → plain or stored as received | Normalize in mapper like Patreon if needed |
| `published_at` | ISO timestamp |
| `tag_ids` | **TBD** or `[]` if no tags | |
| `tier_ids` | List of **`substar_tier_*`** for gated access; **`[]`** + synthetic public handling | May need Relay synthetic markers (`relay_tier_public` pattern) mirroring [`relay-access-tiers`](../../src/patreon/relay-access-tiers.ts) — align in implementation |
| `upstream_revision` | Hash of updated_at + content length, or upstream version field |
| `media` | Mapped list | |

### 5.4 `IngestMediaItem`

| Relay field | Source (TBD) | Notes |
|-------------|----------------|-------|
| `media_id` | `substar_media_*` |
| `mime_type` | From API or URL guess | |
| `upstream_url` | HTTPS URL Relay export worker can GET | Confirm auth headers vs public URL |
| `upstream_revision` | Per-asset revision or URL fingerprint |
| `role` | `cover` vs `attachment` if GraphQL distinguishes | Else omit; optional `finalize` step later |

### 5.5 `IngestTombstone`

| Relay field | Source (TBD) | Notes |
|-------------|----------------|-------|
| `entity_type` | `"post"` / `"media"` |
| `id` | Same prefixed id as ingest |
| `deleted_at` | ISO time from API or detection time |

After mapping is confirmed, implement **`map-subscribestar-to-ingest.ts`** (pure functions + Vitest fixtures), patterned on Patreon mapper.

---

## 6. Patron / merged feed spike (subscriber token)

Aligned with Relay goal: patron logs in once and sees **both** Patreon and SubscribeStar subscriptions.

| Relay need | Subscriber GraphQL query (names **TBD**) | Output must include |
|------------|--------------------------------------------|---------------------|
| Who they support | Connections under **`user`** / **`subscriber`** (Explorer) | External creator/star id usable to resolve **Relay `creator_id`** |
| Active tier/plan | Per subscription row | Stable ids → patron **`tier_ids`** or normalized entitlements |

**Linkage problem:** SubscribeStar subscriber API likely returns **platform user/page ids**, not Relay `creator_id`. Record how to resolve:

1. Invite flow (patron OAuth after creator linked same page — **recommended** alignment), or  
2. Public slug lookup table keyed by SubscribeStar external id stored on **`CreatorProfile`**.

Capture resolution rules in spike appendix before **`IdentityService`** changes ship.

---

## 7. Idempotency and independence from Patreon

- Same hashing rules as **[`docs/patreon-ingest-canonical.md`](../patreon-ingest-canonical.md)**: keyed by `(creator_id, prefixed post_id/media_id, upstream_revision…)`.
- **Never** reuse Patreon prefixes on SubscribeStar batches.
- SubscribeStar sync must only update posts with **`PostSource`/origin = SUBSCRIBESTAR** once schema supports it — do not mutate PATREON or RELAY rows.

---

## 8. Fallback (v1 agreement)

If API cannot supply full gated library:

- Ship **Relay-native tier bins + bulk upload** as the supported path for large Substar catalogs (see existing [`CreatorRelayPostComposer`](../../web/app/components/shell/CreatorRelayPostComposer.tsx) / ingest for `RELAY`).
- Optionally still ingest **public or partial** GraphQL payloads when useful.

---

## 9. Sign-off checklist (Todo 1 exit)

Paste results into project tracker when done:

- [x] **§2A public-reference synthesis:** official transport, scopes, pagination, usage terms summarized in-repo (does **not** close Explorer gaps).
- [ ] Counsel / product reviewed API usage clause vs Relay features (**or** flagged as open risk).
- [ ] Creator OAuth: token exchange + refresh verified on staging credentials.
- [ ] Creator GraphQL: posts + media URLs + tier mapping doc'd (or gap written with screenshots in private appendix).
- [ ] Subscriber OAuth: subscriptions list doc'd for merged-feed resolution.
- [ ] This mapping table filled in (replace **TBD** with concrete field paths / query names).

**Todo 1 is complete only when Sections 3 and 9 are exercised by a human with real credentials** — automation here cannot introspect SubscribeStar GraphQL without your OAuth app.
