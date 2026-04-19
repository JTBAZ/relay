# Extension build prompts — index

**Phase 0 verified ✅ 2026-04-18** — Repo automation (A1–A3, B–D via Vitest); operator still completes E1, E2, and staging **F1** per [`EXT-0V-phase0-verify-prompt.md`](EXT-0V-phase0-verify-prompt.md) before claiming Phase 1.

**Phase 1 verified ✅ 2026-04-18** — Automated: A1–A2 (`web` build + root Vitest), B1–B2 (middleware redirect tests in `web/__tests__/middleware.test.ts`), D2 (extension CTA before Advanced `<details>`, default closed), E1 (no raw `fetch("/api/…")` under `web/app/extension/` or `web/app/settings/connected-extensions/`). Operator: C1–C3 + D1 in browser against a running Relay API per [`EXT-1V-phase1-verify-prompt.md`](EXT-1V-phase1-verify-prompt.md).

**Phase 2 verified ✅ 2026-04-18** — Automated: `cd extension && npm i`, `npm run verify:phase2` (P-12 no `localhost` in `dist/chrome-prod/`, dev manifest localhost allowances, Firefox prod build). Operator: Chrome **Load unpacked** `extension/dist/chrome-dev/` + service worker + popup spot-check per [`EXT-2V-phase2-verify-prompt.md`](EXT-2V-phase2-verify-prompt.md). **No `web_accessible_resources`** in v1 manifests.

**Phase 3 build (3.A–3.D) — Done ✅ 2026-04-18** — Shipped: `browser.ts`, `storage.ts`, `sync-now.ts`, `messages.ts`, full `background.ts`, API `token_id` on consent exchange. Next: operator + automated checks in [`EXT-3V-phase3-verify-prompt.md`](EXT-3V-phase3-verify-prompt.md) before claiming Phase 3 fully verified.

**Phase 4 build (4.A) — Done ✅ 2026-04-18** — Popup: `popup.html`, `popup.css`, `popup.ts` + `lib/constants.ts` (shared URLs).

**Phase 4 verified ✅ 2026-04-18** — Automated: prod popup entry `dist/chrome-prod/assets/popup.html-*.js` **4787 B** (< 20 KiB); `rg "cookie\.value|session_id"` has no hits on that file or its preloaded `constants-*.js`; `npm run build:chrome:dev`, `npm run verify:phase2`; root `npm run test`, `npm run build`, `npm run build --prefix web`. Operator: A1–A4, B1–B2, D2 per [`EXT-4V-phase4-verify-prompt.md`](EXT-4V-phase4-verify-prompt.md). [`EXT-3V`](EXT-3V-phase3-verify-prompt.md) remains the Phase 3 operator gate if not yet completed.

**Phase 5 (EXT-5V)** — **Not done:** full matrix + operator sign-off (A–E, G) and **Phase 5 verified** (H1) per [`EXT-5V-e2e-verify-prompt.md`](EXT-5V-e2e-verify-prompt.md). Automated regression slice (F1–F3, F4 hygiene) last green: **2026-04-18** (`npm run test`, `npm run build --prefix web`).

**Phase 6.A build — Done ✅ 2026-04-18** — Public extension privacy notice: [`web/app/legal/extension-privacy/page.tsx`](../../../web/app/legal/extension-privacy/page.tsx) → `/legal/extension-privacy` (required store URL after deploy: `https://relayapp.me/legal/extension-privacy`).

**Phase 6.B build — Done ✅ 2026-04-18** — Store copy: [`extension/store/chrome/`](../../../extension/store/chrome/) and [`extension/store/firefox/`](../../../extension/store/firefox/) (`description.md`, `short_description.txt` ≤132 chars Chrome, `justifications.md`).

**Phase 7.C build — Done ✅ 2026-04-18** — Operations runbook: [`docs/operations/extension-runbook.md`](../../../docs/operations/extension-runbook.md) (publish loop, emergency `sessions` revoke SQL, `RELAY_EXTENSION_CONSENT_SECRET` / `RELAY_TOKEN_ENCRYPTION_KEY` rotation notes).

**Phase 7.B build — Done ✅ 2026-04-18** — [`InstallExtensionPrompt`](../../../web/app/components/InstallExtensionPrompt.tsx) + [`web/lib/extension-store-urls.ts`](../../../web/lib/extension-store-urls.ts): store URLs from `NEXT_PUBLIC_RELAY_EXTENSION_{CHROME,EDGE,FIREFOX}_URL` (see [`web/.env.example`](../../../web/.env.example)); [`web/app/patreon/cookie/page.tsx`](../../../web/app/patreon/cookie/page.tsx) (removed “Pending publication”); onboarding [`StepPatreonConnect`](../../../web/app/components/onboarding/step-panels.tsx); designer [`DesignerView`](../../../web/app/designer/DesignerView.tsx) when `GET /api/v1/patreon/cookie/status` reports no cookie. Set HTTPS listing URLs on production after **EXT-6V**.

**Next claimable:** [`EXT-6H-build-sign-submit-prompt.md`](EXT-6H-build-sign-submit-prompt.md) (human: sign + upload zips). **Repo helper:** `extension/` has `npm run pack:chrome`, `pack:firefox`, `pack:store` after prod builds ([`extension/README.md`](../../../extension/README.md)). Then [`EXT-7H-pin-extension-ids-prompt.md`](EXT-7H-pin-extension-ids-prompt.md) for production CORS/consent IDs. Operator: [`EXT-5V`](EXT-5V-e2e-verify-prompt.md), [`EXT-3V`](EXT-3V-phase3-verify-prompt.md) as needed.

**Parent plan:** [`docs/EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md)

**Companion docs:** [`docs/AUTH_GUARDRAILS_TIER_1.md`](../../AUTH_GUARDRAILS_TIER_1.md) · [`docs/qa/HTTP_VERB_HYGIENE.md`](../../qa/HTTP_VERB_HYGIENE.md)

**Project context:** [`AGENTS.md`](../../../AGENTS.md) — repo map; use paths shown there when referencing areas.

---

## How to use this folder

Each file is a **standalone, claimable build prompt** for one extension-program work item. Agents should:

1. Read **only** the prompt for the claimed row and the files it lists under **Reference reading**.
2. Verify **Preconditions** before starting. If unmet, mark the row **Blocked** with Delta Out naming the missing item.
3. Execute **Implementation steps** (build rows) or **Verification checklist** (gate rows) in order.
4. Satisfy **Acceptance criteria** before handoff.
5. Write **Handoff** / **Delta Out** for the next builder.

---

## Build hierarchy (claim order follows the dependency graph)

### Phase 0 — Backend prerequisites

| # | File | Goal | Type |
|---|------|------|------|
| 0.A | [`EXT-0A-cookie-endpoint-auth-prompt.md`](EXT-0A-cookie-endpoint-auth-prompt.md) | Auth on `/api/v1/patreon/cookie` POST, DELETE, GET status | Build |
| 0.B | [`EXT-0B-session-kind-extension-ttl-prompt.md`](EXT-0B-session-kind-extension-ttl-prompt.md) | `Session.kind`, extension TTL, `touchSessionExpiry` | Build |
| 0.C | [`EXT-0C-extension-consent-endpoints-prompt.md`](EXT-0C-extension-consent-endpoints-prompt.md) | Consent start/exchange + grants list/revoke | Build |
| 0.D | [`EXT-0D-rate-limiting-prompt.md`](EXT-0D-rate-limiting-prompt.md) | In-memory rate limits for consent + cookie writes | Build |
| 0.E | [`EXT-0E-cors-extension-allowlist-prompt.md`](EXT-0E-cors-extension-allowlist-prompt.md) | `RELAY_EXTENSION_ORIGINS` CORS for extension routes only | Build |
| 0.V | [`EXT-0V-phase0-verify-prompt.md`](EXT-0V-phase0-verify-prompt.md) | Phase 0 verification gate | Verify |

### Phase 1 — Web (after 0.V)

| # | File | Goal | Type |
|---|------|------|------|
| 1.A | [`EXT-1A-consent-page-prompt.md`](EXT-1A-consent-page-prompt.md) | `/extension/authorize` | Build |
| 1.B | [`EXT-1B-connected-extensions-page-prompt.md`](EXT-1B-connected-extensions-page-prompt.md) | `/settings/connected-extensions` | Build |
| 1.C | [`EXT-1C-cookie-page-cta-prompt.md`](EXT-1C-cookie-page-cta-prompt.md) | Cookie page extension CTA | Build |
| 1.V | [`EXT-1V-phase1-verify-prompt.md`](EXT-1V-phase1-verify-prompt.md) | Phase 1 verification gate | Verify |

### Phase 2 — Extension scaffold

| # | File | Goal | Type |
|---|------|------|------|
| 2.A | [`EXT-2A-workspace-tooling-prompt.md`](EXT-2A-workspace-tooling-prompt.md) | `extension/` workspace + Vite | Build |
| 2.B | [`EXT-2B-production-manifest-prompt.md`](EXT-2B-production-manifest-prompt.md) | Manifests + prod Chrome manifest JSON | Build |
| 2.V | [`EXT-2V-phase2-verify-prompt.md`](EXT-2V-phase2-verify-prompt.md) | Phase 2 verification gate | Verify |

### Phase 3 — Extension background worker

| # | File | Goal | Type | Status |
|---|------|------|------|--------|
| 3.A | [`EXT-3A-storage-shape-prompt.md`](EXT-3A-storage-shape-prompt.md) | Typed `chrome.storage.local` wrapper | Build | **Done** |
| 3.B | [`EXT-3B-background-worker-prompt.md`](EXT-3B-background-worker-prompt.md) | Service worker: messages, alarms, cookies | Build | **Done** |
| 3.C | [`EXT-3C-sync-now-prompt.md`](EXT-3C-sync-now-prompt.md) | `SYNC_NOW` + POST cookie ingest | Build | **Done** |
| 3.D | [`EXT-3D-cross-browser-shim-prompt.md`](EXT-3D-cross-browser-shim-prompt.md) | `browser.ts` polyfill re-export | Build | **Done** |
| 3.V | [`EXT-3V-phase3-verify-prompt.md`](EXT-3V-phase3-verify-prompt.md) | Phase 3 verification gate | Verify | Next |

### Phase 4 — Extension popup

| # | File | Goal | Type | Status |
|---|------|------|------|--------|
| 4.A | [`EXT-4A-popup-ui-prompt.md`](EXT-4A-popup-ui-prompt.md) | Popup markup, CSS, states | Build | **Done** |
| 4.V | [`EXT-4V-phase4-verify-prompt.md`](EXT-4V-phase4-verify-prompt.md) | Phase 4 verification gate | Verify | **Done** |

### Phase 5 — End-to-end QA

| # | File | Goal | Type | Status |
|---|------|------|------|--------|
| 5.V | [`EXT-5V-e2e-verify-prompt.md`](EXT-5V-e2e-verify-prompt.md) | Staging test matrix + human gate | Verify | Next |

### Phase 6 — Privacy, store, submission

| # | File | Goal | Type | Status |
|---|------|------|------|--------|
| 6.A | [`EXT-6A-privacy-policy-prompt.md`](EXT-6A-privacy-policy-prompt.md) | Public extension privacy page | Build | **Done** |
| 6.B | [`EXT-6B-store-listings-prompt.md`](EXT-6B-store-listings-prompt.md) | Store copy + justifications | Build | **Done** |
| 6.H | [`EXT-6H-build-sign-submit-prompt.md`](EXT-6H-build-sign-submit-prompt.md) | Operator: sign + submit zips | Human | Next |
| 6.V | [`EXT-6V-store-review-gate-prompt.md`](EXT-6V-store-review-gate-prompt.md) | In review / store gate | Verify | |

### Phase 7 — Post-launch

| # | File | Goal | Type | Status |
|---|------|------|------|--------|
| 7.H | [`EXT-7H-pin-extension-ids-prompt.md`](EXT-7H-pin-extension-ids-prompt.md) | Operator: pin IDs in env | Human | Next |
| 7.B | [`EXT-7B-update-cta-urls-prompt.md`](EXT-7B-update-cta-urls-prompt.md) | Live store links + `InstallExtensionPrompt` | Build | **Done** |
| 7.C | [`EXT-7C-operational-runbook-prompt.md`](EXT-7C-operational-runbook-prompt.md) | `docs/operations/extension-runbook.md` | Build | **Done** |

Further detail: [`DECOMPOSER-ORIENTATION.md`](DECOMPOSER-ORIENTATION.md) §3.


---

## Dependency graph (visual)

```
0A ─┐
0B ─┤
0C ─┤   (0A, 0B, 0C, 0D, 0E may run in parallel)
0D ─┤
0E ─┘
    └─> 0V ──> 1A ─┐
                   ├─> 1V ──> 2A ──> 2B ──> 2V ──> 3A ─┐
              1B ──┤                                    ├─> 3V ──> 4A ──> 4V ──> 5V ──> 6A ─┐
              1C ──┘                               3B ──┤                                    ├─> 6H ──> 6V ──> 7H ──> 7B ──┐
                                                  3C ──┤                                    │                              ├─> ✅
                                                  3D ──┘                               6B ──┘                         7C ──┘
```

Edges preserved:

- 0A–0E: no upstream EXT dependencies; all five unblocked at session start.
- 0V depends on 0A–0E.
- 1A, 1B, 1C depend on 0V; 1V depends on all three.
- 2A → 2B → 2V strictly sequential.
- 3A–3D depend on 2V; 3V depends on all four.
- 4A depends on 3V; 4V depends on 4A.
- 5V depends on 4V.
- 6A and 6B depend on 5V; 6H depends on both; 6V depends on 6H (and store review).
- 7H depends on 6V; 7B and 7C depend on 7H.

---

## Tier 0 invariants (every PR must respect)

Repeated in every prompt. Source: [`docs/Airtable Drops/Guardrails/00-README.md`](../Guardrails/00-README.md) lines 87–94:

1. **No JS reads `relay_session`.** It is `HttpOnly`. Web code never sees the token.
2. **No handler grants permission based on `relay_active_role`.** That cookie is a UI hint. Authz is derived from DB rows (`Account.primaryRelayCreatorId`, `TenantMembership`).
3. **No FK or RLS policy references `public_slug` or `relay_creator_id`.** Both can change shape under us; `Tenant.id` (UUID) is the only safe key.
4. **One Account, one Supabase user, one cookie.** A second simultaneous sign-in must invalidate the first server-side.
5. **All web calls go through `relayFetch`.** Raw `fetch("/api/...")` is forbidden after Stage 1.3 lands.
6. **All `/api/v1/*` routes use `requireAccount` / `requireAccountWithRole`** unless explicitly public with a `// PUBLIC: <reason>` comment.
7. **All redirects derived from user input pass through `resolvePostAuthPath`.**
8. **All mutations use POST/PUT/PATCH/DELETE.** GETs are side-effect-free.

**Extension program add-on (plan §0 compliance):** The browser extension never reads `relay_session`; it uses `Authorization: Bearer` with the Relay-issued extension grant after the consent handshake. Patreon cookie routes use `requirePatronBearerSession` + `requireAccountMatchesCreator` per [`EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md) Phase 0.A / 0.C.

---

## Estimated effort

| Phase | Total | Parallelizable? |
|---|---|---|
| Phase 0 (5 build + 1 verify) | 4–6 days | 0A + 0B + 0C + 0D + 0E in parallel; 0V serial |
| Phase 1 (3 build + 1 verify) | 2–3 days | 1A + 1B + 1C in parallel; 1V serial |
| Phase 2 (2 build + 1 verify) | 1–2 days | Sequential |
| Phase 3 (4 build + 1 verify) | 3–4 days | 3A first; 3B/3C/3D parallel after; 3V serial |
| Phase 4 (1 build + 1 verify) | 1 day | Sequential |
| Phase 5 (1 verify) | 0.5–1 day | — |
| Phase 6 (2 build + 1 human + 1 review-gate) | 1–2 days work + 1–2 weeks store review | 6A + 6B parallel; 6H + 6V serial |
| Phase 7 (1 human + 2 build) | 1 day + post-publish | 7B + 7C parallel after 7H |
| **Total** | **~3 weeks engineering + 1–2 weeks store review** | |

---

## Builder orientation

Short paste doc: [`BUILDER-ORIENTATION.md`](BUILDER-ORIENTATION.md)

Decomposer instructions (do not edit for execution): [`DECOMPOSER-ORIENTATION.md`](DECOMPOSER-ORIENTATION.md)
