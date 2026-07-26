# Platform metrics weekly review (PMD-081)

Turn the dashboard into a weekly operating ritual so missing, stale, and deferred metrics do not become forgotten scope debt.

## When

- **Cadence:** once per week (recommended: Monday or post-deploy review)
- **Audience:** platform operator / engineering lead with Airtable edit access
- **Duration:** 20–30 minutes

## Where

| Surface | Purpose |
|---------|---------|
| `/platform-metrics` dashboard | Data Coverage scoreboard, operating alerts, weekly triage queue |
| `GET /api/v1/platform-metrics/registry` | `operatingReview` payload for automation |
| Airtable → **Platform Metrics Dashboard** | Record wire / defer / remove decisions |

Group Airtable views by **Phase** and **Dashboard Section** when picking the next engineering work item.

## Ritual (4 steps)

### 1. Data Coverage first

Open the **Data Coverage** section at the top of the dashboard. Confirm:

- **Live %** is moving in the right direction week over week
- **Stale** count is zero or has an owner
- **Pending instrumentation** and **Deferred** counts match expectations

### 2. Operating alerts

Review the **Operating alerts** panel (PMD-080). Each alert links to a source metric card. Either:

- Resolve the underlying issue, or
- Acknowledge and track a follow-up work item

### 3. Weekly triage queue

Review the **Weekly metrics review** panel. For each row, choose one action:

| Action | When to use |
|--------|-------------|
| **Wire** | P0 gap or pending instrumentation — create or prioritize a PMD work item |
| **Defer** | Valid metric but not on the current roadmap — set `deferred` in registry seed / Airtable |
| **Remove** | Metric no longer needed — remove from inventory and seed with team approval |
| **Monitor** | Deferred by design, or stale live metric under investigation |

Sort order: P0 before P1, then `not_wired` → `pending_instrumentation` → `deferred` → stale live cards.

### 4. Log decisions in Airtable

For every **wire** or **defer** outcome:

1. Create or update a row in **Platform Metrics Dashboard**
2. Set **Status** (`Todo`, `In Progress`, `Done`, or deferred)
3. Add **Implementation Notes** with the decision date and rationale

## API contract

Registry responses include `operatingReview`:

```typescript
operatingReview: {
  generatedAt: string;
  checklist: string[];
  totals: {
    needsReview: number;
    notWired: number;
    pendingInstrumentation: number;
    deferred: number;
    stale: number;
    activeAlerts: number;
  };
  items: Array<{
    metricKey: string;
    recommendedAction: "wire" | "defer" | "remove" | "monitor";
    reason: string;
    // ...
  }>;
  bySection: Array<{ section: string; items: [...] }>;
}
```

## Exit criteria (PMD-081)

- [x] Weekly checklist documented (this file)
- [x] Dashboard triage queue surfaces not_wired, pending, deferred, and stale metrics
- [x] Coverage rollups include pending instrumentation and deferred counts
- [x] Decisions are recorded on the Airtable execution table

**Next:** PMD-044 creator studio instrumentation, or PMD-060 revenue contract.
