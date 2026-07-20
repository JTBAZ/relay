# XPOST-16 — Cross-Post E2E Manual Checklist

Operator checklist for the Relay extension cross-post bridge v1. Run after items **1–13** and image best-effort (**11**) are merged.

**Parent plan:** [`docs/EXTENSION_CROSS_POST_BUILD_PLAN.md`](../../EXTENSION_CROSS_POST_BUILD_PLAN.md)

---

## Prerequisites

- Postgres seeded for pilot UX (`npm run seed:pilot-ux`) if testing locally
- Relay API + web running (`npm run dev:stack` or staging/prod)
- Patreon creator account logged in the **same Chrome profile** as the extension
- Unpacked dev build: `cd extension && npm run build:chrome:dev`

### Environment (local Track B)

**Repo root `.env`:**

```env
RELAY_EXTENSION_ORIGINS=chrome-extension://YOUR_EXTENSION_ID
RELAY_EXTENSION_CONSENT_SECRET=<min 16 chars>
```

**`web/.env.local`:**

```env
NEXT_PUBLIC_RELAY_API_URL=http://localhost:8787
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_RELAY_EXTENSION_IDS=YOUR_EXTENSION_ID
```

Dev extension builds use `http://localhost:3000` (web) and `http://localhost:8787` (API) automatically. Reload the extension after each rebuild.

---

## Setup

- [ ] Load unpacked extension from `extension/dist/chrome-dev/`
- [ ] Copy extension ID into env vars above; restart API + web
- [ ] Log in as test creator (`/login/pilot-ux` → Dev Ava, or production account)
- [ ] Connect extension (popup **Connect to Relay** or `/extension/authorize?ext_id=…&installation_id=…`)
- [ ] Extension popup shows **Connected** (not “Connect to Relay”)
- [ ] Patreon logged in; popup does not say “Open Patreon login”

---

## Publish Relay-native post

- [ ] Open `/new-post` (or Library compose shell)
- [ ] Create post with title, body, and **at least one image**
- [ ] If publish fails with “Multiple campaigns exist — pass campaign_id”, select a **tier** instead of Public (Dev Ava local quirk)
- [ ] Publish succeeds; green banner shows post id
- [ ] **Publish to Patreon** button visible

---

## Cross-post smoke test

- [ ] Click **Publish to Patreon**
- [ ] Web shows success (not “Connect extension first” / “No official Relay extension configured”)
- [ ] New tab opens `https://www.patreon.com/posts/new`
- [ ] Title matches Relay post
- [ ] Body/description matches Relay post
- [ ] **One** image in Patreon gallery/media area (not triplicate)
- [ ] Review banner visible (success copy, not false “blocked” warning when image is present)
- [ ] Extension did **not** click Patreon **Publish**
- [ ] Creator can still edit draft manually

---

## Audience (manual v1 — expected)

Patreon defaults to **Free access**. The extension does **not** set audience/tier in v1.

- [ ] If Relay post was tier-gated, Patreon still shows **Free access** until creator changes it
- [ ] Creator manually sets **Paid access** / tiers before publishing if needed
- [ ] Document any mismatch for follow-up work (audience best-effort selector)

---

## Negative / edge cases (spot-check)

- [ ] Extension not connected → web shows connect-first message
- [ ] Text-only post (no images) → title/body fill still works
- [ ] Non-image media in package → skipped with honest banner note (if applicable)

---

## Return to — CORS verification

**Context:** `GET /api/v1/extension/cross-post/patreon/:post_id` is outside the tight `/api/v1/auth/extension/*` CORS allowlist. Background fetch relies on `host_permissions` for `relayapp.me` (prod) or `localhost:8787` (dev).

- [ ] Extension service worker Network tab: package `GET` returns **200** with JSON package
- [ ] No persistent CORS/preflight failure from extension origin
- [ ] If blocked in prod: extend allowlist to `/api/v1/extension/*` or document that host_permissions suffice (see master plan **Return to**)

---

## Post-v1 follow-ups (document only)

| Topic | Status |
|---|---|
| Audience/tier reverse-apply from synced Patreon catalog | Future work item — high stakes; own E2E gate |
| User preference for canonical image placement (gallery vs body) | Future profile setting |
| Package route CORS in production | Verify above; fix if evidence of block |

---

## Sign-off template

```
Date:
Environment: local / staging / prod
Extension ID:
Creator account:

Text fill: pass / fail
Image attach: pass / fail / N/A
Duplicate images: pass / fail
False fallback banner: pass / fail
Auto-publish prevented: pass / fail
Audience left manual: expected / issue
CORS package fetch: pass / fail / not checked

Notes:
```
