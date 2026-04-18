# Guardrails build prompts — index

**Parent plan:** [`docs/AUTH_GUARDRAILS_TIER_1.md`](../../AUTH_GUARDRAILS_TIER_1.md)
**Identity model:** [`docs/architecture/multi-tenant-option-b.md`](../../architecture/multi-tenant-option-b.md)
**Runtime arch:** [`docs/architecture/multi-tenant-cloud-runtime.md`](../../architecture/multi-tenant-cloud-runtime.md)
**Airtable execution queue:** **Relay Database Tracker** base `appDbIOVX38X6U8Sf` → **Guard Rails** table (`tblfO7eFbw2J6px3C`). Each GR step is a row with **Step ID**, **Sort order**, **Depends on**, **Parallel with**, **Milestone**, **Execution mode**, **Pipeline status** (same shape as **DB Integration Pipeline** in that base), plus **Prompt file** (repo-relative path) and **Notes** containing the **Prompt Draft** summary. Claim **Queued** rows; set **Pipeline status** → In progress → Complete; mirror **Status** (Todo / In progress / Done).

**Project tracker (optional cross-link):** **Project tracker** base `applW4dOjVNHoWBM9` → **Production Ledger** `tblDDAKjaaBBIBuPf` — link large slices there if you track v0/Cursor work there; Guard Rails rows are the canonical queue for this program.

**Tier 0 verified ✅ 2026-04-17** — automated gate per [`GR-T0-VERIFY-prompt.md`](GR-T0-VERIFY-prompt.md); see [`AUTH_GUARDRAILS_TIER_1.md`](../../AUTH_GUARDRAILS_TIER_1.md) § “Tier 0 verification” for scope (browser checks manual).

---

## How to use this folder

Each file in this folder is a **standalone, claimable build prompt** for one Tier 0 or Tier 1 work item. Agents should:

1. Claim the corresponding **Production Ledger** row (use **Session Lock** per `.cursor/rules/airtable-execution-control-plane.mdc`).
2. Read **only the prompt file for the claimed row** and the files it points at. Do not read sibling prompts unless explicitly listed under "Reference reading."
3. Verify all listed **Preconditions** are satisfied before starting work. If a precondition is unmet, leave the row in **Blocked** with a Delta Out naming the missing precondition.
4. Execute the **Implementation Steps** in order.
5. Run the **Acceptance Criteria** checks. All must pass before opening a PR.
6. Write **Delta Out** per `docs/database/AIRTABLE_AUTOPIPELINE.md` and update **Status**, **Delta Out**, **Notes** in Airtable.

---

## Build hierarchy (claim in this order)

### Tier 0 — Foundation primitives (no guardrail logic; infrastructure only)

| # | File | Goal | Blocks |
|---|---|---|---|
| 0.1 | [`GR-T0-1-cookie-mirror-prompt.md`](GR-T0-1-cookie-mirror-prompt.md) | Server-set `HttpOnly` `relay_session` cookie + non-`HttpOnly` `relay_signed_in` companion. Web stops storing the token in `localStorage`. | 0.2, 1.1, 1.3, 1.7 |
| 0.2 | [`GR-T0-2-coin-model-active-role-prompt.md`](GR-T0-2-coin-model-active-role-prompt.md) | Verify Option B schema supports the coin model. Add `relay_active_role` cookie infrastructure as a UI-only hint. | 1.4, 1.5, 2.9 |
| 0.3 | [`GR-T0-3-rls-context-prompt.md`](GR-T0-3-rls-context-prompt.md) | Create `auth_account_id()` SQL function + `setSupabaseRlsContext` server helper. | 1.1, 1.2 |
| 0.4 | [`GR-T0-4-slug-uuid-contract-prompt.md`](GR-T0-4-slug-uuid-contract-prompt.md) | Audit and lock the `slug ↔ relay_creator_id ↔ Tenant.id UUID` mapping. All FKs use UUID; slug is mutable; doc'd in one place. | (audit only — no downstream block, but informs 1.2) |

### Tier 0 — Verification

| # | File | Goal |
|---|---|---|
| T0V | [`GR-T0-VERIFY-prompt.md`](GR-T0-VERIFY-prompt.md) | Smoke-test all four T0 primitives wire up; no existing flow breaks. **Must be green before claiming any T1 prompt.** |

### Tier 1 — Guardrails

| # | File | Goal | Depends on |
|---|---|---|---|
| 1.1 | [`GR-T1-1-require-account-prompt.md`](GR-T1-1-require-account-prompt.md) | `requireAccount` / `requireAccountWithRole` middleware on every `/api/v1/*` route. | 0.1, 0.3, T0V |
| 1.2 | [`GR-T1-2-rls-policies-prompt.md`](GR-T1-2-rls-policies-prompt.md) | Two-sided RLS policies for tenant-scoped tables (Creator owns; Supporter is_public OR tier-entitled). | 0.3, 0.4, 1.1 |
| 1.3 | [`GR-T1-3-fetch-401-prompt.md`](GR-T1-3-fetch-401-prompt.md) | Centralized `relayFetch` → `401` triggers logout + `?reason=expired` redirect; `403` throws typed error. | 0.1, 1.1 |
| 1.4 | [`GR-T1-4-auth-hooks-prompt.md`](GR-T1-4-auth-hooks-prompt.md) | `useRequireLoggedIn` / `useRequireLoggedOut` hooks reading the SSR cookie hint. | 0.1, 0.2, 1.3 |
| 1.5 | [`GR-T1-5-boot-splash-prompt.md`](GR-T1-5-boot-splash-prompt.md) | Single `<AuthBootSplash />` neutral loader; no flash-of-wrong-content. | 1.4 |
| 1.6 | [`GR-T1-6-safe-redirect-prompt.md`](GR-T1-6-safe-redirect-prompt.md) | `resolvePostAuthPath` is the only safe-redirect helper. Lint-enforced. | (independent) |
| 1.7 | [`GR-T1-7-edge-middleware-prompt.md`](GR-T1-7-edge-middleware-prompt.md) | `web/middleware.ts` cookie-presence perimeter guard. | 0.1 |
| 1.8 | [`GR-T1-8-verb-hygiene-prompt.md`](GR-T1-8-verb-hygiene-prompt.md) | Audit and lock: mutations are POST/PUT/PATCH/DELETE; no GET writes. | (independent) |

### Tier 1 — Verification

| # | File | Goal |
|---|---|---|
| T1V | [`GR-T1-VERIFY-prompt.md`](GR-T1-VERIFY-prompt.md) | Cross-stage persona acceptance: logged-out, creator, supporter, coin-flipper, expired-session. **Must be green before opening Tier 2.** |

---

## Dependency graph (visual)

```
0.1 ──┬─> 0.2 ──┐
      │         ├─> T0V ──> 1.1 ──┬─> 1.2
      │         │                 ├─> 1.3 ──> 1.4 ──> 1.5
      │         │                 │
0.3 ──┴─────────┘                 └─> 1.7
0.4 ────────────────────────> (informs 1.2)
                                  1.6 (independent, do anytime)
                                  1.8 (independent, do anytime)
                                                              ──> T1V
```

Stages 1.6 and 1.8 are unblocked at all times — pick them up in spare cycles.

---

## Tier 0 invariants (every PR must respect)

These are repeated in every prompt's header. They survive Tier 1 → Tier 2 → forever:

1. **No JS reads `relay_session`.** It is `HttpOnly`. Web code never sees the token.
2. **No handler grants permission based on `relay_active_role`.** That cookie is a UI hint. Authz is derived from DB rows (`Account.primaryRelayCreatorId`, `TenantMembership`).
3. **No FK or RLS policy references `public_slug` or `relay_creator_id`.** Both can change shape under us; `Tenant.id` (UUID) is the only safe key.
4. **One Account, one Supabase user, one cookie.** A second simultaneous sign-in must invalidate the first server-side.
5. **All web calls go through `relayFetch`.** Raw `fetch("/api/...")` is forbidden after Stage 1.3 lands.
6. **All `/api/v1/*` routes use `requireAccount` / `requireAccountWithRole`** unless explicitly public with a `// PUBLIC: <reason>` comment.
7. **All redirects derived from user input pass through `resolvePostAuthPath`.**
8. **All mutations use POST/PUT/PATCH/DELETE.** GETs are side-effect-free.

---

## Estimated effort

| Tier | Total | Parallelizable? |
|---|---|---|
| Tier 0 (4 items) | 3–5 days | 0.1 + 0.3 + 0.4 in parallel; 0.2 after 0.1 |
| Tier 0 verify | 0.5 day | — |
| Tier 1 (8 items) | 5–8 days | 1.1 sequential; then 1.2/1.3/1.7 parallel; then 1.4 → 1.5; 1.6/1.8 independent |
| Tier 1 verify | 1 day | — |
| **Total** | **~2 weeks with one backend + one web agent** | |
