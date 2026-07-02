# Insight Actions & Targeted Goals (Phase 8)

Metric-grounded **action cards** and **performance goals** for the Analytics Insights Hub Actions tab.

## Action cards

Module: [`performance-insight-actions.ts`](../../src/analytics/performance-insight-actions.ts)

| Method | Path |
|--------|------|
| GET | `/api/v1/creator/analytics/performance/insight-actions?range=` |

Cards are derived from V2 performance reads (overview, works, campaigns, bundle suggestions) plus posting goal pace. Examples:

- Posting goal behind pace
- Double down on top work
- Improve supporter offer (high reach, low engagement)
- Turn traction into promo
- Test another platform
- Confirm suggested bundling
- Set campaign reach goal

The web client merges these with legacy membership/CSV cards via [`merge-insight-action-cards.ts`](../../web/lib/merge-insight-action-cards.ts), preferring performance cards when they overlap (`winning-format`, `promo-post`).

## Targeted goals

Schema: `creator_performance_goals` (`PerformanceGoalScope`, `PerformanceGoalMetric`)

Module: [`performance-insight-goals-service.ts`](../../src/analytics/performance-insight-goals-service.ts)

| Method | Path |
|--------|------|
| GET | `/api/v1/creator/analytics/performance/goals?range=` |
| POST | `/api/v1/creator/analytics/performance/goals` |
| DELETE | `/api/v1/creator/analytics/performance/goals/:goal_id` |

### Scopes

| Scope | `scope_ref` | Progress source |
|-------|-------------|-----------------|
| `creator` | null | Creator-wide unified totals |
| `work` | `creative_work_id` | Work list / bundle reach |
| `campaign` | analytics campaign label | Campaign rollups |
| `platform` | destination slug | Destination breakdown |

### Metrics

`reach`, `likes`, `comments` — measured over the goal's `range` (`7d`, `30d`, `90d`).

GET also returns **suggested goals** (not persisted) for top work, campaign, or single-platform concentration. The Actions tab **Set goal** button POSTs them.

## UI

| Surface | Component |
|---------|-----------|
| Actions tab cards | `ActionPromptStrip` + merged cards |
| Actions tab goals | `PerformanceGoalsPanel` |
| Work drilldown suggested moves | `deriveWorkDrilldownActions()` (Phase 7) |

## Non-goals (v1)

- AI-generated strategy copy without metric triggers
- Auto-created goals without creator confirmation
- Pre-drafted posts from actions (future Phase 8+ / Studio tier)

## Related

- [PERFORMANCE_INTELLIGENCE_VOCABULARY.md](./PERFORMANCE_INTELLIGENCE_VOCABULARY.md)
- [HUB_HIERARCHY_UI.md](./HUB_HIERARCHY_UI.md)
- [WORK_DRILLDOWN_UI.md](./WORK_DRILLDOWN_UI.md)
