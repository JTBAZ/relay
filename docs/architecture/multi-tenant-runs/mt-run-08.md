# Multi-tenant run 08 — Security hardening (MT-018–MT-021)

| | |
|---|---|
| **Step IDs** | `MT-018` · `MT-019` · `MT-020` · `MT-021` |
| **Sort order** | 18–21 |
| **Precondition** | MT-007 for rate limit/CSRF; MT-013 for patron token encryption + audit scope. |

## Full prompt (paste into agent)

```text
You are a coding agent on Rescue / Relay. This batch covers Step IDs MT-018 through MT-021 only.

### MT-018 — Rate limiting + password policy on auth routes

- Add rate limiting to `/api/v1/auth/*` and legacy `/api/v1/identity/register` if still public — use existing middleware patterns in `src/server.ts` or introduce a small helper (e.g. in-memory for dev, Redis hook for prod behind interface).
- Enforce minimum password rules (length, complexity) consistent with product; reject weak passwords at signup.

### MT-019 — CSRF for cookie-based sessions

- If sessions use **cookies**, add CSRF protection for mutating routes (double-submit cookie or SameSite + custom header pattern). Document behavior for SPA (`web/`) fetch clients.
- If sessions are **Bearer-only**, document why CSRF is N/A and ensure cookies are not used for auth in conflicting ways.

### MT-020 — Encrypt patron OAuth at rest

- Confirm `PatronOAuthCredential` (or equivalent) stores refresh tokens using existing `encryptedPayload` / `keyId` pattern from `OAuthCredential`. Wire patron token persistence to use the same crypto helpers as creator tokens where applicable.
- No plaintext refresh tokens in logs or Airtable.

### MT-021 — Audit logs for account + OAuth binds

- Add structured logs (or audit table stub) for: account created, Patreon creator bound to tenant, patron OAuth completed. Include non-PII identifiers (`accountId`, `tenantId`, `relay_creator_id`).
- Redact email in logs or hash per `operations-and-security.md` posture.

Verify:
- `npm run build`; `npm run test` if audit helpers are testable.

Airtable: Complete MT-018–MT-021.

Out of scope: Feature flags / backfill (run 09).
```

## Links

- **This run:** [mt-run-08.md](mt-run-08.md) — `https://github.com/JTBAZ/relay/blob/main/docs/architecture/multi-tenant-runs/mt-run-08.md`
- **Next run:** [mt-run-09.md](mt-run-09.md) — `https://github.com/JTBAZ/relay/blob/main/docs/architecture/multi-tenant-runs/mt-run-09.md`

## Handoff

Start **[mt-run-09.md](mt-run-09.md)** (flags, backfill, cutover, ops checklist).
