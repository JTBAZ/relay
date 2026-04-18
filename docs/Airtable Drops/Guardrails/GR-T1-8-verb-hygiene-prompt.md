# GR-T1-8 — HTTP verb hygiene: mutations are POST/PUT/PATCH/DELETE only

## Context

You are building **Tier 1 primitive #8** of the Auth Guardrails plan ([`docs/AUTH_GUARDRAILS_TIER_1.md`](../../AUTH_GUARDRAILS_TIER_1.md) §3 Stage H). This row is **independent** of all other Tier 1 work and is mostly an audit + documentation row. The rule:

> **GET requests must be side-effect-free.** Any state change uses POST, PUT, PATCH, or DELETE.

This is conventional REST hygiene. With `SameSite=Lax` cookies (from T0-1) plus this rule, you eliminate an entire class of CSRF-via-prefetch and link-preview bugs without needing CSRF tokens.

## Preconditions

- (None on the code side. Independent.)
- Recommended: `GR-T0-VERIFY-prompt.md` shipped green so the audit doesn't conflict with in-flight T0 changes.

## Tier 0 invariants (always apply)

1. All mutations use POST/PUT/PATCH/DELETE.
2. GETs may be cached, prefetched, replayed, and triggered by link previews. They must be safe to call zero, one, or many times with no side effect beyond recording the access.

## Goal

After this row ships:

- An audit confirms every `/api/v1/*` GET is side-effect-free.
- Any GET that mutates is converted to the appropriate verb (or a separate row is opened to do so, if the conversion is breaking).
- A short rule doc lives at `docs/qa/HTTP_VERB_HYGIENE.md` and is referenced from `AGENTS.md`.
- `POST /api/v1/identity/logout` exists and is the only logout endpoint (no `GET /logout`).

## Reference reading

1. [`docs/AUTH_GUARDRAILS_TIER_1.md`](../../AUTH_GUARDRAILS_TIER_1.md) §3 Stage H.
2. [`docs/qa/UX_ACCEPTANCE_GUARDRAILS.md`](../../qa/UX_ACCEPTANCE_GUARDRAILS.md) — current QA guidance.
3. `src/server.ts` — enumerate every `app.get(...)`, `app.post(...)`, etc.
4. `AGENTS.md` — for the cross-link.

## Implementation steps

### Part A — Audit (~2 hours)

1. **Enumerate every route handler** in `src/`:

   ```bash
   rg "app\\.(get|post|put|patch|delete)\\(" src/ -n
   ```

2. **For each route, classify:**
   - **GET, read-only:** ✅ Safe.
   - **GET, side-effecting** (writes a row, sends an email, mints a token, increments a counter beyond plain access logging): ❌ Violation.
   - **POST/PUT/PATCH/DELETE:** ✅ Verb is correct (regardless of read/write balance).

3. **Special focus** — common offenders to look for:
   - `GET /api/v1/.../logout` — must be POST.
   - `GET /api/v1/.../confirm` — if it mints a session, that's borderline; OAuth callback GETs are conventional but the *side effect* should be the smallest possible (set cookie, redirect — yes; mutate other state — no).
   - `GET /api/v1/.../track` or `.../ping` — recording an access is acceptable as a "logging side effect"; explicit row mutation is not.

### Part B — Convert violations (~variable, depends on count)

4. **For each ❌:**
   - **If the conversion is non-breaking** (no external client depends on the GET shape): change it to POST in this row. Update any web call sites. Add a regression test asserting `GET` returns `405 Method Not Allowed`.
   - **If the conversion is breaking** (an external Patreon webhook, a third-party integration, an email link the user clicks): **do not convert in this row.** Open a separate ledger row with a deprecation plan. Document the violation in the rule doc as a known exception with a sunset date.

5. **Specifically check `POST /api/v1/identity/logout`:** confirm it exists and is the only logout. If a `GET /logout` exists anywhere (including web routes), convert or remove. **Web "Sign out" links must be `<form method="post">` or a button calling `performRelayLogout()`** — never a plain `<a href="/logout">`.

### Part C — Rule documentation (~1 hour)

6. **Create `docs/qa/HTTP_VERB_HYGIENE.md`** (~50 lines):

   ```markdown
   # HTTP verb hygiene

   **Rule:** GET is side-effect-free. State changes use POST, PUT, PATCH, or DELETE.

   ## Why

   - Browsers prefetch GET URLs (link rel="prefetch", quick-look on hover).
   - Search-engine crawlers and link-preview services issue GETs.
   - Email "Click to view" links are GETs.
   - Combined with `SameSite=Lax` cookies, GET-safety eliminates the most common CSRF vectors without needing CSRF tokens.

   ## Allowed exceptions

   - **Access logging** — recording that a request happened is acceptable on GET.
   - **Cache headers** — setting cache-control on the response is fine.
   - **Read-through computation** — derived values cached server-side count as logging-shaped.

   ## Known violations (sunset dates)

   - <list any kept-for-compat violations from Part B with their migration row IDs>

   ## Verification

   - `rg "app\\.get\\(\"/api/" src/` — manually scan; every hit is read-only.
   - Logout is `POST /api/v1/identity/logout` and nowhere else.
   ```

7. **Cross-link from `AGENTS.md`** — append a line under the "Repo map" or rules section:
   - `**HTTP verb hygiene:** [`docs/qa/HTTP_VERB_HYGIENE.md`](docs/qa/HTTP_VERB_HYGIENE.md) — GETs are side-effect-free.`

8. **(Optional) Lint rule** — if the project uses a route-aware linter, add a check that flags `app.get(` with handler bodies containing `prisma.*.create|update|delete|upsert|deleteMany|updateMany|createMany`. **Skip if no lint infrastructure handles this — the audit + doc + PR checklist suffices.**

## Acceptance criteria

- [ ] Audit table complete; every `/api/v1/*` GET classified.
- [ ] Zero ❌ side-effecting GETs remain (or each is documented in `HTTP_VERB_HYGIENE.md` with a sunset row).
- [ ] `POST /api/v1/identity/logout` is the only logout endpoint. No `GET /logout` anywhere in `src/` or `web/`.
- [ ] `docs/qa/HTTP_VERB_HYGIENE.md` exists.
- [ ] `AGENTS.md` cross-links the new doc.
- [ ] Any web "Sign out" UI is verified to use POST or a button (not a plain `<a>`).
- [ ] `npm run test` passes at repo root.
- [ ] `npm run build` passes at repo root and in `web/`.

## Out of scope

- Adding CSRF tokens — `SameSite=Lax` + verb hygiene is foundational; CSRF tokens are belt-and-suspenders for a later tier.
- Refactoring breaking violations (deferred to follow-up rows).
- Idempotency keys on POSTs — that's Tier 3 work (per-feature).
- Cache strategy for GETs — out of scope.

## Handoff

Delta Out:
- Audit summary (count of GET endpoints, count of POST/PUT/PATCH/DELETE).
- Any violations found, whether converted in this row or deferred.
- Confirmation that the doc exists and AGENTS.md cross-links it.

Next claimable: `GR-T1-VERIFY-prompt.md` once 1.6, 1.7 are also merged.
