# Analytics Action Center Spec

## Builder Integration

For implementation governance, contracts, and quality gates, pair this spec with:

- Long-term growth analytics phases (beyond v1 cards): [docs/growth-analytics-features.md](docs/growth-analytics-features.md)
- Third-party / supplemental metrics when official APIs are insufficient: [docs/third-party-metrics-sourcing.md](docs/third-party-metrics-sourcing.md)
- [builder-boost-pack/README.md](c:\Users\jorda\Documents\Coding Projects\Rescue\builder-boost-pack\README.md)
- [builder-boost-pack/contracts/events.md](c:\Users\jorda\Documents\Coding Projects\Rescue\builder-boost-pack\contracts\events.md)
- [builder-boost-pack/contracts/api.md](c:\Users\jorda\Documents\Coding Projects\Rescue\builder-boost-pack\contracts\api.md)
- [builder-boost-pack/delivery/definition-of-done.md](c:\Users\jorda\Documents\Coding Projects\Rescue\builder-boost-pack\delivery\definition-of-done.md)

Authority note:
- This document defines product behavior and intent.
- For implementation-level endpoint, payload, and naming details, treat `builder-boost-pack/contracts/*.md` as the source of truth.

## Purpose

Define the analytics-to-action system that turns creator metrics into executable recommendations in the app.

Primary outcome: measurable retention and revenue improvement with one-click execution.

## Product Scope

### In Scope

- Insight generation from creator content and membership data.
- Ranked recommendations with confidence and expected impact.
- One-click actions (draft, schedule, campaign, segment outreach).
- Closed-loop measurement of recommendation outcomes.

### Out of Scope (v1)

- Fully autonomous publishing without creator approval.
- Black-box recommendations without explanation.

## Core UX Pattern

Each Action Center card must include:

1. Signal: what changed.
2. Diagnosis: likely cause(s).
3. Recommendation: concrete next move.
4. Action Button(s): execute now.
5. Expected Impact: projected metric effect and horizon.
6. Confidence and Explainability: why the system believes this.

Example card structure:

- Title: `Cadence Rescue: Tier 2 churn risk`
- Signal: `Churn up 2.3% in 14 days`
- Diagnosis: `Posting cadence fell 3 -> 1; serial theme paused`
- Recommendation: `Schedule 2-part themed drop in next 10 days`
- CTAs: `Generate Drafts`, `Schedule Plan`, `Dismiss`
- Expected impact: `-0.8% to -1.5% churn over 30 days`
- Confidence: `0.74`

## v1 Action Cards (Prioritized)

1. Cadence Rescue
2. Series Continuation Prompt
3. Churn Cohort Save Plan
4. Tier Upgrade Opportunity
5. Win-Back Nudge Campaign
6. Pre-Migration Re-Populate Readiness

## Data Inputs (Pipeline Contracts)

Required upstream domains:

- Creator profile and tier structure.
- Post metadata (publish time, tags/themes, media type, series linkage).
- Membership snapshots (new, active, churned, upgraded/downgraded).
- Engagement signals (if available): likes, comments, opens, clicks.
- Migration campaign metrics (Part 2): delivery, open, click, re-subscribe.

Recommended event contracts:

- `post_published`
- `post_tagged`
- `member_joined`
- `member_churned`
- `member_tier_changed`
- `recommendation_shown`
- `recommendation_accepted`
- `recommendation_executed`
- `recommendation_outcome_evaluated`

## Suggested Service Architecture

- `ingestion-service`: sync Patreon and normalize data.
- `analytics-service`: computes snapshots, cohorts, trends.
- `recommendation-service`: ranks and materializes action cards.
- `action-execution-service`: creates drafts, schedules, campaign jobs.
- `outcome-eval-service`: compares projected vs actual impact.
- `action-center-api`: query cards, card actions, status, history.
- `notification-service`: alerts and reminders.

Queue-backed jobs:

- Nightly feature generation.
- Daily recommendation scoring.
- Near-real-time trigger cards for anomalies.

## API Surface (Example)

- `GET /api/v1/action-center/cards?creator_id=...`
- `POST /api/v1/action-center/cards/{recommendation_id}/accept`
- `POST /api/v1/action-center/cards/{recommendation_id}/execute`
- `POST /api/v1/action-center/cards/{recommendation_id}/dismiss`
- `GET /api/v1/action-center/cards/{recommendation_id}/explanation`
- `GET /api/v1/action-center/history?creator_id=...`

Execution payload example:

```json
{
  "action_type": "generate_post_drafts",
  "options": {
    "count": 2,
    "theme": "continuing story arc",
    "target_tier_ids": ["tier_2"]
  }
}
```

## Recommendation Engine Requirements

Each recommendation must include:

- `confidence_score` (0-1)
- `expected_impact` (metric + range + horizon)
- `reason_codes` (top factors)
- `evidence_refs` (snapshot IDs, post IDs, cohort IDs)

Rules:

- No recommendation shown if confidence is below a configurable threshold.
- High-risk actions (such as mass outreach) require human review before execution.

## Data Model (Minimum)

- `analytics_snapshots`
- `cohort_metrics`
- `content_performance`
- `recommendations`
- `recommendation_actions`
- `recommendation_outcomes`
- `action_center_feedback` (accepted/rejected/dismissed + reason)

## UX Requirements

- Dashboard and Action Center split:
  - Dashboard answers "what happened."
  - Action Center answers "what to do next."
- Filters:
  - by impact area (churn, growth, tier, content)
  - by confidence band
  - by execution effort (quick win vs campaign)
- Required microcopy:
  - plain-language reason
  - "based on last X days" context
  - clear expected upside and downside
- Safety rails:
  - preview required before send or publish
  - undo or rollback where feasible

## Evaluation and Success Metrics

Product KPIs:

- Recommendation acceptance rate.
- Execution completion rate.
- 30 and 60 day lift in retention and re-subscribe conversion.
- Creator weekly active usage of Action Center.
- False-positive recommendation rate.

System KPIs:

- Recommendation freshness SLA (for example, daily by 06:00 creator local time).
- Action job success rate.
- P95 card load latency.

## Rollout Plan

- Phase A: Read-only insights with recommendations.
- Phase B: Assistive execution (draft and schedule).
- Phase C: Campaign orchestration with guarded automation.
- Phase D: Personalization by creator archetype and tier behavior.
