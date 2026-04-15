# Multi-tenant run 05 — Patreon audit + patron matcher + snapshots (MT-012, MT-013)

| | |
|---|---|
| **Step IDs** | `MT-012` · `MT-013` |
| **Sort order** | 12–13 |
| **Precondition** | MT-005, MT-011, MT-012 dependencies per Airtable (MT-006+ schema; MT-011 creator path; audit). |

## Full prompt (paste into agent)

```text
You are a coding agent on Rescue / Relay. This batch covers Step IDs MT-012 and MT-013 only.

### MT-012 — Patreon API capability audit (document MVP)

- Read Patreon API usage in repo (`src/patreon/`, identity patron completion). Produce a short addendum in `docs/architecture/multi-tenant-option-b.md` or `docs/patreon-ingest-canonical.md`: which endpoints you use for **memberships/pledges** vs **follows**, and why MVP matching uses memberships (not follows) if applicable.
- Call out rate limits / gaps that affect `PatronEntitlementSnapshot` refresh jobs.

### MT-013 — Patron OAuth completion + membership fetch → campaign→tenant match → upserts

- Extend `completePatreonPatronOAuth` (or equivalent in `src/identity/identity-service.ts` / `src/patreon/patreon-patron-oauth.ts`) so it is **not** keyed to a single body `creator_id` only:
  - Fetch patron’s pledges/memberships from Patreon API.
  - For each **campaign id**, resolve **Tenant** via `CreatorProfile.patreonCampaignId` (or join through `Tenant` / ingest campaign id — follow schema).
  - Upsert **`PatronEntitlementSnapshot`** and/or **`PatronCampaignAccess`** rows per `TenantMembership` with `relay_creator_id`, tier ids, `active`, `asOf`, `source = oauth_exchange`.
- Persist **`PatronOAuthCredential`** if refresh tokens are stored; respect encryption fields already on model.

Verify:
- `npm run build`.
- Unit tests for pure matching logic (campaign id → relay_creator_id) if you add a small extracted function.
- Integration test optional if test harness mocks Patreon; otherwise document manual steps.

Airtable: Complete MT-012, MT-013.

Out of scope: `GET /me/entitled-creators` (run 06); web feed (run 07).
```

## Links

- **This run:** [mt-run-05.md](mt-run-05.md) — `https://github.com/JTBAZ/relay/blob/main/docs/architecture/multi-tenant-runs/mt-run-05.md`
- **Next run:** [mt-run-06.md](mt-run-06.md) — `https://github.com/JTBAZ/relay/blob/main/docs/architecture/multi-tenant-runs/mt-run-06.md`

## Handoff

Start **[mt-run-06.md](mt-run-06.md)** (entitled-creators + multi-creator feed API).
