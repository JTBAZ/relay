# Multi-tenant run 01 — Schema, Account model, campaign index, entitlements, DB verify (MT-001–MT-006)

## Orientation (read once; not repeated in later runs)

Use with **Relay Database Tracker** → **Multi Tenant Changes** (not **Project tracker** → **Production Ledger**, and not **DB Integration Pipeline** roadmap steps `1.1.x` / `2.x`).

| | |
|---|---|
| **Base ID** | `appDbIOVX38X6U8Sf` |
| **Table** | Multi Tenant Changes (`tbl9PWH9Q0tvKOmKa`) |
| **Step IDs this run** | `MT-001` · `MT-002` · `MT-003` · `MT-004` · `MT-005` · `MT-006` |
| **Sort order** | 1–6 |
| **Precondition** | None (first run). |

**Rules for every run**

- Minimal, focused diffs; match existing patterns in `src/identity/`, `prisma/schema.prisma`, `src/server.ts`.
- No secrets in commits, Airtable **Notes**, or logs. Env **names** only in docs.
- If database, OAuth, or missing credentials block verification, stop and report per `.docs/anthropic/FAIL_TO_HUMAN.md`.

**Airtable:** For Step IDs in this run: set **Pipeline status** to **In progress** while working; **Complete** when verified; append **Notes** (commands, migration name, PR link). Never paste tokens or passwords into Airtable.

**Repo layout:** See root `AGENTS.md` — backend `src/`, web `web/`, Prisma `prisma/schema.prisma`.

---

## Full prompt (paste into agent)

```text
You are a coding agent on the Rescue / Relay repo implementing multi-tenant identity (Option B: global Account + TenantMembership + creator User rows).

Queue: Airtable "Multi Tenant Changes" — this batch covers Step IDs MT-001 through MT-006 only.

Context: Prisma may already define `Account`, `Tenant`, `TenantMembership`, `User`, `CreatorProfile.patreonCampaignId`, `PatronEntitlementSnapshot`, `PatronCampaignAccess`. Your job is to align documentation, fill any schema gaps, backfill/migration path, and prove `RELAY_DB_STORE_IDENTITY` works end-to-end for new assumptions — without drive-by refactors.

### MT-001 — Lock Option B; document migration story

- Add or update canonical doc `docs/architecture/multi-tenant-option-b.md` (referenced from `CreatorProfile` in `prisma/schema.prisma` if missing).
- Explicitly document: one `Account` per person (`emailNorm` unique when set); creator access via `User` + `Tenant`; patron access via `TenantMembership` + `TenantRole`; sessions attach to `TenantMembership` (`Session` model).
- Document how legacy file / `.relay-data` identity maps to `Account` / `legacyFileId` fields (see schema comments on `Account`, `User`, `TenantMembership`).
- If `TenantRole` today only includes `patron`, document how creator admin is represented (`User` on tenant) so future agents do not duplicate concepts.

### MT-002 — Prisma: Account + memberships (verify / complete)

- Read `prisma/schema.prisma` — confirm `Account`, `TenantMembership` (`@@unique([accountId, tenantId])`), relations to `Session`, and indexes needed for login and campaign lookup.
- Add migrations only if something is missing vs. the doc (e.g. index, nullable constraints). Run `npx prisma validate` and `npm run build` (or `npx prisma generate`) after schema edits.
- Update `.env.example` if new env vars are required (names only).

### MT-003 — Backfill existing dev/staging users to Account model

- Inspect `scripts/backfill-identity.mjs` and `npm run backfill:identity` — align with current schema or extend so dev tenants/users get consistent `Account` + `TenantMembership` rows where the product expects them.
- Document the exact command and any idempotency guarantees in `docs/architecture/multi-tenant-option-b.md` or a short subsection in `docs/database/staging-identity-verification.md`.
- Run backfill against local DB if `DATABASE_URL` is set; if not, document dry steps and stop short (FAIL_TO_HUMAN) rather than inventing credentials.

### MT-004 — CreatorProfile.patreonCampaignId + source of truth

- Confirm `CreatorProfile.patreonCampaignId` is unique where appropriate and indexed for patron→tenant matching (`@@index([patreonCampaignId])`).
- Document in the same architecture doc: canonical numeric/string Patreon campaign id source (ingest, OAuth, webhook) and which code paths write `patreonCampaignId`.

### MT-005 — Patron entitlement tables (verify / light wiring)

- Review `PatronEntitlementSnapshot` and `PatronCampaignAccess` in `prisma/schema.prisma` — ensure fields support: patron membership id, `relay_creator_id`, optional `campaign_id`, tier ids, `active`, `asOf`, `staleAfter`.
- If stubs only: add minimal read/write helpers or service comments so MT-013 can upsert without redesign — no full background job unless already scoped.
- Migration only if schema change is required.

### MT-006 — migrate deploy + DbIdentityStore verification

- `npx prisma migrate deploy` (or `npm run db:migrate` in dev) succeeds against a real `DATABASE_URL`.
- With `RELAY_DB_STORE_IDENTITY=1`, smoke-test identity paths used in dev: e.g. register/login flows hitting `DbIdentityStore` (`src/identity/identity-store-db.ts`) via `src/server.ts`. List exact routes exercised.
- Summarize verification commands in completion notes (and Airtable Notes per row).

Verify before completion:
- `npm run build` at repo root after Prisma changes.
- `npm run test` if identity modules have tests; fix only failures you introduced.

Airtable: Mark Pipeline status Complete for MT-001–MT-006 with Notes per row when done.

Out of scope for this run: new `/api/v1/auth/signup` routes (run 02), patron campaign matcher OAuth (run 05), web Gallery env removal (run 07).
```

## Links

- **This run:** [mt-run-01.md](mt-run-01.md) — on `main`: `https://github.com/JTBAZ/relay/blob/main/docs/architecture/multi-tenant-runs/mt-run-01.md`
- **Next run:** [mt-run-02.md](mt-run-02.md) — `https://github.com/JTBAZ/relay/blob/main/docs/architecture/multi-tenant-runs/mt-run-02.md`

## Handoff

When MT-001–MT-006 are Complete in Airtable, start **[mt-run-02.md](mt-run-02.md)** (auth API + IdentityService account flows).
