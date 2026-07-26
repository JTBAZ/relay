# Relay Analytics Suite — Backend Readiness & Novel Insights

> **Scope:** P5a pilot; data infrastructure analysis for creator insights hub. **Goal:** Instant, obvious, actionable metrics—not dense dashboards.

---

## Part 1: Current Data Infrastructure

### 🗂️ **Event Tables (P5a Foundation)**

| Table | Grain | Row Estimate | Relationships | Use |
|-------|----|----|---|---|
| **CreatorMembershipEvent** | `(creator_id, patreon_member_id, event_type, occurred_at)` | ~100–500K rows/creator/year | → `Tier` (tier_id), → past events | Membership lifecycle: join, upgrade, downgrade, cancel, rejoin |
| **PatreonInsightsPostMetric** | `(creator_id, patreon_post_id, import_id)` | ~500–2K rows/creator | → `Post` (post_id), → `PatreonInsightsImport` | Impressions, seen, likes, comments per post per import |
| **RelayEngagementEvent** | `(creator_id, event_type, occurred_at, post_id/media_id)` | ~1–50K rows/creator/month | → `Post`, → `MediaAsset`, opaque session_key | Gallery view, reveal, profile view (first-party) |
| **PatreonInsightsImport** | `(creator_id, file_hash, uploaded_at)` | ~10–50 rows/creator | → many PatreonInsightsPostMetric | Header: when Patreon CSV was uploaded |

### 🔗 **Existing Snapshot & Lookup Tables**

| Table | Purpose | Grain | Notes |
|-------|---------|-------|-------|
| **AnalyticsSnapshot** | Point-in-time rollup (posting cadence, top tags, tier counts) | Per-creator snapshot | JSON payload; `estimated` flag; used by recommendation engine |
| **PatronEntitlementSnapshot** | Cached patron tier entitlements | `(patron_user_id, relay_creator_id, asOf)` | Stale-after window; snapshot_tier_ids for historical checks |
| **Post** + **PostVersion** | Content metadata | Post ID + version seq | `created_at`, `is_public`, `required_tier_id`, `tags`, `published_at` |
| **Tier** | Access tier catalog | Creator × tier ID | `amount_cents`, `title`, real paid vs pseudo (public/all-patrons) |
| **PatronFavorite** | Patron saved items | `(patron_id, creator_id, target_kind, target_id)` | `snapshot_tier_ids` = tiers at favorite time (historical ref only) |
| **PatronFollow** | Patron social graph | `(follower_id, following_id)` | Seeded from OAuth or worker; not creator-scoped |
| **UsageEvent** | Metering append-only | `(tenant_id, metric, quantity, occurred_at)` | For billing / throttling signals |

---

## Part 2: Currently Computed Insights

### ✅ **In `AnalyticsSnapshot` (Recommendation Engine Inputs)**

| Metric | Type | Calculation | Use |
|--------|------|-------------|-----|
| **posting_cadence_30d** | Int | Count active posts in last 30d | Cadence rescue card trigger (< 4 → recommend) |
| **active_tiers** | Int | Count tiers with ≥1 patron | Tier upgrade opportunity signal |
| **top_tags** | Array[{tag_id, count}] | Tag frequency across posts | Series continuation card (density ≥ 2 posts → recommend) |
| **tier_content_counts** | Array[{tier_id, posts}] | Posts per tier (gated) | Tier concentration ratio (if >55% in one tier → upgrade recommend) |
| **total_posts** | Int | Active posts in canonical | Sanity check for small creators |
| **total_media** | Int | Media assets linked | Content richness signal |

### ✅ **In `RecommendationCard` (Current & Future)**

| Card Type | Trigger | Confidence | Metric | Horizon |
|-----------|---------|------------|--------|---------|
| **cadence_rescue** | Posting < 4 in 30d | 0.4–0.95 | `churn_rate` delta: -0.008 to -0.015 | 30d |
| **series_continuation** | Top tag count ≥ 2 | 0.45–0.88 | `returning_viewer_rate` delta: +0.01 to +0.04 | 30d |
| **tier_upgrade_opportunity** | >55% posts in one tier + ≥3 posts total | 0.62 | `tier_upgrade_rate` delta: +0.005 to +0.02 | 60d |
| **churn_cohort_save** | (Stubbed; not yet scored) | — | Retention % | — |
| **win_back_nudge** | (Stubbed) | — | `reactivation_rate` | — |

### ✅ **In KPI Queries (Available Now)**

- **CreatorMembershipKpis** — active members, free/paid split, event counts (join/rejoin/upgrade/downgrade/cancel), net growth
- **TierStickiness** — per-tier tenure median, churn proxy, member count
- **CreatorMembershipCohortRetention** — retention % by join month × months-since-join
- **PostPerformance** — Patreon Insights rows matched to Relay Posts (gap analysis)

---

## Part 3: Novel High-Value Insights (Not Yet Computed)

> ⚠️ **Constraint:** Each insight must be **instant** (<100ms query + render), **obvious** (one metric + trend), **actionable** (creator has a clear decision), and **not dense** (max 5 cards total in hub).

---

### 🎯 **Insight 1: Tier Performance Asymmetry** 
**Signal:** One tier is attracting & retaining members while others languish.

| Field | Value |
|-------|-------|
| **Calculation** | Per tier: (1) patron count, (2) median tenure, (3) upgrade-to rate (cancel → upgrade), (4) content investment (posts gated to this tier). Rank tiers by engagement score = member_count × median_tenure × (1 + upgrade_from_lower) |
| **Trigger** | `engagement_score[tier_N] < 0.2 × engagement_score[tier_max]` for ≥2 months |
| **Card Title** | "Tier {T_low} underperforming — {N} members, {X} days avg tenure vs {T_high}'s {M} members, {Y} days" |
| **Recommended Action** | Create content exclusively for {T_low}; or restructure (merge, price adjust, retire). Show last 3 posts for that tier (creators remember visually). |
| **Data Source** | CreatorMembershipEvent (replay) + Post (tier gating) |
| **Query Complexity** | **Medium** — Pre-compute monthly rolling tiers; join with post counts. ~10–20ms per creator. |
| **Pre-compute Strategy** | Materialized view: `tier_engagement_snapshot(creator_id, tier_id, month, patron_count, median_tenure_days, upgrade_from_lower_ct, post_count)` ← updated async after each CreatorMembershipEvent sync. |

---

### 🎯 **Insight 2: Content → Upgrade Drivers**
**Signal:** Specific posts (or post attributes) correlate with tier upgrades.

| Field | Value |
|-------|-------|
| **Calculation** | (1) For each patron who upgraded in window: trace back to last 10 posts they viewed (from RelayEngagementEvent). (2) Tag overlap & tier gating of those posts vs. posts viewed pre-upgrade but no upgrade. (3) Correlation score per tag / tier combo. |
| **Trigger** | `correlation_score > 0.6` for a tag or tier-gated content type |
| **Card Title** | "Content driver: {TAG} posts drive upgrades — {N} upgrades traced to this theme" |
| **Recommended Action** | "Produce more {TAG} content at {tier_A}; it's your conversion engine." Show top 2 posts by engagement. |
| **Data Source** | RelayEngagementEvent (gallery_view) + CreatorMembershipEvent (upgrade) + Post (tags, tier) + PatreonInsightsPostMetric (impressions/seen) |
| **Query Complexity** | **High** — Requires session reconstruction (session_key fragility). Cohort bias risk if engagement event logging is spotty. ~50–100ms. |
| **Pre-compute Strategy** | Score weekly: for each patron, find upgrade events; backtrack 30d of engagement events; compute tag → upgrade correlation. Store in `upgrade_driver_signal(creator_id, week, tag_id, correlation_score, upgrade_ct, example_post_ids)`. |

---

### 🎯 **Insight 3: Creator Velocity vs Subscriber Velocity Mismatch**
**Signal:** Creator is posting more/less frequently than subscriber base is joining/upgrading.

| Field | Value |
|-------|-------|
| **Calculation** | (1) Posts per 30d (rolling cadence). (2) Net membership adds per 30d (join + rejoin − cancel). (3) Delta from baseline (creator's own historical ratio). (4) Flag when delta > 2x or < 0.5x. |
| **Trigger** | Creator posts ↑ 50% but adds ↓ 10%; or posts ↓ 50% but adds ↑ 30%. |
| **Card Title** | "Velocity mismatch: {+50% posts, but −10% growth} — Consider: audience saturation, tier misalignment, or timing." |
| **Recommended Action** | (If ↑ posts, ↓ growth) Tier audit, re-engagement campaign. (If ↓ posts, ↑ growth) Leverage momentum—schedule post blitz. |
| **Data Source** | Post (published_at) + CreatorMembershipEvent (join/cancel) |
| **Query Complexity** | **Low** — Just count + windowed averages. ~5ms. |
| **Pre-compute Strategy** | Rolling 30-day stats: `creator_velocity(creator_id, month, posts_count, net_adds, ratio_delta)`. Update daily. |

---

### 🎯 **Insight 4: Engagement Decay Pre-Churn**
**Signal:** Patron gallery views drop off 2–4 weeks before they cancel.

| Field | Value |
|-------|-------|
| **Calculation** | (1) Find all cancellations in last 90d. (2) For each, trace backward: engagement events (gallery_view count) in weeks -4, -3, -2, -1 vs weeks -12 to -5 baseline. (3) Compute decay rate (% decline). (4) Cohort by tier; flag if >30% of cancellations show >50% engagement decay. |
| **Trigger** | `(baseline_views − week_minus_2_views) / baseline_views > 0.5` in ≥30% of recent churners |
| **Card Title** | "Churn signal: {N} recent departures showed low engagement weeks prior—re-engage with {TAG} or tier-exclusive post." |
| **Recommended Action** | Proactive: segment low-engagement patrons; drip campaign or exclusive post unlock. |
| **Data Source** | RelayEngagementEvent (gallery_view, profile_view) + CreatorMembershipEvent (cancel) |
| **Query Complexity** | **High** — Session reconstruction + cohort analysis. Fragile if session_key is inconsistent. ~50–100ms. |
| **Pre-compute Strategy** | Weekly churn cohort analysis: `churn_decay_signal(creator_id, week, decay_rate_pct, affected_ct, suggested_action)`. Materialize decay curve for drill-through. |

---

### 🎯 **Insight 5: Dead Tiers (No Engagement, No Content)**
**Signal:** A tier has patrons but zero gated posts and minimal engagement.

| Field | Value |
|-------|-------|
| **Calculation** | Per tier: (1) member count > 0. (2) Posts exclusively gated to this tier = 0. (3) Avg engagement (gallery views for this tier's exclusive content) = 0 or near-zero. (4) Tenure = long (>6 months with no new content). |
| **Trigger** | `patron_count > 0 AND exclusive_post_count = 0 AND avg_tenure_months > 3` |
| **Card Title** | "Dead tier: {TIER_NAME} has {N} members but no exclusive content—at risk of churn." |
| **Recommended Action** | Merge tier into lower/higher, or create 3 exclusive posts in 2 weeks; else consider retiring. |
| **Data Source** | Tier + Post (required_tier_id) + CreatorMembershipEvent (member count by tier) |
| **Query Complexity** | **Low** — Simple join + count. ~3ms. |
| **Pre-compute Strategy** | Monthly: `dead_tier_alert(creator_id, tier_id, tier_name, member_count, exclusive_post_count, avg_tenure_months)`. |

---

### 🎯 **Insight 6: Content Themes & Retention Correlation**
**Signal:** Patrons who engage with certain tags/themes stay longer.

| Field | Value |
|-------|-------|
| **Calculation** | (1) Segment patrons by top tag in their view history (e.g., {TAGS}). (2) For each segment, compute median tenure, churn rate. (3) Identify tags with >20% retention advantage. |
| **Trigger** | `retention_rate[tag_A] > 1.2 × retention_rate[tag_median]` |
| **Card Title** | "Retention theme: Patrons who engage with '{TAG}' stay {+30% longer} — Double down." |
| **Recommended Action** | Schedule {TAG} series; cross-promote in other posts. |
| **Data Source** | RelayEngagementEvent (gallery_view) + Post (tags) + CreatorMembershipEvent (tenure, cancel) |
| **Query Complexity** | **Medium-High** — Requires session grouping & cohort survival analysis. ~30–60ms. |
| **Pre-compute Strategy** | Monthly cohort: `tag_retention_cohort(creator_id, tag_id, member_cohort_size, median_tenure_months, churn_rate_pct)`. |

---

### 🎯 **Insight 7: Growth Plateau Detection**
**Signal:** Creator's net adds have plateaued despite maintaining posting cadence.

| Field | Value |
|-------|-------|
| **Calculation** | (1) Compute rolling 30-day net adds over last 6 months. (2) Fit linear trend; if slope ≈ 0 and std dev low, flag as plateau. (3) Check if seasonal or structural. |
| **Trigger** | Rolling 30d net adds ≈ flat over 8+ weeks + cadence ≥ baseline |
| **Card Title** | "Growth plateau: {N} net adds/month for 8 weeks—consider new tier, content refresh, or promotion." |
| **Recommended Action** | Audience research (survey?), A/B new tier price/benefit, or cross-promote with other creators. |
| **Data Source** | CreatorMembershipEvent (join/rejoin/cancel) |
| **Query Complexity** | **Low** — Windowed aggregates + linear fit. ~5ms. |
| **Pre-compute Strategy** | Daily: `growth_trend(creator_id, net_adds_30d_rolling, slope_pct, is_plateau, season_hint)`. |

---

### 🎯 **Insight 8: Patron Discovery Funnel** 
**Signal:** How do anonymous visitors → patrons → higher tiers? What content routes them?

| Field | Value |
|-------|-------|
| **Calculation** | (1) Trace session path: gallery_view on public post → reveal_interaction (click paywall) → patron join (via OAuth). (2) Identify "conversion post" (last viewed before join). (3) Aggregate: % of new joins came via {TAG} / {post_id}. (4) For upgraders: trace path to upgrade trigger. |
| **Trigger** | `(signup_from_post_A / total_signups) > 0.15` OR `(upgrade_from_tier_B_post / total_upgrades) > 0.2` |
| **Card Title** | "Conversion post: {POST_TITLE} brought {N} new patrons — Promote via {CHANNEL} or cross-link." |
| **Recommended Action** | Feature this post on landing page; cross-link from similar posts; run creator podcast / external promo. |
| **Data Source** | RelayEngagementEvent (gallery_view, reveal_interaction) + CreatorMembershipEvent (join) + Post (title, tags) |
| **Query Complexity** | **High** — Session reconstruction; attribution window bias. ~80–150ms. |
| **Pre-compute Strategy** | Weekly: `conversion_funnel_snapshot(creator_id, week, signup_post_id, signup_post_title, signup_ct, upgrade_post_id, upgrade_ct, confidence_pct)`. |

---

## Part 4: Simplification Rules (Density Guardrails)

### **Hub Display Constraints**

| Guideline | Rule | Rationale |
|-----------|------|-----------|
| **Card Limit** | Max 5 cards per creator view | Scannable in <2 min; avoid overwhelm |
| **Metric Per Card** | 1 headline metric + optional trend | Clarity over complexity |
| **Actionability** | Every card must answer "What do I do?" | No diagnostic-only insights |
| **Phrasing** | No raw counts; use deltas, % changes, or ranks | "↑30% vs last month" vs "{N} posts in 30d" |
| **Context** | Include 1–2 supporting examples (post titles, tag names, tier names) | Visual anchors help creators understand |
| **Call-to-Action** | Explicit action or next step | "Schedule 2 posts in next 10d" vs. "Consider posting" |
| **Drill-through** | Link to detail page (post performance, member list, etc.) | Support exploration without surfacing it in the card |

### **Query Performance SLOs**

| Complexity | Target QPS | Caching Strategy | Refresh Cadence |
|------------|-----------|------------------|-----------------|
| **Low** (velocity, dead tiers, plateau) | <5ms | 1-day cache + event-triggered invalidation | Hourly recompute, cache miss OK |
| **Medium** (tier asymmetry, theme retention) | 10–50ms | 24-hour cache | Nightly batch, cache on-miss |
| **High** (upgrade drivers, decay, funnel) | 50–150ms | 3-day cache + sampling | Weekly batch + on-demand (slower path) |

### **Data Quality Dependencies**

| Insight Type | Critical Data | Fallback |
|--------------|----------------|----------|
| **Membership events** | CreatorMembershipEvent must be in sync from Patreon webhook | Use file-backed events if Prisma is down |
| **Engagement events** | RelayEngagementEvent (first-party) must log consistently | Estimated from Patreon Insights if Relay logging gaps exist |
| **Patreon Insights** | CSV imports are manual + optional | Flag as "estimated" if no recent import |
| **Session reconstruction** | Session_key consistency is fragile | Cohort bias flagged; degrade to "engagement direction" (up/down) if session data is sparse |

---

## Part 5: Implementation Roadmap (4 Phases)

### 📅 **Phase 1: Foundation (Weeks 1–2)**

- [ ] Verify P5a schema (`CreatorMembershipEvent`, `RelayEngagementEvent`, `PatreonInsightsImport`/Metric) is deployed
- [ ] Test CreatorMembershipEvent sync from Patreon webhook (join, upgrade, cancel)
- [ ] Test RelayEngagementEvent logging from gallery endpoints (gallery_view, reveal_interaction, profile_view)
- [ ] Stub analytics dashboard route (`/api/v1/analytics/dashboard?creator_id=...`)
- [ ] Add basic error handling & rate-limit protection
- **Output:** Dashboards route returns empty card list (no errors); events are flowing to DB.

---

### 📅 **Phase 2: First Insights (Weeks 3–4)**

**Goal:** Deploy 3 low-complexity, high-confidence insights to validate the hub experience.

- [ ] **Dead Tiers** — Materialized view + query (3ms); daily refresh
- [ ] **Velocity Mismatch** — Rolling stats, 5ms query; daily refresh
- [ ] **Engagement Decay** — Weekly cohort snapshot; 50ms query with cache
- [ ] Dashboard returns 3 cards (or fewer if not applicable)
- [ ] Card drill-through routes (e.g., `/creator/tier/{tier_id}/members`, `/creator/growth-analysis`)
- **Output:** First creators see actionable alerts; confidence in data is building.

---

### 📅 **Phase 3: Correlation & Cohort (Weeks 5–6)**

**Goal:** Unlock retention & conversion insights.

- [ ] **Tier Asymmetry** — Medium-complexity join; nightly batch
- [ ] **Content → Upgrade Drivers** — Session reconstruction + correlation (weekly batch, on-demand 50–100ms path)
- [ ] **Retention Themes** — Tag-based cohort survival (weekly batch)
- [ ] **Discovery Funnel** — Attribution window analysis (weekly batch)
- [ ] Drill-through pages for cohort inspection (retention curves, funnel steps)
- **Output:** Creators see "why" behind metrics; confident in strategic decisions.

---

### 📅 **Phase 4: Polish & Performance (Weeks 7+)**

**Goal:** Production-ready, fast, and delightful.

- [ ] Add PostgreSQL indexes on frequently filtered columns (creator_id, tier_id, occurred_at)
- [ ] Implement materialized views for all pre-computed insights
- [ ] Cache layer (Redis or in-memory) for high-QPS insights
- [ ] Drill-through animations & loading states
- [ ] A/B test card ordering (by confidence? by impact?)
- [ ] Admin panel to manually dismiss insights (false positives)
- [ ] Export recommendations to Airtable (for cross-team review)
- **Output:** Sub-100ms load times; creators trust and act on insights.

---

## Part 6: Risk & Complexity Assessment

### ⚠️ **High-Risk Insights**

| Insight | Risk | Mitigation |
|---------|------|-----------|
| **Upgrade Drivers** | Session fragility: if session_key logging is spotty, attribution is biased. Patients with multi-device access may have split sessions. | (1) Flag confidence < 0.6 as "estimated." (2) Recommend creators validate in Patreon Insights (side-by-side). (3) Implement session merging heuristic (same user_id + within 1h). |
| **Cohort Retention** | Survivor bias: churned members are gone, so we can only track those who stayed. New creators with few cohorts have small n. | (1) Show sample size & confidence interval. (2) Suppress insights if n < 10. (3) Flag "early data" if creator < 3 months old. |
| **Funnel Attribution** | Window bias: did the post cause the join, or was the join imminent and the post was incidental? | (1) Use wide attribution window (7d pre-join) but flag as conservative. (2) Show session-level detail (creator can audit). (3) Recommend A/B testing (post blitz vs. silence). |

### 📊 **Complexity & QPS Breakdown**

| Insight | Query Complexity | ~QPS | Caching | Risk Level |
|---------|------------------|------|---------|-----------|
| Dead Tiers | 3 joins, 1 count, simple filter | <3ms | 1d | 🟢 Low |
| Velocity Mismatch | 2 windowed counts + math | <5ms | 1d | 🟢 Low |
| Tier Asymmetry | Member ledger replay + rank | 10–20ms | 24h | 🟡 Medium |
| Growth Plateau | Rolling sum + linear fit | <5ms | 1d | 🟢 Low |
| Engagement Decay | Session grouping + survival curve | 50–100ms | 3d | 🔴 High |
| Upgrade Drivers | Session attribution + correlation | 80–150ms | 3d | 🔴 High |
| Retention Themes | Cohort survival grouped by tag | 30–60ms | 1d | 🟡 Medium |
| Discovery Funnel | Multi-step funnel + attribution | 100–200ms | 3d | 🔴 High |

### **Estimated Load (Pilot: 10–100 Creators)**

- **Daily queries:** ~100 dashboards loads = ~500 cache misses = ~2s total compute (spread)
- **Weekly batch jobs:** ~10 pre-computations × 30–50ms each = ~500ms
- **Storage overhead:** ~100 creators × 8 insights × 52 weeks = ~42K snapshot rows (~5MB)

**Conclusion:** Feasible on modest PostgreSQL + optional Redis cache layer.

---

## Part 7: Summary Table — What You Have vs. What's Missing

| Category | Available Now | Missing (High Value) |
|----------|---------------|----------------------|
| **Membership** | Join/cancel counts; tier distribution | Decay pre-churn; re-engagement signals; velocity mismatch |
| **Content** | Posting cadence; tag frequency | Conversion post tracking; content-theme retention |
| **Engagement** | Gallery views, reveals (first-party) | Session reconstruction; discovery funnel; engagement decay curve |
| **Patreon Insights** | Imports + per-post metrics (impressions, likes) | Linked analysis: content type → insights correlation |
| **Recommendations** | 3 cards: cadence, series, tier concentration | 5+ novel cards: dead tiers, velocity, decay, drivers, themes, plateau, funnel |

---

## Conclusion

Your backend is **well-prepared** for a robust analytics hub:

✅ **P5a event infrastructure** is in place (CreatorMembershipEvent, RelayEngagementEvent, Patreon Insights import).  
✅ **Existing KPI queries** are mature (membership KPIs, tier stickiness, cohort retention).  
✅ **Recommendation engine** has a foundation (3 cards working; can extend to 8+).  

🎯 **High-Value Wins to Add (4–6 weeks):**
1. Dead tier & velocity mismatch alerts (instant, obvious, low-risk)
2. Engagement decay + re-engagement nudges (medium-risk, high-impact)
3. Upgrade driver attribution + retention themes (high-risk, unlock strategic thinking)
4. Discovery funnel & growth plateau (complete the picture)

**Key Constraint:** Keep insights **dense-free**, **actionable**, and **fast**. A creator should scan the hub in <2 min, see 3–5 cards, and know their next move.
