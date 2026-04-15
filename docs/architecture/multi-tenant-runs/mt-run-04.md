# Multi-tenant run 04 — Creator Patreon OAuth → tenant + relayCreatorId (MT-011)

| | |
|---|---|
| **Step IDs** | `MT-011` |
| **Sort order** | 11 |
| **Precondition** | MT-009–MT-010 Complete. |

## Full prompt (paste into agent)

```text
You are a coding agent on Rescue / Relay. This batch covers Step ID MT-011 only.

Goal: After the user has an **Account** session, **creator onboarding** connects **Patreon creator OAuth**, allocates or binds **`Tenant.relayCreatorId`**, creates **User** (creator) + **CreatorProfile**, and persists tokens via existing OAuth tables (`OAuthCredential`, `DbPatreonTokenStore` / `src/auth/auth-service.ts` — follow current `exchangeCodeAndPersist` patterns).

Tasks:
- Trace existing creator OAuth callback and token persistence (`src/patreon/`, `src/auth/auth-service.ts`, `src/auth/token-store-db.ts`).
- Ensure post-exchange flow: create **Tenant** if new; set unique `relayCreatorId` (slug rules per product — document); link **User** kind `creator`; run token storage unchanged where possible.
- **Authorize** using MT-010 rules: only the logged-in **Account** that initiated OAuth may bind that creator tenant (use OAuth `state` to carry signed account/session reference if not already).
- Update `CreatorProfile.patreonCampaignId` when Patreon API returns campaign id for this creator.

Verify:
- `npm run build`.
- Local OAuth smoke only if env vars present; otherwise document exact env keys and stop per FAIL_TO_HUMAN.

Airtable: Complete MT-011; Notes with files touched and OAuth state design.

Out of scope: patron OAuth multi-campaign matcher (run 05); web UI wizard (run 07).
```

## Links

- **This run:** [mt-run-04.md](mt-run-04.md) — `https://github.com/JTBAZ/relay/blob/main/docs/architecture/multi-tenant-runs/mt-run-04.md`
- **Next run:** [mt-run-05.md](mt-run-05.md) — `https://github.com/JTBAZ/relay/blob/main/docs/architecture/multi-tenant-runs/mt-run-05.md`

## Handoff

Start **[mt-run-05.md](mt-run-05.md)** (Patreon API audit + patron OAuth + membership match + snapshots).
