# Multi-tenant run 06 — Entitled creators + feed/gallery aggregation API (MT-014)

| | |
|---|---|
| **Step IDs** | `MT-014` |
| **Sort order** | 14 |
| **Precondition** | MT-009 and MT-013 Complete (session resolution + patron snapshots). |

## Full prompt (paste into agent)

```text
You are a coding agent on Rescue / Relay. This batch covers Step ID MT-014 only.

Goal: Server-derived **list of Relay creators** the patron may access — no env default. Implement:

- `GET /api/v1/me/entitled-creators` (or name aligned with existing `/api/v1` conventions) returning JSON such as `{ "relay_creator_ids": string[] }` or richer objects `{ id, displayName?, campaignId? }` if already patterned elsewhere.
- Source of truth: `PatronEntitlementSnapshot` / `PatronCampaignAccess` + active flags, filtered by session’s patron `TenantMembership`.
- Extend **patron feed/gallery list** endpoints in `src/server.ts` so the server **computes** the union of creators (or single fetch per creator) from that list — **not** from `NEXT_PUBLIC_RELAY_CREATOR_ID`.
- Keep creator **Library** routes separate: those use **creator** session from MT-010, not patron list.

Verify:
- `npm run build`.
- Curl or automated test: with mocked session, response contains expected creator ids when snapshots exist.

Airtable: Complete MT-014 with example response shape in Notes.

Out of scope: Next.js UI (run 07).
```

## Links

- **This run:** [mt-run-06.md](mt-run-06.md) — `https://github.com/JTBAZ/relay/blob/main/docs/architecture/multi-tenant-runs/mt-run-06.md`
- **Next run:** [mt-run-07.md](mt-run-07.md) — `https://github.com/JTBAZ/relay/blob/main/docs/architecture/multi-tenant-runs/mt-run-07.md`

## Handoff

Start **[mt-run-07.md](mt-run-07.md)** (web landing, wizard, remove env creator default).
