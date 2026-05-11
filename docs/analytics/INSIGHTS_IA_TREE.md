# Insights Hub — Information architecture & drill-down tree

**Goal:** One **landing page** (General Insights) shows the big picture; each block is a **portal** into a nested **primary → secondary → tertiary** breakdown. Related metrics are **grouped** so users process one story at a time.

**Later step:** Multi-page UI routes map 1:1 to this tree (landing + 2 detail hubs, or landing + in-page sections per portal).

---

## Page split (recommended: 3 surfaces)

| Page | Role | What lives here |
|------|------|-----------------|
| **1. General Insights** (landing) | Executive pulse | Only **portal roots**: one headline + trend per tree, link into detail. No deep tables. |
| **2. Audience & membership** | People + tiers + time | Membership movement, tier mix, stickiness, cohort retention. |
| **3. Content & gallery performance** | Posts + **Reach** (unified) | Posting rhythm, themes/tags, content-across-tiers, and one **Reach** section that aggregates off-platform + Relay signals (today: Patreon Insights + Relay engagement; later: more socials). |

**Why three:** Page 2 and Page 3 answer different mental questions (“How is my **audience**?” vs “How is my **work and surface** performing?”). The landing synthesizes both into **portals** without mixing dense subgraphics.

**Optional fourth surface later:** “Recommendations” that **cross-links** roots (nudges are tertiary children of multiple primaries—see below).

---

## Landing page: portal roots (what appears “above the fold”)

Each item is a **single primary node** with **one headline metric** and **one line of context**. Click → opens the correct detail page **scrolled to that tree** (or a dedicated sub-route).

| Portal # | Primary (landing label) | Headline example | Routes to |
|----------|-------------------------|------------------|-----------|
| P1 | **Gallery pulse** | “14 posts · 30d — on pace” | Page 3 → tree A |
| P2 | **Audience pulse** | “+9 net members · 30d” | Page 2 → tree B |
| P3 | **Retention snapshot** | “Mar cohort: 68% still here @ 3 mo” | Page 2 → tree C |
| P4 | **Reach** (unified) | One line that **blends** what we know: e.g. “Strong on Patreon · Relay views up” *or* “Connect Patreon CSV · 2.1k gallery opens” | Page 3 → tree D |

**Landing layout (current):** **Four portals only** in a **landscape row** (equal rounded rectangles): P1–P4. **Suggestions / nudges** stay off the landing; they live under **Tree A** and **Tree F** on the content page so the first screen stays a clean 4-up grid.

**Reach (P4)** is intentionally **one portal**: Patreon Insights, Relay first-party engagement, and **future channels** (other socials) all roll up under the same story—“where attention landed off your Relay library and connected surfaces.” The landing headline should be a **composite pulse** (or a honest “partial data” state), not separate Patreon vs Relay cards.

---

## Nested trees (primary → secondary → tertiary)

Legend: **P** = primary (chapter), **S** = secondary (section), **T** = tertiary (detail / chart / table).

---

### Tree A — Gallery & cadence (Page: Content & gallery performance)

- **P — Gallery & cadence**  
  *Story: Is the creator feeding the gallery on a sustainable rhythm?*

  - **S — Posting rhythm**  
    - **T — Count by window** (7d / 30d / 90d)  
    - **T — vs your trailing average** (simple benchmark band, not guilt copy)

  - **S — Content themes**  
    - **T — Tag frequency table** (top tags + post counts)  
    - **T — “Series signal”** (dense tag cluster → continuation nudge, ties to recommendation engine)

  - **S — Who sees what (tier mix of content)**  
    - **T — Posts per tier** (distribution bar or stacked %)  
    - **T — Under-served tier** (tiers with patrons but few gated posts — operational, not moral)

**Cross-link:** Tier mix here links to **Tree B → S — Live tier population** (“same tiers, different lens: content vs people”).

---

### Tree B — Audience & tiers (Page: Audience & membership)

- **P — Audience & tiers**  
  *Story: Who pays, how counts move, where risk clusters.*

  - **S — Membership movement** (windowed)  
    - **T — Event counts** (joins, rejoins, upgrades, downgrades, cancels)  
    - **T — Net change** (single derived number surfaced on landing via this tree)

  - **S — Who’s on which tier** (live snapshot)  
    - **T — Patron count by paid tier**  
    - **T — Free vs paid split** (if applicable)

  - **S — Tier stickiness** (ledger replay)  
    - **T — Median tenure on tier** (per tier)  
    - **T — Churn proxy by tier** (operational label; small explainer text)

**Cross-link:** To **Tree A → S — Who sees what** for “content vs entitlement alignment.”

---

### Tree C — Cohort retention (Page: Audience & membership)

- **P — Cohort retention**  
  *Story: Do batches of joiners stick around over time?*

  - **S — Cohort grid** (join month × months-since-join)  
    - **T — Single cohort drill** (retention curve for one month)  
    - **T — Sample size / confidence note** (suppress noisy cells)

**Placement:** Same page as Tree B (both are “people over time”); landing portal can deep-link to `#cohorts`.

---

### Tree D — Reach (unified) (Page: Content & gallery performance)

- **P — Reach**  
  *Story: Where did attention and reactions show up—across Patreon, Relay, and (later) every connected social—in one place?*

  - **S — Overview (cross-channel pulse)**  
    - **T — Unified summary strip** (e.g. “Patreon: top post X · Relay: Y views · [Channel]: …”)  
    - **T — Data freshness / coverage** (what’s connected, what’s stale, what’s missing)

  - **S — Patreon (Insights / post metrics)** — *channel*  
    - **T — Import health** (last import, row count, linkage to Relay posts)  
    - **T — Top posts** (impressions, seen, likes, comments; sortable)  
    - **T — Single post drill** → Relay post context (title, date, tags, tier)

  - **S — Relay (first-party)** — *channel*  
    - **T — Totals by event type** (gallery views, reveal/paywall, profile views)  
    - **T — Top opened posts / media** (ranked)  
    - **T — Time series** (optional, later)

  - **S — Other socials** — *channel(s), future*  
    - **T — Placeholder per integration** (same pattern: connection health → top content → drill-down)  
    - **T — Normalized “reach events”** when you add a shared event model across providers

**Gating:** If a channel is disconnected, its **S** collapses to **Connect / enable** tertiary—other channels under the same **P — Reach** still show. The **landing** Reach portal should never imply “nothing to see” when *any* channel has data; it should summarize what *is* available.

**Cross-channel (later):** Optional **T — “Same post, many surfaces”** when the same Relay/Patreon asset maps to external IDs—keep tertiary until data model supports it.

---

### Tree F — Action-center nudges (cross-cutting)

Nudges are **tertiary outputs** of analytics, not a fourth competing “truth.” They **nest under** the primaries they belong to:

| Nudge (from existing heuristics) | Parent primary | Parent secondary |
|-----------------------------------|----------------|------------------|
| Cadence rescue | Tree A | S — Posting rhythm |
| Series continuation | Tree A | S — Content themes |
| Tier upgrade / concentration | Tree A | S — Who sees what *(and optionally Tree B — stickiness)* |

**Landing behavior:** Nudges **do not** appear as a fifth portal; full list lives under **Tree A** / **Tree F** on the content page (and links into B when tier population is relevant).

---

## How graphics nest (summary)

| Graphic / concept | Level | Parent |
|-------------------|-------|--------|
| Landing portal card | **P** (root for that story) | — |
| Posting rhythm bands / counts | **S** | Tree A |
| Tag cloud / top tags table | **S** | Tree A |
| Content × tier distribution | **S** | Tree A |
| Join/upgrade/cancel breakdown | **S** | Tree B |
| Tier population bars | **S** | Tree B |
| Stickiness table | **S** | Tree B |
| Cohort heatmap / grid | **S** | Tree C |
| Reach overview / freshness | **S** | Tree D |
| Patreon: import + top posts table | **S** | Tree D (channel) |
| Relay: totals + top content list | **S** | Tree D (channel) |
| Future social: channel block | **S** | Tree D (channel) |
| Per-post Patreon metrics row | **T** | Tree D |
| Per-event Relay breakdown | **T** | Tree D |
| Per-tier tenure / churn proxy | **T** | Tree B |
| Single cohort curve | **T** | Tree C |
| Nudge cards | **T** (or **S** if many) | Tree A (+ links) |

---

## Navigation model (for a later multi-page build)

1. **`/insights`** — General Insights: portals only (P1–P4).  
2. **`/insights/audience`** — Trees B + C (anchors: `#movement`, `#tiers`, `#stickiness`, `#cohorts`).  
3. **`/insights/content`** — Trees A + D + nudges under A (`#cadence`, `#themes`, `#tier-mix`, `#reach`, `#reach-patreon`, `#reach-relay`, `#nudges`).

**Reach deep-links:** `#reach` opens the unified **P**; `#reach-patreon` / `#reach-relay` jump to the corresponding **S — channel** block. Add `#reach-{provider}` as new socials ship.

Each portal on `/insights` links to `.../audience#...` or `.../content#...` with the **primary expanded** and **first secondary visible**.

---

## Principles (keep for UI build)

- **One story per page session:** Detail pages group **Audience** vs **Content** so users are not comparing impressions to cohorts side-by-side unless they choose to.  
- **Landing never duplicates tertiary:** Headline + trend + “View breakdown” only.  
- **Nudges are children, not peers:** They never outrank raw pulse metrics on the landing.  
- **Gated channels degrade gracefully:** Under **Reach**, each **S — channel** collapses to a **Connect / enable** tertiary when that source is missing; other channels still render. The landing **Reach** portal reflects **whatever subset** is live (composite pulse, not an empty page).

---

## Optional consolidated hub (3 columns)

Some flows may use **one screen** (instead of only the 4-portal landing) with three high-level bands—see mockups:

- **Dense reference** (all widgets): `docs/analytics/insights-hub-3section-performance-growth-audience.png`
- **Streamlined snapshot** (minimal first paint): `docs/analytics/insights-hub-3section-minimal-sleek.png`

| Section | Question | Maps to (from trees above) |
|---------|----------|----------------------------|
| **Performance** (tall portrait, left) | How is my gallery doing? | Tree A (cadence, themes, tier mix of content) + Relay engagement slice + Patreon post table under **Reach** |
| **Growth** (top right, landscape) | Am I reaching new people? | Financial / subscription signals (when available), tips, joins or net adds as “new people,” **promotional** one-liner (e.g. top post / campaign pulse)—may pull from **Reach** overview + membership movement headline |
| **Audience** (bottom right, landscape) | How’s my community doing? | Tree B (movement detail, tier population, stickiness) + Tree C (cohort retention) + soft **churn watch** copy (aggregate only) |

The **4-portal landing** can still deep-link into anchors on this layout or into separate `/insights/audience` and `/insights/content` pages; product choice is whether this 3-section view is the default “hub” or a drill-down from portals.

---

## Related docs

- `docs/analytics/ANALYTICS_READINESS.md` — Backend coverage  
- `docs/analytics/DASHBOARD_DESIGN_SYSTEM.md` — Visual patterns (to align portals + drill-down with prior UX notes)
