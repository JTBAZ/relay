# UX acceptance guardrails (Relay — QA agents & bots)

**Purpose:** Define **expected user-visible behavior** so automated or managed QA agents can **pass/fail** checks without inferring intent from code alone.

**Product intent:** **`.docs/anthropic/PRODUCT_UX_NORTH_STAR.md`** — Artist Relay (library, curation, Designer) vs Fan Relay (feed, entitlements).

**When tests cannot run without humans (keys, OAuth, Patreon):** **`.docs/anthropic/FAIL_TO_HUMAN.md`** — do not loop.

**Not a substitute for:** [`road map.md`](../../road%20map.md) (strategy), **`AGENTS.md`** (repo map), or deep specs (**`docs/pattern-library.md`**, **`analytics-action-center-spec.md`**). Use this doc for **holistic UI/UX** and **cross-route** rules.

**Automated checks today:** repo root **`npm run test`**, **`npm run build`**, **`node scripts/m10-token-log-scan.mjs`** (M10: no obvious token material in `console.*` under `src/`); **`web/`** **`npm run lint`**, **`npm run build`**. Full parity: root **`npm run verify:m10`**. There is **no** default root **`npm run test:e2e`** — do not require Playwright unless the project adds it.

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
| **Creator vs patron OAuth** | Creator flows use creator connect/callback; patron flows use patron connect/callback — do not swap routes (**`web/app/patreon/`**, **`web/app/connect/patreon/patron/`**). |
| **Callback handling** | OAuth callbacks should surface errors readably; silent failure on token exchange → **fail** for QA unless spec says otherwise. |

---

## 2. Core routes (high level — extend as product hardens)

| Route area | Must | Must not |
|------------|------|----------|
| **`/`** (home) | Loads without server error; product shell matches **`docs/pattern-library.md`** intent for home. | Expose secrets or raw tokens in UI. |
| **`/designer`** | Available when scoped for Site Designer work; no crash on load in dev. | — |
| **`/visitor`** | Fan-appropriate entry per pattern library; no crash on load. | Show other users’ private data without entitlement. |
| **`/patreon/connect`**, **`/patreon/callback`** | Clear states for connect vs error vs success. | Infinite redirect loops (**fail**). |
| **`/connect/patreon/patron/connect`**, **`/connect/patreon/patron/callback`** | Same clarity as creator flows, patron-specific copy where required. | — |
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

---

## 5. Permission overrides (PILOT-012 / ADR 004)

**Product intent:** Relay **presentation** (hide / review / tags) is separate from Patreon **tier gates**. Overrides can narrow what patrons see; they must never widen paywall access.

| Rule | Expected behavior | Fail when |
|------|-------------------|-----------|
| **Headline copy** | Creator Library surfaces show **Relay visibility ≠ Patreon access** (bulk visibility, inspect sidebar, batch details, sidebar filters). | Headline missing or implies tier changes from hide/review. |
| **Hidden excludes patrons** | Tier-entitled patron cannot load a creator-hidden post in `/patron/feed`, visitor gallery, post detail, or permission API. | Hidden post appears in any patron surface. |
| **Hidden excludes upsell** | Creator-hidden posts do not appear in the bottom **What you missed** locked carousel. | Hidden post shows as locked upsell stub. |
| **Override schema** | `PostOverride` has no tier-id fields; visibility PATCH does not write audience tier. | Tier ids stored or mutated via overrides. |
| **Creator library** | Creator still sees hidden posts in Library (optional filter toggle); gray/hidden indicator OK. | Creator cannot manage hidden state or sees patron-only denial in Library. |

### Automated verification

```bash
npm run build
npx vitest run tests/pilot-permission-architecture.test.ts
npx vitest run tests/post-permission.test.ts
npx vitest run tests/pilot-permission-signoff.test.ts
npx vitest run tests/pilot-012-permission-guardrails.test.ts
npx vitest run tests/patron/assemble-patron-feed.test.ts
```

With `DATABASE_URL` set, also run Gate F:

```bash
npx vitest run tests/pilot-ux-permission-parity.test.ts -t "PUX-006"
```

### Manual spot-check (Gate F)

See [`docs/pilot-ux-dev-login.md`](../pilot-ux-dev-login.md) — **Gate F — hidden post patron exclusion (PUX-006)**:

1. **Dev Ava** → Library → hide an entitled post via bulk **Relay visibility**.
2. **Dev Riley** → `/patron/feed` — post absent; direct post URL → **404**; permission → **deny** with “Post hidden by creator.”
3. **Dev Ava** → unhide before leaving Library dirty.

**Pass:** patron exclusion holds; creator copy clearly separates visibility from tier access.
