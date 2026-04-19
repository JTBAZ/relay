# Patron Experience Roadmap

> **Scope:** flesh out the Supporter / Fan Relay side of the product — sign-up, Patreon link, real DB-backed feed, follow graph (creators **and** other supporters), engagement (favorites, collections, comments), discovery, notifications, and the dual-role (creator who also supports others) shell.
>
> **Companions:** strategic narrative in [`road map.md`](../road%20map.md) Part 3, identity & multi-tenant in [`docs/architecture/multi-tenant-option-b.md`](architecture/multi-tenant-option-b.md), patron OAuth-as-it-exists in [`road map.md`](../road%20map.md) Workstream K table, schema in [`prisma/schema.prisma`](../prisma/schema.prisma).
>
> **This doc replaces** the implicit "we'll wire it up later" status of `/api/v1/patron/relay_feed` (currently a fixture-JSON read) and turns Part 3 Workstreams **K, L, M, O** into concrete buildable slices. Workstream **N** (audience monetization) remains deferred per roadmap policy.

---

## 1. Status snapshot (where we are, October 2026)

### What's already in place

| Domain | Status | Code reference |
|---|---|---|
| Patron Patreon OAuth (login + on-login tier sync) | **Working** end-to-end | `src/patreon/patreon-patron-oauth.ts`, `POST /api/v1/auth/patreon/patron/exchange`, `web/app/patreon/patron/connect`, `web/app/patreon/patron/callback` |
| Multi-tenant identity (Account + TenantMembership) | **Working** (Option B, MT-031) | `prisma/schema.prisma` (Account, TenantMembership), `src/identity/patron-auth-context.ts` |
| `PatronEntitlementSnapshot` materialized on OAuth | **Working** (`source = oauth_exchange`, `staleAfter` 6h default) | `src/identity/patron-entitlement-snapshot.ts` |
| Per-creator favorites + collections (file & DB stores, validated) | **Working** API + DB | `src/gallery/patron-favorites-store*.ts`, `src/gallery/patron-collections-store*.ts`, `/api/v1/patron/favorites`, `/api/v1/patron/collections*` |
| Patron permission/entitlement health endpoints | **Working** | `/api/v1/patron/permission/post`, `/api/v1/patron/entitlements/health` |
| Patron cross-tenant introspection | **Working** | `/api/v1/me/patron-auth` |
| `/login?role=supporter` tab | **Working**, Patreon-only path | `web/app/login/LoginPageClient.tsx` |
| Patron shell UI (feed/sidebar/discover/gallery/command-palette/profile) | **Working** with fixtures, has `live` toggle | `web/components/patron-mock/relay/relay-app.tsx`, `web/lib/patron-feed-api.ts` |
| `relay_active_role` cookie + `defaultActiveRoleForAccount` | **Working** | `src/identity/active-role-default.ts`, `src/identity/set-active-role-cookie-for-session.ts` |
| Patreon `members:*` webhook event detection | **Detection only** | `src/webhooks/patreon-webhook.ts` |
| Schema stubs for full patron domain | **Schema-only** (no app wiring) | `PatronFollow`, `FeedCursor`, `NotificationPreference`, `PatronOAuthCredential`, `Comment`, `DiscoveryDecisionLog` |

### What's placeholder / missing

| Gap | Today | Required |
|---|---|---|
| **Real feed assembly** | `GET /api/v1/patron/relay_feed` reads `web/lib/patron-relay-feed-bundle.json` fixture | DB join: `PatronFollow` × `Post` × `PostOverride` × `PatronEntitlementSnapshot`, paginated via `FeedCursor` |
| **Follow graph endpoints** | Schema only (`PatronFollow` is creator-scoped) | Routes for follow/unfollow/list **and** generalize to follow other Accounts (supporters) |
| **Initial follow seeding from Patreon memberships** | Manual/none | Job that auto-creates `PatronFollow` rows for entitled creators present on Relay |
| **Webhook → patron entitlement refresh** | Member events detected, not wired to snapshots | `members:create/update/delete` enqueues snapshot refresh for affected `(creator, patron_user_id)` |
| **Scheduled refresh worker** | None | BullMQ worker that scans `staleAfter < now` and refreshes via stored refresh token |
| **`PatronOAuthCredential` persistence** | Schema only (intentionally not written today) | Encrypted refresh-token storage (same KMS pattern as creator `OAuthCredential`) |
| **Comments (read/write/moderation)** | Schema only | API + UI + auto-mod + creator + Relay queue |
| **Discovery / Browse assembly** | Static `discoverItems` from fixtures | v1 = creator-opt-in public-post grid; v2 = ranked Browse with `DiscoveryDecisionLog` |
| **Notification system (storage + delivery + prefs UI)** | Schema only | `Notification` table, `/api/v1/patron/notifications`, in-app + email channel |
| **Email/password supporter signup** | Patreon-OAuth-only path | `Account` create with verified email, then **link** Patreon as a separate step |
| **Supporter profile (handle, bio, avatar, public/private)** | `PatronProfile.handle` exists but no API/UI/uniqueness | Full profile model + public profile route `/p/[handle]` |
| **Cross-creator favorites/collections** | Per-creator scope partitioning | Allow any-post collection items, render through viewer entitlement filter |
| **Viewer-permission-aware rendering** | None | Blurred teaser + upgrade-CTA for items the viewer can't access |
| **Comment likes / reactions** | None | New table, API |
| **Reports / moderation queue / mute / block** | None | Trust-and-safety surface |
| **Patron data export & deletion (GDPR-ish)** | None | Per-Account export + per-creator-relationship deletion |

---

## 2. Decisions ledger (locked)

These are the answers from the two scoping rounds. Treat as authoritative unless explicitly amended in a later revision.

| # | Decision | Choice |
|---|---|---|
| D1 | **Supporter on-ramp** | Verified email/password Account first, then **forced** Patreon link step in onboarding. Patreon link populates entitlements + auto-follows. |
| D2 | **Dual-role shell (creator who is also a patron)** | Single Relay shell with explicit role toggle, driven by existing `relay_active_role` cookie pattern. Creator's own studio does **not** appear in their own patron feed. |
| D3 | **Entitlement freshness target** | Webhook-driven + scheduled stale-driven worker + on-login refresh + pre-action verification for tier-gated media. (See §4.3 for cadence math.) |
| D4 | **Refresh token persistence** | Yes — persist `PatronOAuthCredential` encrypted with same KMS pattern as creator `OAuthCredential`. Required to make D3 work without forcing re-auth. |
| D5 | **Follow vs Subscribe** | Independent. Auto-follow on Patreon subscribe + manual follow of any creator (free-tier visible to non-subscribers) **and** any other supporter. |
| D6 | **Discovery / Browse in v1** | Start as opt-in public-post grid (creator marks posts as discovery-eligible). Evolve into ranked Browse with `DiscoveryDecisionLog` once data accumulates. |
| D7 | **Comments** | Public Relay-native, with creator-controlled per-post visibility: `follow_only` / `tier_only` / `public`. Threaded (1 level of replies). |
| D8 | **Comment moderation** | Three layers: auto-mod (rate limits, length caps, basic profanity/url filter) + creator moderation on their own posts (delete/hide/pin) + Relay platform queue for ToS escalations and reports. |
| D9 | **Engagement scope (favorites / collections)** | Cross-creator. A patron can favorite/collect any post they currently have permission to view. Permission re-evaluated at **render time** for the viewer (not the owner). |
| D10 | **Viewer-permission rendering** | Blurred teaser + upgrade CTA (deep-link to creator's Patreon checkout) when the viewer lacks the required tier. |
| D11 | **Supporter profiles** | Public by default (handle, avatar, bio, public collections, public favorites). Patron can opt-out / make private. Handle unique globally. |
| D12 | **Notification events in v1** | `new_post_followed`, `comment_reply`, `creator_replied`, `new_follower`, `collection_added` (your post added to someone's public collection — creator-side), `comment_liked`. **Out of v1:** `tier_change`, `weekly_digest`. |
| D13 | **MVP cut** | Full swing — all of the above is **in scope**. Phasing handles delivery order. |
| D14 | **Block semantics** | Future-only. Blocking stops new comments / new follows / new DMs (when added). Their existing comments stay visible (preserves thread context); their existing follow of you is dropped. |
| D15 | **Comment edit window** | 15 minutes from post. Edits show an "edited" marker. After window, only delete is available to the author. |
| D16 | **Supporter handle policy** | Permissive charset (2-30 chars, `[a-zA-Z0-9_-]`, stored lowercase for uniqueness). Auto-generated at signup (e.g. `user_4f2a`). Patron picks a real handle **only when they make their profile public** — squat protection by gating handle-claim behind `isPublic`. Reserved-words list (admin/relay/staff/api/etc) blocked at claim time. |
| D17 | **Moderation appeals** | None in v1. Removed = removed. Footer of moderation notice points to `support@` for disputes. Add formal appeal flow only if support volume justifies it. |
| D18 | **Email provider** | Decide inside PE-A's first ledger row — evaluate Resend vs Postmark vs SES at that time, factoring in any infra Part-2 Re-Populate already chose. |
| D19 | **Discover v1 ordering** | Recency with creator-fairness cap: no single creator appears more than 2× in any visible page of the grid. |
| D20 | **Audit log retention** | Per-table policy: `ModerationAction` and `ContentReport` indefinite (legal/dispute trail); `DiscoveryDecisionLog` 90 days hot, then drop (operational telemetry only); `MigrationAuditEntry` (existing) follows its own Part-2 policy. |
| D21 | **`PatronCampaignAccess`** | Stay dormant in P1. Wire only if PE-D's cross-creator queries actually need normalized campaign rows; revisit at P2 kickoff. |
| D22 | **Auto-mod stack (v1)** | Hand-rolled: word/URL block lists + per-Account rate limits (5/min, 50/day) + length cap + URL-count cap. No external API calls. Revisit when abuse signal warrants a library or hosted scorer. |
| D23 | **Weekly digest emails** | Never (per current product stance). In-app notifications tray is the answer for "what's new". |
| D24 | **Tier-change in-app notifications** | Yes — surface as in-app notification (no email) whenever entitlement refresh detects an upgrade, downgrade, or cancel. Wording differentiates ("You now have Tier 2 access to X" vs "Your Tier 2 access to X ended"). |
| D25 | **Comment-like notification cadence** | Cluster per-comment **and** per-time-window: roll up all likes on the same comment within a 1h sliding window into a single notification ("5 people liked your comment"). Window resets after notification is delivered. |

---

## 3. Architecture changes required

### 3.1 Schema deltas (Prisma)

> All migrations follow the [migration-best-practices](https://) prisma rule. Each delta below is one migration unit unless flagged.

| Change | Model(s) | Why |
|---|---|---|
| **Generalize follow target** | `PatronFollow` → drop dependency on `relay_creator_id` only; add discriminated `subjectKind` (`creator` \| `supporter`) and either `subjectAccountId` (for supporter follows) or keep `relayCreatorId` (for creator follows). Or introduce a sibling `AccountFollow` model and keep `PatronFollow` for creator-follows — **recommended** to preserve existing index patterns. | D5 |
| **Add supporter profile fields** | `PatronProfile` → add `handleNorm` `@unique`, `displayName`, `bio`, `avatarUrl`, `isPublic` (`Boolean @default(true)`), `bannerUrl?`. | D11 |
| **Cross-creator favorites/collections** | `PatronFavorite`, `PatronSavedCollection(Entry)` → keep `creatorId` as a denorm for index/RLS but allow store layer to query across creators. Add `PatronSavedCollection.isPublic`, `PatronSavedCollectionEntry.snapshotTierId` (so we know the gate even if creator deletes the post later). | D9, D10 |
| **Comment visibility & threading** | `Comment` → add `visibility` enum (`follow_only` \| `tier_only` \| `public`), `requiredTierId?`, `parentCommentId?` (self-relation), `pinnedAt?`, `editedAt?`. | D7 |
| **Comment likes** | New `CommentReaction` (commentId, accountId, createdAt; `@@unique([commentId, accountId])`). | D12 (`comment_liked`) |
| **Notifications storage** | New `Notification` (id, recipientAccountId, eventType, payloadJson, createdAt, readAt?, dismissedAt?, clusterKey?). Plus extend `NotificationPreference` with the v1 event types as a Postgres enum or string-validated set. | D12 |
| **Reports & moderation queue** | New `ContentReport` (id, reporterAccountId, targetKind=`comment`/`post`/`profile`, targetId, reason, status, createdAt, resolvedAt?, resolutionNote?). New `ModerationAction` (id, actorKind=`creator`/`relay_admin`/`automod`, action=`hide`/`delete`/`warn`/`ban`, targetKind/Id, createdAt, note?). | D8 |
| **Block / Mute** | New `AccountBlock` (accountId, blockedAccountId, createdAt, `@@unique`). Future-only semantics per D14: queries filter new comments/follows by blocker→blocked, but historical comments stay visible. | D7, D8, D14 |
| **`PatronOAuthCredential` is the canonical per-Account refresh-token store** | Already in schema. Wire actually-write path. | D4 |
| **Initial-follow seed audit** | New `PatronFollowSeed` (patronAccountId, sourceCampaignId, seededAt) — small log so we don't re-seed on every login. | D5 |

### 3.2 API surface (Express, all under `/api/v1/`, opaque-Bearer auth, success/error envelope)

| Verb / Path | Purpose |
|---|---|
| `POST /auth/email/register` | Email + password → Account, sends verification email |
| `POST /auth/email/verify` | Verify token → mark Account verified |
| `POST /auth/email/login` | Email + password → opaque session cookie (same minting path as Patreon) |
| `POST /auth/patreon/patron/link` | (rename of `/exchange` — handles both **first-link** and **re-link**; identity comes from session, not OAuth) |
| `DELETE /auth/patreon/patron/link` | Unlink Patreon (drops `PatronOAuthCredential`, marks snapshots stale, keeps Account) |
| `GET /patron/me` | Profile + role flags + linked providers (extends today's `/me/patron-auth`) |
| `PATCH /patron/me` | Update profile (handle, displayName, bio, isPublic, avatar) |
| `GET /p/[handle]` (public) | Public supporter profile JSON |
| `GET /patron/follows?kind=creator|supporter` | List follows |
| `POST /patron/follows` | Follow a creator (`relay_creator_id`) or supporter (`account_id`) |
| `DELETE /patron/follows` | Unfollow |
| `GET /patron/feed?cursor=&filter=` | **Real feed** — paginated, filtered, follows × posts × entitlement-aware. Replaces fixture endpoint. |
| `GET /patron/discover?cursor=` | v1 = creator-opt-in public posts; later v2 ranked |
| `POST /patron/discover/eligibility` (creator-side) | Mark a post discovery-eligible / revoke |
| `GET /posts/:postId/comments` | List (filtered by viewer's permission against the post's `visibility` + tier) |
| `POST /posts/:postId/comments` | Create (auto-mod gate before insert) |
| `PATCH /comments/:id` | Edit (own only, time-limited) |
| `DELETE /comments/:id` | Delete (own, or creator on their post, or admin) |
| `POST /comments/:id/reactions` | Like |
| `DELETE /comments/:id/reactions` | Unlike |
| `POST /comments/:id/pin` | Creator only |
| `POST /moderation/reports` | Report comment/post/profile |
| `GET /moderation/queue` | Relay admin only |
| `POST /moderation/actions` | Relay admin or creator (scoped) |
| `GET /patron/notifications?cursor=` | Inbox |
| `POST /patron/notifications/mark-read` | Bulk read |
| `GET /patron/notification-preferences` | Read prefs |
| `PATCH /patron/notification-preferences` | Update prefs |
| `POST /patron/blocks` / `DELETE /patron/blocks` | Block/unblock another Account |
| `GET /patron/data-export` (POST initiate, GET status, GET download) | GDPR-ish |
| `DELETE /patron/account` | Hard delete (with confirmation token, 7-day grace) |
| `DELETE /patron/account/relationships/:relayCreatorId` | Per-creator-relationship deletion |
| **Webhooks (extend existing)** | `members:create/update/delete` → enqueue `RefreshPatronEntitlementJob` for each affected `(account, creator)` |
| **Workers (BullMQ)** | `PatronEntitlementRefreshWorker`, `PatronInitialFollowSeedWorker`, `NotificationDeliveryWorker`, `EmailVerificationWorker`, `DataExportWorker` |

### 3.3 Entitlement freshness recommendation (D3 / D4 detail)

**Recommended pattern** (defaults to Patreon's documented rate limits, our pilot scale of < 50k active patrons):

1. **On-login refresh** (existing) — cheap, immediate, covers re-engaged users.
2. **Webhook-driven refresh** — `members:create/update/delete` from Patreon → enqueue snapshot refresh job for affected `(patron Account, creator)`. **Primary freshness mechanism** — sub-minute latency.
3. **Scheduled stale-driven worker** — every 5 minutes, scan `PatronEntitlementSnapshot` where `staleAfter < now()` AND `last_attempt_at < now() - INTERVAL '15 minutes'`. Refresh in batches with concurrency cap and Patreon rate-limit headers respected. Backstop for missed/dropped webhooks.
4. **Pre-action refresh** — only for **media playback / full-resolution download** of tier-gated content, and only when snapshot is past `staleAfter`. Not for thumbnail/listing — those use snapshot as-is.
5. **`staleAfter` stays at 6h default**, configurable via `RELAY_PATRON_ENTITLEMENT_STALE_AFTER_MS`.

This is layered defense: webhook covers the 99% case in real-time; worker covers webhook drops; pre-action catches the long-tail right when it matters; on-login keeps dormant users honest.

**Why not "every 4h with jitter"?** It's predictable load but pays the API cost on patrons who haven't moved — wasted requests and rate-limit risk at scale. The stale-driven approach naturally focuses load on accounts that need it.

**Why not "tiered (1h / 12h / dormant on-login)"?** The bookkeeping (what's "active"?) duplicates the FeedCursor/last-seen signal we'd want anyway. Roll that in once we have engagement telemetry; not worth in v1.

---

## 4. Workstreams (the build cards)

> Each workstream below maps to one or more Production Ledger rows. Codes use `PE-` prefix (Patron Experience) to avoid collision with existing `MT-`/`MIG-` series.

### PE-A — Identity expansion: email signup + Patreon as a link, not a constructor

- Email/password registration (re-use existing Supabase auth path used by `/login` creator tab if possible — see `StudioSupabaseSignInPanel`)
- Email verification flow (`EmailVerificationWorker`)
- **Email provider selection** (D18): evaluate Resend / Postmark / SES inside this workstream's first ledger row; check whether Part-2 Re-Populate has already chosen one and reuse if reputation pools allow
- `/auth/patreon/patron/link` replaces `/exchange` semantics: identity from session, not from OAuth result. Existing endpoint kept as deprecated alias for one release.
- `PatronOAuthCredential` write path with KMS encryption (mirror creator `OAuthCredential` pattern)
- **Handle policy (D16)**: at signup, auto-generate `user_<6-char-hash>` and store as `PatronProfile.handleNorm`. Profile stays `isPublic = false`. When patron flips to public, prompt for a real handle: 2–30 chars, `[a-zA-Z0-9_-]`, lowercased for uniqueness, reserved-words list checked (`admin`, `relay`, `staff`, `api`, `support`, `mod`, `moderator`, `system`, `null`, `undefined` + Patreon-conflict shortlist). Auto-handle is never shown publicly.
- Onboarding wizard at `/patron/onboarding`: Step 1 register/verify, Step 2 Patreon connect (forced unless skipped), Step 3 profile (handle/avatar — only required if going public), Step 4 notification prefs
- Acceptance: an email-only patron can register, sign in, and see an empty feed with "Connect Patreon" CTA. After link, entitlements + auto-follows appear within 5 seconds. Handle stays auto-generated until the patron explicitly opts public.

### PE-B — Real DB-backed feed assembly

- Replace `loadPatronRelayFeedBundleFromRepo` with `assemblePatronFeed(accountId, cursor, filter)`
- Query: `PatronFollow` for `accountId` × `Post` (filter by `creator_id IN follows`) × `PostOverride` (visibility) × entitlement-aware tier filter using `PatronEntitlementSnapshot`. Order by `Post.createdAt DESC`, paginate via `FeedCursor`.
- Filters: `all`, `following`, `free`, `photos`, `audio`, `writing` (matches existing UI chips)
- Cache: per-cursor 60s with `private, no-store` upstream
- Fallback: when entitlement snapshot stale **and** Patreon unreachable, mark items `degraded` (existing `entitlement-degraded.ts` pattern)
- Acceptance: feed renders real posts, zero unauthorized tier content (security test), P95 < 500ms for patron with 50 follows

### PE-C — Follow graph (creators + supporters)

- Schema delta per §3.1
- `PatronInitialFollowSeedWorker`: on first Patreon link, create follows for each entitled creator that exists on Relay (matched via `CreatorProfile.patreonCampaignId`); idempotent via `PatronFollowSeed`
- Follow/unfollow APIs with rate limits
- Sidebar in `relay-app.tsx` switches from fixtures to real follows; off-Relay invite copy preserved for entitled-but-not-on-Relay creators
- Acceptance: I can follow another supporter, see their public collections on their profile page, and they appear in my "supporters I follow" filter.

### PE-D — Cross-creator favorites & collections + viewer-aware render

- Store-layer: drop `creator_id` query partitioning constraint while keeping it as a denorm. Add `listAllForUser(accountId)` methods.
- Add `PatronSavedCollection.isPublic`
- New render contract: every favorite/collection-entry response includes `viewerEntitlement: 'visible' | 'blurred' | 'hidden'` computed against the **viewer's** entitlement snapshot for the source creator
- UI: when `blurred`, show teaser + tier badge + "Upgrade on Patreon" deep link
- Validation: `validatePatronFavoriteTarget` extends to confirm the favoriter had access **at time of favoriting** (snapshot stored on entry)
- Acceptance: Supporter A collects a Tier-3 post from Creator X. Supporter B (viewing A's profile) is a Tier-1 patron of X — sees a blurred placeholder with upgrade CTA. Supporter C (no relationship to X) sees the same blurred placeholder.

### PE-E — Comments + moderation + reactions

- Schema delta per §3.1
- **Auto-mod (D22, hand-rolled v1)**: per-Account rate limits 5/min and 50/day, length cap (configurable, default 2000 chars), URL count cap (default 2), word block-list, URL-domain block-list. All limits + lists in env/config. No external API calls. 429 with `Retry-After` on rate trip.
- Visibility enforcement at query time (use viewer's entitlement context)
- Threading: 1 level of replies (`parentCommentId`), no infinite nesting in v1
- Pin (creator on their post)
- **Edit window (D15)**: own comments editable for 15 minutes from `createdAt`. After window, edit endpoint returns 403 — only delete remains. Every successful edit sets `editedAt` and is shown with an "edited" marker in the UI.
- Soft-delete via `modState`
- Likes: `CommentReaction` table + endpoints
- Reports: `ContentReport` flow → Relay admin queue UI under `/admin/moderation`
- **Appeals (D17)**: none in v1. Moderation-action notice (in-app + email) includes a `support@` mailto for disputes. No formal appeal endpoint; revisit if support volume warrants.
- **Block (D14, future-only)**: `AccountBlock` filters new comments and new follow attempts from blocker→blocked. Historical comments by the blocked user remain visible to preserve thread context. The blocked user's existing follow of the blocker is dropped; new follow attempts return 403. Documented clearly in the block confirmation UI so users aren't surprised.
- UI: comment composer + thread renderer in `gallery-view.tsx`; counts on `feed-card.tsx`
- Acceptance: creator can hide a comment on their post; Relay admin can ban an Account; blocking another supporter prevents their new comments and follows but leaves their old comments visible; rate-limit 429 surfaces gracefully; comment edited within 15 min shows "edited" marker; comment edit attempted at 16 min returns 403.

### PE-F — Discovery v1 (opt-in grid) → v2 (ranked Browse)

- v1: creator marks posts as `discovery_eligible` (single boolean override). `GET /patron/discover` returns recency-sorted public discovery-eligible posts.
- **Ordering (D19)**: recency-sorted with creator-fairness cap — no single creator appears more than 2× per visible page. Implementation: simple post-query rebalancing pass; deterministic for testing.
- v1 caps: max 20% of feed when interleaved (matches roadmap policy)
- v2 (post-MVP, separate ledger): `DiscoveryDecisionLog` with reason codes (`recency`, `creator_similarity`, `tag_overlap`, etc.), audit-friendly per roadmap policy. **Retention (D20)**: 90 days hot, then drop — operational telemetry only, no legal need to retain longer.
- Acceptance: a patron with zero follows sees a Discover grid where no creator dominates; revoking discovery on a post removes it within next cache window.

### PE-G — Notifications storage, delivery, prefs

- Schema delta per §3.1
- `NotificationDeliveryWorker`: subscribes to internal events (`outbox` pattern using existing `OutboxEvent`?) and inserts `Notification` rows + sends email when prefs allow
- Channels: in-app (always) + email (per-event opt-in)
- UI: existing `NotificationsTray` switches to live data; preferences section in `SettingsModal`
- Event types per D12, **plus** `tier_change` (D24) — in-app only, no email. Differentiated wording: "You now have Tier 2 access to Creator X" (gain) vs "Your Tier 2 access to Creator X ended" (loss). Triggered by entitlement-refresh diff (PE-H).
- **No weekly digest** (D23) — never. Don't add the schema field.
- **Clustering (D25)**: `comment_liked` clusters per-comment AND per-time-window — roll up all likes on the same comment within a 1h sliding window into one notification ("5 people liked your comment"). Window resets after notification is delivered. `comment_reply` clusters per-thread only (no time window — replies are individually meaningful).
- Acceptance: I get an in-app notification within 30s when a creator I follow publishes; I can disable `new_follower` emails but keep them in-app; downgrading my Patreon pledge surfaces an in-app `tier_change` notification within 60s; 10 likes on the same comment within an hour produce one clustered notification, not 10.

### PE-H — Webhook + worker entitlement freshness (D3 + D4 wiring)

- Wire `members:create/update/delete` webhook handler → enqueue `RefreshPatronEntitlementJob(accountId, relayCreatorId)`
- Worker uses stored `PatronOAuthCredential` refresh token; updates snapshot with `source = webhook` or `source = scheduled`
- **Refresh diff emits internal events for PE-G**: when `entitledTierIds` changes between snapshots, emit a `tier_change` event so notifications can fire (D24).
- Scheduled scan job (BullMQ repeatable) every 5min: pick `staleAfter < now() AND last_attempt_at < now() - 15min`, batch, respect rate-limit headers
- Pre-action refresh: thin wrapper around media-export endpoint that triggers a synchronous refresh when stale
- **`PatronCampaignAccess` (D21)**: stay dormant in this workstream. PE-D will revisit at P2 kickoff and decide whether to wire it for cross-creator query needs.
- Metrics: extend `platform-operations-metrics.ts` with refresh success/failure/rate-limit counters
- Acceptance: cancel a tier on Patreon → access disappears in patron UI within 60s (webhook), and patron sees in-app `tier_change` notification; kill webhook delivery, snapshot refreshes within 5min (worker); Patreon down → snapshot stays last-known with `degraded` flag.

### PE-I — Dual-role shell polish

- `relay_active_role` cookie already exists. Add a visible role-switcher in the top-right account menu (currently only shows email + sign-out)
- When toggling to `creator`, redirect to `/library` (or `primaryRelayCreatorId` workspace); when `supporter`, redirect to `/patron/feed`
- Hide own studio from "creators I follow" auto-seed
- Acceptance: a user with both an artist studio and patron memberships can flip between shells in two clicks; data stores stay isolated.

### PE-J — Privacy, data export, deletion

- Per-Account export: ZIP of profile + follows + favorites + collections + comments (JSON)
- Per-creator-relationship deletion: drop `TenantMembership` + cascading favorites/collections/comments scoped to that creator
- Hard-delete account: 7-day grace + confirmation token + audit log entry
- Acceptance: data export downloads within 24h; per-creator deletion does not affect other creators' data; hard-delete leaves no PII after grace period.

### PE-K — UX/UI hardening

- `relay-app.tsx` follow-up: replace remaining fixture-driven branches; surface entitlement-degraded state; render `comment_liked`/`new_follower` notification types; profile-page wiring
- `web/app/patron/profile/page.tsx`: real settings form (handle/bio/avatar/isPublic + notification prefs)
- `/p/[handle]` public route + SEO basics
- Empty/error/loading states audited per `docs/qa/UX_ACCEPTANCE_GUARDRAILS.md`

---

## 5. Phasing — Option A (chosen)

Two options were drafted and weighed. **Option A (domain-layered) is the chosen path.** Option B retained below for context on what was considered and rejected.

### Option A — Domain-layered phases (chosen)

Each phase ships a complete, releasable layer. Easier to QA, lower regression risk per release, and makes it possible to dogfood early phases with a small cohort while later phases are still in build.

| Phase | Workstreams | Approx weeks (1 dev × wall-clock) | Ships when… |
|---|---|---|---|
| **P1 — Identity + Real Feed** | PE-A, PE-B, PE-C, PE-H | 6–8 | An email-registered patron with linked Patreon sees a real, freshness-correct feed of followed creators. Engagement still per-creator (no cross-creator yet). |
| **P2 — Engagement layer** | PE-D, PE-E, PE-K (partial) | 6–8 | Cross-creator favorites/collections, public comments with moderation, supporter profiles + follow-supporter, viewer-aware rendering. Patron experience feels "social". |
| **P3 — Discovery v1 + Notifications** | PE-F (v1), PE-G | 4–6 | Opt-in discover grid is live. Notification system covers all v1 events. |
| **P4 — Polish, dual-role, privacy** | PE-I, PE-J, PE-K (rest) | 3–5 | Dual-role shell production-ready; data export + deletion shipped; UX guardrails pass. |
| **P5 (post-MVP)** | PE-F (v2 ranked Browse), audience monetization (Workstream N) | TBD | Defer until baseline DAU + engagement telemetry justify. |

**Pro:** Each phase is shippable to pilot users. P1 alone unlocks the majority of "the page actually works with real data" value. **Con:** Longer total wall-clock until full feature parity with the mock UI; some intermediate states (P1 with no comments) feel incomplete.

### Option B — Vertical slices (rejected, kept for posterity)

Each phase ships a thin end-to-end slice across all features, then iterates depth.

| Phase | Slice | Approx weeks |
|---|---|---|
| **V1 — "Hello Patron"** | Email-only signup, Patreon link, real feed (followed creators only, no filters), favorite a single post, no comments, no notifications | 6 |
| **V2 — "Engaged Patron"** | Add follow-supporters, collections, comments (no moderation queue, just creator delete), in-app notifications for `new_post_followed` only | 6 |
| **V3 — "Trustworthy Platform"** | Add moderation queue, all notification events + email, viewer-aware blurring, entitlement webhook + worker | 6 |
| **V4 — "Full Surface"** | Discovery grid, dual-role polish, data export, profile public/private, all UX guardrails | 4 |

**Pro:** Demoable end-to-end value at every phase; uncovers integration risks early. **Con:** Each phase touches every system → wider blast radius per release; QA must cover the whole surface every time; harder to dogfood incrementally.

### Why Option A was chosen

Three reasons:
1. **Schema migrations cluster cleanly** in P1 (identity + follows) and P2 (engagement + comments + moderation). Vertical slicing forces three or four migration waves on the same tables, each carrying re-baselining risk. We've felt this with M3/M8/MIG-* series.
2. **Moderation cannot be half-built.** D8's three-layer model (auto-mod + creator + Relay queue) needs to ship together or the trust posture is wrong. Vertical slicing tempts shipping comments without the queue, which is the worst possible interim state.
3. **Patreon API spend.** PE-H (webhook + worker) is naturally one workstream. Splitting across vertical slices means we'd ship on-login refresh in V1, webhook in V2, worker in V3 — and each intermediate state has a different entitlement-staleness contract for the UI to respect, which will leak into bugs.

If we ever need a "demo to investors at end of P1" moment, we can land a thin comment-readonly preview behind a flag without committing to the full PE-E surface — but the moderation surface stays gated until P2 ships in full.

---

## 6. Genuinely deferred (post-MVP)

The 12 open items from draft v1 (O1–O12) are now closed and folded into the §2 Decisions ledger as D14–D25 and into the relevant §4 workstream cards. What remains genuinely deferred:

| # | Item | When to revisit |
|---|---|---|
| F1 | **Ranked Browse v2** (PE-F v2): `DiscoveryDecisionLog` with reason codes and similarity ranking. | When opt-in Discover grid has measurable engagement and we have signal to rank on. Separate ledger. |
| F2 | **Audience monetization** (Workstream N from `road map.md`): premium viewer tier, Skip payouts, Boost tokens, Promo Pool. | After baseline patron DAU and engagement are established. Policy + legal review precedes implementation. Already gated by roadmap policy. |
| F3 | **Auto-mod upgrade**: move from hand-rolled (D22) to open-source library or hosted scoring service. | Triggered by abuse signal — when hand-rolled false-positive or false-negative rate exceeds threshold (TBD operational metric). |
| F4 | **Formal moderation appeals** (D17 v2): structured appeal endpoint with admin review queue. | Triggered by support-volume signal — if `support@` dispute volume exceeds threshold or shows systemic patterns. |
| F5 | **Weekly digest emails** (D23): explicitly **never** ship. Listed here only to make the "no" durable across future product reviews. | — |
| F6 | **`PatronCampaignAccess` wiring** (D21): currently dormant. Revisit at PE-D kickoff (P2) only if cross-creator queries need normalized campaign rows. | P2 kickoff. |
| F7 | **DM / private messaging** between patrons or patron↔creator. Not in scope. | If/when product validates demand. New roadmap doc. |
| F8 | **Patron-side analytics** ("your top creators", "your spend trend"): not in scope for v1. | Post-MVP, after engagement data exists. |

---

## 7. Quality gates (per `docs/qa/UX_ACCEPTANCE_GUARDRAILS.md` + `docs/qa/HTTP_VERB_HYGIENE.md`)

- All mutating endpoints are POST/PUT/PATCH/DELETE. No GET with side effects (HTTP verb hygiene rule already in repo).
- All patron endpoints set `Cache-Control: private, no-store` (matches existing patron route pattern).
- Tier-gated content has zero unauthorized-access tests passing — extend the existing security test suite.
- Every mutation that affects another Account's view (favorite, collect, comment, follow) has an idempotency or rate-limit guard.
- Entitlement-degraded states never grant access — they restrict.
- Patron session tokens never appear in URLs or logs (existing redaction patterns).
- Acceptance UX checks: empty/error/loading states present for every new route; keyboard navigation; screen-reader labels on interactive elements.

---

## 8. Airtable seeding (completed)

Seeded into the **Project tracker** base (`applW4dOjVNHoWBM9`) on roadmap approval. The Production Ledger is a UI/v0-attended queue, so a two-tier model was adopted:

### Production Ledger (`tblDDAKjaaBBIBuPf`)

- **11 workstream anchor rows** — one per PE-A…PE-K, `Work Unit Kind = Slice Bundle`, `Status = Queued`. Each links to a corresponding **UI Planning - Vertical Slices** record (also seeded). Anchors do not get v0 prompt drafts; they track overall workstream progress and enumerate sub-rows in `Supplemental Guidance`.
- **22 UI sub-rows** — `Work Unit Kind = UI Element`, `Status = Queued`, linked to their workstream's Vertical Slice. These are the v0-shaped deliverables (onboarding wizard, comment composer, notification tray, role switcher, etc.). Prompt Draft will be authored at each phase kickoff.

### New table: Backend Tasks (`tbl7uQxP1vEa5AOGi`)

- **41 backend sub-rows** — one per non-UI deliverable (schema deltas, API endpoints, workers, store-layer changes). Each row links back to its Production Ledger workstream anchor via `Production Ledger Anchor`. Schema mirrors Ledger conventions (Status, Session Lock, Cursor Branch, Error Log) but skips the v0 stages (`Status` flow: Queued → In Progress → Blocked → Integrated → Verified → Failed → Skipped). Carries `Acceptance Criteria`, `Implementation Notes`, `Dependencies`, `API Surface`, `Schema Delta` per row.

### Queue Order convention

Phased blocks for clean inter-row insertion later:
- P1: 1100–1899 (PE-A 11xx, PE-B 12xx, PE-C 13xx, PE-H 18xx)
- P2: 2400–2999 (PE-D 24xx, PE-E 25xx, PE-K spans 29xx)
- P3: 3600–3799 (PE-F 36xx, PE-G 37xx)
- P4: 4900–4999 (PE-I 49xx, PE-J 49xx)

Existing Production Ledger UI work occupies Queue Order 10–1000; this roadmap's rows live above that range and don't disturb existing sequencing.

### Status convention at seeding

All 74 new rows (11 anchors + 22 UI sub-rows + 41 Backend Tasks) start at `Status = Queued`. Transition to `Ready for v0` (Production Ledger) or `In Progress` (Backend Tasks) happens when each row is picked up. The signal of "P1 vs later" is carried by `Queue Order` and the `Phase` field on Backend Tasks.

### v2 Browse (post-MVP)

Not seeded. Lives in §6 deferred backlog (F1) until trigger conditions met.

---

## 9. Appendix — surface deltas the existing `relay-app.tsx` mock will need

Today the patron shell already renders feed, sidebar follows, gallery modal, command palette, settings modal, notifications tray, and a profile page — all from fixtures. Mapping the work needed to make each surface "real":

| Surface | Today | After this roadmap |
|---|---|---|
| Top-bar account menu | Email + sign-out | + role switcher (PE-I), + notification badge live count (PE-G) |
| Sidebar Following list | Fixtures, mixed on/off-Relay | Live `PatronFollow` results; off-Relay invite preserved (PE-C) |
| Feed home | Fixture `filteredPosts` | `assemblePatronFeed` results, real filters, real cursor pagination (PE-B) |
| Filter chips (Following / Free / Photos / Audio / Writing) | Client-side filter on fixtures | Server-side filters (PE-B) |
| Discovery grid | Static fixture | `/patron/discover` opt-in grid (PE-F v1) |
| Gallery modal | View-only | + comment composer + thread + likes (PE-E) |
| Notifications tray | Fixture notifications | Live `Notification` rows + mark-read (PE-G) |
| Settings modal | Mock controls | Profile fields + notification prefs + privacy + linked accounts + sign-out (PE-A, PE-G, PE-J) |
| `/patron/profile` | Mock `ProfilePage` | Editable own profile (PE-K) |
| `/patron/c/[handle]` | Public creator profile (mock) | Real creator data + comments + follow button (PE-C, PE-E) |
| `/p/[handle]` (NEW) | — | Public supporter profile with public collections/favorites filtered by viewer entitlement (PE-D, PE-K) |
| `/patron/former-subscriptions` | Mock | Real query against `PatronEntitlementSnapshot` where `active = false` (PE-H, PE-K) |
| `/patron/commission-hub` | Mock | Out of scope for this roadmap — separate workstream |
| Empty / error / degraded states | Limited demo flags | Production behavior per `entitlement-degraded.ts` patterns |

---

**Document owner:** jorda
**Status:** Approved v1 — Option A phasing chosen, all open items closed (D1–D25), ready for ledger seeding
**Next action:** Create P1 ledger rows (PE-A, PE-B, PE-C, PE-H), refresh `.docs/anthropic/CURRENT_LEDGER_QUEUE.md`, kick off P1.
