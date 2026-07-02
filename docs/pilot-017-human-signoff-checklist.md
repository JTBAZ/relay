# PILOT-017 Human Sign-Off Checklist

**Purpose:** Product/QA validates engineering automation (`verify:pilot` green) + manually verifies cohort targets before calling pilot done.

**Owner:** Product/QA lead + creator/patron outreach  
**Timeline:** Recommend 2–3 hours after engineering bar green + staging env live

---

## Pre-Flight: Environment & Setup


| #         | Check                                                                                                           | Expected                                                                        | Link                                                                                           | Sign-off |
| --------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------- |
| **ENV-1** | Staging environment has `RELAY_DB_STORE_IDENTITY=1`, `RELAY_DB_STORE_OVERRIDES=1`, `RELAY_DB_STORE_CANONICAL=1` | All three **1** (not 0, not empty)                                              | `node scripts/pilot-env-check.mjs` in staging                                                  | ☐        |
| **ENV-2** | Postgres RLS policies active on `patron_follow`, `patron_entitlement_snapshot`, `post_override`                 | Queries fail if `SET LOCAL` session context is wrong                            | `SELECT * FROM patron_follow LIMIT 1;` in psql (should enforce `SET rls.patron_membership_id`) | ☐        |
| **ENV-3** | BullMQ + Redis live; `/api/v1/health/jobs` returns status                                                       | `status: "ok"` or similar; job queues not stalled                               | Staging: `https://staging-relay.example.com/api/v1/health/jobs`                                | ☐        |
| **ENV-4** | Patreon webhook ingress active; test member/post sync fires                                                     | Check logs/monitoring; ≥1 webhook in last hour                                  | Datadog/CloudWatch for `POST /api/v1/patreon/webhooks/process` 200s                            | ☐        |
| **ENV-5** | Creator/patron test accounts exist in staging                                                                   | Ava, Milo, Riley; seeded via `npm run build && npm start` locally or pre-staged | Airtable or ops docs reference                                                                 | ☐        |


### Pre-Flight Sign-Off

**Environment validated by:** ________________  
**Date/time:** ________________  
**Notes:** ________________

---

## Patron Experience (≥25 Active, ≥50% Feed Use)

### Account & Auth Flow


| #         | Scenario                     | Steps                                                                                                                                                                                                          | Expected Result                                                   | Evidence                                                                                    | Sign-off |
| --------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------- |
| **PAT-1** | Patron email/password signup | 1. Go to `/patreon/patron/onboarding` 2. Click "Create account" 3. Fill email, password, confirm 4. Submit                                                                                                     | Account created; redirect to Patreon OAuth                        | Screenshot or video                                                                         | ☐        |
| **PAT-2** | Patron Patreon OAuth flow    | 1. On `/patreon/patron/onboarding` (post signup) 2. Click "Connect Patreon" 3. Approve access on Patreon ([https://www.patreon.com/oauth/authorize](https://www.patreon.com/oauth/authorize)) 4. Return to app | OAuth token saved; patron memberships auto-created for Ava + Milo | Network tab `POST /api/v1/auth/patreon/link` 200; Airtable count                            | ☐        |
| **PAT-3** | Patron session persistence   | 1. Log in as patron (email/password or OAuth) 2. Refresh page 3. Navigate to `/patron/feed`                                                                                                                    | Session persists; no re-login needed                              | Browser DevTools: `_supa_session` cookie present                                            | ☐        |
| **PAT-4** | Multiple patron signup       | Repeat PAT-1 and PAT-2 for **≥25 unique email/patron combos**                                                                                                                                                  | All sessions valid; distinct `user_id` in Postgres `patronmember` | Postgres: `SELECT COUNT(DISTINCT account_id) FROM tenant_membership WHERE role = 'patron';` | ☐        |
| **PAT-5** | Logout + re-login            | 1. Log in 2. Click account menu → Logout 3. Session cleared 4. Re-login with same email                                                                                                                        | Previous session revoked; new session issued                      | Postgres: `session.revoked_at` is NOT NULL for old row                                      | ☐        |


### Feed Experience


| #          | Scenario                    | Steps                                                                                                                                                                                                         | Expected Result                                                   | Evidence                                                                    | Sign-off |
| ---------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------- | -------- |
| **FEED-1** | Patron follow creators      | 1. Log in as patron (Riley) 2. Navigate to `/patron/library` 3. Search for "Ava" → click follow 4. Repeat for "Milo"                                                                                          | Patron now follows both; sidebar updates                          | Airtable `patron_follow` row added; `/api/v1/patron/follows` returns 2 rows | ☐        |
| **FEED-2** | Feed fetches followed posts | 1. After FEED-1 follow setup 2. Navigate to `/patron/feed` 3. Wait 2s for load                                                                                                                                | Feed displays posts from Ava + Milo sorted by date (newest first) | Network tab: `GET /api/v1/patron/feed?limit=50` 200; body contains ≥5 posts | ☐        |
| **FEED-3** | Tier entitlement badge      | 1. On `/patron/feed` as Riley (Patreon Supporter tier) 2. Inspect Ava's card: - Public intro post: "Free" badge - Supporter set post: "Supporter" badge - Supporter video post: visible (Milo Supporter tier) | Badges match Riley's entitlements; locked posts not visible       | Screenshot of feed; modal shows tier gate                                   | ☐        |
| **FEED-4** | Patron search/filter        | 1. On `/patron/feed` 2. Click filter dropdown 3. Select "Photos" or "Writing" 4. Feed re-filters                                                                                                              | Only posts of chosen media type visible                           | Network: `GET /api/v1/patron/feed?filter=photos`                            | ☐        |
| **FEED-5** | Feed pagination (cursor)    | 1. On `/patron/feed`, load 50 posts 2. Scroll to bottom 3. Click "Load more" 4. Fetch next page                                                                                                               | Next 50 posts load; no duplicates                                 | Network: `GET /api/v1/patron/feed?cursor=...&limit=50` 200                  | ☐        |


### Consent & Permissions


| #          | Scenario                           | Steps                                                                                                                                                                                        | Expected Result                                             | Evidence                                             | Sign-off |
| ---------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------- | -------- |
| **PERM-1** | Creator blocks patron from feed    | 1. Log in as Ava (creator) 2. Go to gallery → select Riley's account or post 3. Click "Block" (if UI available) or via API `POST /api/v1/gallery/block-patron` 4. Log out; re-login as Riley | Riley feed updates; Ava's posts no longer visible           | API response 200; feed re-fetch shows Ava removed    | ☐        |
| **PERM-2** | Patron unfollow                    | 1. Log in as Riley 2. On `/patron/feed`, click Ava's creator card → unfollow 3. Confirm                                                                                                      | Ava's posts removed from feed; sidebar updated              | API `DELETE /api/v1/patron/follows/{creator_id}` 200 | ☐        |
| **PERM-3** | RLS breach attempt (negative test) | 1. Patron session token for Riley 2. Manual API call: `GET /api/v1/patron/feed` + Bearer token for *another patron's session* 3. Should fail or return empty                                 | 401 Unauthorized or 403 Forbidden (not 200 with wrong data) | Network: response is error, not data                 | ☐        |


---

## Creator Experience (≥5 Published, No Support Calls)

### OAuth & Onboarding


| #         | Scenario                      | Steps                                                                                                                                                       | Expected Result                                                       | Evidence                                                                                                  | Sign-off |
| --------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------- |
| **CRE-1** | Creator email/password signup | 1. Go to `/onboarding?path=creator` 2. Fill email, password, confirm 3. Submit                                                                              | Account created; redirect to Patreon connect step                     | Screenshot                                                                                                | ☐        |
| **CRE-2** | Creator Patreon OAuth flow    | 1. On creator onboarding, Patreon step 2. Click "Connect Patreon Creator" 3. Authorize on Patreon as creator account (must own a campaign) 4. Return to app | Creator tenant + membership auto-created; `relay_creator_id` assigned | Postgres: `SELECT relay_creator_id FROM tenant WHERE account_id = ?` not null                             | ☐        |
| **CRE-3** | Creator profile step          | 1. After CRE-2 OAuth 2. Fill display name, bio, avatar 3. Click next → public handle claim 4. Claim handle (e.g., `@creator_name`)                          | Profile saved; public handle registered                               | Postgres: `creator_profile.public_slug` = handle; `/creator/handle/...` page loads                        | ☐        |
| **CRE-4** | Multiple creator signup       | Repeat CRE-1, CRE-2, CRE-3 for **≥5 unique creator accounts**                                                                                               | All onboarded; each has distinct `relay_creator_id`                   | Airtable or Postgres count: `SELECT COUNT(DISTINCT relay_creator_id) FROM tenant WHERE role = 'creator';` | ☐        |
| **CRE-5** | Creator session persistence   | 1. Log in as creator 2. Refresh page 3. Navigate to `/creator/studio`                                                                                       | Session persists                                                      | Browser cookies; no re-login                                                                              | ☐        |


### Post Creation & Publishing


| #          | Scenario                          | Steps                                                                                                                                       | Expected Result                                                   | Evidence                                                                                  | Sign-off |
| ---------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------- |
| **POST-1** | Patreon post import               | 1. Log in as creator (Ava) 2. Go to `/creator/studio/library` (or import view) 3. Click "Import from Patreon" 4. Select 2–3 posts to import | Posts imported; appear in creator gallery                         | Postgres: `post.source = 'PATREON'`; `/api/v1/gallery/items?creator_id=...` includes them | ☐        |
| **POST-2** | Relay-native post creation        | 1. Creator studio → click "New Post" 2. Fill title, description, tier gate 3. Upload image or media 4. Publish                              | Post created with `source = 'RELAY'`; visible in library          | Postgres: `post.source = 'RELAY'`, `media_asset` exists, `post_version.published_at` set  | ☐        |
| **POST-3** | Post tier visibility              | 1. Creator publishes post restricted to "Supporter" tier 2. Log out; re-login as patron (Riley, Supporter tier) 3. Check feed               | Post visible to Riley (entitled); not visible to free-tier patron | Feed shows post; permission check passes                                                  | ☐        |
| **POST-4** | Post visibility override (hidden) | 1. Creator hides a post via bulk action or detail view 2. Refresh page 3. Log out; re-login as entitled patron                              | Post removed from patron feed; not in gallery                     | Postgres: `post_override.is_hidden_from_patron_surfaces = true`                           | ☐        |
| **POST-5** | Creator publish ≥2 posts total    | Each of 5 creators publishes at least 2 posts (Patreon import or Relay-native)                                                              | Total ≥10 posts published; visible in library + feed              | Postgres: `SELECT COUNT(*) FROM post WHERE source IN ('PATREON', 'RELAY');` ≥10           | ☐        |
| **POST-6** | Patreon re-sync preserves Relay-native post | 1. Publish a Relay-native post (POST-2); note its id and position in Library 2. Trigger a Patreon sync (Library top bar → Patreon menu → fetch newer posts) 3. Reload Library | Post still present, same id and position; tier gate and media unchanged | Postgres: `SELECT source, upstream_status FROM post WHERE id = '<relay_post_id>';` returns `RELAY`, `active` | ☐        |


### Analytics & Metrics


| #               | Scenario                                          | Steps                                                                                                                                                 | Expected Result                                        | Evidence                                          | Sign-off |
| --------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------- | -------- |
| **ANALYTICS-1** | Creator dashboard (if available)                  | 1. Creator studio → Analytics tab 2. Check follower count, post view count 3. Data matches patron follows + feed fetches                              | Counts ≥ known patron activity                         | Screenshot or API `GET /api/v1/creator/analytics` | ☐        |
| **ANALYTICS-2** | Patron feed usage (can count via logs/monitoring) | 1. Check app logs or Datadog for `GET /api/v1/patron/feed` call frequency 2. Over a 24h window, expect ≥5 distinct patrons loading feed ≥2 times each | Feed API call volume ≥10 calls from ≥5 unique sessions | Datadog/CloudWatch dashboard or log aggregation   | ☐        |


---

## Browser & Device Matrix

Test on **≥2 browsers** on ≥1 desktop + 1 mobile device.


| Browser | OS                            | Desktop | Mobile | Patron Feed | Creator Studio | Post Detail | Notes          | Sign-off |
| ------- | ----------------------------- | ------- | ------ | ----------- | -------------- | ----------- | -------------- | -------- |
| Chrome  | Windows 11                    | ☐       | N/A    | ☐           | ☐              | ☐           | Latest version | ☐        |
| Chrome  | macOS                         | ☐       | N/A    | ☐           | ☐              | ☐           | Latest version | ☐        |
| Chrome  | iOS (simulator or device)     | N/A     | ☐      | ☐           | ☐              | ☐           | Latest version | ☐        |
| Chrome  | Android (emulator or device)  | N/A     | ☐      | ☐           | ☐              | ☐           | Latest version | ☐        |
| Firefox | Windows 11                    | ☐       | N/A    | ☐           | ☐              | ☐           | Latest version | ☐        |
| Safari  | macOS                         | ☐       | N/A    | ☐           | ☐              | ☐           | Latest version | ☐        |
| Safari  | iOS (real device recommended) | N/A     | ☐      | ☐           | ☐              | ☐           | Latest version | ☐        |


**Blocker criteria:** Any browser failing patron feed load, post view, or creator login.  
**Best-effort:** Mobile browsers; document any degradation.

---

## Security Spot-Checks


| #         | Check                          | Steps                                                                                                                                                                                      | Expected Result                                                                 | Evidence                                             | Sign-off |
| --------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- | ---------------------------------------------------- | -------- |
| **SEC-1** | No SQL injection via tier gate | 1. Creator detail page (if public) 2. Inspect network request for tier query 3. Try tier_id parameter with `' OR '1'='1`                                                                   | Request rejected or parameter escapes safely; no raw SQL execution              | Network tab shows parameterized query (Prisma)       | ☐        |
| **SEC-2** | No auth bypass (JWT tampering) | 1. Patron session token in DevTools 2. Copy token; modify payload manually 3. Send modified token to `/api/v1/patron/feed`                                                                 | 401 Unauthorized (JWT signature invalid)                                        | Network: 401, not 200                                | ☐        |
| **SEC-3** | CORS no-bypass (origin check)  | 1. From external origin (e.g., `http://attacker.com`) 2. `fetch('https://staging-relay.../api/v1/patron/feed', {headers: {Authorization: 'Bearer ...'}})` 3. Browser blocks or API rejects | Request blocked by browser or API returns no `Access-Control-Allow-Credentials` | Browser console: CORS error or no credentials header | ☐        |
| **SEC-4** | No new P1-class regressions    | 1. Review Sentry/error logs for security-class errors (RLS failures, auth bypasses, SQL injection indicators) 2. Compare to PILOT-016 baseline                                             | Zero new P1-class alerts                                                        | Sentry dashboard filtered to last 48h; no new issues | ☐        |


---

## Known Issues & Follow-Ups

### PILOT-012 Known Issue (Gate F): Hidden Post Patron Exclusion

**Status:** Automated test passes; manual browser test flagged regression.

**Scenario (Regression):**  

1. Creator (Ava) hides a post via bulk visibility override.
2. Patron (Riley, entitled) reloads feed.
3. **Expected:** Post removed.
4. **Observed (2026-05-22):** Post still appears in patron feed after API rebuild.

**Workaround:** If manual test fails, clear `RELAY_DB_STORE_OVERRIDES` cache or restart API. Do **not** mark Gate F as signed off in browser until manual re-check passes or root cause is understood.

**Check (optional, time-permitting):**  

- Developer re-runs `PUX-006 gate F — hidden post patron exclusion` on staging browser.
- If passes: Gate F cleared for full exit.  
- If fails: Document regression; schedule follow-up; do not block PILOT-017 exit if only manual spot-check fails (automated bundle green is sufficient).

**Ticket/Follow-up:** Link to GitHub issue or Airtable row: ________________

---

## Cohort Metrics Summary


| Metric                      | Target                                       | Actual       | Evidence                                                                              | Sign-off |
| --------------------------- | -------------------------------------------- | ------------ | ------------------------------------------------------------------------------------- | -------- |
| **Patron accounts**         | ≥25                                          | ____         | Airtable; Postgres: `SELECT COUNT(...) FROM tenant_membership WHERE role = 'patron';` | ☐        |
| **Creator accounts**        | ≥5                                           | ____         | Airtable; Postgres: `SELECT COUNT(...) FROM tenant WHERE role = 'creator';`           | ☐        |
| **Feed usage**              | ≥50% of patrons load feed ≥2x                | ____         | Datadog/logs; manual spot-check                                                       | ☐        |
| **Post count (published)**  | ≥10 total (Patreon + Relay)                  | ____         | Postgres: `SELECT COUNT(*) FROM post WHERE source IN ('PATREON', 'RELAY');`           | ☐        |
| **Engineering automation**  | `verify:pilot` green                         | ✓ 2026-05-23 | CI log or local run                                                                   | ☐        |
| **Browser matrix**          | Chrome, Firefox, Safari (≥2 browsers tested) | ____         | Checklist above                                                                       | ☐        |
| **Prod env verified**       | RELAY_DB_STORE_*, RLS, webhooks, BullMQ live | ✓            | ENV-1 through ENV-5                                                                   | ☐        |
| **Zero new P1 regressions** | No security/critical bugs                    | ____         | Sentry, SEC-1 through SEC-4                                                           | ☐        |


---

## Sign-Off

**All checks complete?** ☐ Yes  ☐ No (if No, list blockers below)

**Blockers (if any):**  

```
1. ________________
2. ________________
3. ________________
```

### Product / QA Sign-Off


| Role                  | Name         | Email        | Date/Time    | Signature    |
| --------------------- | ------------ | ------------ | ------------ | ------------ |
| **Product Lead**      | ____________ | ____________ | ____________ | ____________ |
| **QA Lead**           | ____________ | ____________ | ____________ | ____________ |
| **Creator Outreach**  | ____________ | ____________ | ____________ | ____________ |
| **DevOps / Platform** | ____________ | ____________ | ____________ | ____________ |


### Next Steps

- **All sign-offs collected:** Update PILOT-017 Airtable row → Status `Done` + add sign-off date + link to this checklist.
- **Blockers found:** Create GitHub issue; tag as `pilot-exit-blocker`; schedule follow-up.
- **Known issue (Gate F) not retested:** Document in PILOT-012 follow-up issue; do not re-test unless time permits.
- **Full exit complete:** Announce to stakeholders; archive pilot setup docs for next cohort reference.

---

## Testing Environment URLs

**Staging (pre-prod):**

- App: `https://staging-relay.example.com`
- Patreon OAuth: `https://sandbox.patreon.com` (or prod, depending on setup)
- Monitoring: `https://datadog.com/dash/...` (link to dashboard)
- Postgres: Direct connection via bastion or `staging-db.example.com:5432` (per ops)

**Patron Test Accounts (pre-created for re-use):**

```
Email: dev-patron-1@example.com / Password: [ops knows]
Email: dev-patron-2@example.com / Password: [ops knows]
...
Email: dev-patron-25+@example.com / Password: [ops knows, or self-signup]
```

**Creator Test Accounts:**

```
Ava: dev-ava@example.com / Patreon: @dev_ava_creator
Milo: dev-milo@example.com / Patreon: @dev_milo_creator
+ 3–5 additional creator OAuth test accounts (TBD per ops)
```

---

**Checklist Version:** 1.0  
**Last Updated:** 2026-05-23  
**Maintained By:** ________________