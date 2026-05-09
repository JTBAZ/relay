# Usage events — daily rollups (M1-lite / P7)

Append-only rows live in `usage_events` (Prisma `UsageEvent`). They are written from export GET handlers and from the shared JSON 429 handler in `src/middleware/rate-limits.ts`.

## Example: bytes per tenant per day (export content)

```sql
SELECT
  tenant_id,
  date_trunc('day', occurred_at AT TIME ZONE 'UTC') AS day_utc,
  SUM(quantity) AS total_bytes
FROM usage_events
WHERE metric = 'export.media.content.bytes'
GROUP BY 1, 2
ORDER BY 2 DESC, 1;
```

## Example: rate-limit hits per tenant per day

```sql
SELECT
  tenant_id,
  date_trunc('day', occurred_at AT TIME ZONE 'UTC') AS day_utc,
  COUNT(*) AS rate_limit_429_hits
FROM usage_events
WHERE metric = 'api.rate_limited'
GROUP BY 1, 2
ORDER BY 2 DESC, 1;
```

## Notes

- `tenant_id` may be null when no `tenants` row exists for the Relay `creator_id`; use `meta` on specific metrics when you add richer attribution.
- For billing-scale workloads, prefer rolling these into a materialized view or a nightly job that writes aggregate tables instead of scanning raw events.
