# EXT-0B — `Session.kind` + extension sliding TTL

## Context

This row implements **Phase 0.B** of [`docs/EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md): web sessions keep a **24h** TTL while extension-issued Bearer sessions use a **sliding 30-day** window (`lastUsedAt` / `expiresAt` updates on successful resolution). The extension cannot rely on the `relay_session` cookie cross-origin; it will hold an opaque token minted after consent (Phase 0.C). This item adds schema + identity-service behavior only — no new HTTP routes.

## Preconditions

- [ ] None — may run in parallel with `EXT-0A-cookie-endpoint-auth-prompt.md` and other Phase 0.A–E rows on separate branches; merge coordination: any branch that calls `issueExtensionSession` before this lands must not register those calls in production until `EXT-0B` is on main.

## Tier 0 invariants (always apply)

1. **No JS reads `relay_session`.** It is `HttpOnly`. Web code never sees the token.
2. **No handler grants permission based on `relay_active_role`.** That cookie is a UI hint. Authz is derived from DB rows (`Account.primaryRelayCreatorId`, `TenantMembership`).
3. **No FK or RLS policy references `public_slug` or `relay_creator_id`.** Both can change shape under us; `Tenant.id` (UUID) is the only safe key.
4. **One Account, one Supabase user, one cookie.** A second simultaneous sign-in must invalidate the first server-side.
5. **All web calls go through `relayFetch`.** Raw `fetch("/api/...")` is forbidden after Stage 1.3 lands.
6. **All `/api/v1/*` routes use `requireAccount` / `requireAccountWithRole`** unless explicitly public with a `// PUBLIC: <reason>` comment.
7. **All redirects derived from user input pass through `resolvePostAuthPath`.**
8. **All mutations use POST/PUT/PATCH/DELETE.** GETs are side-effect-free.
9. **Token raw values are never stored — only `tokenHash` (SHA-256).** Follow the existing `Session` pattern and field comments in `prisma/schema.prisma`. **Sliding 30-day TTL:** `lastUsedAt` and `expiresAt` updates for extension sessions are **fire-and-forget** in `requirePatronBearerSession` — **do not await** `touchSessionExpiry`; request latency must stay unchanged.

## Goal

Prisma `Session` rows distinguish `web` vs `extension`; extension sessions issue with 30d sliding TTL and renew on use; web sessions remain 24h and untouched by renewal logic.

## Reference reading

1. [`docs/EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md) §0.B — Add `Session.kind` discriminator + extension TTL path.
2. [`docs/AUTH_GUARDRAILS_TIER_1.md`](../../AUTH_GUARDRAILS_TIER_1.md) §1.2 — Tier 0 invariants (session model coherence).
3. `prisma/schema.prisma` — extend `Session` per plan (line **149** cited in plan).
4. `src/identity/identity-service.ts` — default TTL and new helpers per plan.
5. `src/server.ts` — `requirePatronBearerSession` integration (fire-and-forget touch) per plan.

## Implementation steps

### Part A — Schema + migration

1. **Edit `prisma/schema.prisma`** — extend the existing `Session` model per the plan (copy verbatim):

   ```prisma
   // prisma/schema.prisma
   enum SessionKind {
     web        @map("web")
     extension  @map("extension")
   }

   model Session {
     // ...existing fields...
     kind            SessionKind @default(web) @map("kind")
     label           String?     @map("label")           // user-visible: "Chrome on Windows", set by extension on issue
     lastUsedAt      DateTime?   @map("last_used_at")    // sliding-window anchor for extension grants
     @@index([tenantMembershipId, kind, expiresAt])
   }
   ```

2. Generate migration: `npm run db:migrate -- --name session_kind` (or project’s equivalent). Backfill in SQL: `UPDATE sessions SET kind = 'web' WHERE kind IS NULL` per plan.

### Part B — Identity layer

3. **`src/identity/types.ts`** — add `kind?: "web" | "extension"; label?: string | null` to `SessionToken` (match Prisma enum naming used in TS).

4. **`src/identity/identity-service.ts`**:
   - Add `EXTENSION_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000`.
   - Add `issueExtensionSession(user: UserAccount, label: string): Promise<SessionToken>` — mint with `kind: "extension"`, `label`, longer TTL.
   - Add `touchSessionExpiry(token: string): Promise<void>` — bumps `expiresAt` to `now + EXTENSION_SESSION_TTL_MS` and `lastUsedAt = now()` **only when** `kind === "extension"`. No-op or skip for `web`.

5. **`src/identity/identity-store.ts`** + **`src/identity/identity-store-db.ts`** — persist `kind` + `label` on create; implement `touchSessionExpiry`. **File-backed store** must mirror schema for local/dev parity per plan.

### Part C — Server resolution hook

6. **`src/server.ts`** — inside `requirePatronBearerSession`, after successful `resolveSession`, if `session.kind === "extension"`, fire-and-forget:

   ```ts
   // src/server.ts (conceptual; place exactly where session is resolved)
   void identityService.touchSessionExpiry(opaque).catch(() => {});
   ```

   **Do not** `await` this call.

### Part D — Tests

7. **New file** `tests/identity/extension-session.test.ts` — cover: issue extension session; sliding renewal on use; idle expiry past window; **web** sessions unchanged by `touchSessionExpiry`.

### Part E — Audit

8. Enumerate session creation paths:

   ```bash
   rg "createSession|issueSession|SessionKind|kind:\\s*[\"']web" src/identity/
   ```

## Acceptance criteria

- [ ] Migration applies on fresh DB (`docker compose up -d` then `npx prisma migrate deploy` per plan).
- [ ] All `tests/identity/*` pass including the new file.
- [ ] Extension session still valid ~day 29 when used; unused ~31 days fails resolution with invalid/expired session; web sign-in still ~24h for `relay_session`.
- [ ] `npm run test` and `npm run build` pass at repo root.
- [ ] No new ESLint errors in touched files.
- [ ] Tier 0 invariants above remain satisfied.

## Out of scope

- Changing cookie TTL for `relay_session`, removing JSON-body token return, or changing how `relay_session` is set ([`EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md) §0.B).
- Consent HTTP endpoints (`EXT-0C`) — but `issueExtensionSession` must be callable from server code when `EXT-0C` lands.
- Rate limiting and CORS (`EXT-0D`, `EXT-0E`).

## Handoff

Delta Out:

- Migration name and any backfill SQL notes.
- Exported TS API: `issueExtensionSession`, `touchSessionExpiry`, `SessionToken` shape.
- Confirmation that `touchSessionExpiry` is only invoked fire-and-forget from `requirePatronBearerSession`.

Next claimable: `EXT-0C-extension-consent-endpoints-prompt.md` (needs `issueExtensionSession` on branch before exchange issues tokens), `EXT-0D-rate-limiting-prompt.md`, `EXT-0E-cors-extension-allowlist-prompt.md`, plus parallel `EXT-0A` if not done.
