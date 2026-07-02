# Insights Hub — Performance Hierarchy UI (Phase 6)

The **Trends** tab in Analytics Insights Hub now surfaces the Work/Bundle performance hierarchy using V2 read APIs.

## Hierarchy levels

| Level | UI location | Data source |
| --- | --- | --- |
| Creator-wide | Summary counts + reach | `GET .../performance/overview` |
| Platform | Platform scope chips + source labels | `overview.source_summary`, client filter on rollups |
| Campaign / tag | Campaign labels + tag groups | `.../performance/campaigns`, `.../performance/tags` |
| Work / bundle | Expandable work rows | `.../performance/works` |
| Variant | Expanded work panel | `.../performance/works/:creative_work_id` (lazy) |
| Platform instance | Under each variant | Included in work bundle payload |

## Client wiring

- `AnalyticsOverviewClient` loads overview, campaigns, tags, works, and bundle suggestions in parallel with legacy unified performance.
- `PerformanceHierarchyPanel` renders the hierarchy block on the Trends tab.
- Platform scope filters re-fetch overview with `?destination=` and client-filter campaign/tag/work reach.

## UX notes

- Freshness and source confidence badges come from V2 `freshness` and `source_summary`.
- Posting goal pace appears from `overview.posting_goal` (Relay posting goal, not Patreon Campaign).
- Bundle suggestions are read-only previews; confirm/dismiss actions remain API-backed for a future slice.
- Each work row links to the dedicated drilldown page at `/studio/analytics/works/:creative_work_id`.
- Full Work drilldown page is Phase 7 (`work-drilldown-ui`) — see [WORK_DRILLDOWN_UI.md](./WORK_DRILLDOWN_UI.md).

## Related docs

- [UNIFIED_READ_V2.md](./UNIFIED_READ_V2.md)
- [PERFORMANCE_INTELLIGENCE_VOCABULARY.md](./PERFORMANCE_INTELLIGENCE_VOCABULARY.md)
- [SUGGESTED_BUNDLING.md](./SUGGESTED_BUNDLING.md)
