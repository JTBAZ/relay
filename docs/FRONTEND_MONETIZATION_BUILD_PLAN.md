# Frontend Monetization Integration — Build Plan (MB-15)

**Status:** MB-15 **done**. Prerequisites MB-1–14 are **done**. MB-15A–D **done**.
**Scope:** Make every existing Relay price point, plan entitlement, Tip purchase path, onboarding choice, and artist payout action visible and understandable in the production frontend. This slice connects completed backend money rails to complete user journeys; it does not create new prices or payment mechanics.
**Related:**

- **Mandatory visual/code canon:** [RELAY_DESIGN_CODE.md](RELAY_DESIGN_CODE.md). Every worker must read it in full **before editing any file under `web/`**. Its shell tokens, state patterns, accessibility contract, and Active Posts visual grammar are binding.
- Product and money canon: [MONETIZATION_MASTER_MAP.md](MONETIZATION_MASTER_MAP.md), [financial-atlas.md](financial-atlas.md).
- Prerequisites: [BILLING_SPINE_BUILD_PLAN.md](BILLING_SPINE_BUILD_PLAN.md) (creator plans + server gates), [TIP_BETA_BUILD_PLAN.md](TIP_BETA_BUILD_PLAN.md) (Tip UX), [FAN_PREMIUM_BUILD_PLAN.md](FAN_PREMIUM_BUILD_PLAN.md) (fan plans, earnings, Connect).
- Creator feature ladder: [AUTOPOST_BUILD_PLAN.md](AUTOPOST_BUILD_PLAN.md).

**Contract authority:** This document owns MB-15 presentation and integration contracts. It may extend the existing wires where presentation truth is missing, but it must not change pricing, ledger, payout, webhook, or entitlement semantics frozen by MB-1–14.

---

## Worker-agent session protocol

1. Read this document top to bottom.
2. Read [RELAY_DESIGN_CODE.md](RELAY_DESIGN_CODE.md) top to bottom **before any frontend edit**. Re-open the relevant sections before each sub-slice:
  - Studio gates / earnings: §§3–4, 7–12.
  - Consumer plans / onboarding: §§3–4, 7–12.
  - Any media tile or card: §§5–6 are mandatory; Active Posts is the bread-and-butter visual grammar.
3. Read the upstream build plan and existing component/service named by the sub-slice.
4. Claim exactly one next sub-slice. Keep the single MB-15 status row and set it to `**in progress (MB-15A)`** (or B/C/D); do not add sub-slice status rows or work ahead. Advance the parenthetical only after that sub-slice's acceptance criteria pass. Set MB-15 to `**done`** only after A–D and the exit checklist pass.
5. Preserve server authority: never infer access from a displayed price, a client-side plan label, or a hidden button.
6. Verify proportionally: targeted root/web tests, `npm run build` at root, `npm run lint` and `npm run build` under `web/`, then browser-test all state rows in the acceptance matrix.
7. Backend/web/env changes require `npm run dev:stack:restart` at task end per `.cursor/rules/rescue-workflow-always.mdc`.
8. Stop on a human gate. Do not invent Stripe IDs, Connect configuration, product policy, or live-mode state.

---

## Human gates (stop conditions)

- **Stripe products / price IDs:** `STRIPE_PRICE_STUDIO_CORE`, `STRIPE_PRICE_AUTOPOST`, `STRIPE_PRICE_GROWTH_ENGINE`, `STRIPE_PRICE_SUPPORTER`, `STRIPE_PRICE_CURATOR`, and `STRIPE_PRICE_RELOAD_PACK` are dashboard-owned. Build and test with mocks or explicit local stubs; never fabricate production IDs.
- **Stripe Connect platform profile:** live onboarding and transfers require a human-configured Connect profile. Build all states against mocked/test-mode responses; report a definitive account restriction once and stop.
- **Live payments:** enabling live keys, prices, webhooks, payouts, tax, or plan copy is a human launch decision.
- **Feature ladder changes:** adding/removing a paid capability, changing its minimum plan, or exposing a Growth Engine feature that is not shipped is a product decision. Implement the existing ladder only.
- **SFW monetization boundary:** mature content remains ineligible for fan-side paid Tip unlocks.

These gates block live launch, not build-dark UI, test fixtures, or disabled-state rendering.

---

## Non-goals

- No price, allowance, rollover, window, payout-rate, or threshold changes.
- No new payment rail, annual plan, coupon, storefront checkout, Boost mechanics, Exposure Feed, or mature-content monetization.
- No ledger, settlement, refund, clawback, or webhook semantic changes.
- No redesign of Stripe-hosted Checkout, Billing Portal, or Connect onboarding.
- No mandatory paid onboarding: creator and patron free paths must remain complete.
- No duplicate price or feature catalogs in component files.

---

## Frozen presentation contracts

### 1. Sources of truth


| Concern                   | Source                                            | Frontend rule                                                                                        |
| ------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Creator plan display      | `web/lib/creator-plans.ts`                        | Import `CREATOR_PLAN_CATALOG`; never repeat $18/$39/$79 or plan copy in components.                  |
| Fan plan display          | `web/lib/fan-plans.ts`                            | Import `FAN_PLAN_CATALOG` / `RELOAD_PACK_LABEL`; never repeat $5/$14.99 or allowances in components. |
| Effective creator access  | `src/billing/creator-plan-entitlement-service.ts` | Server-resolved plan/source/capability wire; never derive from subscription alone.                   |
| Billing lifecycle         | `PlanSubscription` via `subscription-sync.ts`     | Drives dunning, renewal, cancellation, and portal actions; does not override operator/pilot grants.  |
| Tip balance / fan plan    | `GET /api/v1/tips/wallet`                         | Drives wallet and insufficient-Tip routing.                                                          |
| Artist payout eligibility | `GET /api/v1/creator/earnings` + payout routes    | Drives onboarding, threshold, request, and history states.                                           |
| Feature availability      | API payload / 402 / 404                           | The web app does not read server feature-flag env variables.                                         |
| Visual decisions          | `docs/RELAY_DESIGN_CODE.md`                       | Binding for every changed frontend element.                                                          |


Stripe price IDs remain server-only. The client sends stable plan IDs; the server maps IDs to Stripe prices.

### 2. Unified creator access wire

Add an authenticated, Postgres-only presentation read:

`GET /api/v1/creator/plan-access`

```ts
type CreatorPlanAccessWire = {
  effective_plan: "studio_core" | "autopost" | "growth_engine" | null;
  entitlement_source: "stripe" | "operator_grant" | "pilot" | null;
  entitlement_expires_at: string | null;
  billing: {
    plan: "studio_core" | "autopost" | "growth_engine" | null;
    status: "active" | "past_due" | "canceled" | "incomplete" | "trialing" | null;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
  };
  capabilities: {
    studio_core: CreatorCapabilityWire;
    autopost: CreatorCapabilityWire;
    posting_assistant: CreatorCapabilityWire;
    growth_engine: CreatorCapabilityWire;
  };
};

type CreatorCapabilityWire = {
  allowed: boolean;
  required_plan: "studio_core" | "autopost" | "growth_engine";
  reason:
    | "included"
    | "operator_grant"
    | "pilot"
    | "legacy_feature_flag"
    | "plan_required"
    | "billing_past_due"
    | "feature_not_shipped";
};
```

Rules:

- Build this wire from `getCreatorPlanEntitlement`, subscription mirror data, and the existing posting-assistant bridge. It must not call Stripe.
- `operator_grant` / `pilot` wins exactly as MB-3 defines; the UI must label the access source and must not falsely say “No paid plan” when access is granted.
- `past_due` retains the effective entitlement behavior already defined by the server, while adding dunning presentation. Do not revoke client-side.
- `growth_engine.allowed` is false with `feature_not_shipped` for catalog promises not implemented yet; its checkout visibility follows the existing launch decision, not component guesswork.
- Existing server 402 `{ error: "plan_required", required_plan }` remains the write-path authority. A stale client that showed “allowed” must still handle 402 and render an upgrade wall.
- Cache: `private, no-store`. Creator scope and cross-tenant guards match existing billing/earnings routes.

### 3. Gate presentation state

Every purchasable gate renders all of:

1. Feature name and concise benefit.
2. State: Available / Included by grant / Upgrade required / Payment needs attention / Coming later.
3. Minimum plan, resolved from the shared catalog.
4. One primary action:
  - Upgrade required → `/studio/settings/billing?feature=<capability>`.
  - Payment needs attention → Billing Portal.
  - Included by grant/pilot → no checkout CTA; show source and optional expiry.
  - Feature not shipped → disabled “Coming later”; no checkout promise.
5. Keyboard/focus/disabled reason per Design Code §11.

Do not silently hide a gated feature a user can buy. Do not render an enabled control that will predictably 402.

### 4. Feature-off / build-dark behavior

- Billing/fan premium route 404 → explicit unavailable state on destination pages; contextual widgets may hide only when there is no useful action.
- Tips route 404 → wallet/Tip controls hide as they do today; plan education may still render catalog copy only if checkout is visibly unavailable.
- Connect unavailable/restricted → earnings and bill-credit history remain visible; only payout actions degrade.
- All unavailable/error branches include `data-testid`, accessible copy, and Retry when retry can change the outcome.

### 5. Onboarding contract

- Onboarding teaches plans but never requires payment.
- “Continue free” is always a first-class action.
- A paid selection uses the existing catalog and checkout API after account creation. Before redirect, persist the completed onboarding step so returning from Stripe cannot strand the user.
- Creator checkout returns to `/studio/settings/billing?from=onboarding`; fan checkout returns to `/plans?from=onboarding`. Query values are presentation context only and never authorize access.
- If billing is off, show catalog education with checkout disabled and allow free continuation.
- Do not create a second onboarding-only plan model.

### 6. Payout presentation contract

- Bill credit never requires Connect. UI copy must keep those concepts separate.
- Connect status states: `not_started`, `pending`, `restricted`, `complete`; payout enablement is separate.
- Request eligibility derives from `available_cents`, `payout_threshold_cents`, `payouts_enabled`, and positive balance; never from a local counter.
- Known 409s map to actionable copy:
  - `below_threshold` → show remaining amount.
  - `payouts_not_enabled` → resume onboarding.
  - `balance_not_positive` → disable request and explain.
- Unknown/transport failures preserve earnings data and show an action-local error.

---

## Work item


| #     | ID                                  | Depends on | Goal                                                                                            | Key paths                                                                                                               | Status   |
| ----- | ----------------------------------- | ---------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------- |
| MB-15 | `frontend-monetization-integration` | MB-1–14    | Entitlement-aware Studio walls, consumer plan funnels, onboarding plan steps, Connect payout UI | `src/billing/`, `src/server.ts`, `web/app/studio/`, `web/app/(consumer)/`, `web/app/components/onboarding/`, `web/lib/` | **done** |


**Required order:** MB-15A → MB-15B → MB-15C → MB-15D. A establishes the creator presentation wire; B establishes the patron funnel grammar; C reuses both; D completes the existing money-out surface.

---

## MB-15A `studio-entitlement-walls`

**Goal:** every existing paid Studio capability looks gated before activation, deep-links to the correct plan, and remains server-enforced.

**Key paths:**

- Server truth: `src/billing/creator-plan-entitlement-service.ts`, `src/creator/creator-feature-flags-service.ts`, `src/billing/subscription-sync.ts`, `src/server.ts`.
- Web wire/catalog: `web/lib/relay-api.ts`, `web/lib/creator-plans.ts`.
- Surfaces: `web/app/studio/settings/billing/`, `web/app/studio/autopost/`, `web/app/components/autopost-v0/RelayAutopostComposer.tsx`, `web/app/components/distribution/AutopostDistributionSteps.tsx`, `TransformerNodePage.tsx`, `PlatformSelectionPanel.tsx`.

**Steps:**

1. Implement `GET /api/v1/creator/plan-access` and typed web client per the frozen wire.
2. Add a shared Studio gate component following Design Code shell/state/accessibility rules. It accepts capability data, feature copy, and the intended child control; it does not fetch or infer plan state itself.
3. Gate the Autopost route/composer and existing Coach/posting-assistant controls. Keep read-only previews visible where safe; disable writes and show the reason/action.
4. Catch write-path 402 responses in Autopost/Coach flows and replace generic errors with the same gate + `/studio/settings/billing?feature=...` CTA.
4b. Schedule Rail Create Event is **Studio Core** (manual events + one-off reminders). Autopost remains the gate for generated sequences / AI assistant. See `docs/studio/PLAN_MANUAL_SOCIAL_EVENTS.md`.
5. Extend Billing settings:
  - highlight the requested feature/required plan from validated query context;
  - distinguish Stripe plan from effective operator/pilot access;
  - show grant source and expiry without a Manage Subscription button when no Stripe subscription exists;
  - retain dunning and portal behavior.
6. Represent AI usage as metered/plan-context copy only where usage data already exists. Do not invent quota numbers or gate the AI facade client-side without server support.

**State matrix:**


| Effective access      | Subscription  | UI                                                                            |
| --------------------- | ------------- | ----------------------------------------------------------------------------- |
| none                  | none          | Lock + minimum plan + upgrade CTA                                             |
| operator/pilot grant  | none          | Enabled + “Included by Relay” + expiry if present                             |
| legacy flag only      | none          | Posting Assistant enabled only + migration-bridge label; Autopost stays gated |
| active/trialing       | matching plan | Enabled + current plan                                                        |
| past_due              | mirrored plan | Follow server entitlement + dunning/portal CTA                                |
| stale UI receives 402 | any           | Replace action error with upgrade gate using `required_plan`                  |
| not shipped           | any           | Disabled “Coming later”; no false purchase promise                            |


**Acceptance criteria:**

- No-plan creator sees a clear lock and working billing deep-link before entering Autopost/Coach writes.
- Operator-granted creator sees enabled capability and accurate grant source even with `{ plan: null }` subscription.
- Flag-only pilot keeps Posting Assistant but does not gain unrelated Autopost access.
- A server 402 always wins over stale client state.
- Gated controls are keyboard reachable, have a visible focus ring, and expose the disabled reason.
- Visuals follow `RELAY_DESIGN_CODE.md`; no new plan/price literals in components.

**Tests:**

- `tests/creator-plan-access-route.test.ts`
- `tests/web/studio-entitlement-wall.test.tsx`
- `tests/web/autopost-plan-gate-ui.test.tsx`
- extend `tests/web/billing-settings.test.tsx`
- retain `tests/plan-gating-routes.test.ts`

---

## MB-15B `consumer-plan-funnel`

**Goal:** a patron can discover plans from normal navigation and recover from an insufficient Tip without a dead end.

**Key paths:**

- `web/components/patron/PatronPrimaryTopNav.tsx`
- `web/components/patron/TipWalletChip.tsx`
- `web/app/(consumer)/settings/PatronSettingsClient.tsx`
- `web/components/patron/TipRevealModal.tsx`
- `web/app/(consumer)/plans/FanPlansClient.tsx`
- `web/lib/fan-plans.ts`, `web/lib/relay-api.ts`

**Steps:**

1. Add Plans to patron navigation/account affordances without displacing Feed/Library/Inbox/Profile. Make the wallet chip a labeled link to `/plans`.
2. Add a compact “Tips & plan” settings section: current plan, allowance/balance, next grant, Manage/Compare link. Use wallet truth; 404 hides the module.
3. Change insufficient-Tip handling:
  - free fan → “Compare plans” CTA to `/plans?from=tip_reveal`;
  - paid fan → “Get more Tips” CTA to `/plans?from=tip_reveal#reload`;
  - preserve the failed reveal context so closing the modal returns to the same tile.
4. On `/plans`, consume validated `from` context to focus the relevant card/Reload section; never change entitlement based on query parameters.
5. Keep patronage framing: Tips unlock art and route value to artists. Never call Tips “promo spend” or cash-equivalent.

**Acceptance criteria:**

- Plans are reachable from patron navigation, wallet, and settings in two interactions or fewer.
- 402 `insufficient_tips` always yields a working next action; no “check back next month” dead end.
- Free fans never see a Reload Pack purchase CTA; paid fans do.
- Feature-off 404 behavior does not leave broken nav controls or empty cards.
- All plan names, prices, allowances, and windows come from shared catalogs/wallet wire.
- Consumer shell, spacing, colors, cards, focus states, and errors follow `RELAY_DESIGN_CODE.md`.

**Tests:**

- `tests/web/patron-plans-discoverability.test.tsx`
- `tests/web/tip-wallet-chip-link.test.tsx`
- `tests/web/tip-reveal-insufficient-plans-funnel.test.tsx`
- extend `tests/web/fan-plans-page.test.tsx`
- retain `tests/web/tip-reveal-modal.test.tsx`

---

## MB-15C `onboarding-plan-steps`

**Goal:** creator and patron onboarding explain the actual Relay business models and offer paid next steps without blocking free activation.

**Key paths:**

- Main wizard: `web/app/onboarding/page.tsx`, `web/app/components/onboarding/onboarding-wizard.tsx`, `step-panels.tsx`, `progress-stepper.tsx`.
- Patron legacy flow: `web/app/onboarding/patron/PatronOnboardingClient.tsx`.
- Catalogs/checkout: `web/lib/creator-plans.ts`, `web/lib/fan-plans.ts`, `web/lib/relay-api.ts`.
- Do not edit/reference as production: `web/onboarding_enhancement/`.

**Steps:**

1. Creator path: add “Choose your Relay plan” after profile basics and before final Sync & Review. Show Free + Studio Core + Autopost + Growth Engine from the catalog, including honest “coming later” treatment for unshipped Growth features.
2. Patron path: add “Choose how you support” after Patreon connection and before Feed. Show Free + Supporter + Curator from the catalog with Tip allowance/window/patronage copy.
3. Default to no paid selection. Provide equal-visibility “Continue free” and a paid CTA. Do not preselect the highest plan or use fake urgency/trial language.
4. Before paid redirect, persist the onboarding step as complete. On return context, show confirmation based on the actual subscription/wallet wire, not URL state.
5. Billing/fan-premium 404 → disable checkout, explain that paid plans are not available here, and allow free completion.
6. Align or redirect the legacy `/onboarding/patron` route so it cannot bypass contradictory plan education; preserve OAuth callback behavior.

**Acceptance criteria:**

- Both roles can complete onboarding without paying.
- Every displayed plan and price is imported from the shared catalog.
- Paid CTAs call checkout with the correct stable plan ID only after a Relay account exists.
- Refresh/back/Stripe-return cannot lose or duplicate onboarding progress.
- Screen-reader order is heading → plan choices → selected details → primary/secondary actions; keyboard selection is complete.
- UI uses onboarding shell tokens and motion/reduced-motion rules from `RELAY_DESIGN_CODE.md`; it does not copy Studio control-room density into onboarding.

**Tests:**

- `tests/web/onboarding-creator-plan-education.test.tsx`
- `tests/web/onboarding-supporter-plan-selection.test.tsx`
- `tests/web/onboarding-plan-skip-path.test.tsx`
- extend `tests/account-first-onboarding-smoke.test.ts`
- retain creator onboarding transition/route tests

---

## MB-15D `earnings-connect-ui`

**Goal:** complete MB-12’s payout center in Studio Earnings while keeping bill credits available without Connect.

**Key paths:**

- UI: `web/app/studio/earnings/EarningsDashboardClient.tsx`, `page.tsx`.
- Web API: `web/lib/relay-api.ts`.
- Routes/services: `src/server.ts`, `src/payouts/connect-onboarding-service.ts`, `src/payouts/payout-service.ts`, `src/ledger/artist-ledger-service.ts`.

**Steps:**

1. Add typed `fetchCreatorPayouts()` for `GET /api/v1/creator/payouts`; define a stable payout-history wire in `web/lib/relay-api.ts`.
2. Build the payout center:
  - optional Connect onboarding/resume CTA;
  - onboarding status and restrictions;
  - threshold progress (`available / threshold`, clamped visually but showing exact values);
  - request payout button only when server-derived conditions allow;
  - payout history with requested/in-transit/settled/failed states and failure reason.
3. Handle `?connect=return|refresh` by refetching earnings/payouts and showing actual status. Query value is not success proof.
4. Map known 409s to the frozen actionable copy. Keep earnings ledger and bill-credit panels visible on payout failure.
5. After successful request, refetch both earnings and payout history; never optimistically subtract money before server confirmation.
6. Copy must state: “Cash payouts are optional — bill credit needs no setup.”

**Acceptance criteria:**

- No payout account → optional onboarding CTA; bill-credit panel remains fully functional.
- Pending/restricted accounts receive a resume/fix CTA, not a request button.
- Below threshold shows exact remaining cents formatted as money and disables request.
- Eligible creator can request once; response refreshes balance/history and prevents duplicate in-flight requests.
- Failure preserves data and presents an action-local accessible error.
- History renders every server status and does not conflate transfer settlement with invoice credit.
- UI follows Studio token, money, state, and accessibility rules in `RELAY_DESIGN_CODE.md`.

**Tests:**

- `tests/web/earnings-connect-onboard.test.tsx`
- `tests/web/earnings-request-payout.test.tsx`
- `tests/web/earnings-payout-history.test.tsx`
- `tests/creator-payouts-route.test.ts`
- extend `tests/web/earnings-dashboard.test.tsx`
- retain `tests/connect-onboarding.test.ts`, `tests/payout-service.test.ts`

---

## Cross-slice browser acceptance matrix

Use seeded/mocked development states. Do not mutate live Stripe data.


| Persona/state                     | Route/action            | Required observation                                                                            |
| --------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------- |
| Creator, no plan                  | `/studio/autopost`      | Lock explains Autopost plan and reaches highlighted Billing card.                               |
| Creator, operator grant           | gated Studio controls   | Enabled; grant source/expiry accurate; no false portal CTA.                                     |
| Creator, past due                 | gated control + Billing | Server access honored; visible dunning and portal action.                                       |
| Patron, Free, 0 Tips              | failed reveal           | Compare-plans CTA; Free remains current on `/plans`.                                            |
| Patron, Supporter/Curator, 0 Tips | failed reveal           | Reload-focused CTA; no free-plan downgrade confusion.                                           |
| Creator onboarding                | plan step               | Continue-free and paid paths both complete/persist.                                             |
| Patron onboarding                 | plan step               | Free/Supporter/Curator education; free path completes.                                          |
| Artist, no Connect                | `/studio/earnings`      | Earnings + bill credit visible; optional onboarding CTA.                                        |
| Artist, below threshold           | request payout          | Progress/remaining amount; request disabled.                                                    |
| Artist, eligible                  | request payout          | Single request, refreshed balance/history.                                                      |
| All flags off                     | affected routes         | Existing free product works; no broken controls; explicit unavailable states where appropriate. |


Capture desktop and narrow/mobile screenshots for the touched routes and check focus order at both widths.

---

## Exit checklist

- MB-15A–D acceptance criteria and named tests pass.
- Root: targeted tests, `npm run test`, `npm run build`.
- Web: targeted component tests, `npm run lint`, `npm run build`.
- Browser acceptance matrix passes at desktop and narrow/mobile widths.
- `RELAY_BILLING_ENABLED`, `RELAY_TIPS_BETA`, and `RELAY_FAN_PREMIUM_ENABLED` off regression: free onboarding and free Studio/patron paths remain usable.
- No duplicated price, allowance, threshold, feature ladder, or Stripe price ID literals in component files.
- Operator grant, legacy flag, active/trialing, past-due, canceled, insufficient-Tip, Connect pending/restricted, below-threshold, transfer-failed states are all represented.
- Every touched frontend element follows [RELAY_DESIGN_CODE.md](RELAY_DESIGN_CODE.md), including shell tokens, designed states, keyboard behavior, focus rings, test IDs, and reduced motion.
- Dev stack restarted after backend/web changes and API/web listeners confirmed.
- Human launch gates remain documented and unmodified: real price IDs, Connect platform profile, live keys/webhooks/tax, and final plan copy signoff.

---

## Return to (not MB-15)

- Growth Engine feature implementation beyond truthful “coming later” presentation.
- Retirement of the legacy `posting_assistant_enabled` migration bridge.
- Annual pricing and Stripe Tax.
- Exposure Feed + Boost mechanics.
- Storefront checkout and discounts.
- High-risk adult monetization rail.
- Live-mode Stripe/Connect launch operations.

