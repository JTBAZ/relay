# PILOT-017 Documentation Index

**Date:** 2026-05-23  
**Status:** Engineering ✅ Green | Product ⏳ Ready for Human Sign-Off

---

## Quick Links by Audience

### 👨‍💼 Product / UX Leads
Start here for UX strategy:
1. **`PILOT-017-core-ux-summary.md`** — Three essential flows + what "done" looks like
2. **`PILOT-017-critical-ux-flows.md`** — Detailed UX journey for each flow
3. **`PILOT-017-README.md`** — Quick reference + FAQ

### ✅ QA / Product Testers
Start here for manual testing:
1. **`pilot-017-human-signoff-checklist.md`** — 60+ end-to-end tests (~2.5–3 hours)
2. **`PILOT-017-README.md`** — Quick reference + FAQ
3. **`pilot-exit-checklist.md`** — Go/no-go gate definitions

### 👩‍💻 Engineering / Developers
For context and architecture:
1. **`PILOT-017-engineering-complete.md`** — What was fixed + code path mapping
2. **`tests/pilot-017-pilot-exit-signoff.test.ts`** — Automated verification wiring

### 📊 Stakeholders / Leadership
For pilot success metrics:
1. **`PILOT-017-core-ux-summary.md`** — Three flows + success metrics
2. **`pilot-build-plan.md`** — Cohort targets (≥25 patrons, ≥5 creators, etc.)
3. **`pilot-exit-checklist.md`** — Scale table with gate definitions

---

## Document Map

### 🟢 Primary Documents (Read First)

#### **`PILOT-017-core-ux-summary.md`** (220 lines)
**Audience:** Product, UX, Stakeholders  
**Purpose:** What the three core UX flows are and what success looks like  
**Contains:**
- Flow 1: Creator Gallery Independence
- Flow 2: Patron Unified Feed
- Flow 3: Webhook Automation
- Critical UX refinements (ranked by impact)
- Test-to-product mapping
- Acceptance criteria for sign-off

**Read this if:** You want to understand what the pilot program *does* and what "done" looks like.

---

#### **`pilot-017-human-signoff-checklist.md`** (216 lines)
**Audience:** QA, Product, Creator Outreach  
**Purpose:** 60+ structured end-to-end tests for manual sign-off  
**Contains:**
- Pre-flight environment checks (5)
- Patron experience tests (15+)
- Creator experience tests (15+)
- Analytics & engagement (2)
- Browser matrix (7 browsers/devices)
- Security spot-checks (4)
- Cohort metrics summary table
- Sign-off table for stakeholders
- Known issues (Gate F hidden-post regression)

**Read this if:** You're the person running manual tests (2.5–3 hours of work).

---

#### **`PILOT-017-README.md`** (189 lines)
**Audience:** Everyone  
**Purpose:** One-page quick start + FAQ  
**Contains:**
- Status (engineering ✅, product ⏳)
- What you need (links to all docs)
- Steps to sign-off (6 phases)
- Known issues
- FAQ (what if test fails, timeline, skip browser matrix?, etc.)
- Contacts & resources

**Read this if:** You're new to PILOT-017 and need orientation.

---

### 🟡 Secondary Documents (Deep Dives)

#### **`PILOT-017-critical-ux-flows.md`** (284 lines)
**Audience:** Product, UX, Design  
**Purpose:** Detailed UX journey for each of the 3 core flows  
**Contains:**
- Flow 1: Creator Extraction & Gallery (frictionless path, critical tests, must-work criteria)
- Flow 2: Patron Feed (seamless path, tier badges, engagement proof)
- Flow 3: Webhook Automation (end-to-end sync, real-time feel)
- Test-to-UX mapping
- Known gaps (Gate F)
- Summary: what "done" looks like

**Read this if:** You want detailed test-to-UX alignment or are designing related features.

---

#### **`PILOT-017-engineering-complete.md`** (204 lines)
**Audience:** Engineering, Tech Leads  
**Purpose:** What was fixed to get `verify:pilot` green + handoff instructions  
**Contains:**
- Engineering blockers + fixes (table)
- Code path mapping (UX goal → code → test)
- Known issues (Gate F)
- File change log
- Next owner + estimated time

**Read this if:** You need to understand engineering context or are onboarding the product team.

---

#### **`pilot-exit-checklist.md`** (40 lines excerpt)
**Audience:** Product, DevOps  
**Purpose:** Go/no-go gate definitions for pilot exit  
**Contains:**
- Scale table (engineering ✅, product ⏳, prod env ⏳)
- CI vs local `verify:pilot` equivalence
- Notes section

**Read this if:** You need to understand what gates must be met.

---

#### **`pilot-ux-dev-login.md`** (Gates A–K)
**Audience:** QA, Product  
**Purpose:** UX gate definitions and developer login instructions for gates A–J  
**Contains:**
- Gate-by-gate instructions (PUX-000 through PUX-006)
- Gate K: Pilot exit (PILOT-017 summary)

**Read this if:** You want individual gate pass/fail criteria.

---

### 🔵 Supporting Documents (Reference)

#### **`pilot-build-plan.md`**
Cohort targets, success metrics, dependencies

#### **`pilot-browser-matrix.md`**
Browser coverage definition (Chrome, Firefox, Safari; desktop + mobile)

#### **`tests/pilot-017-pilot-exit-signoff.test.ts`**
Automated verification of script, docs, and prior gates

#### **Postgres Schema Docs**
- `post` (source: PATREON vs RELAY)
- `post_override` (is_hidden_from_patron_surfaces)
- `patron_follow` (auto-created on OAuth)
- `patron_entitlement_snapshot` (tier tracking)
- `tenant` (relay_creator_id assignment)

---

## Reading Paths by Role

### 📋 QA Lead (2.5–3 hours)
1. `PILOT-017-README.md` — Get oriented (5 min)
2. `pilot-017-human-signoff-checklist.md` — Run 60+ tests (2.5 hours)
3. `PILOT-017-core-ux-summary.md` — Understand what you tested (20 min)
4. Collect signatures on checklist
5. Update Airtable → Status Done

### 🎨 Product Lead (1 hour)
1. `PILOT-017-README.md` — Quick start (5 min)
2. `PILOT-017-core-ux-summary.md` — Three flows + success metrics (20 min)
3. `pilot-build-plan.md` — Cohort targets (10 min)
4. `PILOT-017-README.md` FAQ — Known issues (5 min)
5. Assign QA to run checklist (2.5 hours)
6. Review & co-sign results

### 👩‍💻 Engineering (Handoff Context, 20 min)
1. `PILOT-017-engineering-complete.md` — What was fixed (10 min)
2. `PILOT-017-core-ux-summary.md` — Three flows (10 min)
3. Done; product team takes it from here

### 🚀 DevOps / Platform (30 min)
1. `PILOT-017-README.md` — Environment checks (5 min)
2. `pilot-017-human-signoff-checklist.md` → ENV-1 to ENV-5 (15 min)
3. Co-sign checklist (10 min)

### 👨‍⚖️ Stakeholder / Leadership (15 min)
1. `PILOT-017-core-ux-summary.md` — Three flows + success metrics (15 min)
2. Done; check Airtable for sign-off status

---

## Metrics at a Glance

| Metric | Target | How to Verify |
|--------|--------|---------------|
| **Engineering automation** | `verify:pilot` green | ✅ 2026-05-23: 1336 tests, web lint/build pass |
| **Creator onboarding** | ≥5 creators; 0 support calls | Test CRE-1 → CRE-3 (human checklist) |
| **Creator publishing** | ≥10 posts (Patreon + Relay) | Test POST-1 → POST-5 (human checklist) |
| **Patron accounts** | ≥25 active | Test PAT-1 → PAT-4 (human checklist) |
| **Patron engagement** | ≥50% load feed ≥2x in 24h | Test ANALYTICS-2 (monitoring) |
| **Feed performance** | <2s load time | Network tab: `GET /api/v1/patron/feed` response |
| **Tier enforcement** | 100% (no leaks) | Test POST-3, PERM-3 (RLS + FEED-3 badges) |
| **Webhook sync** | <60s latency | Datadog: webhook → feed update time |
| **Browser coverage** | Chrome, Firefox, Safari | Test matrix (7 browser/device combos) |
| **Security** | Zero new P1s | Sentry: no regressions vs PILOT-016 baseline |

---

## Key Files in Codebase

### Tests
```
tests/pilot-017-pilot-exit-signoff.test.ts       ← Automated gate verification
tests/pilot-ux-permission-parity.test.ts         ← PUX-001–006 (Gates A–F)
tests/relay-native-post-route.test.ts            ← Gate H (Relay-native posts + feed)
tests/post-permission.test.ts                    ← Tier enforcement
tests/patron/assemble-patron-feed.test.ts        ← Feed assembly
```

### Source
```
src/server.ts                          ← REST routes (/api/v1/patron/feed, etc.)
src/patron/assemble-patron-feed.ts     ← Feed composition + RLS
src/gallery/post-permission.ts         ← Tier validation
src/patreon/patreon-sync-service.ts    ← Webhook processing
src/pilot-ux/seed-pilot-ux-dev-accounts.ts  ← Test account setup
```

### Docs
```
docs/pilot-ux-dev-login.md             ← Gates A–K user flows
docs/pilot-build-plan.md               ← Cohort targets & plan
docs/pilot-exit-checklist.md           ← Exit gate definitions
docs/pilot-browser-matrix.md           ← Browser coverage def
docs/PILOT-017-*.md                    ← All PILOT-017 docs
```

---

## Airtable Integration

**Base:** Batting Order (`apprid6UGT9E1KlkN`)  
**Table:** Pilot Build Plan (`tblzwAuy02t1yFOE0`)  
**Record:** PILOT-017 (`rec5qlZFK8Dsvwvap`)

**Status progression:**
1. Engineering in progress → `verify:pilot` green → Status updates to ✅
2. Product in progress → human checklist completed → Status updates to ⏳
3. All sign-offs collected → Status updates to **Done**

---

## Timeline to Full Exit

| Phase | Owner | Time | Blockers |
|-------|-------|------|----------|
| **Pre-Flight** | DevOps | 30 min | ENV checks (BullMQ, RLS, webhooks live) |
| **Patron Testing** | QA | 45 min | ≥25 patrons created, ≥50% feed usage |
| **Creator Testing** | QA | 45 min | ≥5 creators, ≥10 posts published |
| **Browser Matrix** | QA | 30 min | Chrome, Firefox, Safari work |
| **Security** | QA | 15 min | Zero new P1s |
| **Sign-Off** | Product + QA + DevOps | 15 min | Collect all signatures |
| **Airtable Update** | Product | 5 min | Link checklist; mark Done |

**Total: ~2.5–3 hours** (can be parallelized)

---

## FAQ

**Q: Can we skip the human checklist?**  
A: No. Engineering automation passes; human validation of UX + engagement is required.

**Q: What if a test fails?**  
A: Document it in the checklist. If it blocks auth, feed, or permissions, create GitHub issue tagged `pilot-exit-blocker`. Optional tests (e.g., Gate F hidden post) can be deferred.

**Q: How long will sign-off take?**  
A: 2.5–3 hours if you have staging ready + test accounts pre-seeded. Can be done in one day.

**Q: What's the Gate F hidden-post issue?**  
A: Creator hides post → patron feed should exclude it, but may not until API restart. Automated test passes; manual re-check is optional (does not block exit).

**Q: When do we mark PILOT-017 Done in Airtable?**  
A: After all checklist tests pass + all 4 stakeholders sign off + checklist is linked in Airtable notes.

---

**Created:** 2026-05-23  
**Last Updated:** 2026-05-26  
**Maintained By:** Product + Engineering
