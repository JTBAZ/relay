# Platform metrics telemetry — RLS review (PMD-071)

Review date: 2026-05-25. Scope: cross-tenant operator analytics tables introduced in PMD-041 / PMD-050 / PMD-071.

## Tables reviewed

| Table | RLS | Client (Supabase JS) exposure | Server read path |
|-------|-----|------------------------------|------------------|
| `platform_telemetry_events` | Enabled, no permissive policies | **None** — append via API ingestion only | Prisma service role in `first-party-event-ingestion.ts` |
| `platform_metric_daily_rollups` | Enabled, no permissive policies | **None** — rollup job + registry API only | Prisma in rollup job + registry wiring |
| `platform_revenue_events` | Enabled, no permissive policies | **None** — server writers only (PMD-061+) | Prisma service role; contract PMD-060 |
| `platform_operator_access_audits` | Enabled, no permissive policies | **None** — insert-only from API | Prisma in `platform-operator-access-audit.ts` |

Migrations enable RLS without granting `anon` / `authenticated` SELECT policies on these tables. Patron/creator JWT paths cannot read raw cross-tenant telemetry through Supabase client.

## Client-facing paths

| Surface | Cross-tenant data? | Verdict |
|---------|-------------------|---------|
| `GET /api/v1/platform-metrics/registry` | Aggregated registry only | Operator-gated (PMD-070); audit logged (PMD-071) |
| `POST /api/v1/platform-metrics/events` | Write-only beacon | Validates payloads; does not return telemetry rows |
| `/platform-metrics` web UI | Fetches registry API | Same operator gate + session guard |

**No** Next.js or browser code reads `platform_telemetry_events` or rollups directly from Supabase.

## Residual gaps (accepted for pilot)

1. **Registry API without enforce** — When `RELAY_PLATFORM_OPERATOR_ACCESS_ENFORCE` is off, registry is open on the API process. Production must set enforce + allowlist.
2. **Staff role column** — v1 uses env allowlist; future `UserKind.staff` platform membership (PMD-070 notes).
3. **Audit retention** — Append-only table; no TTL job yet. Archive policy TBD with storage review.

## Checklist (PMD-071 exit)

- [x] RLS enabled on telemetry, rollup, and audit tables
- [x] No Supabase client policies exposing cross-tenant rows
- [x] Operator registry access audit logged to `platform_operator_access_audits`
- [x] Event ingestion remains write-only from client beacons

**Next:** PMD-080 — dashboard alerts for operating risks (depends on PMD-052, PMD-070).
