# Patron Experience — reuse audit & conflict map

> Companion to [`Patron_Experience_Roadmap.md`](Patron_Experience_Roadmap.md) and [`Patron_Experience_Batting_Order.md`](Patron_Experience_Batting_Order.md).
> **Purpose:** Before any P1 backend row is started, every Backend Tasks row should be annotated against this doc so we don’t **re-implement, double-write, or overwrite** existing infrastructure.

Legend used throughout:

- **REUSE** — code/model exists, call it as-is.
- **EXTEND** — code/model exists, add fields or methods on the same path.
- **NEW** — no foundation today; build clean.
- **CONFLICT** — two mechanisms exist or are proposed for the same job; pick one and deprecate the other before writing more code.

---

## 0. The big-picture conflicts (decide these first)

These are the only items that block PE-A from starting cleanly. Each one needs a one-line decision recorded on the matching **Backend Tasks** anchor row before the lane begins.

### C1 — Email auth provider: Supabase vs native account/password

We have **both** today:

- **Supabase Pattern A** (`src/identity/supabase-account.ts`, `POST /api/v1/auth/supabase/sync`, `POST /api/v1/auth/supabase/relay-session`) — already mints opaque patron sessions from a verified Supabase JWT. Email verification + password reset come for free from Supabase Auth.
- **Native account/password** (`POST /api/v1/auth/signup`, `POST /api/v1/auth/login`, `DbIdentityStore.registerAccountEmailPassword`/`loginAccountEmailPassword`) — also already in place, with `passwordHash` on `Account`.

The roadmap (PE-A) says *“re-use existing Supabase auth path used by `/login` creator tab if possible”*.

**Recommendation:** **Pick Supabase as the canonical patron on-ramp**. Three reasons:

1. D18 (email provider) collapses to “Supabase handles verification” — no Resend/Postmark/SES decision needed for v1.
2. We already have the Supabase → opaque-session bridge tested and shipping.
3. Native `passwordHash` path stays as **fallback only** for environments where Supabase is unavailable (test/CI). Mark `POST /api/v1/auth/signup` and `POST /api/v1/auth/login` as **internal/test-only** in OpenAPI; do not advertise on the patron onboarding wizard.

**Backend Tasks impact:** the row currently labelled “email provider selection (D18)” becomes **“confirm Supabase Auth covers verification + reset; no separate transactional email client for v1.”** This deletes ~3 rows of work (provider client, EmailVerificationWorker, verification token table).

### C2 — Patreon link surface: keep `/exchange` or rename to `/link`

`POST /api/v1/auth/patreon/patron/exchange` exists and works today. Roadmap §3.2 proposes a new `POST /auth/patreon/patron/link` whose only behavioral difference is **identity from session, not from OAuth result**, and whose only state difference is **persists `PatronOAuthCredential`**.

**Recommendation:** Don’t add a parallel route. **Mutate `/exchange` in place** to:

- Optionally accept session identity (when present, use session’s `accountId`; otherwise fall back to today’s OAuth-derived behavior for backward compat with the existing patron Patreon connect page).
- Always persist `PatronOAuthCredential` going forward.
- Add `POST /api/v1/auth/patreon/patron/link` as a **thin alias** that requires session and rejects anonymous calls — this is the P1 documented surface; old `/exchange` stays for one release as deprecated. Both routes call the same internal helper.

**Backend Tasks impact:** the “new endpoint” row becomes **“refactor `exchangePatreonPatronOAuth` to take optional `accountId`; new `/link` is a 30-line wrapper.”**

### C3 — `PatronFollow` widening vs sibling `AccountFollow`

`PatronFollow` is creator-scoped today (`patronMembershipId` × `relayCreatorId`). PE-C needs supporter-of-supporter follows.

**Roadmap §3.1 already chose: sibling model.** This audit confirms — do **not** widen `PatronFollow`. Add `AccountFollow(followerAccountId, followedAccountId)`. Reason: indexes, RLS, and the existing initial-follow seeding semantics all assume creator scope. Conflict avoided by keeping the table.

### C4 — `upsertPatronEntitlementSnapshotForOAuth` source label

This function hard-codes `source = oauth_exchange`. PE-H worker and webhook will write to the same table with `source = scheduled_refresh` and `source = webhook`.

**Recommendation:** Refactor **before** PE-H starts — split into a generic `upsertPatronEntitlementSnapshot({ source, ... })` and keep the `*ForOAuth` name as a thin caller that passes the enum. Otherwise the worker will silently overwrite snapshots with the wrong source string and the metrics in `/api/v1/patron/entitlements/health` will lie.

**Backend Tasks impact:** add a 1-row prerequisite on the PE-H anchor: *“Parametrize `upsertPatronEntitlementSnapshotForOAuth.source` (no behavior change for OAuth callers).”*

### C5 — Webhook entry: never wire `members:*` through the legacy stub

Today there are two webhook entry points:

- `processPatreonWebhookStub` — anonymous JSON test stub.
- `scrapeOrSyncFromVerifiedPlatform` — verified Patreon delivery (signature checked).

`isPatreonMemberFamilyTrigger` exists but is unwired. It must only fire from the **verified** path or anyone could enqueue refresh jobs for arbitrary patrons.

**Backend Tasks impact:** PE-H webhook row carries an explicit constraint: *“Bind `members:*` handler to the verified-platform entry only; the stub path stays posts-only.”*

### C6 — Cross-creator favorites/collections: store layer, not schema

`PatronFavorite` and `PatronSavedCollection*` rows already carry one row per `(membership, creator, target)`. An Account has multiple memberships (one per creator). “Cross-creator favorites” is a **read-side** problem — query by `accountId → memberships[] → favorites` — not a schema change.

**Backend Tasks impact:** PE-D row labelled “cross-creator favorites schema” becomes **“add `listAllForAccount(accountId)` to `DbPatronFavoritesStore`/`DbPatronCollectionsStore`; no migration.”** Schema work in PE-D shrinks to just `isPublic` + `snapshotTierId` columns (D9/D10).

### C7 — Two patron register surfaces (`/signup` vs `/register`)

`POST /api/v1/auth/register` already carries a `Deprecation` header pointing at `/signup`. Once C1 is decided in favor of Supabase, **delete** the legacy `/register` and `/login` body-of-work entries from any PE-A row that mentions them — they’re already deprecated, and PE-A would otherwise look like new work when it’s really cleanup.

---

## 1. Workstream-by-workstream reuse map

Each lane shows **what we already have**, **what we extend**, **what is genuinely new**, and **conflicts already noted in §0**.

### PE-A — Identity expansion

| Item | Verdict | Path / model | Note |
|------|---------|------|------|
| `Account` global identity | **REUSE** | `prisma/schema.prisma::Account` | `emailNorm`, `passwordHash`, `supabaseUserId`, `patronPatreonUserId`, `primaryRelayCreatorId` all present |
| Email register | **REUSE** | `DbIdentityStore.registerAccountEmailPassword` + `POST /api/v1/auth/signup` | shipping |
| Email login | **REUSE** | `DbIdentityStore.loginAccountEmailPassword` + `POST /api/v1/auth/login` | shipping |
| Email verification | **C1 → REUSE Supabase** (recommended) | `POST /api/v1/auth/supabase/sync`, `upsertAccountForSupabaseUser` | drops EmailVerificationWorker / D18 provider rows entirely |
| Native `emailVerified` flag | **NEW only if C1 → native** | would require `Account.emailVerified` migration | **don’t build under C1 = Supabase** |
| Supabase → opaque session bridge | **REUSE** | `IdentityService.issueRelaySessionForAccount`, `DbIdentityStore.ensurePlatformPatronUserForAccount` | already MT-033 wired |
| Patreon link path | **C2 → EXTEND** | `exchangePatreonPatronOAuth` + `POST /api/v1/auth/patreon/patron/exchange` | accept optional session-derived `accountId`; always write credential |
| Patreon-account merge logic | **REUSE** | `DbIdentityStore.createUser` lines 88–129, `PatreonAccountLinkConflictError` | already handles by-email + by-patreon merge |
| `PatronOAuthCredential` write path | **NEW** | schema row exists; no writer yet | must reuse the same encryption helper as creator `OAuthCredential` (see §2) |
| Handle auto-generation (`user_<hash>`) | **EXTEND** | `PatronProfile.handle` exists | add `handleNorm`, `displayName`, `bio`, `avatarUrl`, `isPublic` migration |
| Reserved-words handle policy (D16) | **NEW** | small validator | |
| Onboarding wizard backend | **NEW** | trivial (just stepper state) | UI lane |
| Patron auth context | **REUSE** | `loadPatronAuthContext`, `patronMayAccessCreator` | multi-creator allowlist already correct |

### PE-B — Real DB-backed feed

| Item | Verdict | Path / model | Note |
|------|---------|------|------|
| Fixture endpoint to retire | **EXTEND in place** | `GET /api/v1/patron/relay_feed` + `loadPatronRelayFeedBundleFromRepo` | rename to `/patron/feed`, keep fixture path behind a dev flag for local UI work |
| `assemblePatronFeed` | **NEW** | needs `PatronFollow` × `Post` × `PostOverride` × snapshot join | |
| `FeedCursor` storage | **REUSE schema** | already in `prisma/schema.prisma` | no migration |
| Tier filtering | **REUSE** | `patronMayFetchMediaExport` + `checkPostAccess` (`access-guard.ts`) + `PatronEntitlementSnapshot` | call as the canonical gate |
| Degraded contract | **REUSE** | `entitlement-degraded.ts`, `buildPatronEntitlementHealthPayload`, `RELAY_PATRON_ENTITLEMENT_STALE_AFTER_MS` env | |
| Filter chips (Following/Free/Photos/Audio/Writing) | **NEW** server-side | client-side filter exists today; move to query | |
| `Post` / `PostVersion` / `MediaAsset` model | **REUSE** | shipping | |
| `PostOverride.visibility` filter | **REUSE** | `overrides-store-db.ts` | |

### PE-C — Follow graph

| Item | Verdict | Path / model | Note |
|------|---------|------|------|
| `PatronFollow` (creator) | **REUSE schema** | shipping schema, no app code | |
| `AccountFollow` (supporter) | **NEW** | per C3, sibling model — don’t widen | |
| `PatronFollowSeed` audit | **NEW** | tiny table | |
| `PatronInitialFollowSeedWorker` | **NEW** | match entitled creators against `CreatorProfile.patreonCampaignId` | |
| Follow / unfollow / list APIs | **NEW** | | rate limits ride on PE-K hardening |

### PE-D — Cross-creator favorites & collections + viewer-aware render

| Item | Verdict | Path / model | Note |
|------|---------|------|------|
| `PatronFavorite` table | **REUSE** | `prisma/schema.prisma` lines 590–601 + `DbPatronFavoritesStore` | |
| `PatronSavedCollection` + entries | **REUSE** | shipping | |
| Cross-creator query | **C6 → EXTEND store** | add `listAllForAccount(accountId)` | no migration |
| `PatronSavedCollection.isPublic` | **EXTEND schema** | new column | |
| `PatronSavedCollectionEntry.snapshotTierId` | **EXTEND schema** | new column (D10 — locks the gate even if creator deletes the post later) |
| Viewer-aware render contract | **REUSE engine** | `patronMayFetchMediaExport`, `redactGalleryItemExportIfLocked`, `entitlement-degraded.ts` | wrap to emit `viewerEntitlement: 'visible' \| 'blurred' \| 'hidden'` |
| Validation | **REUSE** | `patron-favorites-validate.ts`, `patron-collections-validate.ts` | extend rules, do not fork |
| `PatronCampaignAccess` | **REUSE schema (dormant)** | per D21, decision deferred to PE-D kickoff |

### PE-E — Comments + moderation + reactions + blocks

| Item | Verdict | Path / model | Note |
|------|---------|------|------|
| `Comment` (basic) | **EXTEND schema** | exists with `modState`, `deletedAt` | add `visibility`, `requiredTierId`, `parentCommentId`, `pinnedAt`, `editedAt` |
| `CommentReaction` | **NEW** | per D12 | |
| `ContentReport` | **NEW** | | |
| `ModerationAction` | **NEW** | | |
| `AccountBlock` | **NEW** | future-only semantics per D14 | |
| Auto-mod (D22) | **NEW** | hand-rolled, no external API |
| Edit window | **NEW** | 15-min window check at PATCH |
| Pin | **NEW** | trivial flag |

### PE-F — Discovery v1 → v2

| Item | Verdict | Path / model | Note |
|------|---------|------|------|
| `discovery_eligible` flag | **EXTEND** | most natural home is `PostOverride` (already creator-curated) | one boolean column |
| Discover query | **NEW** | recency + 2-per-creator fairness pass |
| `DiscoveryDecisionLog` | **REUSE schema (deferred to v2)** | exists; do not write in v1 |

### PE-G — Notifications

| Item | Verdict | Path / model | Note |
|------|---------|------|------|
| `Notification` table | **NEW** | per §3.1 |
| `NotificationPreference` | **EXTEND schema** | exists; confirm `preferenceType` set covers v1 events |
| `OutboxEvent` | **REUSE** | `prisma/schema.prisma::OutboxEvent` already used elsewhere — emit patron events to it, subscribe in worker |
| `NotificationDeliveryWorker` | **NEW** | reads outbox, writes Notification, optionally sends email (Supabase if C1 = Supabase, otherwise needs D18) |
| In-app channel | **NEW** | |
| `tier_change` source | **REUSE** | snapshot diff in PE-H emits the event; this lane just consumes |
| Clustering rules (D25) | **NEW** | windowed rollup |

### PE-H — Webhook + worker entitlement freshness

| Item | Verdict | Path / model | Note |
|------|---------|------|------|
| Snapshot writer | **C4 → EXTEND** | `upsertPatronEntitlementSnapshotForOAuth` — parametrize `source` first |
| `members:*` trigger detection | **REUSE** | `isPatreonMemberFamilyTrigger` |
| Verified webhook handler binding | **C5 → EXTEND** | `scrapeOrSyncFromVerifiedPlatform` — add a `members:*` branch |
| `RefreshPatronEntitlementJob` worker | **NEW** | BullMQ; reads `PatronOAuthCredential` for refresh token |
| Scheduled stale scan | **NEW** | repeatable job; respects `staleAfter < now` and 15-min retry window |
| Pre-action refresh | **EXTEND** | wrap existing media-export endpoints to refresh when stale |
| Metrics | **EXTEND** | `platform-operations-metrics.ts` already carries patron OAuth counters (`recordPatronOAuthAttempt/Success/Failure`) — add refresh counters next to them |
| `entitlement-degraded.ts` | **REUSE as-is** | the contract already says “last-known good with messaging” — don’t reinvent |

### PE-I — Dual-role shell

| Item | Verdict | Path / model | Note |
|------|---------|------|------|
| `relay_active_role` cookie | **REUSE** | `set-active-role-cookie-for-session.ts`, `active-role-default.ts` |
| `defaultActiveRoleForAccount` | **REUSE** | shipping |
| Role switcher API/UI | **NEW** | mostly a UI lane |

### PE-J — Privacy / data export / deletion

| Item | Verdict | Path / model | Note |
|------|---------|------|------|
| Export job | **NEW** | aggregate over Account → memberships → favorites/collections/comments |
| Per-creator delete | **NEW** | drop `TenantMembership` + cascading rows by `creatorId` denorm; existing `onDelete: Cascade` on `TenantMembership` does most of it |
| Account hard-delete | **NEW** | 7-day grace + token + audit |
| `MigrationAuditEntry` pattern | **REUSE** | precedent for append-only audit shape (don’t rewrite the audit primitive) |

### PE-K — UX hardening

| Item | Verdict | Path / model | Note |
|------|---------|------|------|
| `Cache-Control: private, no-store` | **REUSE** | already applied to patron routes; extend to new routes |
| Rate limiting | **REUSE** | `src/middleware/rate-limits.ts` (recently added during extension lane) |
| `/p/[handle]` public route | **NEW** | reads `PatronProfile` (extended) |
| Empty/error/loading states | **REUSE guardrails** | `docs/qa/UX_ACCEPTANCE_GUARDRAILS.md` |
| Session opaque-token model | **REUSE** | `Session` + `hashOpaqueSessionToken` |

---

## 2. Cross-cutting infra to reuse (do not reinvent)

| Concern | Existing module / pattern | Where it lives |
|---|---|---|
| Encrypted OAuth credential payload | `OAuthCredential` (creator) writer/reader uses `encryptedPayload: Bytes`, `keyId` | `src/auth/token-store-db.ts`, `src/dev/pipeline-parity-routes.ts` — **share this helper for `PatronOAuthCredential`**, do not write a second crypto module |
| Opaque session token hash | `hashOpaqueSessionToken` | `src/identity/session-token-hash.ts` |
| Session TTLs | `WEB_SESSION_TTL_MS`, `EXTENSION_SESSION_TTL_MS` | `src/identity/session-constants.ts` |
| Session kinds | `SessionKind.web` / `SessionKind.extension` | already in schema; **patron flows reuse `web`** — do not invent new kinds |
| Tier access check | `checkPostAccess`, `evaluateTierRules`, `resolvePostAccessLevel` | `src/identity/access-guard.ts`, `src/clone/tier-rules.ts` |
| Patron entitlement snapshot upsert | `upsertPatronEntitlementSnapshotForOAuth` (after C4 refactor) | `src/identity/patron-entitlement-snapshot.ts` |
| Multi-creator allowlist for a session | `loadPatronAuthContext`, `patronMayAccessCreator` | `src/identity/patron-auth-context.ts` |
| Account ↔ tenant membership upsert | `ensurePatronMembershipForSupabaseAccount`, `ensurePlatformPatronUserForAccount` | `src/identity/supabase-account.ts`, `src/identity/identity-store-db.ts` |
| Outbox events (for notifications) | `OutboxEvent` model + insert pattern | `prisma/schema.prisma`, used in M5 ops code |
| Patron OAuth metrics | `recordPatronOAuthAttempt/Success/Failure` | `src/auth/part1a-gate-metrics.ts` |
| Patreon OAuth client | `patronClient.exchangeCode`, `fetchPatronIdentity`, `extractPatronSyncFromIdentity` | `src/auth/patreon-client.ts`, `src/patreon/patreon-user-identity.ts`, `src/patreon/patreon-patron-oauth.ts` |
| Platform tenant id | `getPlatformRelayCreatorId` / `RELAY_PLATFORM_CREATOR_ID` | `src/identity/platform-tenant.ts` |
| Patron-side rate limits | `src/middleware/rate-limits.ts` | reuse for follow / comment / report endpoints |
| CORS allowlist for patron API | `src/lib/relay-extension-origins.ts` (extension), main CORS for web | extend, don’t fork |
| Backfill / DB-vs-file shim | `RELAY_DB_STORE_IDENTITY` env, `IdentityService.supportsAccountScopedEmailAuth()` | use the same gate for new code |

---

## 3. Backend Tasks rows: annotation cheat-sheet

For each Backend Tasks row in Airtable (table `tbl7uQxP1vEa5AOGi`), set the **`Implementation Notes`** field with one of these standardized prefixes so the next picker knows the path:

| Prefix | Meaning |
|---|---|
| `REUSE:` | Call the named existing module/route. No new code beyond the call site. |
| `EXTEND:` | Modify the named existing module — list the exact field/method/route being added. |
| `NEW:` | Genuinely new module. List the file path you intend to create. |
| `CONFLICT (resolved):` | Two paths exist; this row picks one. State which path is dropped/deprecated. |
| `BLOCKED-BY:` | Names another row that must land first (typically a C-prefix prerequisite from §0). |

Concrete examples to apply now (PE-A and PE-H Backend Tasks rows in queue order):

- **PE-A Email provider (D18)** → `CONFLICT (resolved): Use Supabase Auth for verification + reset (C1). Do NOT build EmailVerificationWorker, verification token table, or transactional email client in v1.`
- **PE-A `POST /auth/email/register`** → `REUSE: POST /api/v1/auth/signup already covers this via DbIdentityStore.registerAccountEmailPassword. Mark legacy POST /api/v1/auth/register fully deprecated.`
- **PE-A `POST /auth/email/verify`** → `REUSE (under C1=Supabase): POST /api/v1/auth/supabase/sync handles JWT→Account upsert; verification status is on Supabase user.`
- **PE-A `POST /auth/email/login`** → `REUSE: POST /api/v1/auth/login (DbIdentityStore.loginAccountEmailPassword). Native fallback only; production patron login goes through Supabase + POST /api/v1/auth/supabase/relay-session.`
- **PE-A `POST /auth/patreon/patron/link`** → `EXTEND: src/patreon/patreon-patron-oauth.ts — accept optional accountId from session; always persist PatronOAuthCredential. Add /link as alias of /exchange. Both call the same helper. (C2)`
- **PE-A PatronOAuthCredential write path** → `NEW: src/auth/patron-oauth-credential-store.ts. REUSE: encryption helper from src/auth/token-store-db.ts (creator OAuthCredential pattern). Schema row already exists.`
- **PE-A handle policy** → `EXTEND: prisma/schema.prisma::PatronProfile — add handleNorm, displayName, bio, avatarUrl, isPublic, bannerUrl. NEW: handle validator with reserved-words list.`
- **PE-A onboarding wizard** → `NEW: skeleton state only (steps 1–4). UI lane carries the surface.`
- **PE-B replace fixture endpoint** → `EXTEND: src/server.ts GET /api/v1/patron/relay_feed → /api/v1/patron/feed. Keep loadPatronRelayFeedBundleFromRepo behind RELAY_PATRON_FEED_FIXTURE=1 for local dev.`
- **PE-B assemblePatronFeed** → `NEW: src/patron/assemble-patron-feed.ts. REUSE: PatronEntitlementSnapshot, PatronFollow, Post + overrides; tier gate via src/identity/access-guard.ts.`
- **PE-C PatronFollow APIs** → `REUSE schema (shipped). NEW: API + sidebar query. Rate limits via src/middleware/rate-limits.ts.`
- **PE-C AccountFollow** → `NEW (sibling model, per C3 — do NOT widen PatronFollow).`
- **PE-C initial follow seeder** → `NEW worker. REUSE: CreatorProfile.patreonCampaignId for the join.`
- **PE-D cross-creator favorites query** → `EXTEND store layer only (C6). NEW methods: listAllForAccount(accountId) on DbPatronFavoritesStore + DbPatronCollectionsStore. NO migration.`
- **PE-D viewer-aware render** → `REUSE: patronMayFetchMediaExport + entitlement-degraded.ts. EXTEND response shape with viewerEntitlement enum.`
- **PE-D PatronSavedCollection.isPublic + entry.snapshotTierId** → `EXTEND schema (one migration).`
- **PE-E Comment fields** → `EXTEND prisma/schema.prisma::Comment — add visibility, requiredTierId, parentCommentId, pinnedAt, editedAt.`
- **PE-E AccountBlock / ContentReport / ModerationAction / CommentReaction** → `NEW models per §3.1.`
- **PE-H upsertPatronEntitlementSnapshot refactor** → `EXTEND: src/identity/patron-entitlement-snapshot.ts — parametrize source. BLOCKED-BY: nothing. (C4) — must land before any PE-H worker.`
- **PE-H members:* webhook binding** → `EXTEND: src/webhooks/patreon-webhook.ts — bind isPatreonMemberFamilyTrigger to verified-platform path only. (C5)`
- **PE-H RefreshPatronEntitlementJob** → `NEW worker. REUSE: PatronOAuthCredential read + Patreon client. EXTEND metrics via src/auth/part1a-gate-metrics.ts pattern.`
- **PE-H pre-action refresh** → `EXTEND: media export endpoint(s) — call refresh when staleAfter < now.`
- **PE-G Notification model** → `NEW. REUSE: OutboxEvent for the producer side; new worker subscribes.`
- **PE-G NotificationPreference** → `EXTEND (confirm preferenceType covers v1 set; otherwise one ALTER).`
- **PE-J export / delete** → `NEW. REUSE: MigrationAuditEntry pattern for the audit primitive. REUSE: TenantMembership cascade for per-creator delete.`
- **PE-K rate limits + cache** → `REUSE: src/middleware/rate-limits.ts and existing patron Cache-Control pattern. EXTEND coverage to new routes.`

---

## 4. What can be deleted from the plan because it’s already done

These items appeared in the original PE-* plan but are **already in production**. Move to `Skipped` (Backend Tasks status) with a note pointing at the existing module:

- “Account-scoped email register/login backend” → `Skipped — POST /api/v1/auth/signup + /login already shipped (DbIdentityStore.registerAccountEmailPassword/loginAccountEmailPassword).`
- “Supabase JWT → opaque patron session bridge” → `Skipped — POST /api/v1/auth/supabase/sync + /supabase/relay-session shipped (MT-033).`
- “Multi-creator session allowlist” → `Skipped — loadPatronAuthContext shipped (MT-009).`
- “Patron entitlement snapshot model + on-login materialization” → `Skipped — upsertPatronEntitlementSnapshotForOAuth shipped (MIG-40).`
- “Degraded entitlement contract” → `Skipped — entitlement-degraded.ts + /api/v1/patron/entitlements/health shipped.`
- “Per-creator favorites/collections (DB)” → `Skipped — DbPatronFavoritesStore + DbPatronCollectionsStore shipped.`
- “Patron media access tier gate” → `Skipped — patronMayFetchMediaExport shipped.`
- “Active-role cookie (creator vs supporter)” → `Skipped — set-active-role-cookie-for-session.ts + active-role-default.ts shipped.`
- “Session kind discriminator (web vs extension)” → `Skipped — schema + IdentityService support shipped.`

That’s **9 rows** of would-be backend work that don’t need to be re-cut.

---

## 5. Net effect on the batting order

After applying §0 conflict resolutions and §4 deletions, the **first six Monday rows** (from `Patron_Experience_Batting_Order.md` §4) compress to:

1. **PE-A — Patreon link path (C2)**: extend `exchangePatreonPatronOAuth` to take optional session-derived accountId and always persist `PatronOAuthCredential`. Add `/link` alias.
2. **PE-A — `PatronOAuthCredential` write path** using the existing creator-OAuth encryption helper.
3. **PE-A — `PatronProfile` field extension** + handle validator.
4. **PE-B — `assemblePatronFeed`** + rename fixture endpoint, dev flag the fixture.
5. **PE-C — `PatronFollow` APIs + `AccountFollow` (NEW model)** + initial-follow seeder.
6. **PE-H prerequisite (C4)** → **PE-H webhook binding (C5)** → **`RefreshPatronEntitlementJob` worker** → **scheduled stale scan** → **pre-action refresh wrapper**.

Everything in steps 1–6 either calls or extends an existing path; none of them rewrite shipping infrastructure. After step 6, P1 v0 asset generation can begin for the onboarding wizard and other P1 UI Element rows.

---

**Next action:** annotate every Backend Tasks row in `tbl7uQxP1vEa5AOGi` with the `REUSE:` / `EXTEND:` / `NEW:` / `CONFLICT (resolved):` / `BLOCKED-BY:` prefix per §3 before any row moves out of `Queued`.
