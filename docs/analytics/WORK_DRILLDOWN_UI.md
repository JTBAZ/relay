# Work / Bundle Drilldown UI (Phase 7)

Dedicated studio page for inspecting one **Creative Work / Bundle** across variants and platform instances.

## Route

`/studio/analytics/works/:creative_work_id?range=7d|30d|90d`

Linked from the Insights Hub hierarchy panel (**Details** on each work row).

## Sections

| Section | Source |
| --- | --- |
| Summary (reach, likes, comments, variants) | `GET .../performance/works/:id` |
| Top performer callout | Derived from variant reach in bundle payload |
| Source quality labels | `source_summary` on bundle report |
| Platform breakdown | `by_destination` |
| Trend history | `daily_series` (reach sparkline) |
| Suggested next moves | `deriveWorkDrilldownActions()` heuristics |
| Variants + instances | `variants[]` with lazy refresh actions |
| Role-split stats (Relay View) | `?group_by=variant_role` → `role_breakdown` |
| Cross-post gaps / blank cards | `crosspost_gaps.missing_destinations[]` |
| Dedicated instances + refresh | `GET .../performance/works/:id/instances` |

## Refresh actions

Each platform instance row exposes **Refresh**, wired to:

- `POST .../platform-instances/:id/refresh`
- Extension handoff via `sendRelayExternalMetricsRefreshToExtension` when status is `handoff_required`

See [SAFE_REFRESH.md](./SAFE_REFRESH.md).

## Modules

| File | Role |
| --- | --- |
| `web/app/studio/analytics/works/[creative_work_id]/page.tsx` | Route shell |
| `web/app/studio/analytics/works/[creative_work_id]/WorkDrilldownClient.tsx` | Data load + refresh orchestration |
| `web/app/studio/analytics/WorkDrilldownView.tsx` | Presentational drilldown UI |
| `web/lib/work-drilldown-actions.ts` | Metric-grounded suggested actions |

## Related

- [HUB_HIERARCHY_UI.md](./HUB_HIERARCHY_UI.md) — entry point from Trends tab
- [UNIFIED_READ_V2.md](./UNIFIED_READ_V2.md) — bundle read API
- Phase 8 (`insight-actions-goals`) — richer Insight Bot cards and goal objects
