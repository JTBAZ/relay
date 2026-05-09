# Canonical `web/app` route inventory (P3-web-001)

**Generated:** 2026-05-08. **Purpose:** One list of Next.js App Router surfaces under [`web/app`](../web/app) with a **primary user** label (`creator` \| `patron` \| `public`). Layout files wrap segments as noted.

## Layout tree (summary)

| Layout file | Wraps |
|-------------|--------|
| [`web/app/layout.tsx`](../web/app/layout.tsx) | Entire app (root HTML shell). |
| [`web/app/patron/layout.tsx`](../web/app/patron/layout.tsx) | All `/patron/*` except paths that hide nav per layout logic (`/patron`, `/patron/onboarding`, `/patron/c/*`). |
| [`web/app/patreon/patron/layout.tsx`](../web/app/patreon/patron/layout.tsx) | `/patreon/patron/*` only. |
| [`web/app/landing/layout.tsx`](../web/app/landing/layout.tsx) | `/landing` segment only. |

## Routes (`page.tsx` → primary user)

Primary user is the **main intended audience** for the screen. OAuth and auth handoffs are **`public`** (unauthenticated or pre-session). Dev-only pages are still labeled by content; see **Notes**.

| URL path | `page.tsx` | Primary user | Notes |
|----------|------------|--------------|-------|
| `/` | [`web/app/page.tsx`](../web/app/page.tsx) | public | Home / entry. |
| `/action-center` | [`web/app/action-center/page.tsx`](../web/app/action-center/page.tsx) | creator | Behind `StudioRouteGuard`. |
| `/analytics` | [`web/app/analytics/page.tsx`](../web/app/analytics/page.tsx) | creator | Studio analytics overview (P5a); `StudioRouteGuard`. |
| `/auth/confirm` | [`web/app/auth/confirm/page.tsx`](../web/app/auth/confirm/page.tsx) | public | Auth callback / confirm. |
| `/collections` | [`web/app/collections/page.tsx`](../web/app/collections/page.tsx) | creator | Creator collections / library chrome. |
| `/creator/connect` | [`web/app/creator/connect/page.tsx`](../web/app/creator/connect/page.tsx) | creator | Patreon connect (creator). |
| `/designer` | [`web/app/designer/page.tsx`](../web/app/designer/page.tsx) | creator | Profile designer shell. |
| `/designer/profile` | [`web/app/designer/profile/page.tsx`](../web/app/designer/profile/page.tsx) | creator | Designer profile canvas. |
| `/dev/bench` | [`web/app/dev/bench/page.tsx`](../web/app/dev/bench/page.tsx) | public | Dev bench; `notFound()` in production unless flag. |
| `/dev/pipeline-parity` | [`web/app/dev/pipeline-parity/page.tsx`](../web/app/dev/pipeline-parity/page.tsx) | public | Internal pipeline parity UI. |
| `/extension/authorize` | [`web/app/extension/authorize/page.tsx`](../web/app/extension/authorize/page.tsx) | public | Extension OAuth-style handoff. |
| `/landing` | [`web/app/landing/page.tsx`](../web/app/landing/page.tsx) | public | Marketing / landing segment. |
| `/legal/extension-privacy` | [`web/app/legal/extension-privacy/page.tsx`](../web/app/legal/extension-privacy/page.tsx) | public | Legal. |
| `/login` | [`web/app/login/page.tsx`](../web/app/login/page.tsx) | public | Sign-in. |
| `/new-post` | [`web/app/new-post/page.tsx`](../web/app/new-post/page.tsx) | creator | Composer surface. |
| `/onboarding` | [`web/app/onboarding/page.tsx`](../web/app/onboarding/page.tsx) | public | Shared onboarding wizard (pre-role). |
| `/p/[handle]` | [`web/app/p/[handle]/page.tsx`](../web/app/p/[handle]/page.tsx) | public | Public creator profile (slug). |
| `/patron` | [`web/app/patron/page.tsx`](../web/app/patron/page.tsx) | patron | Patron entry / redirect logic. |
| `/patron/c/[handle]` | [`web/app/patron/c/[handle]/page.tsx`](../web/app/patron/c/[handle]/page.tsx) | public | Share-friendly creator profile under patron host; no patron nav chrome. |
| `/patron/commission-hub` | [`web/app/patron/commission-hub/page.tsx`](../web/app/patron/commission-hub/page.tsx) | patron | |
| `/patron/discover` | [`web/app/patron/discover/page.tsx`](../web/app/patron/discover/page.tsx) | patron | |
| `/patron/feed` | [`web/app/patron/feed/page.tsx`](../web/app/patron/feed/page.tsx) | patron | |
| `/patron/former-subscriptions` | [`web/app/patron/former-subscriptions/page.tsx`](../web/app/patron/former-subscriptions/page.tsx) | patron | |
| `/patron/library` | [`web/app/patron/library/page.tsx`](../web/app/patron/library/page.tsx) | patron | |
| `/patron/notifications` | [`web/app/patron/notifications/page.tsx`](../web/app/patron/notifications/page.tsx) | patron | |
| `/patron/notifications/preferences` | [`web/app/patron/notifications/preferences/page.tsx`](../web/app/patron/notifications/preferences/page.tsx) | patron | |
| `/patron/onboarding` | [`web/app/patron/onboarding/page.tsx`](../web/app/patron/onboarding/page.tsx) | patron | Patron-specific onboarding. |
| `/patron/profile` | [`web/app/patron/profile/page.tsx`](../web/app/patron/profile/page.tsx) | patron | |
| `/patron/settings` | [`web/app/patron/settings/page.tsx`](../web/app/patron/settings/page.tsx) | patron | |
| `/patreon/callback` | [`web/app/patreon/callback/page.tsx`](../web/app/patreon/callback/page.tsx) | public | Creator OAuth callback. |
| `/patreon/connect` | [`web/app/patreon/connect/page.tsx`](../web/app/patreon/connect/page.tsx) | public | Creator connect handoff. |
| `/patreon/cookie` | [`web/app/patreon/cookie/page.tsx`](../web/app/patreon/cookie/page.tsx) | public | Cookie / scrape handoff. |
| `/patreon/patron/callback` | [`web/app/patreon/patron/callback/page.tsx`](../web/app/patreon/patron/callback/page.tsx) | public | Patron OAuth callback. |
| `/patreon/patron/connect` | [`web/app/patreon/patron/connect/page.tsx`](../web/app/patreon/patron/connect/page.tsx) | public | Patron connect handoff. |
| `/settings/connected-extensions` | [`web/app/settings/connected-extensions/page.tsx`](../web/app/settings/connected-extensions/page.tsx) | patron | Copy links to patron profile; extensions UX. |
| `/studio/moderation/reports` | [`web/app/studio/moderation/reports/page.tsx`](../web/app/studio/moderation/reports/page.tsx) | creator | Studio moderation. |
| `/visitor` | [`web/app/visitor/page.tsx`](../web/app/visitor/page.tsx) | public | Visitor / gallery-style browsing. |
| `/visitor/favorites` | [`web/app/visitor/favorites/page.tsx`](../web/app/visitor/favorites/page.tsx) | public | Visitor favorites. |

**Count:** 38 `page.tsx` files (38 rows).

## Maintenance

Re-run inventory when adding routes: glob `web/app/**/page.tsx`, update this table and the **Logged** line in [`docs/pilot-build-plan.md`](pilot-build-plan.md) for P3-web-001.

**Quarantine (non-canonical Next trees):** [`docs/web-quarantine-trees.md`](web-quarantine-trees.md) — `web/b_i0ofEW9bMcy/`, `web/onboarding_enhancement/` (P3-web-002).

**Patron `patron-mock` kit:** [`docs/patron-mock-inventory.md`](patron-mock-inventory.md) (P3-web-004) — CSS vs shadcn subtree vs `patron/relay` production UI.
