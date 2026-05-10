# Analytics Suite — Executive Summary & Implementation Priorities

## 🎯 What Your Backend Enables

Your P5a infrastructure is battle-tested and ready for a **premium creator insights hub**. You have:

- **Event-sourced truth** (CreatorMembershipEvent, RelayEngagementEvent, PatreonInsightsImport)
- **Robust snapshots** (PatronEntitlementSnapshot, AnalyticsSnapshot with JSON payloads)
- **Proved KPI queries** (membership KPIs, tier stickiness, cohort retention analysis)
- **Live engagement logging** (gallery views, reveal interactions, opaque sessions)
- **Patreon ground truth** (impressions, seen, likes, comments per post + membership lifecycle)

This is **not a data warehouse problem**—it's a *translation problem*: converting raw events into 3–5 **instant, obvious, actionable** cards per creator.

---

## 📊 What Novel Insights Matter Most

### **Tier 1: High-Impact, Low-Risk (Start Here)**

1. **Dead Tiers** ← 3–5ms query; instant payoff
   - "Tier X has N members but zero exclusive content in 4 months"
   - Action: Merge, retire, or schedule exclusive content
   - Data: Tier + Post (tier gating) + CreatorMembershipEvent (member count)

2. **Velocity Mismatch** ← 5ms query
   - "Posting ↑30%, but growth ↓10%"
   - Action: Audit tier pricing, run re-engagement, or embrace higher cadence
   - Data: Post (published_at) + CreatorMembershipEvent (join/cancel)

3. **Growth Plateau** ← 5ms query
   - "Net adds flatline for 8+ weeks despite keeping cadence"
   - Action: New tier, content refresh, or cross-promotion
   - Data: CreatorMembershipEvent (rolling 30d aggregates)

**Why:** These three cards:
- Are instantly cacheable (1d TTL, recalc daily)
- Have zero session fragility (no session_key dependency)
- Catch real strategic issues (dead tiers bleed churn, velocity mismatch signals saturation)
- Cover ~70% of actionable creator problems at pilot scale

---

### **Tier 2: Retention & Conversion (Weeks 5–6)**

4. **Engagement Decay Pre-Churn** ← 50–100ms (cached 3d)
   - "N recent churners showed ↓50% views in weeks before cancel"
   - Action: Re-engagement drip, exclusive content unlock, tier restructure
   - Data: RelayEngagementEvent + CreatorMembershipEvent (cohort analysis)

5. **Tier Asymmetry** ← 10–20ms (cached 24h)
   - "Tier A attracting & retaining; Tier B languishing"
   - Action: Create content for Tier B, or consolidate tiers
   - Data: CreatorMembershipEvent replay + Post (gating) + TierStickiness

6. **Content → Upgrade Drivers** ← 80–150ms (cached 3d, or weekly batch)
   - "Posts tagged {X} drive {N} upgrades; posts tagged {Y} don't"
   - Action: Double down on {X}; rethink {Y}
   - Data: RelayEngagementEvent + CreatorMembershipEvent (upgrade events) + Post (tags)
   - ⚠️ **High-Risk:** Session_key fragility; requires mitigation (confidence flagging, creator validation)

7. **Retention Themes** ← 30–60ms (cached 24h, weekly batch)
   - "Patrons who engage with {TAG} stay +30% longer"
   - Action: Schedule {TAG} series, cross-link
   - Data: RelayEngagementEvent → Post (tags) → CreatorMembershipEvent (tenure, cancel)

---

### **Tier 3: Advanced (Future)**

8. **Discovery Funnel** ← 100–200ms (weekly batch, on-demand cached)
   - "Post X is your top converter (20% of signups came via it)"
   - Action: Feature on landing, cross-link, external promotion
   - Data: RelayEngagementEvent (session path: gallery_view → reveal → join) + Post + CreatorMembershipEvent

---

## 💾 Data Requirements & Readiness

| Event Table | Status | Gaps |
|-----------|--------|------|
| **CreatorMembershipEvent** | ✅ Ingesting | Webhook tested; `to_tiers` payload validated |
| **RelayEngagementEvent** | ✅ Logging | Gallery endpoints enqueuing; session_key optional but fragile |
| **PatreonInsightsImport** | ✅ Optional | Manual CSV upload; flagged as "estimated" if missing |
| **Post** + **PostVersion** | ✅ Available | Tags, tier gating, published_at all present |
| **Tier** | ✅ Available | Real paid vs pseudo (public/all-patrons) distinguished |
| **AnalyticsSnapshot** | ✅ Exists | JSON payload; used by recommendation engine |

**No data gaps.** You can start immediately.

---

## 🏗️ Recommended Build Order (4–6 Weeks)

### **Week 1–2: Foundation (Tier 1 — Dead Tiers, Velocity, Plateau)**

**Effort:** ~40 hours (1 IC, 1 QA)

1. Create dashboard route: `GET /api/v1/analytics/dashboard?creator_id={id}`
   - Returns 3–5 cards (empty list initially)
   - Auth: creator scoped (session or Patreon OAuth + creatorId)
   
2. Build **Dead Tier** query + materialized view
   - `SELECT tier_id, title, member_count, exclusive_post_count, avg_tenure_months FROM dead_tier_alert WHERE creator_id = ?`
   - Refresh: daily (e.g., 2am UTC)
   - Cache: 1d TTL
   
3. Build **Velocity Mismatch** query
   - `SELECT posts_30d, net_adds_30d, ratio_delta FROM creator_velocity WHERE creator_id = ? ORDER BY occurred_at DESC LIMIT 1`
   - Refresh: daily
   - Cache: 1d TTL
   
4. Build **Growth Plateau** query
   - `SELECT is_plateau, net_adds_rolling_30d, slope_pct FROM growth_trend WHERE creator_id = ? ORDER BY occurred_at DESC LIMIT 1`
   - Refresh: daily
   - Cache: 1d TTL

5. Format response as `RecommendationCard` envelope (align with existing types)
6. Test with 5–10 creators (pilot scale)
7. Add drill-through routes (tier member list, growth chart, velocity over time)

**Outcome:** Dashboard shows 0–3 cards. Creators see immediate signals. Data is validated.

---

### **Week 3–4: Tier 1 Polish + Early Tier 2 (Engagement Decay, Tier Asymmetry)**

**Effort:** ~50 hours (1–2 IC)

1. Refine Dead Tier card logic (edge cases: newly created tiers, seasonal variations)
2. Add dismissal logic (card status: open → dismissed, with reason)
3. Build **Engagement Decay** pre-churn cohort
   - Weekly batch: `INSERT INTO churn_decay_signal SELECT creator_id, week, decay_rate_pct, affected_ct FROM ...`
   - Query: `SELECT * FROM churn_decay_signal WHERE creator_id = ? ORDER BY week DESC LIMIT 1`
   - ⚠️ Flag confidence < 0.6 as "estimated" if session_key data is sparse
   
4. Build **Tier Asymmetry** materialized view
   - `SELECT tier_id, engagement_score, member_count, median_tenure_days, post_count FROM tier_engagement_snapshot WHERE creator_id = ?`
   - Refresh: nightly (e.g., 3am UTC)
   - Cache: 24h TTL
   
5. Dashboard now returns 3–5 cards (mix of Tier 1 & early Tier 2)
6. Add Airtable export option (send card to a Rescue project ledger row for ops review)

**Outcome:** Creators see decay signals. Ops can track which insights get acted on.

---

### **Week 5–6: Tier 2 Full (Drivers, Themes, Funnel)**

**Effort:** ~60 hours (2 IC, advanced query work)

1. Build **Content → Upgrade Drivers** correlation engine
   - Weekly batch: trace each upgrader's engagement history; compute tag → upgrade score
   - `INSERT INTO upgrade_driver_signal SELECT creator_id, week, tag_id, correlation_score, upgrade_ct FROM ...`
   - On-demand query: `SELECT * FROM upgrade_driver_signal WHERE creator_id = ? ORDER BY correlation_score DESC`
   - ⚠️ Add session merge heuristic (same user_id + within 1h window = same session)
   - Confidence: `correlation_score` normalized 0–1; flag < 0.6 as estimated
   
2. Build **Retention Themes** cohort
   - Monthly batch: segment patrons by top tag; compute retention % per segment
   - `INSERT INTO tag_retention_cohort SELECT creator_id, month, tag_id, cohort_size, median_tenure_months, churn_rate_pct FROM ...`
   - Query: `SELECT * FROM tag_retention_cohort WHERE creator_id = ? ORDER BY churn_rate_pct ASC`
   
3. Build **Discovery Funnel** attribution (optional, time-permitting)
   - Weekly batch: session path analysis (gallery_view → reveal → join → upgrade)
   - `INSERT INTO conversion_funnel_snapshot SELECT creator_id, week, signup_post_id, signup_ct, upgrade_post_id, upgrade_ct FROM ...`
   
4. Drill-through pages: retention curve (chart over months), funnel steps (session replay sample)

**Outcome:** Dashboard shows 5+ cards. Creators understand "why" (content drivers, retention themes).

---

### **Week 7+: Polish & Scale**

**Effort:** ~30 hours (ongoing)

1. PostgreSQL indexing: `(creator_id, occurred_at)`, `(creator_id, tier_id)`, etc.
2. Materialized view refresh optimization (incremental updates vs full rebuild)
3. Cache layer: Redis or in-process (caffeine) for < 100ms response
4. Card reordering: A/B test by confidence vs impact
5. Admin panel: dismiss insights, re-run batches, view audit log
6. Drill-through animations, loading states, error handling
7. Scale to 50–200 creators

---

## 🚨 Key Implementation Decisions

### **Session Reconstruction (Fragility)**

**Problem:** RelayEngagementEvent.session_key is optional & fragile. Multi-device patrons may have split sessions. If logging gaps occur, attribution is biased.

**Mitigation:**
1. Implement session merge heuristic: `(same user_id + occurred_at within 1h) = same session`
2. Flag insights with `confidence < 0.6` as "estimated"
3. Recommend creators validate via Patreon Insights side-by-side
4. Plan for future: permanent session ID (not opaque key)

### **Cohort Bias (High-Risk)**

**Problem:** Churned members are gone. You can only measure retention of *survivors*. New creators with few cohorts have small n.

**Mitigation:**
1. Show sample size & confidence interval on every card
2. Suppress insights if `n < 10` 
3. Flag "early data" if creator age < 3 months
4. Retry insight weekly as n grows

### **Attribution Window**

**Problem:** Did post X cause the join, or was the join imminent and the post coincidental?

**Mitigation:**
1. Use wide pre-join window (7d backward) but flag as conservative
2. Show session-level detail (creator can audit)
3. Recommend A/B testing (post blitz vs silence) to validate

---

## 📋 Checklist for Launch

- [ ] Dashboard route deployed & scaled to 10+ concurrent creators
- [ ] 3–5 cards showing (Dead Tiers, Velocity, Plateau minimum)
- [ ] Drill-through pages working (member lists, growth chart)
- [ ] Cache layer in place (< 100ms p99 response time)
- [ ] Airtable export working (card → ledger row)
- [ ] Dismissal logic tested (card status transitions)
- [ ] Error handling (missing data, sparse events, new creators)
- [ ] QA sign-off (5–10 creators tested)
- [ ] Creator UX feedback collected & actioned
- [ ] Monitoring in place (QPS, latency, error rates)

---

## 💡 Success Metrics

| Metric | Target | Rationale |
|--------|--------|-----------|
| **Cards shown per creator** | 2–5 avg | Scannable; not overloaded |
| **Card act-on rate** | >30% (creator takes action within 2 weeks) | Proves actionability |
| **Drill-through rate** | >40% (creator clicks into detail) | Proves curiosity + trust |
| **Dashboard load time** | <100ms p99 | Instant feel |
| **Creator satisfaction** | >4/5 (post-interaction survey) | Validates value |

---

## 🔗 Related Docs

- **`docs/analytics/ANALYTICS_READINESS.md`** — Full technical breakdown (8 insights, formulas, complexity ratings)
- **`src/analytics/types.ts`** — Existing RecommendationCard & AnalyticsSnapshot types
- **`src/analytics/recommendation-engine.ts`** — Current 3-card scoring logic (extend here)
- **`src/analytics/creator-membership-kpis.ts`** — KPI query examples (reference)
- **`prisma/schema.prisma`** — CreatorMembershipEvent, RelayEngagementEvent, AnalyticsSnapshot models
