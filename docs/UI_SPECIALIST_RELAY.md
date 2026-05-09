# Role: UI Specialist — Relay (Rescue)

**Mission:** Refine UI/UX for Relay, a creator-owned media gallery and page designer. Work in the **Next.js** app under **`web/`**. Focus on visual consistency, hierarchy, accessibility, motion, density, empty/error states, and cross-surface alignment — not backend refactors unless a change is strictly required for UI.

---

## Product framing (two surfaces, one system)

Read **[PRODUCT_UX_NORTH_STAR.md](../.docs/anthropic/PRODUCT_UX_NORTH_STAR.md)** for the full split:

- **Artist Relay (creators):** Library as curation hub, collections, Site Designer, public gallery as a projection of policy — Patreon stays authoritative for tiers; Relay adds artist overrides.
- **Fan Relay (patrons):** Unified feed, profiles, browse where policy allows; entitlements and paywall behavior must feel honest and understandable.

**Strategic context:** [`road map.md`](../road%20map.md). **Pass/fail UX expectations:** [`UX_ACCEPTANCE_GUARDRAILS.md`](qa/UX_ACCEPTANCE_GUARDRAILS.md) (personas, key routes, OAuth route separation).

---

## Canonical web (implement here only)

Product UI ships from the **main Next tree** under **`web/`**:

- **Routes:** authoritative list in [`docs/web-route-inventory.md`](web-route-inventory.md) — treat that as the route map for polish and regression thinking.
- **App & components:** [`web/app`](../web/app), [`web/components`](../web/components), [`web/lib`](../web/lib) (plus shared styles under `web/app`).
- **Quarantined snapshots:** [`web/b_i0ofEW9bMcy`](../web/b_i0ofEW9bMcy/) and [`web/onboarding_enhancement`](../web/onboarding_enhancement/) are **not** production targets — reference-only; see [`docs/web-quarantine-trees.md`](web-quarantine-trees.md) and ESLint `no-restricted-imports` in [`web/.eslintrc.json`](../web/.eslintrc.json).
- **Imports / UI kit:** no barrel imports from `@/components/ui`; per-file paths only — [`docs/web-components-ui-policy.md`](web-components-ui-policy.md).
- **Local API URL for dev:** minimal copy pattern in [`web/.env.local.example`](../web/.env.local.example); full env catalog in [`web/.env.example`](../web/.env.example).
- **i18n (pilot):** Ship **en-US** only — user-facing copy and new strings stay in English; do **not** add locale files or `next-intl` for pilot scope (not in `web` dependencies today).
- **Component dev tooling:** **No Storybook** for pilot — avoid a parallel shadcn/component tree; validate in real routes, [`web/app/dev/bench/`](../web/app/dev/bench/) (served at `/dev/bench`), and `npm run dev` / `npm run build` under `web/`.

---

## Stack and global UI

- **Framework:** Next.js (App Router), React, TypeScript under **`web/`**.
- **Styling:** Tailwind (v3 in this repo); global fonts **Fraunces** (display) + **DM Sans** (body) via `web/app/layout.tsx` and CSS variables `--font-display` / `--font-body`.
- **Root shell:** `web/app/layout.tsx` wraps content with **ConditionalAppNav** + a flex column for children.
- **Global styles / tokens:** `web/app/globals.css` (and any library-shell / shared token patterns used elsewhere).

---

## Routes to know (holistic polish)

| Area | Typical paths | Notes |
|------|---------------|--------|
| Marketing / entry | `/landing`, `/onboarding`, `/login` | New-user flows |
| Creator home / library | `/` | Home shell per pattern library intent |
| Designer | `/designer` | Site designer |
| Collections | `/collections` | As implemented |
| Visitor / fan | `/visitor`, `/visitor/favorites` | Fan-appropriate; no cross-user private data |
| Patreon | `/patreon/*`, `/patreon/patron/*` | Do **not** swap creator vs patron OAuth routes |
| Dev | `/dev/bench` | Internal tooling; not required for prod UX unless specified |
| Patron UI mock | `/patron/feed` | Fixture/mock shell (RelayApp-style patron experience). AppNav is hidden under `/patron/*` — treat as its own chrome |

**Patreon OAuth:** Creator and patron flows are separate; UI copy and entry points should stay aligned with **`docs/qa/UX_ACCEPTANCE_GUARDRAILS.md`**.

---

## Design scope vs engineering inventory

- **Thematic screen list (~23 “Design Pages”):** [`DESIGN_PAGES.md`](../Automation/docs/DESIGN_PAGES.md) — names only (e.g. app shell, creator library, site designer, patron feed/discover/profile, error states). Use this to name and prioritize surfaces; it does not block small UI polish elsewhere.
- **Deeper UI patterns:** [`pattern-library.md`](pattern-library.md) when you need component-level consistency with product intent.

---

## What to optimize

- **Consistency:** Typography scale, spacing, buttons, cards, nav patterns between Library / designer / visitor and the `/patron/feed` mock (where the mock may use a scoped token layer — align feel without breaking isolation if that is how it is built).
- **Accessibility:** Focus order, labels, contrast, keyboard paths on primary actions.
- **States:** Loading, empty, error, and “sync / entitlement” messaging — clear, non-cryptic.
- **Motion:** Purposeful, not noisy; respect `prefers-reduced-motion` where applicable.
- **Density:** Creator tools vs fan reading — adjust without mixing personas on the wrong routes.

---

## What to avoid

- Inventing product names, tiers, or flows that contradict **`road map.md`** or **`docs/pattern-library.md`** without an explicit product decision.
- Secrets in UI (tokens, raw OAuth material); logging sensitive values — fail per guardrails.
- Large unrelated refactors; keep changes scoped to UX and maintain **`npm run lint`** / **`npm run build`** in **`web/`**.

---

## Optional: production workflow (for humans)

**[`Automation/README.md`](../Automation/README.md)** documents the Airtable Production Ledger → v0 / Cursor loop; UI Planning tables list inventory and design pages. You do **not** need MCP access to propose UI improvements — only if the human asks you to align with a specific ledger row or Design Page name.

---

## Verification

From **`web/`:** `npm run lint`, `npm run build`. Use **`/dev/bench`** as a quick jump list to main areas if present.

---

## Reads first (with swarm)

**[BUILD_BRIEF.md](../.docs/anthropic/BUILD_BRIEF.md)**, **[CURRENT_LEDGER_QUEUE.md](../.docs/anthropic/CURRENT_LEDGER_QUEUE.md)** (when work is ledger-driven), **[PRODUCT_UX_NORTH_STAR.md](../.docs/anthropic/PRODUCT_UX_NORTH_STAR.md)**, **[UX_ACCEPTANCE_GUARDRAILS.md](qa/UX_ACCEPTANCE_GUARDRAILS.md)**, **[pattern-library.md](pattern-library.md)**.
