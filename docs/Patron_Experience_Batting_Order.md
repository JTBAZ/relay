# Patron Experience — schedule & batting order

Companion to [`Patron_Experience_Roadmap.md`](Patron_Experience_Roadmap.md). This file is the **human-readable execution view**: what each focus area is, which phase it lands in, and **in what order we build** (backend and thin UI first, v0-style UI prompts/assets last).

---

## 1. Project focus areas (the eleven lanes)

| Lane | Name | Phase | One sentence |
|------|------|-------|----------------|
| **PE-A** | Identity & onboarding | P1 | Email/password account, verify, link Patreon (session-based), encrypted refresh token, handle rules, onboarding wizard. |
| **PE-B** | Real feed | P1 | Replace fixture `relay_feed` with DB-backed assembly, filters, pagination, degraded entitlement states. |
| **PE-C** | Follow graph | P1 | Follow creators and other supporters; seed follows from Patreon; sidebar uses live data. |
| **PE-H** | Entitlement freshness | P1 | `members:*` webhooks → refresh jobs; scheduled stale scan; pre-action refresh; tier-change signals for notifications. |
| **PE-D** | Cross-creator saves | P2 | Favorites/collections across creators; viewer-aware blur/upgrade; public collections. |
| **PE-E** | Comments & safety | P2 | Threads, reactions, auto-mod, creator + Relay moderation, blocks (future-only), audit. |
| **PE-K** | UX hardening | P2 + P4 | Cache/no-store, rate limits, idempotency, accessibility, empty/error states, profile/settings polish. |
| **PE-F** | Discovery v1 | P3 | Opt-in public grid, recency + fairness cap. |
| **PE-G** | Notifications | P3 | Storage, delivery worker, prefs, clustering rules, in-app + optional email. |
| **PE-I** | Dual-role shell | P4 | Role switcher, redirects, hide own studio from patron follow seed. |
| **PE-J** | Privacy & data rights | P4 | Export, per-creator delete, account delete with grace + audit. |

**Phase map (Option A):**

- **P1** — PE-A, PE-B, PE-C, PE-H → *a linked patron sees a real, fresh feed.*
- **P2** — PE-D, PE-E, PE-K (partial) → *social engagement + trust.*
- **P3** — PE-F (v1), PE-G → *discovery + notifications.*
- **P4** — PE-I, PE-J, PE-K (rest) → *polish, dual-role, compliance.*

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

## 4. One-page “what do we do first Monday?”

| Order | Do this |
|-------|--------|
| 1 | **PE-A backend** through Patreon link + credential storage (unblocks everything else). |
| 2 | **PE-A skeletal** — verified email + connect Patreon CTA (no fancy v0 yet). |
| 3 | **PE-B backend** then **PE-B skeletal** — real feed in the shell. |
| 4 | **PE-C backend** then **PE-C skeletal** — real follows. |
| 5 | **PE-H backend** — webhooks + workers so entitlements stay true. |
| 6 | **P1 v0** — onboarding wizard and any remaining P1 UI Element rows. |

Everything in P2+ follows §3 in order.

---

## 5. What we intentionally do *not* front-load

- **Full v0 illustration/prompt passes** before the API contract is stable — wastes rework.
- **PE-F v2 ranked Browse** — post-MVP (roadmap §6 F1).
- **PE-E comments before PE-D cross-creator viewer rules** — blur/upgrade story pairs with public surfaces (order may tighten if you ship profile later; above order keeps “read path” consistent first).

---

**Document owner:** jorda (match roadmap)  
**Status:** Working schedule — adjust dates in Airtable, not here.
