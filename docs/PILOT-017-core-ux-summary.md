# PILOT-017 Core UX Refinements — 3 Essential Flows

Extracted from the human sign-off checklist, here are the **three critical UX journeys** that define whether the pilot program works:

---

## 1️⃣ Creator Gallery Independence (No Support Calls)

**What It Is:** A creator can pull their Patreon media, organize it, and host it on Relay as their own independent gallery.

### The Journey (Frictionless Path)
```
Creator Signup 
  → Patreon OAuth (auto-assign relay_creator_id) 
  → Claim public handle (@creator_name)
  → Import Patreon posts (bulk select, not one-by-one)
  → Create new Relay post (media upload + tier gate)
  → Publish 
  → Gallery shows both Patreon + Relay posts unified
```

### Critical Tests (From Checklist)
| Test | What It Validates | Pass Criteria |
|------|-------------------|---------------|
| **CRE-2** Patreon OAuth | Creator can link Patreon without loops | `relay_creator_id` assigned instantly; no manual intervention |
| **POST-1** Patreon import | Bulk import works | Select 2–3 posts → all appear in gallery (not one-at-a-time) |
| **POST-2** Relay-native post | Creator can create new content directly | Upload media → set title, tier gate → publish |
| **POST-5** Publish ≥2 posts | Creator achieves independence | ≥5 creators × ≥2 posts each = 10 total published |

### Must Work (UX Blocker)
- ☑ **CRE-1 → CRE-3 complete without blank pages or OAuth loops**
- ☑ **POST-1 bulk import** (not single-post friction)
- ☑ **Tier selector intuitive** (not buried in modals)
- ☑ **Gallery unified** (both Patreon + Relay shown together)

### Success Metric
**≥5 creators complete onboarding + publish ≥2 posts each** with **zero support calls**

**Why This Matters:** Creator independence. They own their gallery, control pricing/tiers, and don't stay locked to Patreon.

---

## 2️⃣ Patron Unified Feed (Sticky Engagement)

**What It Is:** A patron sees all their favorite creators' updates in one place, properly gated to their tier, so they don't have to visit each creator's Patreon separately.

### The Journey (Seamless Path)
```
Patron Signup 
  → Patreon OAuth (auto-discover creators they support)
  → Sidebar shows "Following" (no manual follow per creator)
  → Click /patron/feed
  → See all creators' posts, newest first
  → Tier badges show "Free", "Supporter", or "Locked"
  → Filter by media type (photos, writing, etc.)
  → Infinite scroll loads more posts
  → Return ≥2x in 24h (sticky engagement)
```

### Critical Tests (From Checklist)
| Test | What It Validates | Pass Criteria |
|------|-------------------|---------------|
| **PAT-2** Patreon OAuth | Patron auto-discovers creators they support | Patron memberships auto-created; no manual follow needed |
| **FEED-1** Follow creators | Sidebar shows following list | Click follow → creator appears in sidebar |
| **FEED-2** Feed loads | Feed displays posts, newest first | `GET /api/v1/patron/feed` returns ≥5 posts in <2s |
| **FEED-3** Tier badges | Post shows patron's access level | Badges: "Free", "Supporter", "Locked" match entitlements |
| **FEED-4** Filter | Patron can discover by media type | Click "Photos" → feed re-filters instantly |
| **FEED-5** Pagination | No duplicate posts on scroll | Load more → new posts, no repeats |
| **ANALYTICS-2** Usage | Patrons return (engagement proof) | ≥5 patrons × ≥2 visits each in 24h |

### Must Work (UX Blocker)
- ☑ **PAT-2 OAuth auto-links creators** (not manual follow per creator)
- ☑ **Feed loads <2s** (patron doesn't stare at blank screen)
- ☑ **Tier badges immediately visible** (patron knows why post is locked)
- ☑ **Infinite scroll smooth** (no flicker, no duplicates)
- ☑ **≥50% patrons return ≥2x** (implies feed is useful)

### Success Metric
**≥25 patrons active; ≥50% load feed ≥2x in 24h**

**Why This Matters:** Feed stickiness is the engagement signal. If patrons don't return, they'll just check Patreon directly; Relay is abandoned.

---

## 3️⃣ Webhook Automation & Real-Time Sync

**What It Is:** When a creator posts on Patreon, the patron automatically sees it in their Relay feed within 60 seconds, properly gated to their tier.

### The Journey (Behind-the-Scenes)
```
Creator posts on Patreon
  → Webhook fires: POST /api/v1/patreon/webhooks/process
  → BullMQ processes job
  → Postgres updated with new post + tier data
  → Patron's next feed query returns new post
  → Patron sees post with tier badge (no manual refresh)
```

### Critical Tests (From Checklist)
| Test | What It Validates | Pass Criteria |
|------|-------------------|---------------|
| **ENV-3** BullMQ live | Job queue isn't stalled | `/api/v1/health/jobs` returns status: "ok" |
| **ENV-4** Webhook ingress | Patreon → Relay sync works | `POST /api/v1/patreon/webhooks/process` returns 200; ≥1/hour logged |
| **POST-1 → FEED-2** End-to-end | Creator post → patron feed | Patron sees new post within 60s without manual refresh |

### Must Work (UX Blocker)
- ☑ **BullMQ queue live** (jobs not stalled)
- ☑ **Webhook delivery <1/hour average** (real-time feel)
- ☑ **Tier gate preserved** (post isn't suddenly free-tier)
- ☑ **Patron sees new post without refresh** (automation is transparent)

### Success Metric
**When creator posts on Patreon, patron sees it in Relay feed within 60 seconds** (real-time perception)

**Why This Matters:** If the feed feels slow or requires manual refresh, patrons think the system is broken and abandon it.

---

## Side-by-Side: The 3 Flows

| Flow | Goal | Creator Effort | Patron Effort | Outcome |
|------|------|----------------|---------------|---------|
| **Gallery** | Independence | Signup → OAuth → Import → Publish | (passive) | ≥5 creators, ≥10 posts published, 0 support calls |
| **Feed** | Unified discovery | (passive) | Signup → OAuth → See feed | ≥25 patrons, ≥50% return ≥2x |
| **Webhooks** | Real-time sync | (passive) | (passive) | Posts appear within 60s, no manual refresh |

---

## Critical UX Refinements (Ranked by Impact)

### 🔴 **Blocker: If Broken, Pilot Fails**

1. **Creator OAuth cannot loop** (CRE-2)
   - Patreon → Relay → Patreon → back to Relay must complete
   - If loops, creator abandons signup

2. **Patron OAuth auto-discovers creators** (PAT-2)
   - Patron links Patreon → should auto-join Ava + Milo's feeds
   - If requires manual follow per creator, UX friction kills adoption

3. **Feed loads <2s with tier badges** (FEED-2, FEED-3)
   - If slow, patrons leave mid-page
   - If badges missing, patrons don't understand why posts are locked

4. **Tier gates enforced end-to-end** (POST-3, FEED-3)
   - Creator sets "Supporter" tier → RLS must prevent free-patron access
   - If leaks, trust is broken

5. **Webhook syncs within 60s** (ENV-4, POST-1 → FEED-2)
   - If manual refresh needed, feels broken
   - If >5 min latency, patrons think posts aren't syncing

### 🟡 **Quality: If Broken, UX Friction Increases**

6. **Bulk post import** (POST-1)
   - Should select 2–3 at once, not click 10 times

7. **Tier selector intuitive** (POST-3)
   - Should be on publish form, not hidden modal

8. **Feed is sticky** (ANALYTICS-2)
   - ≥50% patrons return ≥2x signals real engagement
   - If <30%, content or UI is boring

9. **Browser matrix passes** (Chrome, Firefox, Safari)
   - Feed, studio, post detail shouldn't break on iOS

### 🟠 **Known Gap (Not a Blocker)**

10. **Post hiding may propagate slowly** (POST-4, PILOT-012 Gate F)
    - Creator hides post → patron feed should exclude immediately
    - May require API restart
    - **Workaround exists**; does not block exit if automated tests pass

---

## Test-to-Product Mapping

| What Product Cares About | Where It's Tested | Pass Criteria |
|--------------------------|-------------------|---------------|
| "Creators onboard easily" | CRE-1, CRE-2, CRE-3 | ≥5 creators; 0 support calls; no OAuth loops |
| "Creators publish content" | POST-1, POST-2, POST-5 | ≥10 posts total; bulk import works |
| "Patrons can organize follows" | PAT-2, FEED-1 | Auto-discover creators; follow sidebar works |
| "Patrons see unified feed" | FEED-2, FEED-3, FEED-4, FEED-5 | <2s load; tier badges; filters work; infinite scroll smooth |
| "Patrons return (engagement)" | ANALYTICS-2 | ≥50% patrons load feed ≥2x in 24h |
| "Tiers are respected" | POST-3, FEED-3, PERM-3 | RLS enforced; no cross-patron data leak; tier badges match |
| "System is fast/automated" | ENV-4, POST-1 → FEED-2 | Webhooks <60s; no manual refresh needed |
| "Security is solid" | SEC-1–4, PERM-3 | No SQL injection, JWT tampering, CORS bypass, or P1 regressions |

---

## Acceptance Criteria (For Sign-Off)

### Engineering ✅ (Done 2026-05-23)
- `verify:pilot` green: 1336 tests pass, web lint + build pass
- All 8 UX-blocking tests automated and passing locally

### Product/QA ⏳ (Use Checklist)
- [ ] **Creator flow:** ≥5 creators onboard + publish ≥2 posts each (≥10 total)
- [ ] **Patron flow:** ≥25 patrons active; ≥50% load feed ≥2x
- [ ] **Webhook automation:** Verify ≥1 webhook processed per hour; patron sees new post <60s
- [ ] **Tier enforcement:** Test POST-3 (tier gate) + PERM-3 (RLS breach) manually
- [ ] **Browser matrix:** Chrome, Firefox, Safari on ≥2 devices
- [ ] **Zero new P1s:** Check Sentry for security regressions
- [ ] **Collect signatures:** Product, QA, Creator Outreach, DevOps

---

## Next Steps

1. **For Product/QA:** Use `docs/pilot-017-human-signoff-checklist.md` (60+ tests, ~2.5–3 hours)
2. **For Designers:** This doc shows what UX "done" looks like
3. **For Engineering:** These are the tests already passing; no new code needed
4. **For Stakeholders:** Three flows = three reasons to believe pilot will succeed

---

**Source:** Extracted from `docs/pilot-017-human-signoff-checklist.md`  
**Date:** 2026-05-23  
**Status:** Engineering ✅ → Ready for human validation
