# Relay — Pre-Launch Security Review (2026-06)

**Type:** First-pass cybersecurity review (read-only; no code changed).
**Scope:** Express API (`src/`), Next.js web app (`web/`), Prisma schema/migrations (`prisma/`), automation/scripts, and supporting docs.
**Stance:** Relay is a creator/patron **media + tooling site**, not a bank or health system. Recommendations target **industry-standard operational security for a media platform handling logins, paid content, and limited PII** — not defense-grade overkill.
**Method:** Architecture read-through + four parallel domain audits (auth/authz, secrets/crypto, media/storage, input-validation/web/payments). Highest-severity findings were re-verified directly against source.

In-code pointers for every finding use the tag **`@security-review 2026-06 [R-SEC-NN]`** (JSDoc header) or inline **`// [R-SEC-NN] …`**, mirroring the repo's existing `@security-audit-required` convention. Grep `R-SEC-` to find all flags.

## Remediation status (2026-06, batch 1 — "Tier A", production-gated)

The following were **implemented** as production-only gates / additive checks that leave local dev behavior unchanged (verified: backend `npm run build` clean; `npm run test` introduced **zero new failures** and turned the `auth-coverage` guardrail green):

- **R-SEC-04** — creator-route secret now fails **closed** in production when unset (`src/identity/creator-route-guard.ts`).
- **R-SEC-05 / R-SEC-06** — legacy `login-patreon` / `register-patreon` / unsigned Patreon webhook now return 404 in production (`legacyInsecureRouteDisabled()` in `src/server.ts`; override `RELAY_ALLOW_LEGACY_INSECURE_ROUTES=1`).
- **R-SEC-07 / R-SEC-21** — non-dry-run checkout blocked in production unless `RELAY_ALLOW_LIVE_PAYMENTS=1`; payment placeholder secrets no longer injected in production (`src/payments/payment-service.ts`, `src/server.ts`).
- **R-SEC-08 / R-SEC-23** — `NEXT_PUBLIC_*_AUTH_DISABLED` and `RELAY_DEV_VISITOR_TIER_SIM` hard-ignored in production (`web/lib/dev-auth-flags.ts`, `src/server.ts`).
- **R-SEC-09** — patron "hide 18+" preference now enforced on export byte delivery regardless of the tier-gate flag (`src/server.ts` `/content` + `/thumb`).
- **R-SEC-16** — oversize objects rejected at upload commit (`src/relay/relay-native-upload-finalize.ts`).
- **R-SEC-18** — entitlement-gated media now served `Cache-Control: private` (`src/server.ts`).
- **R-SEC-19** — session-token JSON dual-write defaults **off** in production (`src/server.ts`).
- **R-SEC-24** — control characters stripped from digest email subjects (`src/patron/notification-digest-email.ts`).
- **R-SEC-25** — token-in-log CI scan extended to `web/` and tightened against false positives (`scripts/m10-token-log-scan.mjs`).

## Remediation status (2026-06, batch 2 — "Tier B", production defaults + baseline headers)

The following were **implemented** as production-default hardening with dev behavior unchanged unless explicitly overridden:

- **R-SEC-01 (partial)** — export tier paywall now defaults **ON in production**, OFF in development (`src/security/production-env-defaults.ts` → `exportRequireTierAccessFromEnv()` in `src/server.ts`). Explicit `RELAY_EXPORT_REQUIRE_TIER_ACCESS=0|1` still wins. **Still open:** authenticated caller requirement on `library-zip` + manifest routes.
- **R-SEC-10 (partial)** — platform operator enforce now defaults **ON in production**, OFF in development (`platformOperatorAccessEnforceFromEnv()` in `src/platform-metrics/platform-operator-access.ts`). **Still open:** populate `RELAY_PLATFORM_OPERATOR_ACCOUNT_IDS` / `RELAY_PLATFORM_OPERATOR_EMAILS` before prod deploy (otherwise metrics API fails closed).
- **R-SEC-11 (partial)** — baseline `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, and `Referrer-Policy: strict-origin-when-cross-origin` on Express (`src/security/baseline-response-headers.ts`) and Next.js (`web/next.config.mjs`). **Still open:** strict Content-Security-Policy (report-only rollout).

## Remediation status (2026-06, batch 3 — "Tier C" slice 1, XSS sanitizer)

- **R-SEC-02** — Post description HTML sanitized with DOMPurify allowlist on **write** (Patreon/SubscribeStar ingest, ingest batch validation, Relay native post create, `relay_description` PATCH) and on **read merge** (`mergePostPresentation`). Client re-sanitizes before `dangerouslySetInnerHTML` in `VisitorGalleryView`. Shared config: `src/security/post-html-sanitize-config.ts`.

## Remediation status (2026-06, batch 4 — "Tier C" slice 2, R-SEC-01 + R-SEC-03)

- **R-SEC-01 (full)** — `library-zip` now requires a valid Relay session (cookie or Bearer). Manifest read routes (`media-manifest`, `post-map`, `tier-map`) now require the creator-route secret (`assertCreatorRelayMutationAllowed`), consistent with all other creator pipeline routes.
- **R-SEC-03** — Reflective CORS replaced with explicit origin allowlist (`src/lib/relay-cors.ts`). Credentialed headers (`Allow-Credentials: true`) only emitted for origins in `RELAY_ALLOWED_WEB_ORIGINS` plus localhost in development. Production deploys must set `RELAY_ALLOWED_WEB_ORIGINS` or cross-origin credentialed calls will silently fail (correct fail-closed behavior).

**Still open:** R-SEC-11 (strict CSP), R-SEC-12 (Redis rate limits), R-SEC-13 (password KDF), R-SEC-14 (session rotation), R-SEC-15 (key rotation), R-SEC-17 (SSRF allowlist), R-SEC-20 (Zod), R-SEC-22 (consent replay store).

---

## 1. Plain-English security score (for non-technical leadership)

> **Overall rating: "Fair — solid foundation, not yet launch-ready." Roughly 6 out of 10 today; a realistic 8.5 out of 10 after the short fix list below.**

**What this means in everyday terms:**

- **The house is built well.** Relay's core security design is genuinely good: passwords/tokens are encrypted properly, login cookies are handled the safe modern way, the database is shielded behind the app, and the team has already written thoughtful security plans and left "audit me" notes throughout the code. This is well above average for a project at this stage.
- **But several doors ship unlocked by default.** The biggest issues are not missing locks — the locks exist — they're **switches that are turned OFF unless someone remembers to turn them on** before launch. For example, the protection that stops a stranger from downloading a creator's paid media library is currently optional. Flip the right switches and most of the risk disappears.
- **A few old side-doors remain.** There are some legacy/leftover entry points (old login and webhook shortcuts built for testing) that should be closed before a public launch.
- **One genuine code bug to fix.** Creator post descriptions are shown to visitors without being "sanitized," which could let a malicious or hacked creator inject harmful code into a viewer's browser. This needs a real (small) code fix, not just a setting.

**Bottom line for launch:** **Do not launch on defaults.** None of the serious findings require re-architecting the product. They are a focused set of configuration changes plus a handful of small patches. With about **1–2 focused engineering days** on the Critical/High list, Relay reaches a normal, defensible security posture for a media site.

| Rating band | Meaning |
|---|---|
| Today: ~6/10 ("Fair") | Strong design undermined by insecure default settings and a few legacy doors. |
| After Critical + High fixes: ~8.5/10 ("Good") | Industry-standard for a media/tooling platform; launch-appropriate. |
| Stretch (Medium items): ~9/10 | Defense-in-depth; hardened against scale and edge cases. |

---

## 2. Findings register

Severity uses standard tiers. "Type" notes whether the fix is mostly a **config/deploy** toggle, a **code** change, or **process**.

| ID | Severity | Title | Type |
|----|----------|-------|------|
| R-SEC-01 | **Critical** | Bulk export & media-byte endpoints are unauthenticated; tier paywall is off by default | Config + Code |
| R-SEC-02 | **Critical** | Stored XSS: post descriptions rendered as raw HTML without sanitization | Code |
| R-SEC-03 | High | CORS reflects any Origin **with credentials** (no allowlist) | Code |
| R-SEC-04 | High | Legacy creator-mutation routes open when `RELAY_CREATOR_ROUTE_SECRET` is unset | Config + Code |
| R-SEC-05 | High | Legacy `login-patreon` / `register-patreon` mint sessions from knowable IDs, no proof | Code |
| R-SEC-06 | High | Legacy **unsigned** Patreon webhook triggers sync/scrape | Code |
| R-SEC-07 | High | Payment webhook verification stubbed; "live" checkout returns synthetic success; checkout unauthenticated | Code |
| R-SEC-08 | High | `NEXT_PUBLIC_*` auth-disable flags bypass UI guards if set in prod | Config + Code |
| R-SEC-09 | High | Mature/NSFW gate only applied on export when tier gate is enabled | Code |
| R-SEC-10 | High | Platform-operator dashboards/metrics open when enforce flag is off (default) | Config |
| R-SEC-11 | Medium | Missing web security headers (CSP, X-Frame-Options, nosniff, Referrer-Policy) | Code |
| R-SEC-12 | Medium | Rate limiting is in-memory only; auth/OAuth/search/export/telemetry largely unthrottled | Code |
| R-SEC-13 | Medium | Passwords hashed with salted SHA-256 (fast hash), not Argon2/bcrypt/scrypt | Code |
| R-SEC-14 | Medium | No session rotation/invalidation on new sign-in | Code |
| R-SEC-15 | Medium | Token-encryption `keyId` is metadata only; no key rotation / dual-key decrypt | Code + Process |
| R-SEC-16 | Medium | Presigned upload PUT not size-bound; commit doesn't reject oversize | Code |
| R-SEC-17 | Medium | SSRF risk: export-upstream & Discord attachment fetches have no host allowlist | Code |
| R-SEC-18 | Medium | `Cache-Control: public` without `Vary` on gated media (CDN cross-user leak) | Code |
| R-SEC-19 | Low/Med | Session token dual-written into JSON response body by default | Config |
| R-SEC-20 | Medium | No request-schema validation (e.g. Zod); ad-hoc checks; oversize comments stored not rejected | Code |
| R-SEC-21 | Medium | Hardcoded pilot dev password + Stripe/PayPal placeholder-secret fallbacks | Code + Config |
| R-SEC-22 | Medium | Extension consent replay-protection is in-process only (multi-instance replay) | Code |
| R-SEC-23 | Low | Dev simulation/login flags must be hard-blocked in production | Config |
| R-SEC-24 | Low | Digest emails lack unsubscribe link; subject line not control-char stripped | Code + Process |
| R-SEC-25 | Low | Token-in-log CI scan covers `src/` only, not `web/` | Process |

---

## 3. Critical findings (must fix before public launch)

### R-SEC-01 — Unauthenticated bulk export & media bytes; paywall off by default
**Where:** `src/server.ts` — `GET /api/v1/export/library-zip` (~L4462), `GET /api/v1/export/media/:creator_id/:media_id/content` (~L4518), export manifest routes (~L4296); gate flag `exportRequireTierAccess` (~L1553).
**Risk:** With `RELAY_EXPORT_REQUIRE_TIER_ACCESS` unset (the default), anyone who knows or guesses a `creator_id` can download a creator's **entire media library as a ZIP**, fetch individual paid media bytes, and enumerate the full media manifest (ids, hashes, tier maps) — all with **no login and no tier check**. This defeats the paywall that is Relay's core value to creators.
**Fix:** In production set `RELAY_EXPORT_REQUIRE_TIER_ACCESS=1`, and additionally require an authenticated, entitled caller on `library-zip` and the manifest routes (don't rely on the flag alone). Treat the tier gate as always-on for byte delivery, not opt-in.

### R-SEC-02 — Stored XSS via unsanitized post descriptions
**Where:** `web/app/components/VisitorGalleryView.tsx` (~L479, `dangerouslySetInnerHTML={{ __html: detail.description }}`). Source data: Patreon HTML ingest (`src/patreon/post-content.ts`) and creator-editable `relay_description` (`src/gallery/post-presentation-mutate.ts` ~L80) — neither is sanitized.
**Risk:** A creator (or compromised/maliciously-crafted Patreon content) can embed `<script>` or event-handler HTML in a post description. When a visitor opens the post, that code runs in the visitor's browser — enabling session/cookie theft, account actions on the victim's behalf, and defacement.
**Fix:** Sanitize description HTML with a strict allowlist (e.g. DOMPurify / `rehype-sanitize`) **server-side on write** and again before rendering. Allow only safe formatting tags; strip scripts, event handlers, and `javascript:` URLs.

---

## 4. High findings (fix before launch)

### R-SEC-03 — Reflective CORS with credentials
**Where:** `src/server.ts` CORS middleware (~L2076): echoes the request `Origin` back as `Access-Control-Allow-Origin` and sets `Access-Control-Allow-Credentials: true` for any non-extension origin.
**Risk:** This is the classic over-permissive CORS pattern. `SameSite=Lax` cookies blunt the worst of it, but reflecting arbitrary origins with credentials is well below standard and broadens the blast radius of any future cookie/CSRF gap. **Fix:** Replace reflection with an explicit allowlist (web app origin + known extension origins) sourced from env; only emit `Allow-Credentials: true` for allowlisted origins.

### R-SEC-04 — Optional shared secret leaves creator mutations open
**Where:** `src/identity/creator-route-guard.ts` (`relayCreatorRouteSecretMatches` returns `true` when `RELAY_CREATOR_ROUTE_SECRET` is unset, ~L20). Used by `assertCreatorRelayMutationAllowed` on Patreon scrape/sync, ingest batches, export jobs, etc.
**Risk:** If the secret isn't set in production, those mutation/job routes accept **any unauthenticated caller** who supplies a `creator_id` — enabling resource-burning scrapes/syncs and pipeline abuse. **Fix:** Require `RELAY_CREATOR_ROUTE_SECRET` in production **and/or** migrate these routes to the session-based `requireAccountMatchesCreator` guard already used by `/api/v1/relay/*`. Fail closed when the secret is absent in prod.

### R-SEC-05 — Legacy Patreon login/register without proof
**Where:** `src/server.ts` `POST /api/v1/identity/login-patreon` (~L12194) and `register-patreon` (~L12092); `identityService.loginPatreonFallback` (`src/identity/identity-service.ts` ~L188).
**Risk:** `login-patreon` mints a full Relay session given only a `creator_id` + `patreon_user_id` for an already-linked account — **no Patreon token, password, or OAuth proof**. A `patreon_user_id` is not a secret, so this is an account-takeover path. **Fix:** Disable both routes in production; require the real Patreon OAuth exchange flow for session minting.

### R-SEC-06 — Unsigned legacy Patreon webhook
**Where:** `src/server.ts` `POST /api/v1/webhooks/patreon` (~L3834) → `processPatreonWebhookStub` (`src/webhooks/patreon-webhook.ts`).
**Risk:** Accepts unsigned JSON and kicks off `scrapeOrSync` for any `creator_id` — a free DoS/resource-burn lever for anonymous callers. The **signed** platform webhook (`/api/v1/webhooks/patreon/platform/:opaqueToken`, with HMAC verification) is the correct path. **Fix:** Remove the unsigned stub in production or require the shared creator secret; route all real deliveries through the signed platform endpoint.

### R-SEC-07 — Payment verification stubbed; unauthenticated checkout
**Where:** `src/payments/provider-adapter.ts` — `StripeAdapter.verifyWebhookSignature` is a loose probe (~L93), `PayPalAdapter.verifyWebhookSignature` always returns `true` (~L156), and "live" `processCheckout` returns synthetic success without charging (~L76/L141). `src/payments/payment-service.ts` checkout is public/unauthenticated.
**Risk:** If payments are enabled with `live_mode`, callers could obtain "successful" checkouts without paying, and forged webhooks would be accepted. **Fix:** Do **not** enable live payments until real Stripe `constructEvent` / PayPal webhook verification and real gateway sessions are implemented; require authentication + idempotency + rate limits on checkout. (Acceptable today only because these are inert stubs.)

### R-SEC-08 — `NEXT_PUBLIC_*` auth-disable flags
**Where:** `web/app/components/studio/StudioRouteGuard.tsx`, `web/components/platform-metrics/PlatformOperatorRouteGuard.tsx`, `web/lib/pilot-ux-dev-accounts.ts`; flags `NEXT_PUBLIC_RELAY_STUDIO_AUTH_DISABLED`, `NEXT_PUBLIC_RELAY_PLATFORM_METRICS_AUTH_DISABLED`, `NEXT_PUBLIC_RELAY_PILOT_UX_DEV_LOGIN`.
**Risk:** If any of these are accidentally set in the production web deploy, client-side guards are bypassed (UI exposure; data exposure where the API gap also exists). **Fix:** Ignore these flags when `NODE_ENV === "production"` (hard-block in code), and keep them out of all prod deploy configs.

### R-SEC-09 — Mature gate skipped on export unless tier gate on
**Where:** `src/server.ts` export `/content` (~L4532): `patronMatureGateForMediaExport` only runs inside `if (exportRequireTierAccess)`.
**Risk:** Patrons who opted to "hide 18+ content" can still be served full mature media via the export route when the tier flag is off. **Fix:** Apply the mature-content gate on all byte-delivery routes independently of the tier flag.

### R-SEC-10 — Operator metrics open when enforce flag off
**Where:** `src/platform-metrics/platform-operator-access.ts` (`requirePlatformOperatorForRequest` returns allowed when `RELAY_PLATFORM_OPERATOR_ACCESS_ENFORCE` is unset); routes in `src/server.ts` (~L2219).
**Risk:** Default-off means cross-tenant operating metrics/registry are readable by anyone. **Fix:** Set `RELAY_PLATFORM_OPERATOR_ACCESS_ENFORCE=1` and populate the operator allowlist in production; add `/platform-metrics` to `web/middleware.ts` APP_ROUTES.

---

## 5. Medium findings (fix soon after launch / before scale)

- **R-SEC-11 — Web security headers.** No CSP, `X-Frame-Options`/`frame-ancestors`, `X-Content-Type-Options: nosniff`, or `Referrer-Policy` (`web/next.config.mjs` has only rewrites; documented gap in `docs/pilot-security-headers.md`). Add a `headers()` block in `next.config.mjs` and a baseline CSP; add `helmet`-equivalent headers on Express. Reduces clickjacking and MIME-sniffing exposure and is a strong second layer behind the XSS fix (R-SEC-02).
- **R-SEC-12 — Rate limiting.** `src/middleware/rate-limits.ts` is in-memory/per-process (resets per replica; bypassable at scale) and login/OAuth-exchange, `GET /api/v1/patron/search`, export, and `POST /api/v1/platform-metrics/events` are largely unthrottled. Back the limiter with Redis and add IP+account limits on auth and expensive/anonymous endpoints.
- **R-SEC-13 — Password hashing.** `src/identity/password.ts` uses salted SHA-256 (GPU-fast). Migrate password verification to Argon2id/bcrypt/scrypt with transparent rehash-on-login.
- **R-SEC-14 — Session rotation.** Each login adds a session row without revoking prior ones (`src/identity/identity-service.ts`); stolen cookies stay valid up to 24h. Revoke/rotate sessions on new sign-in.
- **R-SEC-15 — Key rotation.** `OAuthCredential.keyId` is written but decryption always uses the current env key (`src/auth/token-store-db.ts`); rotating `RELAY_TOKEN_ENCRYPTION_KEY` breaks existing rows. Implement key lookup by `keyId` (dual-key decrypt window) and document a rotation runbook.
- **R-SEC-16 — Upload size enforcement.** Presigned PUT binds Content-Type but not size (`src/storage/relay-upload-r2.ts`); commit only checks declared vs HEAD length, not the max. Reject `head.contentLength > max` at commit and/or use SigV4 `content-length-range`.
- **R-SEC-17 — SSRF allowlist.** Export-upstream fetch (`src/export/export-service.ts`) and Discord attachment fetch (`src/discord/discord-ingest.ts`) fetch arbitrary URLs. Allowlist known CDN/Patreon/Discord hosts and block private/link-local ranges.
- **R-SEC-18 — Cache headers on gated media.** Some entitlement-gated responses set `Cache-Control: public` without `Vary` (`src/server.ts` ~L4576). Use `private` (or `Vary: Authorization, Cookie`) so shared CDNs can't serve one patron's authorized bytes to another.
- **R-SEC-19 — Session token dual-write.** `RELAY_COOKIE_SESSION_DUAL_WRITE` defaults on, returning the session token in JSON as well as the HttpOnly cookie. Set `=0` in production to keep the token cookie-only.
- **R-SEC-20 — Input validation.** No schema framework; `validateRequiredFields` checks presence only, and oversize comments are stored (hidden) rather than rejected. Adopt per-route Zod schemas; reject unknown fields and oversize input at the boundary.
- **R-SEC-21 — Hardcoded/placeholder secrets.** Pilot dev password `pilot-ux-dev-only` is committed (`web/lib/pilot-ux-dev-accounts.ts`); payment adapters fall back to `sk_test_placeholder` / `paypal_test_secret` (`src/server.ts` ~L1561). Require real secrets (fail startup) in production; never ship the default dev password.
- **R-SEC-22 — Consent replay store.** Extension consent single-use tracking is an in-process `Map` (`src/auth/extension-consent-code.ts`); replayable across replicas/restarts. Move consumed-code hashes to Redis/DB with TTL.

---

## 6. Low / informational

- **R-SEC-23** — Hard-block `RELAY_DEV_VISITOR_TIER_SIM`, pilot-UX dev login, and patron-feed dev tools when `NODE_ENV === "production"`.
- **R-SEC-24** — Add signed unsubscribe/preference links to digest emails (CAN-SPAM/GDPR hygiene); strip CR/LF/control chars from display names used in email subjects.
- **R-SEC-25** — Extend `scripts/m10-token-log-scan.mjs` to cover `web/` so client-side token logging is caught in CI.

---

## 7. What is already done well (keep it)

- AES-256-GCM at-rest encryption for OAuth tokens with random IV + auth tag and a 32-byte key check; process refuses to start without `RELAY_TOKEN_ENCRYPTION_KEY`.
- Opaque session tokens from a CSPRNG, stored only as SHA-256 hashes; `HttpOnly; SameSite=Lax; Secure`(prod) cookies; POST-only logout.
- Supabase JWTs are actually verified server-side (`auth.getUser`), not merely decoded.
- DB is a bounded context behind the API; service-role key is server-only (no `NEXT_PUBLIC` secret leakage); R2 master keys never returned to clients (presigned URLs only).
- Prisma parameterization throughout; the one `$executeRawUnsafe` binds `$1` (no string concatenation).
- Strong patterns where present: HMAC + `timingSafeEqual` for OAuth state, extension consent, Discord ingest, and the signed Patreon platform webhook; campaign-ownership check on webhooks; path-traversal jail on exports; recipient-scoped notifications; session-scoped patron data export; safe open-redirect handling (`resolvePostAuthPath`).
- Logging redaction (Pino + Sentry `beforeSend`); access logs avoid headers/bodies; CI token-log scan exists; `.env`/secrets gitignored with no committed live secrets.
- The team has already authored detailed security guardrails (`docs/AUTH_GUARDRAILS_TIER_1.md`) and seeded `@security-audit-required` markers — a strong security culture to build on.

---

## 8. Recommended remediation order (launch checklist)

**Before public launch (Critical + High — ~1–2 engineering days):**
1. R-SEC-01 — Force tier-gated, authenticated export; lock down `library-zip` + manifests.
2. R-SEC-02 — Sanitize post-description HTML (server-side on write + on render).
3. R-SEC-04 / R-SEC-05 / R-SEC-06 — Require creator secret or session auth on mutation/job routes; disable legacy `login-patreon`/`register-patreon` and the unsigned webhook in prod.
4. R-SEC-03 — Replace reflective CORS with an origin allowlist.
5. R-SEC-08 / R-SEC-10 / R-SEC-23 — Production env audit: enforce operator access, hard-block all auth-disable/dev-sim flags.
6. R-SEC-09 — Always enforce the mature-content gate on byte delivery.
7. R-SEC-07 — Keep live payments disabled until real verification ships.

**Shortly after launch (Medium):** R-SEC-11 (headers), R-SEC-12 (Redis rate limits), R-SEC-13 (password KDF), R-SEC-14 (session rotation), R-SEC-18 (cache headers), R-SEC-19 (dual-write off), then R-SEC-15/16/17/20/21/22.

**Hygiene/process (Low):** R-SEC-24, R-SEC-25.

---

*First-pass review only — no code was modified. Each finding has a matching `[R-SEC-NN]` flag at the relevant source location for the implementing engineer.*
