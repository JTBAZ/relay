# Multi-tenant run 03 — Session resolution + enforce tenant ownership (MT-009, MT-010)

| | |
|---|---|
| **Step IDs** | `MT-009` · `MT-010` |
| **Sort order** | 9–10 |
| **Precondition** | MT-007–MT-008 Complete. |

## Full prompt (paste into agent)

```text
You are a coding agent on Rescue / Relay. This batch covers Step IDs MT-009 and MT-010 only.

Goal: Centralize **authorization**: from session token → `Account` → `TenantMembership`(s) → allowed `relay_creator_id` set for patrons; for creators, prove the session **owns** the tenant being mutated. **Never** trust `creator_id` from request body/query alone for privileged actions.

### MT-009 — Central module: session → Account → memberships → relay_creator_id allowlist

- Add or extend a single module (e.g. under `src/identity/` or `src/auth/`) that:
  - Parses session from cookie or `Authorization` header (match existing patron/creator patterns in `src/server.ts`).
  - Loads `TenantMembership`(s) for the `Account` and derives which `relay_creator_id` values are valid for **patron** feed/gallery calls.
  - Exposes a small API: `getAuthContext(req)` → `{ accountId, memberships, creatorUsers?, ... }` per your schema.
- Integrate at least one read path to prove it works (e.g. a debug or internal route gated to dev) **or** wire the first consumer route that currently takes `creator_id` from the client — without changing all routes yet (that is MT-010).

### MT-010 — Enforce tenant ownership on creator routes

- Audit `src/server.ts` (and routers) for routes that accept `creator_id` / `relayCreatorId` in body or query for **mutating** creator actions (sync, gallery admin, curation).
- For each, require: the authenticated principal has a **User** / **Tenant** row that owns that `relay_creator_id`. Return 403 when mismatch.
- Do not remove query parameters until clients are updated; **do** ignore client-supplied creator id when it conflicts with session ownership.

Verify:
- `npm run build`.
- Add or extend tests if `src/server` has route tests; otherwise document manual curl steps with session cookie in Airtable Notes.

Airtable: Complete MT-009, MT-010 with Notes listing routes hardened.

Out of scope: Patreon creator OAuth onboarding (run 04); patron matcher (run 05).
```

## Links

- **This run:** [mt-run-03.md](mt-run-03.md) — `https://github.com/JTBAZ/relay/blob/main/docs/architecture/multi-tenant-runs/mt-run-03.md`
- **Next run:** [mt-run-04.md](mt-run-04.md) — `https://github.com/JTBAZ/relay/blob/main/docs/architecture/multi-tenant-runs/mt-run-04.md`

## Handoff

Start **[mt-run-04.md](mt-run-04.md)** (creator Patreon OAuth → tenant + token persistence).
