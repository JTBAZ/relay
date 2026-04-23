# Patron Experience — schedule & batting order

Companion to [`Patron_Experience_Roadmap.md`](Patron_Experience_Roadmap.md). This file is the **human-readable execution view**: what each focus area is, which phase it lands in, and **in what order we build** (backend and thin UI first, v0-style UI prompts/assets last).

---

## 1. Project focus areas (the lanes)

| Lane | Name | Phase | One sentence |
|------|------|-------|----------------|
| **PE-A** | Identity & onboarding | P1 | Email/password account, verify, link Patreon (session-based), encrypted refresh token, handle rules, onboarding wizard. |
| **PE-B** | Real feed | P1 | Replace fixture `relay_feed` with DB-backed assembly, filters, pagination, degraded entitlement states. |
| **PE-C** | Follow graph | P1 | Follow creators and other supporters; seed follows from Patreon; sidebar uses live data. |
| **PE-H** | Entitlement freshness | P1 | `members:*` webhooks → refresh jobs; scheduled stale scan; pre-action refresh; tier-change signals for notifications. |
| **PE-D** | Cross-creator saves | P2 | Favorites/collections across creators; **live viewer-entitlement re-check** (no snapshot freeze) → `visible / preview / unlockable / locked`; public collections; reserves the `unlockable` slot for PE-L. |
| **PE-E** | Comments & safety | P2 | **Coordinate-pinned to MediaAsset**, **patron-tag-bearing** (mirror to `TagSuggestion`), owner-revocable per-tag, threads, reactions, auto-mod, creator + Relay moderation, blocks. |
| **PE-K** | UX hardening | P2 + P4 | Cache/no-store, rate limits, idempotency, accessibility, empty/error states, profile/settings polish. |
| **PE-F** | Discovery v1 | P3 | Opt-in public grid, recency + fairness cap. **Shares the canonical search kernel** with library + PE-N (see [`SEARCH_AND_TAGS_SHARED_KERNEL.md`](architecture/SEARCH_AND_TAGS_SHARED_KERNEL.md)). |
| **PE-G** | Notifications | P3 | Storage, delivery worker, prefs, clustering rules, in-app + optional email. Adds `tier_change`, `tip_unlock.expired`, `magnet_folder.matched` events. |
| **PE-I** | Dual-role shell | P4 | Role switcher, redirects, hide own studio from patron follow seed. |
| **PE-J** | Privacy & data rights | P4 | Export, per-creator delete, account delete with grace + audit. |
| **PE-L** | Tip-to-unlock (stretch) | Stretch / post-P4 | Time-boxed, no-download access via `MediaUnlock`; eager Post-derivation for promo'd single MediaAssets; expiry worker. |
| **PE-M** | Similarity / "more like this" (stretch) | Stretch / post-P4 | Hidden co-collection + co-artist edge graph; only consumer surface is `GET /patron/similar`. No user-facing scores. |
| **PE-N** | Magnet Folders (stretch, premium) | Stretch / post-P4 | Saved boolean searches that **push** new matches into per-folder feeds with unread badges. Shares criteria parser with PE-F. |

**Phase map (Option A):**

- **P1** — PE-A, PE-B, PE-C, PE-H → *a linked patron sees a real, fresh feed.*
- **P2** — PE-D, PE-E, PE-K (partial) → *social engagement + trust.* Reserves schema slots for PE-L (`viewerEntitlement: 'unlockable'`) and PE-M (no extra cost — additive tables).
- **P3** — PE-F (v1), PE-G → *discovery + notifications.*
- **P4** — PE-I, PE-J, PE-K (rest) → *polish, dual-role, compliance.*
- **Stretch** — PE-L, PE-M, PE-N → *monetization + retention primitives.* Pulled into a phase opportunistically (e.g. PE-M can ship anytime after PE-D's `outbox_events` for collection-add are firing; PE-L only depends on PE-D's redaction shape; PE-N depends on PE-F's parser).

---

## 2. How to read “backend → skeletal UI → v0”

| Step | Meaning |
|------|--------|
| **Backend** | Schema if needed, APIs, workers, webhooks, stores — enough to return real JSON and enforce rules. |
| **Skeletal UI** | Thin wiring: real fetch, loading/error/empty, no illustration polish. Enough to integrate and QA. |
| **v0 asset generation** | Production Ledger **UI Element** rows: prompt draft, reference assets, and attended v0 pass — the “designed” shell users see. Done **after** the slice is functionally true so prompts aren’t chasing a moving API. |

Backend Tasks rows move **Queued → In Progress → Integrated → Verified** during backend steps. Ledger UI rows move toward **Ready for v0 → v0 Complete** after integration, when you run the v0 pipeline.

---

## 3. Batting order (global execution order)

Below is the **recommended sequence**. Within a phase, follow top to bottom.

### P1 — Foundation (identity, feed, follows, freshness)

1. **PE-A · Backend (start here)**  
   Email provider choice (D18) → Supabase (or chosen) register/verify → session alignment with existing patron auth → `PatronOAuthCredential` write path (KMS) → patron link/relink API → handle policy (auto handle, claim on publish).

2. **PE-A · Skeletal UI**  
   Login/register/verify screens wired; post-login empty patron shell with “Connect Patreon” and verified-email gate before feed (per roadmap).

3. **PE-B · Backend**  
   `assemblePatronFeed`, `FeedCursor`, `GET /patron/feed` with filters and entitlement checks.

4. **PE-B · Skeletal UI**  
   `relay-app` (or client) calls live feed API; fixture path behind flag or removed; loading/empty/degraded.

5. **PE-C · Backend**  
   Follow model/APIs (creators + supporters), rate limits, initial follow seed job (idempotent).

6. **PE-C · Skeletal UI**  
   Sidebar following list from API; off-Relay copy preserved.

7. **PE-H · Backend**  
   Webhook → refresh jobs; scheduled stale worker; pre-action refresh for tier-gated media; diff → internal events for tier-change notifications; metrics.

8. **PE-H · Skeletal / product checks**  
   Confirm feed and permission UIs react within expected latency; degraded + tier-change paths visible in-app (notification plumbing may still be stubbed until P3 — events should be emit-ready).

9. **P1 · v0 asset generation (last in P1)**  
   Onboarding wizard (and any other P1 Production Ledger **UI Element** rows): full v0 prompts + references + polish pass. *No need to wait for P2 to start PE-A v0 if P1 backend+skeletal for that screen is done.*

---

### P2 — Engagement (saves, comments, moderation, partial hardening)

10. **PE-D · Backend**  
    Cross-creator favorites/collections, `isPublic`, viewer entitlement evaluation on read paths.

11. **PE-D · Skeletal UI**  
    Profile/collection views show visible vs blurred vs upgrade CTA per viewer.

12. **PE-E · Backend**  
    Comment schema + APIs, auto-mod, threading, edit window, reactions, reports, blocks, moderation actions, Relay queue hooks.

13. **PE-E · Skeletal UI**  
    Comment composer + thread in gallery/feed cards; basic mod surfaces for creator/admin.

14. **PE-K · Backend (P2 slice)**  
    Patron-wide `Cache-Control`, rate limits, idempotency guards on mutating routes (as seeded for P2).

15. **P2 · v0 asset generation**  
    Comment UX, moderation UIs, blurred teaser cards, settings/profile slices tied to P2 — v0 prompts after each feature’s skeletal UI is stable.

---

### P3 — Discovery + notifications

16. **PE-F · Backend**  
    Discovery eligibility + `GET /patron/discover` with recency + fairness pass.

17. **PE-F · Skeletal UI**  
    Discover grid wired to API.

18. **PE-G · Backend**  
    `Notification` storage, outbox/event wiring, delivery worker, preferences API, clustering (e.g. comment likes), tier_change in-app.

19. **PE-G · Skeletal UI**  
    Notifications tray + prefs live; badge counts.

20. **P3 · v0 asset generation**  
    Discover grid visuals, notification tray/prefs, empty states for discovery and notifications.

---

### P4 — Dual-role, privacy, remaining polish

21. **PE-I · Backend + UI**  
    Session exposes `defaultActiveRoleForAccount` as needed; role switcher behavior is mostly UI + redirects — ship skeletal then polish.

22. **PE-J · Backend**  
    Export job, per-creator relationship delete, account delete flow with grace + audit.

23. **PE-J · Skeletal UI**  
    Settings entries for export/delete; confirmation flows.

24. **PE-K · Rest**  
    Public `/p/[handle]`, SEO basics, remaining guardrails from `UX_ACCEPTANCE_GUARDRAILS.md`.

25. **P4 · v0 asset generation**  
    Role switcher, settings/privacy/export/delete, public supporter profile, final patron shell polish.

---

### Stretch — Monetization & retention primitives (post-P4 / opportunistic)

> All three lanes assume P2 has shipped. They are not blocked by P3/P4 — pick whichever has the strongest product justification at the time.

S1. **PE-L · Backend** — `MediaUnlock` model + `Post.derivedFromPostId?` migration; artist-side "mark as Tip Post" endpoint with **eager Post derivation**; redaction layer extended to honor `MediaUnlock` as viewing-only (download still denied); `TipUnlockExpiryWorker` (BullMQ repeatable). Emits `tip_unlock.expired` outbox events.

S2. **PE-L · Skeletal UI** — locked card variant with "Tip to unlock for N days" CTA, payment confirmation, expiry countdown chip on unlocked items. Lives behind a feature flag until PE-G consumes the expiry event.

S3. **PE-M · Backend** — `MediaSimilarityEdge` + `ArtistSimilarityEdge` tables; `CoCollectionEdgeWorker` consumes `patron_collection.entry_added` outbox events; nightly decay job; `GET /patron/similar?to=…` endpoint with viewer-entitlement filtering and per-creator fairness cap. **No user-facing graph or scores.**

S4. **PE-M · Skeletal UI** — "More like this…" carousel on post detail and on collection detail; recency / entitlement filters obeyed; carousel hides itself entirely if the underlying graph has < N candidates (no awkward 2-item rows).

S5. **PE-N · Backend** — `MagnetFolder` + `MagnetFolderEntry` schema; criteria parser (extracted from PE-F so both consume the same grammar); cron + reactive evaluator (consumes `post.published`); backfill on folder create; `GET/POST/DELETE /patron/magnets` with premium-gate middleware; `magnet_folder.matched` event.

S6. **PE-N · Skeletal UI** — `/patron/magnets` route (premium-gated): folder list, criteria editor with the boolean grammar visible, per-folder feed with unread badges. Notification preferences extended for the new event.

S7. **Stretch · v0 asset generation** — when each stretch lane's skeletal UI is stable, run the v0 prompt + reference pass. PE-L's locked-card variants and PE-N's criteria editor are the highest-design-cost surfaces.

---

## 4. One-page “what do we do first Monday?”

| Order | Do this |
|-------|--------|
| 1 | **PE-A backend** — Patreon **`/link`** + **`patron_oauth_credentials` write** + client routing + unlink + PE-H token read path shipped (see §5). Remaining PE-H worker/webhook work is separate (Monday row 5). |
| 2 | **PE-A skeletal** — verified email + connect Patreon CTA (no fancy v0 yet). |
| 3 | **PE-B backend** then **PE-B skeletal** — real feed in the shell. |
| 4 | **PE-C backend** then **PE-C skeletal** — real follows. |
| 5 | **PE-H backend** — webhooks + workers so entitlements stay true. |
| 6 | **P1 v0** — onboarding wizard and any remaining P1 UI Element rows. |

Everything in P2+ follows §3 in order.

---

## 5. Sign up / login first, then Patreon link (universal policy)

**Universal policy:** Supporters **always** create and sign in to a Relay account **before** Patreon can be linked. We **cannot** attach Patreon without an `Account` — there is nothing to anchor memberships, `PatronOAuthCredential`, or entitlements to. The only supported product attach path is `POST /api/v1/auth/patreon/patron/link` with an existing patron session (cookie or Bearer).

**Legacy `POST /api/v1/auth/patreon/patron/exchange`:** Hard-deprecated by default (`403 RELAY_ACCOUNT_REQUIRED`). It does **not** define product behavior. Enable **`RELAY_PATRON_PATRON_ALLOW_LEGACY_EXCHANGE=1`** only for emergency rollback or tests — never for normal onboarding.

**“Dual-path” (informal):** Email/Supabase or native signup **first**, then **link Patreon** in-session. It does **not** mean Patreon-only account creation.

### Shipped in repo (PE-A slice)

| Item | Notes |
|------|--------|
| Unified Patreon scopes + identity | `campaigns` in `PATREON_PATRON_OAUTH_SCOPES`; `extractUnifiedPatreonIdentity`; `buildPatronIdentityRequestUrl` includes owned campaign + membership includes. |
| Multi-creator membership upsert | `IdentityService.completeUnifiedPatreonPatronOAuth` + `DbIdentityStore.findRelayCreatorIdsByPatreonCampaignIds`. |
| Session-first link API | `POST /api/v1/auth/patreon/patron/link` — requires Bearer or `relay_session` cookie; body `{ code, redirect_uri }`; merges into the signed-in `Account`; returns `linked_relay_creator_ids`, `owned_relay_creator_id`, `unmapped_patreon_campaign_ids` for UI (e.g. “Connect your Campaign”). |
| Token persistence | `src/auth/patron-oauth-credential-store.ts` — AES-GCM payload keyed like creator OAuth; **`/link`** persists on every successful link. Legacy **`/patron/exchange`** (rollback only) also persists when enabled and DB identity is on. |
| Web callback | `web/app/patreon/patron/callback` — if no Relay session, redirects to **`/login`** (does not call `/exchange`). With session, **`POST .../patron/link`**. |
| Legacy exchange | Off by default; `Deprecation` header points successors to `/link`. |

### Product checklist (PE-A attach lifecycle)

| # | Step | What “done” looks like |
|---|------|------------------------|
| 1 | **Web callback routing** | Patreon redirect handler requires a Relay session; **`POST .../patron/link`** after OAuth; unsigned users sent to sign-in first. |
| 2 | **“Connect your Campaign” UI** | Client reads `owned_relay_creator_id` and `unmapped_patreon_campaign_ids` from `/link` response; dismissible modal; Settings re-entry. |
| 3 | **Unlink + credential teardown** | `DELETE /api/v1/auth/patreon/patron/link` clears `PatronOAuthCredential` and invalidates entitlement snapshots. |
| 4 | **PE-H worker (ongoing)** | Scheduled/webhook-driven refresh uses encrypted refresh from `patron_oauth_credentials` (read helpers + `refreshPatronOAuthTokensWithStoredRefreshToken` — wire workers per PE-H rows). |
| 5 | **Email verification gate** | Optional: `RELAY_PATREON_LINK_REQUIRE_VERIFIED_EMAIL` blocks `/link` until Supabase email confirmed when enabled. |
| 6 | **QA** | Scripted path: register → sign in → Patreon OAuth → `/link` → patron shell. [`docs/qa/DUAL_PATH_PATRON_QA_CHECKLIST.md`](qa/DUAL_PATH_PATRON_QA_CHECKLIST.md). |

Rows **1–3** are the minimum **attach/detach** contract. **4** is operational freshness (PE-H). **5–6** are policy and confidence.

---

## 6. What we intentionally do *not* front-load

- **Full v0 illustration/prompt passes** before the API contract is stable — wastes rework.
- **PE-F v2 ranked Browse** — post-MVP (roadmap §6 F1).
- **PE-E comments before PE-D cross-creator viewer rules** — blur/upgrade story pairs with public surfaces (order may tighten if you ship profile later; above order keeps "read path" consistent first).
- **Stretch lanes (PE-L / M / N) before P2 lands.** PE-D's `viewerEntitlement` enum + outbox-event emit on collection-add must already be live; PE-F's parser must already exist. Pulling them in earlier creates two parsers to maintain or two redaction shapes to migrate.
- **Community-tag upvote / contributor reputation UI** (D28 aspirational tier) — schema slots stay reserved on `TagSuggestion`, but no surface ships until PE-N era at the earliest.

---

**Document owner:** jorda (match roadmap)  
**Status:** Working schedule — **operational queue** lives in Airtable workspace **Batting Order**, base **Batting Order** (`apprid6UGT9E1KlkN`), table **PE Batting Order** — see [`docs/database/BATTING_ORDER_AIRTABLE.md`](database/BATTING_ORDER_AIRTABLE.md). Edit **Detail** / **Pipeline status** there when scope changes; keep this file as the narrative source of truth. §5: universal Relay-account-first policy + PE-A attach lifecycle (2026).
