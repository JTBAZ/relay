# v0 prompt — Relay Insights Hub (growth fundamentals dashboard)

Copy everything inside the block below into v0.

---

```
You are building a single-page **Insights Hub** dashboard for Relay, a creator analytics product. Make it **dynamic and engaging**: subtle hover states, smooth section transitions, clear visual hierarchy, and confident whitespace—not a dense admin table.

## Brand & theme (must match)

- **Name:** Relay  
- **Logo:** Small wordmark "Relay" in **gold / warm amber** (#D4A574 or similar), serif or semi-serif, top-left of the shell. Optional tiny mark beside it.  
- **Background:** Near-black **#0A0A0A** to **#0D0D0D**; cards/panels **#111111**–**#141414** with **1px border #252525** and **rounded-2xl** (16px) corners.  
- **Primary accent:** **Forest green** #2D6A4F (or #2D4A3E) for positive metrics, primary buttons, and focus rings.  
- **Caution (sparingly):** Muted amber for "down vs prior" trends; **muted red** #C45C5C **only** for churn rate number—not for whole cards.  
- **Typography:** **Display / page title:** elegant serif (e.g. Fraunces or similar). **Body / metrics:** clean geometric sans (e.g. DM Sans, Inter). Large **tabular-nums** for KPIs.  
- **Feel:** Premium dark "studio" UI—Apple-adjacent calm, not neon gamer.

## Page purpose

**7-day snapshot** for **short-term growth decisions**: post more, fix churn, double down on a post, re-engage. Subtitle under title: *"7-day snapshot — what to do this week."*

## Layout (three zones — bento)

1. **Left column (~40% width, full height):** **Performance** — subtitle: *(Gallery + acquisition pulse)*  
2. **Top-right (~60% width, ~45% height):** **Growth** — subtitle: *(Are we growing?)*  
3. **Bottom-right (same width, remaining height):** **Audience** — subtitle: *(Health + leading signals)*  

Use CSS grid or flex with **consistent 24px gutters**. Mobile: stack **Performance → Growth → Audience** (single column).

---

## PRIMARY metrics (always visible — no scrolling required on desktop)

### Performance (left column)

Show in this order, **large type**, lots of vertical air:

1. **Posting cadence** — Big number: posts in last **7 days** (e.g. `14`). Label: `posts · 7d`.  
   - **Primary action (required):** Full-width or prominent button **"New post"** directly below this block (forest green bg, white text, rounded-lg). Secondary ghost: **"Schedule"** optional.  
2. **New patrons · 7d** — e.g. `+22` (green).  
3. **Net members · 7d** — e.g. `+9` (green).  
4. **Top converting post** — One compact card: small thumbnail placeholder, **post title**, one line **"+N joins attributed · 7d"** in green, tiny gray disclaimer *"Estimated until attribution ships"*.

### Growth (top-right)

1. **Est. new revenue · 7d** — Large green e.g. `~$660`; sublabel *"from new joins × tier floor (estimate)"*.  
   - **Action:** Button **"Review tiers"** (outline green) → can be `href="#"` placeholder.  
2. **Churn rate · 7d** — Large number e.g. `4.2%` in muted red; sublabel *"cancels ÷ active members"*.  
   - **Action:** Button **"See cancels"** (ghost) — implies drill-down.  
3. One line **vs prior 7d:** e.g. *"Flat to last week"* in muted gray.

### Audience (bottom-right)

1. **Gallery views · 7d** — e.g. `2.4k` + small **delta vs prior 7d** (e.g. `↓ 12%`) in amber, not aggressive red.  
   - **Action:** **"Open gallery analytics"** (text link or small button).  
2. **Profile views · 7d** — e.g. `340`; sublabel *"interest before subscribe"*.  
3. **Churn decay watch** — One **alert-style** strip: left amber border, single sentence e.g. *"3 of 5 recent cancels had low gallery engagement the week prior."*  
   - **Action:** **"Re-engagement ideas"** (outline or secondary).

---

## SECONDARY stats — hide by default (progressive disclosure)

Do **not** show raw Patreon impressions tables, tier distribution bars, or 4-column movement grids on the main surface.

Use **one** of these patterns (pick what fits v0 components best):

### Option A — Carousel (recommended for "more metrics")

- Below **Audience** section (or spanning full width under the bento on desktop), a **narrow horizontal carousel** with **dot indicators**:  
  - Slide 1: *"Movement detail"* — joins / upgrades / downgrades / cancels as **small** stat chips.  
  - Slide 2: *"Tier mix"* — simple horizontal bar or three percentages.  
  - Slide 3: *"Patreon reach"* — top post impressions / seen / likes **one row** only.  
- **Chevron** controls; **autoplay off** by default (accessibility).  
- Section title: **"More detail"** in small caps muted.

### Option B — Kebab menu per section

- Each of the three panels (**Performance**, **Growth**, **Audience**) has a **⋯ kebab** (top-right of card) opening a **dropdown**:  
  - Performance → "Posting history", "Tag breakdown", "Export CSV".  
  - Growth → "Revenue breakdown", "Tier economics".  
  - Audience → "Cohort table", "Stickiness by tier".  
- Dropdown items can be `href="#"`; they represent **secondary** destinations.

### Option C — "Details" drawer

- A single **"Show all metrics"** text button bottom-right of the page opens a **right-side drawer** (sheet) with scrollable secondary tables—keeps hero dashboard pristine.

**Implement at least one** of A / B / C so secondary content is never competing with the primary KPIs.

---

## Global chrome

- **Header:** Relay gold wordmark + **Insights Hub** (serif title) + optional **Last 7 days** pill filter (not a wall of filters).  
- **Footer (optional):** Muted link *"Archived insights · Data sources"*.

---

## Interactions & polish

- Cards **lift slightly** on hover (`translate-y-[-2px]`, shadow).  
- Buttons have **focus-visible** rings (green).  
- Loading: **skeleton** placeholders inside each of the three zones—not spinners only.  
- Empty / partial data: gentle banner *"Connect Patreon Insights CSV to unlock post-level reach"* inside **Growth** or carousel slide—does not break layout.

---

## Tech stack (if generating code)

- **Next.js** App Router, **Tailwind CSS**, **shadcn/ui**-style primitives if available (Button, Card, Sheet, DropdownMenu, Carousel).  
- No real API—use **mock JSON** in the same file or a small `const dashboard = { ... }` so the UI is **dynamic** (map over carousel slides, animate counts with CSS or light motion if allowed).

---

## Do NOT include on the main dashboard

- Full Patreon post performance **table** (many rows).  
- "Who sees what" tier **bar chart** on first paint.  
- Separate **Reveals** row unless inside carousel/drawer.  
- **#Sketch** hashtag strip on first paint.  
- More than **two** primary buttons per column (avoid choice overload).

---

## Success criteria

A creator opens the page and in **under 90 seconds** knows: (1) posting cadence + can start a post, (2) money and churn headline, (3) whether traffic and profile interest are up or down, (4) one churn warning—with **every secondary metric tucked** behind carousel, kebab, or drawer.

Build this as a **single responsive page** with the Relay dark theme and actions described above.
```

---

## Repo reference (for you, not v0)

- **Visual mockup generated from this spec:** `docs/analytics/insights-hub-v0-prompt-visual-mockup.png` (bento + kebabs + “More detail” carousel strip + action buttons).  
- Metric set aligned with: `docs/analytics/insights-hub-growth-fundamentals-7d.png` and growth-fundamentals discussion in repo.  
- IA context: `docs/analytics/INSIGHTS_IA_TREE.md`  
- Live web fonts in product: see `web/app/layout.tsx` for **Fraunces** + **DM Sans** if matching production exactly.
