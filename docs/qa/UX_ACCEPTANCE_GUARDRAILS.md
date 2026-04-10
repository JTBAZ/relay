# UX acceptance guardrails (Relay — QA agents & bots)

**Purpose:** Define **expected user-visible behavior** so automated or managed QA agents can **pass/fail** checks without inferring intent from code alone.

**Product intent:** **`.docs/anthropic/PRODUCT_UX_NORTH_STAR.md`** — Artist Relay (library, curation, Designer) vs Fan Relay (feed, entitlements).

**When tests cannot run without humans (keys, OAuth, Patreon):** **`.docs/anthropic/FAIL_TO_HUMAN.md`** — do not loop.

**Not a substitute for:** [`road map.md`](../../road%20map.md) (strategy), **`AGENTS.md`** (repo map), or deep specs (**`docs/pattern-library.md`**, **`analytics-action-center-spec.md`**). Use this doc for **holistic UI/UX** and **cross-route** rules.

**Automated checks today:** repo root **`npm run test`**, **`npm run build`**; **`web/`** **`npm run lint`**, **`npm run build`**. There is **no** default root **`npm run test:e2e`** — do not require Playwright unless the project adds it.

---

## Personas

| Persona | Typical routes | Auth |
|---------|----------------|------|
| **Artist (creator)** | `/`, Library-adjacent flows, **`/designer`**, **`/collections`**, creator Patreon connect | Session per product rules |
| **Fan (patron)** | **`/visitor`**, **`/visitor/favorites`**, patron Patreon connect | Patron OAuth / session per product rules |
| **New user** | **`/landing`**, **`/onboarding`**, **`/login`** | As implemented |

---

## 1. Patreon and account context

| Rule | Expected behavior |
|------|-------------------|
| **Creator vs patron OAuth** | Creator flows use creator connect/callback; patron flows use patron connect/callback — do not swap routes (**`web/app/patreon/`**, **`web/app/patreon/patron/`**). |
| **Callback handling** | OAuth callbacks should surface errors readably; silent failure on token exchange → **fail** for QA unless spec says otherwise. |

---

## 2. Core routes (high level — extend as product hardens)

| Route area | Must | Must not |
|------------|------|----------|
| **`/`** (home) | Loads without server error; product shell matches **`docs/pattern-library.md`** intent for home. | Expose secrets or raw tokens in UI. |
| **`/designer`** | Available when scoped for Site Designer work; no crash on load in dev. | — |
| **`/visitor`** | Fan-appropriate entry per pattern library; no crash on load. | Show other users’ private data without entitlement. |
| **`/patreon/connect`**, **`/patreon/callback`** | Clear states for connect vs error vs success. | Infinite redirect loops (**fail**). |
| **`/patreon/patron/connect`**, **`/patreon/patron/callback`** | Same clarity as creator flows, patron-specific copy where required. | — |
| **`/dev/bench`** | Dev-only tooling — must not be required for production acceptance unless a ledger row says so. | — |

---

## 3. API / server expectations (when QA hits backend)

| Rule | Expected behavior |
|------|-------------------|
| **JSON errors** | Structured routes return sensible status codes; **5xx** on obvious programmer errors in happy path → **fail** for that scenario. |
| **Patreon token usage** | No logging of bearer tokens or refresh tokens in clear text. |

---

## 4. Session report

When guardrails fail, record: **route**, **persona**, **expected vs actual**, **command run** (e.g. `npm run lint` in `web/`), and whether **FAIL_TO_HUMAN** applies.
