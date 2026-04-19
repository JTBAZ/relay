# EXT-7C — Operational runbook

## Context

This row implements **Phase 7.C** of [`docs/EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md): a single **operations** doc for engineering/on-call: extension update publish loop, **emergency** revocation SQL for extension sessions, **rotation** procedures for **`RELAY_EXTENSION_CONSENT_SECRET`** and **`RELAY_TOKEN_ENCRYPTION_KEY`**. **Docs-only** in `docs/operations/` — no application code unless rotation requires a script stub (prefer documenting existing tooling).

## Preconditions

- [ ] `EXT-0B-session-kind-extension-ttl-prompt.md` shipped — `Session.kind` / `extension` exists for SQL examples.
- [ ] `EXT-7H-pin-extension-ids-prompt.md` completed recommended — runbook describes **production**-accurate ops; may draft earlier with “TBD” IDs section.

## Tier 0 invariants (always apply)

1. **No JS reads `relay_session`.** It is `HttpOnly`. Web code never sees the token.
2. **No handler grants permission based on `relay_active_role`.** That cookie is a UI hint. Authz is derived from DB rows (`Account.primaryRelayCreatorId`, `TenantMembership`).
3. **No FK or RLS policy references `public_slug` or `relay_creator_id`.** Both can change shape under us; `Tenant.id` (UUID) is the only safe key.
4. **One Account, one Supabase user, one cookie.** A second simultaneous sign-in must invalidate the first server-side.
5. **All web calls go through `relayFetch`.** Raw `fetch("/api/...")` is forbidden after Stage 1.3 lands.
6. **All `/api/v1/*` routes use `requireAccount` / `requireAccountWithRole`** unless explicitly public with a `// PUBLIC: <reason>` comment.
7. **All redirects derived from user input pass through `resolvePostAuthPath`.**
8. **All mutations use POST/PUT/PATCH/DELETE.** GETs are side-effect-free.
9. **Runbook SQL** must match **actual** Prisma/DB column names — verify against `prisma/schema.prisma` **`Session`** model before publishing (**builder** may read schema for this doc row only).

## Goal

Create **`docs/operations/extension-runbook.md`** covering all bullets in plan §7.C with copy-paste-safe sections and warnings.

## Reference reading

1. [`docs/EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md) §7.C — Operational runbook (bullet list).
2. [`docs/EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md) Appendix B — env vars.
3. [`docs/database/operations-and-security.md`](../../database/operations-and-security.md) — if present, align tone and secrets handling.
4. `prisma/schema.prisma` — **`Session`**, **`SessionKind`**, revocation / `revokedAt` field names (adjust SQL if schema differs from plan’s example).

## Implementation steps

### Part A — Publish loop

1. **Extension update** procedure: bump **`version`** in manifests → `cd extension && npm run build:*:prod` → zip → upload to each store → AMO **full review** note per plan.

### Part B — Emergency revoke

2. **Emergency revoke all extension grants** — plan cites:

   ```sql
   UPDATE sessions SET revoked_at = now() WHERE kind = 'extension';
   ```

   **Replace** `revoked_at` / `kind` column names with actual schema (`@map` / Prisma names). If DB uses **`revokedAt`** camelCase vs snake_case, document the **exact** SQL for production Postgres.

   Add **warnings:** breaks all extension installs until users re-consent; coordinate comms.

### Part C — Secret rotation

3. **`RELAY_EXTENSION_CONSENT_SECRET`** rotation: effect = invalidates **in-flight** consent codes only; **existing** extension Bearer sessions **survive** per plan. Steps: generate new secret → dual-write window **if** supported (else hard cutover) → update `.env` → restart API → document downtime/consent retry UX.

4. **`RELAY_TOKEN_ENCRYPTION_KEY`** rotation: triggers **re-encrypt** of cookie store — cite `src/auth/cookie-store.ts` / operational docs; if **no** script exists, document **required** script behavior and open a follow-up ticket (do not block runbook on implementation unless team insists).

### Part D — Cross-links

5. Link **`extension/README.md`**, **store dashboards**, **privacy URL**, **`AGENTS.md`** deployment notes.

### Part E — Audit

6. **File exists:**

   ```bash
   test -f docs/operations/extension-runbook.md
   ```

   (Windows: `Test-Path docs/operations/extension-runbook.md`.)

## Acceptance criteria

- [ ] `docs/operations/extension-runbook.md` exists and includes §7.C topics with schema-accurate SQL.
- [ ] No secrets embedded in the markdown (placeholder names only).
- [ ] Tier 0 invariants satisfied.

## Out of scope

- Implementing the re-encrypt sweep script (document only unless separately tasked).
- Airtable / ledger updates.

## Handoff

Delta Out:

- Schema corrections applied vs plan’s example SQL.
- Follow-up ticket IDs for missing automation (if any).
