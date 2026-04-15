# Multi-tenant run 14 — Harden MT-011 Patreon creator OAuth bind (MT-034)

| | |
|---|---|
| **Step IDs** | `MT-034` |
| **Sort order** | 56 |
| **Precondition** | **MT-031** + **MT-032**: account owns a `relay_creator_id`. `RELAY_PATREON_OAUTH_STATE_SECRET` documented. |

## Full prompt (paste into agent)

```text
You are a coding agent on Rescue / Relay. Implement **MT-034** only: **security hardening** for creator Patreon OAuth (MT-011).

### Problem

`POST /api/v1/auth/patreon/creator/prepare` currently signs **any** `creator_id` the client sends. It must only sign `creator_id` values **owned by** the authenticated `Account`.

### Requirements

1. **`prepare`:** After resolving `accountId`, call a helper e.g. `assertAccountOwnsRelayCreatorId(prisma, accountId, creatorId)` that returns true only if `Account.primaryRelayCreatorId === creatorId` (or workspace table equivalent). On mismatch: **403** with stable error code/message.

2. **`exchange`:** When `RELAY_ENFORCE_CREATOR_OAUTH_BIND=1`, after `verifyCreatorPatreonOAuthState`, optionally re-check ownership before `exchangeCodeAndPersist` (defense in depth).

3. **Tests:** Unit/integration tests: cannot `prepare` for another account’s creator id; happy path with owned id succeeds.

4. **Docs:** One-line note in `multi-tenant-option-b.md` or `server.ts` block comment that prepare is ownership-gated.

### Verify

- `npm run test`; `npm run build`.

### Airtable

Complete **MT-034**; **Next run prompt** → `mt-run-15.md`.
```
