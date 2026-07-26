# PILOT-017 Critical UX Flows — Core Pilot Program

Extracted from `pilot-017-human-signoff-checklist.md`, these are the **three essential user journeys** that define the pilot program's value proposition.

---

## Flow 1: Creator Extraction & Independent Gallery Hosting

**User Goal:** "I want to pull my Patreon media into my own gallery and present it independently."

### Tests That Define This Flow

#### **CRE-1 → CRE-3: Creator Onboarding (No Support Calls)**

| Step | Test | Critical UX Element | Validation |
|------|------|---------------------|------------|
| 1. **Signup** | **CRE-1** Email/password signup | Creator can create account without friction | Screenshot: account created, redirects to OAuth step |
| 2. **Link Patreon** | **CRE-2** Patreon OAuth flow | Creator authorizes Relay to pull campaign data (`relay_creator_id` assigned) | Postgres: `relay_creator_id NOT NULL`; no manual intervention needed |
| 3. **Profile Setup** | **CRE-3** Display name, bio, avatar, public handle | Creator claims a vanity URL (e.g., `@creator_name`); profile appears public | Postgres: `creator_profile.public_slug` matches handle; `/creator/handle/...` loads |

**UX Pass Criteria:**
- ☑ No blank pages or 404s between steps
- ☑ OAuth redirect works bidirectionally (Patreon → Relay → Patreon → Relay)
- ☑ Public handle is claimed in one step (not multiple attempts)
- ☑ Creator can navigate to studio without re-login

---

#### **POST-1 → POST-5: Extract, Organize, Publish**

| Step | Test | Critical UX Element | Validation |
|------|------|---------------------|------------|
| 1. **Import** | **POST-1** Patreon post import | Creator goes to studio → clicks "Import from Patreon" → selects 2–3 posts → they appear in gallery | Postgres: `post.source = 'PATREON'`; API returns posts |
| 2. **Create Native** | **POST-2** Relay-native post creation | Creator can upload media directly (not just Patreon) → set title, description, tier gate → publish | Postgres: `post.source = 'RELAY'`; `media_asset` exists; timestamp shows published |
| 3. **Gallery Organization** | **POST-5** ≥2 posts per creator × 5 creators | Creator gallery shows both Patreon + Relay posts in unified view; count ≥10 total | API `GET /api/v1/gallery/items?creator_id=...` includes both sources |

**UX Pass Criteria:**
- ☑ Import button is visible and labeled clearly ("Import from Patreon")
- ☑ Bulk select + import works (not one post at a time)
- ☑ New post form has intuitive tier selector (not buried)
- ☑ Gallery shows creation source (so creator knows what's Patreon vs Relay)
- ☑ No data loss on refresh

---

#### **POST-3 & POST-4: Control & Distribution**

| Step | Test | Critical UX Element | Validation |
|------|------|---------------------|------------|
| 1. **Tier Gating** | **POST-3** Post restricted to "Supporter" tier | Creator sets tier gate on publish → patron with that tier sees post → free patron doesn't | Feed shows/hides post based on entitlement; modal explains tier requirement |
| 2. **Visibility Override** | **POST-4** Creator can hide a post | Creator bulk-hides a post → entitled patron's feed updates automatically → post gone from patron surfaces | Postgres: `post_override.is_hidden_from_patron_surfaces = true` |

**UX Pass Criteria:**
- ☑ Tier selector is adjacent to "Publish" button (not in a modal two levels deep)
- ☑ Creator sees real-time preview of who can see this post
- ☑ Hiding a post shows confirmation (not silent change)
- ☑ **Known Issue:** Hidden post may still appear in feed after API restart (see PILOT-012 Gate F)

---

### **Flow 1 UX Summary**

**Painless path:** Signup → OAuth → 30-second profile → Import Patreon posts → Publish new post → Set tier gate  
**Success metric:** ≥5 creators complete full onboarding + publish ≥2 posts each (10 total posts) **with no support calls**

**Why it matters:** Creator independence. They own their gallery, control pricing/tier access, and can add content outside Patreon if they choose.

---

## Flow 2: Patron Unified Feed & Tier-Gated Discovery

**User Goal:** "I want to see all my favorite creators' updates in one place, properly gated to what I can access."

### Tests That Define This Flow

#### **PAT-1 → PAT-4: Patron Account & Discovery**

| Step | Test | Critical UX Element | Validation |
|------|------|---------------------|------------|
| 1. **Signup** | **PAT-1** Email/password signup | Patron creates account fast | Redirects to Patreon OAuth immediately |
| 2. **Link Patreon** | **PAT-2** Patron Patreon OAuth flow | Patron links Patreon account → app auto-discovers which creators they're supporting (≥2 shown) | Postgres: `patron_entitlement_snapshot` created for each creator |
| 3. **Follow** | **FEED-1** Patron follows creators | Patron can search/discover creators → click follow → they appear in sidebar | Postgres: `patron_follow` row added |
| 4. **Scale** | **PAT-4** Multiple patron signup | ≥25 patrons created + linked (no manual follow-up) | All distinct `user_id` in Postgres; no duplicates |

**UX Pass Criteria:**
- ☑ Patron OAuth auto-links patrons to creators they support (one click, not manual)
- ☑ Sidebar shows "Following" list (not buried)
- ☑ Discovery is fast (search works, not scrolling through 500 creators)
- ☑ No login loop (patron signs up once, stays logged in)

---

#### **FEED-2 → FEED-5: The Core Feed Experience**

| Step | Test | Critical UX Element | Validation |
|------|------|---------------------|------------|
| 1. **Load Feed** | **FEED-2** Feed fetches followed posts | Patron navigates to `/patron/feed` → sees posts from Ava + Milo sorted newest first → ≥5 posts visible | Network: `GET /api/v1/patron/feed` returns ≥5 posts; response time <2s |
| 2. **Tier Badges** | **FEED-3** Tier entitlement display | Each post shows badge (e.g., "Free", "Supporter", "Locked") matching patron's tier | Patron sees "Free" badge on public posts → "Supporter" on tier-gated → "Lock" icon on posts they don't have access to |
| 3. **Filtering** | **FEED-4** Media type filtering | Patron clicks "Photos" filter → feed re-filters to only photos (not videos, writing) → experience is smooth | Network: `GET /api/v1/patron/feed?filter=photos` filters correctly |
| 4. **Pagination** | **FEED-5** Infinite scroll or "Load more" | Patron scrolls to bottom → new posts load automatically or via button → no duplicates | Cursor pagination works; feed doesn't re-fetch old posts |

**UX Pass Criteria:**
- ☑ Feed loads in <2s (patron doesn't wait staring at blank screen)
- ☑ Posts are chronological, newest first (intuitive)
- ☑ Tier badge is immediately visible (patron knows why locked post is locked)
- ☑ Filter dropdown is discoverable (not hidden in a menu)
- ☑ Infinite scroll doesn't flicker or repeat posts

---

#### **PERM-2 & PERM-3: Control & Trust**

| Step | Test | Critical UX Element | Validation |
|------|------|---------------------|------------|
| 1. **Unfollow** | **PERM-2** Patron can unfollow | Patron clicks creator card → "Unfollow" → posts gone from feed | Postgres: `patron_follow` row deleted; feed re-fetches |
| 2. **Security** | **PERM-3** RLS breach attempt (negative test) | Patron session token for Riley → try to access another patron's data → 401/403, not 200 | Network: response is error, not cross-patron data |

**UX Pass Criteria:**
- ☑ Unfollow is reversible (patron can follow again)
- ☑ Feed updates in real-time (patron doesn't have to refresh)
- ☑ No cross-patron data leaks (patron A cannot see patron B's private feed)

---

#### **ANALYTICS-2: Engagement Proof**

| Step | Test | Critical UX Element | Validation |
|------|------|---------------------|------------|
| 1. **Usage** | **ANALYTICS-2** Feed usage tracking | ≥5 distinct patrons load feed ≥2 times each (over 24h) | Datadog: ≥10 total `GET /api/v1/patron/feed` calls from ≥5 unique sessions |

**UX Pass Criteria:**
- ☑ Feed is **sticky**: patrons return ≥2x (not one-and-done)
- ☑ Implies: feed is fast enough, content fresh enough, UI intuitive enough to encourage repeat visits

---

### **Flow 2 UX Summary**

**Seamless path:** Signup → Patreon OAuth auto-links creators → Sidebar shows "Following" → Click `/patron/feed` → See all creators' posts with tier badges → Filter by media type → Infinite scroll  
**Success metric:** ≥25 patrons active; ≥50% load feed ≥2x in 24h (engagement)

**Why it matters:** Feed is the patron's home. If they don't use it repeatedly, the pilot fails (they'll abandon it for checking each creator's Patreon individually).

---

## Flow 3: Webhook Automation & Real-Time Sync

**User Goal (Implicit):** "When a creator posts on Patreon, I instantly see it in my feed, properly gated to my tier."

### Tests That Define This Flow

#### **ENV-4: Webhook Infrastructure**

| Component | Test | Critical UX Element | Validation |
|-----------|------|---------------------|------------|
| **Webhook Receiver** | **ENV-4** Patreon webhook ingress active | Staging can receive Patreon member/post sync events → logs show `POST /api/v1/patreon/webhooks/process` 200s ≥1x per hour | Datadog/CloudWatch logs confirm webhook delivery |

**UX Pass Criteria:**
- ☑ BullMQ job queue is live (not stalled)
- ☑ Webhooks are processed within seconds, not minutes
- ☑ Failed webhook doesn't lock the system (retry logic works)

---

#### **POST-1 → FEED-2: Creator Post → Patron Feed (End-to-End)**

| Step | Test | Critical UX Element | Validation |
|------|------|---------------------|------------|
| 1. **Patreon Import** | **POST-1** Creator imports Patreon post | Creator selects 2–3 Patreon posts → they appear in Relay gallery | Postgres: `post.source = 'PATREON'` |
| 2. **Tier Data Sync** | **POST-3** Tier gate applied | Creator publishes post with "Supporter" tier gate on Patreon → Relay reflects tier gate | Post metadata includes tier IDs; entitlement snapshot matches |
| 3. **Feed Propagation** | **FEED-2** Post appears in patron feed | Patron logs in → sees newly-imported post from creator → tier badge shows correctly | Network: `GET /api/v1/patron/feed` includes new post; response <2s |

**UX Pass Criteria:**
- ☑ No manual re-sync button needed (webhook auto-pulls)
- ☑ Tier gate is preserved (post isn't suddenly free-tier)
- ☑ Patron sees update without app restart or hard refresh

---

### **Flow 3 UX Summary (Automation)**

**Behind-the-scenes:** Webhook fires → BullMQ job processes → Postgres updated → Patron feed queries new data → API response includes post with tier  
**Success metric:** When creator posts on Patreon, patron sees it in Relay feed within 60 seconds (real-time feel)

**Why it matters:** If patrol has to wait 5 minutes or refresh manually, the "unified feed" feels broken. Automation is transparent to users but critical to UX perception.

---

## Critical UX Refinements Summary

### **Must Work (Blocking Issues if Broken)**

1. **Creator OAuth one-click onboarding** (CRE-2)
   - Patreon → Relay → Patreon → back to Relay **must not loop**
   - Auto-assign `relay_creator_id` (no manual step)

2. **Patron OAuth auto-discovery** (PAT-2)
   - Patreon OAuth auto-creates patron memberships for creators they support
   - Do not require manual "follow" step per creator

3. **Unified feed loads fast** (FEED-2)
   - <2s response time for 50 posts
   - Newest first; tier badges immediately visible
   - Infinite scroll without flicker

4. **Tier gates honored end-to-end** (POST-3, FEED-3)
   - Creator sets tier → patron sees badge → locked posts don't render
   - Patron without tier cannot see content (RLS enforced)

5. **Webhook syncs within 60s** (ENV-4, POST-1 → FEED-2)
   - Creator posts on Patreon → Relay gallery updated → patron feed shows new post
   - No manual refresh

---

### **Should Work (Quality Signal if Broken)**

6. **Post import handles bulk selection** (POST-1)
   - Not one post at a time (UX friction)

7. **Creator tier selector is intuitive** (POST-3)
   - Tier dropdown on publish form (not hidden modal)

8. **Patron feed is sticky** (ANALYTICS-2)
   - ≥50% return ≥2x in 24h
   - Implies content is fresh, UI is intuitive, notifications work

9. **Browser matrix passes** (Chrome, Firefox, Safari)
   - Feed, creator studio, post detail work on desktop + mobile
   - No "broken" views on iOS/Android

---

### **Known Gaps (Gate F Regression)**

**POST-4: Post hiding may fail to propagate immediately** (PILOT-012)
- Creator hides post → patron feed should exclude it
- May require API restart to fully propagate
- **Workaround:** Clear cache or restart API
- **Status:** Optional manual re-check; does not block exit if automated tests pass

---

## Test-to-UX Mapping (Quick Reference)

| UX Goal | Tests | Pass Criteria |
|---------|-------|---------------|
| Creator can onboard without support | CRE-1, CRE-2, CRE-3 | ≥5 creators complete; 0 support calls |
| Creator can import + publish independently | POST-1, POST-2, POST-5 | ≥10 total posts (5 creators × 2 each) |
| Creator controls tier access | POST-3, POST-4 | Tier gates enforced; hiding works |
| Patron sees unified feed | PAT-1, PAT-2, FEED-1, FEED-2 | ≥25 patrons; ≥5 posts visible |
| Patron sees tier badges correctly | FEED-3 | Posts show "Free", "Supporter", or "Locked" correctly |
| Patron can filter + discover | FEED-4, FEED-5 | Filters work; pagination loads new posts |
| Automation is transparent | ENV-4, POST-1 → FEED-2 | Webhook fires; patron sees post within 60s |
| Security is enforced | PERM-3, SEC-1–4 | No RLS bypass; no SQL injection; 401 on breach attempt |
| Engagement is real | ANALYTICS-2 | ≥50% patrons return ≥2x |

---

## Summary: What "Done" Looks Like for UX

**Creators:**
- Click "Connect Patreon" → get `relay_creator_id` immediately (no blank page)
- See gallery with Patreon posts + newly-created Relay posts side-by-side
- Set tier gate, publish → patron sees tier badge on feed
- Hide post → patron feed updates in real-time

**Patrons:**
- Click "Connect Patreon" → auto-discover creators they support (no manual follow per creator)
- Open feed → see newest posts from all creators sorted chronologically
- Tier badges show which posts are free vs locked
- Click filter → feed re-filters instantly
- Return ≥2x in 24h (proving feed is useful, not abandoned)

**System:**
- No support calls (onboarding is frictionless)
- Webhooks sync within 60s (creators' posts auto-update)
- RLS enforced (patron A can't see patron B's feed)
- Works on Chrome, Firefox, Safari (desktop + mobile)

---

**Checklist Reference:** `docs/pilot-017-human-signoff-checklist.md`  
**Last Updated:** 2026-05-23
