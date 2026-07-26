# Pilot security headers — web (`web/`) + API (Express)

**Purpose:** P8-sec-006 inventory. **Pilot stance:** ship with documented gaps; **full** CSP / frame / MIME hardening is **post-pilot** unless your host injects headers.

**Helmet:** not used on the Relay API (`package.json` has no `helmet`). Headers are **manual** per route + global middleware where noted.

---

## Header table

| Header | `web/` (Next.js App Router) | API (`src/server.ts` + routes) | Pilot note |
|--------|-----------------------------|-----------------------------------|------------|
| **Content-Security-Policy** | **Not** set in `web/app/layout.tsx`, `web/middleware.ts`, or `web/next.config.mjs`. | **Not** set. | **Gap:** browsers rely on same-origin + app code. Plan a CSP after inventorying scripts (Supabase, Patreon, R2 uploads). |
| **X-Frame-Options** | Not set in repo. | Not set globally. | **Gap:** if you need clickjacking defense, add `DENY` or `SAMEORIGIN` on both surfaces. |
| **X-Content-Type-Options** | Not set in repo. | Not set. | **Gap:** consider `nosniff` on API JSON + static. |
| **Referrer-Policy** | Not set in repo. | Not set. | Optional: `strict-origin-when-cross-origin`. |
| **Permissions-Policy** | Not set in repo. | Not set. | Optional: trim camera/mic/geolocation if unused. |
| **Strict-Transport-Security** | Not in app code; often added by **host** (e.g. Vercel) when HTTPS. | Same — TLS is usually at the edge. | Confirm with your deployment docs, not only this repo. |
| **X-Trace-Id** | Not emitted by Next itself; browser sees it on **API** responses. | **Set on every response** (first middleware in `createApp`). | Aids support; aligns with error copy. |
| **Access-Control-Allow-Origin** | N/A for same-origin page HTML. | **Yes:** echoes request `Origin` when present, else `*`. | Needed for browser `fetch` from the web app + extensions. |
| **Access-Control-Allow-Credentials** | — | **Yes** when `Origin` is sent (`true`). | Required for cookie/Bearer cross-origin patterns used in docs. |
| **Access-Control-Allow-Methods** | — | `GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS` | Global CORS middleware. |
| **Access-Control-Allow-Headers** | — | `Content-Type`, `X-Trace-Id`, `Authorization`, `X-Relay-Pipeline-Parity-Secret`, `X-Relay-Discord-Signature` | Extension + internal routes. |
| **Cache-Control** | Next **default** for static/`_next` assets (framework). `middleware.ts` does **not** set security/cache headers. | **Per-route:** most authenticated JSON uses `private, no-store`; some public gallery/export paths use `public, max-age=...`. | Intentional split — do not blanket `no-store` on cacheable public media. |
| **Deprecation** | — | Set on **legacy** auth routes where marked deprecated. | Signals clients to migrate. |

---

## Where to add stricter `web/` headers later

Use `next.config.mjs` `headers()` **or** `export async function generateMetadata` / route `headers()` only if you need per-segment policy. Keep **CSP** in sync with Supabase, OAuth redirects, and presigned R2 PUT hosts.

## Manual checklist (Phase P9)

Before calling the pilot “done” on security UX:

1. Open DevTools → Network → pick the **document** for a Studio page and confirm whether your **host** adds HSTS / security headers.
2. Pick an **API** JSON response (`/api/v1/...`) and confirm `X-Trace-Id` and expected `Cache-Control`.
3. Decide **post-pilot** whether to add **helmet** (or equivalent) on Express for `X-Content-Type-Options`, `X-Frame-Options`, and a baseline CSP on HTML error bodies (if any).

References: [`web/middleware.ts`](../web/middleware.ts) (auth redirects only), [`web/next.config.mjs`](../web/next.config.mjs) (rewrite only), [`src/server.ts`](../src/server.ts) (CORS + trace + route headers).
