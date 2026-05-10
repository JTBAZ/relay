# Analytics Data Flows — Quick Reference

## 🔄 Event Sources → Insights

```
┌─────────────────────────────────────────────────────────────────┐
│ PATREON (Upstream Truth)                                        │
│ ├─ Webhooks: join, upgrade, downgrade, cancel, rejoin          │
│ ├─ CSV Insights: impressions, seen, likes, comments per post   │
│ └─ OAuth: patron entitlements, tier membership                 │
└──────────────────┬──────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────────┐
│ RELAY DB (P5a Event Tables)                                     │
├─ CreatorMembershipEvent (append-only)                          │
│  └─ (creator_id, patreon_member_id, event_type, tier, @occurred) │
├─ RelayEngagementEvent (append-only)                            │
│  └─ (creator_id, event_type, post_id/media_id, session_key, @)  │
├─ PatreonInsightsImport (headers)                               │
│  └─ (creator_id, file_hash, uploaded_at, label)                │
└─ PatreonInsightsPostMetric (per-post metrics)                  │
   └─ (creator_id, post_id, impressions, seen, likes, comments) │
└──────────────────┬──────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────────┐
│ PRE-COMPUTED SNAPSHOTS (Materialized Views / Batch Jobs)       │
│                                                                 │
│ 🟢 Low-Complexity (Daily, <5ms)                                │
│ ├─ creator_velocity (posts_30d, net_adds_30d, ratio_delta)    │
│ ├─ growth_trend (is_plateau, net_adds_rolling, slope_pct)     │
│ └─ dead_tier_alert (member_ct, post_ct, tenure_months)        │
│                                                                 │
│ 🟡 Medium-Complexity (Nightly, 10–50ms)                        │
│ ├─ tier_engagement_snapshot (engagement_score, member_ct, etc) │
│ └─ tag_retention_cohort (cohort_size, retention%, churn_rate)  │
│                                                                 │
│ 🔴 High-Complexity (Weekly, 50–150ms + cache)                  │
│ ├─ churn_decay_signal (decay_rate_pct, affected_ct)           │
│ ├─ upgrade_driver_signal (tag_id, correlation_score)          │
│ └─ conversion_funnel_snapshot (signup_post_id, signup_ct)      │
└──────────────────┬──────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────────┐
│ DASHBOARD API (/analytics/dashboard?creator_id=...)            │
│                                                                 │
│ Returns: RecommendationCard[] (0–5 cards)                      │
│ - card_type (dead_tier, velocity_mismatch, etc)               │
│ - title, signal, diagnosis, recommendation                     │
│ - confidence_score, expected_impact, evidence_refs            │
│ - status (open, dismissed, accepted, executed)                 │
└──────────────────┬──────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────────┐
│ CREATOR UI (Web Dashboard)                                      │
│ ├─ Scan 3–5 cards in <2 min                                    │
│ ├─ Click card → drill-through (member list, retention curve)   │
│ └─ Action: create post, merge tier, run campaign               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📊 Insight Recipes (Pseudo-SQL)

### **Recipe 1: Dead Tiers**
```sql
-- Daily, ~3ms
INSERT INTO dead_tier_alert
SELECT 
  creator_id, tier_id, tier.title,
  COUNT(DISTINCT tm.id) as member_count,
  COUNT(CASE WHEN p.required_tier_id = t.id THEN 1 END) as exclusive_post_count,
  AVG(EXTRACT(DAY FROM (NOW() - cme.occurred_at))) as avg_tenure_months
FROM Tier t
  LEFT JOIN TenantMembership tm ON ? IN tm.tier_ids
  LEFT JOIN Post p ON p.required_tier_id = t.id
  LEFT JOIN CreatorMembershipEvent cme ON (t.creator_id = cme.creator_id)
WHERE t.creator_id = ?
  AND member_count > 0
  AND exclusive_post_count = 0
  AND avg_tenure_months > 90  -- ~3 months
GROUP BY creator_id, tier_id;
```

### **Recipe 2: Velocity Mismatch**
```sql
-- Daily, <5ms
WITH posts_30d AS (
  SELECT creator_id, COUNT(*) as posts_count
  FROM Post
  WHERE created_at >= NOW() - INTERVAL '30 days'
  GROUP BY creator_id
),
adds_30d AS (
  SELECT creator_id,
    COUNT(CASE WHEN event_type IN ('join', 'rejoin') THEN 1 END) -
    COUNT(CASE WHEN event_type = 'cancel' THEN 1 END) as net_adds
  FROM CreatorMembershipEvent
  WHERE occurred_at >= NOW() - INTERVAL '30 days'
  GROUP BY creator_id
)
INSERT INTO creator_velocity
SELECT 
  p.creator_id,
  p.posts_count,
  a.net_adds,
  CASE 
    WHEN LAG(posts_count) OVER (PARTITION BY p.creator_id ORDER BY?) > 0
      THEN (p.posts_count - LAG(posts_count) OVER (...)) / LAG(posts_count) OVER (...)
    ELSE 0
  END as ratio_delta,
  NOW() as occurred_at
FROM posts_30d p
  JOIN adds_30d a USING (creator_id);
```

### **Recipe 3: Engagement Decay Pre-Churn**
```sql
-- Weekly, ~80ms (cached 3d)
WITH recent_churners AS (
  SELECT DISTINCT patreon_member_id, creator_id, occurred_at
  FROM CreatorMembershipEvent
  WHERE event_type = 'cancel'
    AND occurred_at >= NOW() - INTERVAL '90 days'
),
baseline_views AS (
  SELECT patreon_member_id, creator_id,
    COUNT(*) as baseline_view_count
  FROM RelayEngagementEvent
  WHERE event_type = 'gallery_view'
    AND occurred_at >= NOW() - INTERVAL '180 days'
    AND occurred_at < NOW() - INTERVAL '30 days'  -- Pre-cancel, weeks -12 to -5
  GROUP BY patreon_member_id, creator_id
),
pre_churn_views AS (
  SELECT patreon_member_id, creator_id,
    COUNT(*) as decay_view_count
  FROM RelayEngagementEvent
  WHERE event_type = 'gallery_view'
    AND occurred_at >= NOW() - INTERVAL '30 days'
    AND occurred_at < NOW() - INTERVAL '0 days'   -- Weeks -4 to 0
  GROUP BY patreon_member_id, creator_id
)
INSERT INTO churn_decay_signal
SELECT 
  rc.creator_id,
  DATE_TRUNC('week', rc.occurred_at) as week,
  AVG((b.baseline_view_count - p.decay_view_count) / 
      NULLIF(b.baseline_view_count, 0)) as decay_rate_pct,
  COUNT(*) as affected_ct,
  NOW() as calculated_at
FROM recent_churners rc
  LEFT JOIN baseline_views b USING (patreon_member_id, creator_id)
  LEFT JOIN pre_churn_views p USING (patreon_member_id, creator_id)
WHERE b.baseline_view_count > 5  -- Minimum engagement bar
GROUP BY rc.creator_id, week;
```

### **Recipe 4: Tier Asymmetry**
```sql
-- Nightly, ~15ms (cached 24h)
WITH tier_members AS (
  SELECT creator_id, tier_id, COUNT(DISTINCT patreon_member_id) as member_count
  FROM CreatorMembershipEvent cme
  WHERE event_type IN ('join', 'upgrade')
    AND occurred_at >= NOW() - INTERVAL '90 days'
  GROUP BY creator_id, tier_id
),
tier_tenure AS (
  SELECT creator_id, tier_id, 
    PERCENTILE_CONT(0.5) WITHIN GROUP (
      ORDER BY EXTRACT(DAY FROM (NOW() - occurred_at))
    ) as median_tenure_days
  FROM (SELECT creator_id, tier_id, occurred_at FROM CreatorMembershipEvent WHERE event_type IN ('join', 'rejoin')) x
  GROUP BY creator_id, tier_id
),
upgrade_rate AS (
  SELECT creator_id, tier_id,
    COUNT(CASE WHEN event_type = 'upgrade' THEN 1 END) as upgrade_from_lower_ct
  FROM CreatorMembershipEvent
  WHERE occurred_at >= NOW() - INTERVAL '90 days'
  GROUP BY creator_id, tier_id
),
tier_posts AS (
  SELECT creator_id, required_tier_id, COUNT(*) as post_count
  FROM Post
  GROUP BY creator_id, required_tier_id
)
INSERT INTO tier_engagement_snapshot
SELECT 
  tm.creator_id, tm.tier_id,
  tm.member_count,
  COALESCE(tt.median_tenure_days, 0) as median_tenure_days,
  COALESCE(ur.upgrade_from_lower_ct, 0) as upgrade_from_lower_ct,
  COALESCE(tp.post_count, 0) as post_count,
  tm.member_count * 
    COALESCE(tt.median_tenure_days, 0) *
    (1 + COALESCE(ur.upgrade_from_lower_ct, 0) / NULLIF(tm.member_count, 1)) as engagement_score,
  NOW() as calculated_at
FROM tier_members tm
  LEFT JOIN tier_tenure tt USING (creator_id, tier_id)
  LEFT JOIN upgrade_rate ur USING (creator_id, tier_id)
  LEFT JOIN tier_posts tp ON tm.creator_id = tp.creator_id AND tm.tier_id = tp.required_tier_id;
```

---

## 🔐 Query Performance SLOs

| Insight | Query | Cache | Refresh | P95 Latency |
|---------|-------|-------|---------|------------|
| Dead Tiers | `SELECT * FROM dead_tier_alert WHERE creator_id = ?` | 1d | Daily 2am | <3ms |
| Velocity | `SELECT * FROM creator_velocity WHERE creator_id = ? DESC LIMIT 1` | 1d | Daily | <5ms |
| Plateau | `SELECT * FROM growth_trend WHERE creator_id = ? DESC LIMIT 1` | 1d | Daily | <5ms |
| Asymmetry | `SELECT * FROM tier_engagement_snapshot WHERE creator_id = ? ORDER BY engagement_score DESC` | 24h | Nightly 3am | <15ms |
| Decay | `SELECT * FROM churn_decay_signal WHERE creator_id = ? DESC LIMIT 1` | 3d | Weekly + on-demand | <50ms |
| Drivers | `SELECT * FROM upgrade_driver_signal WHERE creator_id = ? ORDER BY correlation_score DESC LIMIT 5` | 3d | Weekly batch | <100ms |
| Themes | `SELECT * FROM tag_retention_cohort WHERE creator_id = ? ORDER BY churn_rate_pct ASC LIMIT 5` | 24h | Weekly batch | <40ms |
| Funnel | `SELECT * FROM conversion_funnel_snapshot WHERE creator_id = ? DESC LIMIT 1` | 3d | Weekly batch | <80ms |

---

## 📈 Indexing Strategy

```sql
-- Membership events
CREATE INDEX ix_cme_creator_occurred ON creator_membership_events(creator_id, occurred_at DESC);
CREATE INDEX ix_cme_creator_type ON creator_membership_events(creator_id, event_type, occurred_at DESC);

-- Engagement events
CREATE INDEX ix_ree_creator_type ON relay_engagement_events(creator_id, event_type, occurred_at DESC);
CREATE INDEX ix_ree_post_creator ON relay_engagement_events(post_id, creator_id, occurred_at DESC);

-- Posts
CREATE INDEX ix_post_creator_created ON posts(creator_id, created_at DESC);
CREATE INDEX ix_post_required_tier ON posts(required_tier_id, creator_id);

-- Patreon Insights
CREATE INDEX ix_ppm_creator_post ON patreon_insights_post_metrics(creator_id, patreon_post_id);

-- Tiers
CREATE INDEX ix_tier_creator ON tiers(creator_id, amount_cents DESC);

-- Snapshots (fast reads)
CREATE INDEX ix_analytics_creator_kind ON analytics_snapshots(creator_id, kind, period_start DESC);
CREATE INDEX ix_dead_tier_alert_creator ON dead_tier_alert(creator_id, member_count DESC);
CREATE INDEX ix_tier_engagement_creator ON tier_engagement_snapshot(creator_id, engagement_score DESC);
```

---

## 🔄 Refresh Schedules

```
Daily (Batch Job @ 2am UTC):
  └─ dead_tier_alert
  └─ creator_velocity
  └─ growth_trend

Daily (Batch Job @ 3am UTC):
  └─ tier_engagement_snapshot (nightly, but recalc daily for speed)

Weekly (Batch Job @ Sun 12am UTC):
  └─ churn_decay_signal
  └─ upgrade_driver_signal
  └─ tag_retention_cohort
  └─ conversion_funnel_snapshot

On-Demand (API call, cache 3d):
  └─ Any of the above (cache miss triggers refresh)
```

---

## ✅ Data Quality Checks

| Metric | Check | Alert |
|--------|-------|-------|
| CreatorMembershipEvent lag | Last event age > 24h | Webhook sync stalled |
| RelayEngagementEvent lag | Last event age > 6h | Gallery logging paused |
| Session_key sparsity | NULL session_keys > 80% | Session reconstruction unreliable |
| Patreon Insights freshness | Last import > 30d old | CSV manual upload missing |
| Small n (cohort) | n < 10 for insight | Flag "early data"; suppress if needed |
| Creator age | Age < 3 months | Suppress retention insights (survivor bias) |

---

## 🎯 Deployment Checklist

- [ ] Materialized views created & tested
- [ ] Batch jobs scheduled (cron + error handling)
- [ ] Indexes applied (measure query plans before/after)
- [ ] Cache layer configured (Redis / caffeine)
- [ ] Dashboard API endpoint live
- [ ] Error handling: missing data, new creators, sparse events
- [ ] Monitoring: QPS, latency, error rates, batch job duration
- [ ] QA with 5–10 creators
- [ ] Creator feedback loop (card dismiss, action tracking)
