# Multi-tenant run 17 — Tests, staging rollout, ops (MT-037)

| | |
|---|---|
| **Step IDs** | `MT-037` |
| **Sort order** | 59 |
| **Precondition** | **MT-031**–**MT-036** implemented or ready to verify end-to-end. |

## Full prompt (paste into agent)

```text
You are a coding agent on Rescue / Relay. Implement **MT-037** only: **verification bundle** — tests, staging checklist, light documentation — for account-first creator onboarding.

### Tasks

1. **Integration / E2E smoke:** Add or extend tests so **signup → workspace → prepare path is covered** (mock Patreon if needed). Align with existing **MT-029** intent (`multi-tenant-runs/mt-run-10.md`); avoid duplicate test files — consolidate if two suites overlap.

2. **Staging checklist** (short markdown in repo is OK **only if** user asked — prefer **Notes** in Airtable + existing `docs/database/operations-and-security.md` pointer): list env vars: `RELAY_ENFORCE_CREATOR_OAUTH_BIND`, `RELAY_PATREON_OAUTH_STATE_SECRET`, `RELAY_DB_STORE_CREATOR_OAUTH`, encryption key, Supabase URLs, `NEXT_PUBLIC_RELAY_API_URL`.

3. **Regression:** `npm run test` at repo root; `web` lint/build if touched.

4. **Cross-link:** Ensure `multi-tenant-runs/README.md` lists runs 11–17 and `AIRTABLE_MULTI_TENANT_CHANGES.md` remains accurate.

### Verify

- CI green locally; staging human pass: one artist can complete OAuth + live scrape without `NEXT_PUBLIC_RELAY_CREATOR_ID` mismatch.

### Airtable

Complete **MT-037**; **Next run prompt** empty (terminal step for this onboarding track).
```
