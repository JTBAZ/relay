/**
 * P5a-ins-010 — Patreon Insights CSV “stale” banner threshold for /analytics.
 */
const DEFAULT_STALE_DAYS = 14;

/** Max age (days) before we nudge the creator to re-upload Patreon Insights CSV. */
export function insightsStaleDaysLimit(): number {
  const raw =
    typeof process !== "undefined" ? process.env.NEXT_PUBLIC_RELAY_INSIGHTS_STALE_DAYS : undefined;
  if (raw == null || raw === "") {
    return DEFAULT_STALE_DAYS;
  }
  const n = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n)) {
    return DEFAULT_STALE_DAYS;
  }
  return Math.min(Math.max(n, 1), 366);
}

/** True when `import_uploaded_at` is older than `staleDays` from `nowMs`. */
export function isInsightsCsvStale(
  importUploadedAtIso: string | null | undefined,
  nowMs: number = Date.now(),
  staleDays: number = insightsStaleDaysLimit()
): boolean {
  if (!importUploadedAtIso?.trim()) {
    return false;
  }
  const t = new Date(importUploadedAtIso.trim()).getTime();
  if (!Number.isFinite(t) || t > nowMs) {
    return false;
  }
  const ageMs = nowMs - t;
  return ageMs > staleDays * 86_400_000;
}
