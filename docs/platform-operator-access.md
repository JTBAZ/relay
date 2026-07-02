# Platform operator access (PMD-070)

Cross-tenant platform metrics are **operator-only**. Creator `/analytics` stays tenant-scoped; the platform metrics dashboard and registry API expose aggregates across all tenants.

## Role model (v1)

| Role | Scope | Access |
|------|--------|--------|
| Patron / creator | Single tenant or own studio | Creator analytics, studio — **not** platform registry |
| Platform operator | Cross-tenant | `GET /api/v1/platform-metrics/registry`, `/platform-metrics` UI |

v1 does **not** introduce a new Prisma role column. Operators are identified by an explicit server allowlist:

- `RELAY_PLATFORM_OPERATOR_ACCOUNT_IDS` — comma-separated `Account.id` values
- `RELAY_PLATFORM_OPERATOR_EMAILS` — comma-separated normalized emails (`Account.emailNorm`)

Future: dedicated staff/platform membership rows (see `UserKind.staff` per-tenant).

## Enforcement

| Env | Default | Meaning |
|-----|---------|---------|
| `RELAY_PLATFORM_OPERATOR_ACCESS_ENFORCE` | **on in production**, off in dev | When enforced, registry route requires authenticated allowlisted operator. Override with `=0` or `=1`. |
| `NEXT_PUBLIC_RELAY_PLATFORM_METRICS_AUTH_DISABLED` | off | Web-only dev bypass (local scaffold); **never** in production |

**Not gated (by design):** `POST /api/v1/platform-metrics/events` — public/client beacons from patron feed and gallery surfaces. Ingestion validates payloads; it does not return cross-tenant rollups.

## Responses

| Status | Code | When |
|--------|------|------|
| 401 | `AUTH_ERROR` | Enforce on, no session |
| 403 | `FORBIDDEN` | Enforce on, session not on allowlist |

## RLS note

Raw telemetry tables (`platform_telemetry_events`, `platform_metric_daily_rollups`) have RLS enabled. Operator APIs read via Prisma service role / server path — not Supabase client. PMD-071 adds audit logging.

## Operator access audit (PMD-071)

- Table: `platform_operator_access_audits` (append-only)
- Service: `src/platform-metrics/platform-operator-access-audit.ts`
- Allowed registry reads and denied 401/403 attempts are logged when Prisma is configured
- RLS review: `docs/platform-metrics-rls-review.md`

## PMD-070 exit

- [x] Operator role model documented
- [x] Registry API protected when enforce enabled
- [x] Web dashboard requires session when auth not disabled; 403 surfaced for non-operators
- [x] Event ingestion remains open for instrumentation beacons

**Next:** PMD-080 — dashboard alerts for operating risks.
