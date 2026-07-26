# Creator Onboarding Step 5 — Sync & Review E2E Checklist

Manual verification gate for the staged media-sync onboarding experience (Slices A–E).

**Parent plan:** [`docs/EXTENSION_CROSS_POST_BUILD_PLAN.md`](../EXTENSION_CROSS_POST_BUILD_PLAN.md)  
**Pilot doc:** [`docs/pilot-ux-dev-login.md`](../pilot-ux-dev-login.md) — Gate L

---

## Prerequisites

- Postgres seeded (`npm run seed:pilot-ux`)
- Relay API + web running (`npm run dev:stack`)
- Chrome with Relay extension loaded (unpacked from `extension/dist/chrome-dev/`)
- Extension ID added to `NEXT_PUBLIC_RELAY_EXTENSION_IDS` in `web/.env.local`
- Dev Onboarding creator account (`creator_dev_onboarding@pilot.relay.test` / `pilot-ux-dev-only`)

---

## A — Business signal rows (Step 5 loads)

Sign in as **Dev Onboarding** → `/login/pilot-ux` → click **Simulate Patreon connect (dev)**.

- [ ] Page redirects to `/onboarding?path=creator&step=5`
- [ ] Step badge reads **Step 5 of 5** with "Artists" pill
- [ ] Heading reads **Sync & Review**
- [ ] **Tiers** row fills with `Complete` status — detail shows tier names (Supporter, Studio)
- [ ] **Patrons** row fills with `Complete` — detail shows patron count ("127 patrons…")
- [ ] **Revenue** row fills with `Complete` — detail shows estimated MRR ("$1,015/mo detected")
- [ ] **Media** row shows `Pending` with copy "Not connected yet. Import your media…"
- [ ] Primary CTA reads **Connect Extension** (extension not yet connected)

---

## B — Extension gate: not installed

With extension NOT loaded / `NEXT_PUBLIC_RELAY_EXTENSION_IDS` empty:

- [ ] CTA reads **Connect Extension** (links to `/extension/authorize`)
- [ ] No store-link buttons visible (store URLs not configured)
- [ ] Advanced: manual import disclosure is present but collapsed

---

## C — Extension gate: installed but no grant

With extension loaded, popup NOT yet connected:

- [ ] `probeRelayExtensionStatus` returns `{ ok: true, hasGrant: false }`
- [ ] CTA reads **Connect Extension →** (links to `/extension/authorize`)
- [ ] Click → `/extension/authorize` opens correctly

Connect the extension (popup → Connect to Relay, authorize):

- [ ] Page detects grant within 4 s (polling interval) without reload
- [ ] CTA transitions to next state automatically

---

## D — Extension gate: grant active, no Patreon session

After connecting the extension, log out of patreon.com in this browser:

- [ ] CTA reads **Open Patreon to sync session** (links to `https://www.patreon.com`)
- [ ] Hint copy visible: "Log into Patreon in this browser, then click Sync in the Relay extension popup"
- [ ] Open Patreon, log in, click Sync in extension popup
- [ ] Page detects cookie within ~4 s (polling) without reload
- [ ] CTA transitions to **Import Media**

---

## E-fast — Dev simulate media import (no extension)

Alternative to sections C–E when using **Dev Onboarding** only:

- [ ] **Simulate media import (dev)** button visible on Step 5 panel
- [ ] Click → `POST /api/v1/pilot-ux/dev/onboarding-walkthrough/simulate-media-import` returns 200
- [ ] Media row → `Complete` without extension install
- [ ] `export_media_count` ≥ 6 in gallery facets
- [ ] Proceed to section F (review modal)

---

## E — Media import trigger (real extension path)

With extension connected + Patreon cookie synced:

- [ ] CTA reads **Import Media** (button, not link)
- [ ] Click **Import Media** → spinner + "Importing…" disabled button
- [ ] `POST /api/v1/patreon/creator/scrape` fires (check Network tab)
- [ ] Media row transitions from `Pending` → `Syncing` (pulsing amber bar)
- [ ] After scrape completes (dev seed is fast): Media row → `Complete` (green)
- [ ] CTA transitions automatically to **Review your Library →** (no page reload)

---

## F — Review Library modal

After media import completes, CTA reads **Review your Library →**:

- [ ] Click → **Review your Library** modal opens (does NOT navigate to `/studio`)
- [ ] Modal header reads "Review your Library" with "Step 5 · Review" label
- [ ] **Promo slot strip** shows 5 empty ranked slots (#1–#5)
- [ ] **Search bar** present; typing debounces and re-fetches gallery items
- [ ] **Gallery grid** shows imported media thumbnails (60 items max)
- [ ] Tile shows title overlay; clicking selects and places in next slot
- [ ] Selected tile shows slot rank badge (e.g. "#1")
- [ ] **6th item click is disabled** once 5 slots are filled (cursor-not-allowed)
- [ ] Slot strip thumbnails update in real time as items are selected
- [ ] Slot's **×** remove button deselects and frees the slot
- [ ] **Tier filter chips** appear when creator has tiers; clicking narrows grid
- [ ] **Growth goal section** shows three choices: Audience discovery / Convert fans to patrons / Posting consistency
- [ ] Selecting a goal highlights the card (green border/bg)
- [ ] **Continue to Library** is disabled until at least 1 promo piece AND a growth goal are selected
- [ ] Hint copy in footer updates: "Pick at least one promo piece…" → "Choose a growth goal…" → "Selections save to your studio…"

---

## G — Review Library save flow

With 1–5 promo pieces and a growth goal selected:

- [ ] Click **Continue to Library**
- [ ] `PUT /api/v1/creator/promo-slots` fires with correct ranked slots (Network tab)
- [ ] `PATCH /api/v1/creator/onboarding` fires with `{ step: "organized", metadata: { growth_goal: "…", library_review_completed_at: "…" } }` (Network tab)
- [ ] Browser navigates to `/studio` (Library)
- [ ] Modal closes cleanly (no flash/overlap)
- [ ] Library loads with sync complete state — no stuck spinner

---

## H — Not now / dismiss

- [ ] Click **Not now** → modal closes; user stays on Step 5 panel
- [ ] CTA still reads **Review your Library →** (state not cleared)
- [ ] Re-opening modal pre-populates any previously selected slots (fetches existing promo slots)

---

## I — Advanced fallback always reachable

In any CTA state:

- [ ] **Advanced: manual import options** disclosure is present and collapsed
- [ ] Expanding shows **Paste Patreon cookie manually** and **Manual file upload** links
- [ ] Both links navigate correctly

---

## J — Regression: prior onboarding steps unchanged

- [ ] Step 2 (Patreon OAuth) badge reads **Step 3 of 5** after new step numbering
- [ ] Step 3 (profile) badge reads **Step 4 of 5**
- [ ] RoadmapPreview in onboarding wizard shows 5 steps: Username, Patreon, Profile, Sync & Review
- [ ] Supporter onboarding path is unaffected (step 3 unchanged)

---

## Sign-off template

```
Date:
Environment: local / staging / prod
Extension ID:
Creator account: Dev Onboarding / other

A (signal rows):            pass / fail
B (ext not installed):      pass / fail
C (ext no grant):           pass / fail
D (session sync):           pass / fail
E (media import trigger):   pass / fail
F (review modal opens):     pass / fail
G (save flow + Library):    pass / fail
H (not now dismiss):        pass / fail
I (advanced fallback):      pass / fail
J (step numbering):         pass / fail

Promo slots PUT verified:   yes / no
Onboarding PATCH verified:  yes / no (step, growth_goal)
Notes:
```
