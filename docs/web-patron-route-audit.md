# Patron web routes audit (`web/app/patron/**`)

**Work item:** P6-patron-001  
**Date:** 2026-05-08  
**Scope:** Next.js App Router pages under [`web/app/patron/`](../web/app/patron/) (the logged-in / supporter shell). Related OAuth UI lives under [`web/app/patreon/patron/`](../web/app/patreon/patron/) — summarized in § Related routes only.

## URL → purpose

| URL | Primary component / client | Purpose (plain English) |
|-----|---------------------------|-------------------------|
| `/patron` | [`PatronStartClient`](../web/app/patron/PatronStartClient.tsx) | Landing after login: checks email verification and Patreon link, then points people to the feed or login. |
| `/patron/feed` | [`RelayApp`](../web/components/patron/relay/relay-app.tsx), optional [`PatronFeedDevPreviewClient`](../web/app/patron/feed/PatronFeedDevPreviewClient.tsx) | Main supporter **feed** (chronological / filtered). Dev-only `?state=` preview when `NEXT_PUBLIC_RELAY_PATRON_FEED_DEV_TOOLS=true`. |
| `/patron/library` | [`PatronLibraryClient`](../web/app/patron/library/PatronLibraryClient.tsx) | **Favorites and saved collections** across creators, with tier-aware visibility (visible / locked / etc.). |
| `/patron/discover` | [`PatronDiscoverClient`](../web/app/patron/discover/PatronDiscoverClient.tsx) | **Discovery** grid (creator-opt-in / free-focused in v1 copy); search + pagination. |
| `/patron/notifications` | [`PatronNotificationsClient`](../web/app/patron/notifications/PatronNotificationsClient.tsx) | **Inbox**: list notifications, mark read. |
| `/patron/notifications/preferences` | [`PatronNotificationPreferencesClient`](../web/app/patron/notifications/preferences/PatronNotificationPreferencesClient.tsx) | **Notification toggles** per creator / type. |
| `/patron/settings` | [`PatronSettingsClient`](../web/app/patron/settings/PatronSettingsClient.tsx) | **Account settings**: data export, leave creator, account deletion flow. |
| `/patron/profile` | [`ProfilePage`](../web/components/patron/relay/profile-page.tsx) | **Patron’s own profile** (handle, bio, etc. per existing relay profile stack). |
| `/patron/onboarding` | [`PatronOnboardingClient`](../web/app/patron/onboarding/PatronOnboardingClient.tsx) | **Connect Patreon** wizard (immersive; top nav hidden in layout). |
| `/patron/c/[handle]` | [`VisitorGalleryView`](../web/app/components/VisitorGalleryView.tsx) | **Public creator page** by slug (shareable); not the full logged-in chrome (nav hidden). |
| `/patron/former-subscriptions` | inline page | **Placeholder list** from fixtures — re-subscribe messaging; not wired to live API in this pass. |
| `/patron/commission-hub` | inline page | **Stub** “commission hub” — placeholder copy for future marketplace. |

**Shared chrome:** [`web/app/patron/layout.tsx`](../web/app/patron/layout.tsx) wraps most routes with [`PatronTopNav`](../web/app/patron/PatronTopNav.tsx) (Feed, Library, Discover, Inbox, Settings, Profile) except `/patron`, `/patron/onboarding`, `/patron/c/*`.

## Related routes (outside `patron/`)

| URL | Purpose |
|-----|---------|
| `/patreon/patron/connect` | Start Patreon **patron OAuth** (with [`PatronConnectClient`](../web/app/patreon/patron/connect/PatronConnectClient.tsx)). |
| `/patreon/patron/callback` | OAuth **callback** handler for patron linking. |

## Gaps vs road map **Part 3 — Workstream K** (Patron identity & follow graph)

| Road map theme | Today | Gap / follow-up |
|----------------|--------|------------------|
| Patron account before Patreon | Enforced via `/patron` + onboarding + `/login?role=supporter` | None major for routing; ongoing session UX elsewhere. |
| Patreon patron link lifecycle | OAuth + API `.../patron/link`; onboarding page | **Credential health / stale link** surfacing is a separate item (see P6-patron-004, Workstream K “revalidation”). |
| Follow graph | Feed & discover consume backend | **Dedicated “following” management UI** (unfollow, mute) is lighter than full road map; follows may be implicit via feed APIs — confirm product expectations. |
| Privacy (export, delete) | `/patron/settings` | Align copy with regional requirements as legal reviews land. |

## Gaps vs **Workstream L** (Feed assembly & entitlements)

| Road map theme | Today | Gap / follow-up |
|----------------|--------|------------------|
| Entitlement-aware surfaces | Library + feed use server decisions | **P6-patron-003**: explicit **“Subscribed” vs “Discover”** badge on feed cards and API field `feed_item_source`. |
| Degraded / stale OAuth | Partially backend | **P6-patron-004**: banner + “Reconnect Patreon” when entitlements are stale. |
| Non-chronological Browse | Discover exists | Transparency copy for ranking (road map *Required Assets*) still product-owned. |

## Gaps vs **Workstream M** (Discovery & opt-in)

| Road map theme | Today | Gap / follow-up |
|----------------|--------|------------------|
| Creator opt-in for discovery | API + discover grid | **Studio UI** to mark posts discovery-eligible is called out as polish in discover page comments. |
| Caps / policy | Server-driven | UI + tests when caps land. |

## Gaps vs pilot **P6** checklist (from [`pilot-build-plan.md`](pilot-build-plan.md))

| Pilot item | Note |
|------------|------|
| **P6-patron-002** | Layout + [`PatronTopNav`](../web/app/patron/PatronTopNav.tsx) = dedicated patron shell; root [`ConditionalAppNav`](../web/app/components/ConditionalAppNav.tsx) skips **all** `/patron` URLs including exact `/patron` so studio **AppNav** never stacks on the supporter landing page. |
| **P6-patron-005** | Empty states: verify feed / follow / OAuth variants per item. |
| **P6-patron-007** | Post detail from feed — separate thin route/modal. |
| **P6-patron-008** | Settings may overlap notification preferences; stub toggles if still no-op. |

## Suggested next implementation order (reference only)

1. **P6-patron-003** — feed source badge + API.  
2. **P6-patron-004** — stale Patreon link banner.  
3. **P6-patron-005** — empty-state copy pass on `/patron/feed` and related entry points.  
4. Replace **fixture-only** pages (`former-subscriptions`, `commission-hub`) when APIs exist.
