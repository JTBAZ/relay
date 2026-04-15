# Multi-tenant run 10 — Documentation + integration tests (MT-026–MT-030)

| | |
|---|---|
| **Step IDs** | `MT-026` · `MT-027` · `MT-028` · `MT-029` · `MT-030` |
| **Sort order** | 26–30 |
| **Precondition** | MT-025 for doc accuracy; MT-017 + MT-025 for integration tests per Airtable deps. |

## Full prompt (paste into agent)

```text
You are a coding agent on Rescue / Relay. This batch covers Step IDs MT-026 through MT-030 only.

### MT-026 — Architecture doc `docs/architecture/multi-tenant-identity.md`

- Author full doc: roles (Account, User, Tenant, TenantMembership), session attachment, Patreon objects → Relay objects, creator vs patron flows. Link to `multi-tenant-option-b.md` and Prisma models.

### MT-027 — Update `road map.md` + `docs/SUPPORTER_RELAY_MVP_CHASSIS.md`

- State explicit **multi-tenant** assumption; session/feed ordering unchanged from chassis where applicable.

### MT-028 — Align `.docs/anthropic/PRODUCT_UX_NORTH_STAR.md`

- Artist Relay vs Fan Relay onboarding paths consistent with implemented routes (no contradictions).

### MT-029 — Integration test: signup → creator OAuth → sync without `NEXT_PUBLIC_*`

- Add vitest/integration or scripted smoke (repo convention) proving creator path works with multi-tenant mode when flag off. Mock Patreon if needed.

### MT-030 — Integration test: patron OAuth → two campaigns → feed contains both

- Seed or mock two tenants with distinct `CreatorProfile.patreonCampaignId`; assert entitled list or feed aggregation returns both creators.

Verify:
- `npm run test` / targeted test scripts pass.
- Markdown links valid.

Airtable: Complete MT-026–MT-030. **Next run prompt** field empty in Airtable for terminal steps.

**Follow-on:** Account-first artist onboarding continues in **`mt-run-11.md` … `mt-run-17.md`** (MT-031–MT-037). Run 10 remains the prior doc/test milestone terminal for MT-026–MT-030.
```

## Links

- **This run:** [mt-run-10.md](mt-run-10.md) — `https://github.com/JTBAZ/relay/blob/main/docs/architecture/multi-tenant-runs/mt-run-10.md`
- **Next run:** *(none)*

## Handoff

Multi-tenant Airtable queue complete for this track; future work goes in new rows or Product tracker as appropriate.
