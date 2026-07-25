# ESCAPE_HATCH_EH_082_EVIDENCE

**Slice:** EH-082 Release security and independence (local QC acceptance)  
**Date:** 2026-07-23  
**productionSafe:** false  
**Builder:** Cursor Grok 4.5 High  
**Acceptance class:** Honest **LOCAL** security / independence QC only — not a production release stamp.

## Verdict

| Gate | Result |
|------|--------|
| Local security / independence acceptance | **PASS** |
| Overall production release gate | **OPEN / BLOCKED** on human checklist + live-provider proofs |

`productionSafe` remains **`false`**. Next step is **`HUMAN-SIGNOFF`** (final human + live-provider release gate), not another numbered implementation slice.

## Delivered security fixes (this master pass)

1. **Local-preview read gate** — localhost page allowed; spoofed `Host` shows local-machine denial and withholds controls. Admin API without `x-escape-hatch-local` returns 403; UI clients use the shared helper.
2. **Billing portal IDOR** — client-supplied Stripe customer ID is no longer trusted without configured identity/session binding.
3. **`public_legacy` premium hard block** — refused at generation (`mediaLayout`), blocked at config/delivery for premium bytes; default remains private staging (`local_private` / `private_r2`).
4. **Ownership packet** — generator produces env-name inventory only; independence proof stamped `local_native_passed_live_provider_open` (does **not** claim live provider independence).

## Verification evidence (master acceptance, 2026-07-23)

- Package typecheck passes; full suite **35 files / 417 tests** passes.
- Fresh generated kit `npm install` / audit: **0 vulnerabilities**; build succeeds without Relay/provider env and without prior critical dynamic-import warning; generated kit typecheck passes. Only a benign monorepo multi-lockfile root inference warning remains locally.
- No generated package import from the Relay monorepo; browser resource scan had **0 external / 0 Relay** requests.
- Local-preview read gate and admin local-operator header coverage verified as above.
- Billing portal IDOR fix verified (customer ID not trusted without identity/session).
- `public_legacy` premium media hard-blocked at generation/config/delivery; default private staging.
- Browser representative desktop + approx **390px** admin/visitor journey passed; mobile rails usable; Gold preview unlocks. Recovery note persisted. Observed Next hydration diagnostic was caused only by Cursor browser injecting `data-cursor-ref` before hydration, not app markup.
- Live local media matrix after final fix: anonymous→`m_members` **401**; Gold→`m_members` **200**; Silver→`m_gold` **403**; Gold→`m_gold` **200**.
- Backup + isolated restore passed (target under `data/restore-rehearsal`); two fixture promote operations then rollback restored previous stable.
- Ownership packet generated, contains env names only; secret scan found no real secrets (only known explicit dev/test placeholders elsewhere).
- Provider policy evidence refreshed for current Vercel/Resend restrictions: [`docs/studio/escape-hatch-build-plans/13-PROVIDER-POLICY-EVIDENCE.md`](../studio/escape-hatch-build-plans/13-PROVIDER-POLICY-EVIDENCE.md) (**review date 2026-07-23**).

## Supported preview adapters (release notes)

| Domain | Supported / named adapters | Honesty |
|--------|----------------------------|---------|
| **Identity** | Local preview (`none`); Supabase Path A; portable Path B | Preview / configured readiness only — not live multi-tenant certification |
| **Media** | `local_private`, `private_r2` | Premium via `/api/media` after `evaluateAccess`. **`public_legacy` premium forbidden** (generation + delivery) |
| **Patreon** | Creator-owned OAuth; optional Relay-managed verification | Preview adapters; live multi-tenant managed outage drill remains open |
| **Billing** | Stripe eligible-business adapter + NOWPayments crypto preview | CCBill/Segpay and other high-risk recipes remain **guidance only** |
| **Email** | Resend preview recipe (env names) | Live SMTP/API and adult ToS selection open |
| **Deploy** | Vercel fixture path + Docker Path B recipe | Live Vercel API / Docker daemon / MojoHost wizard support open |
| **Backup / restore** | Kit-local fixture + isolated restore rehearsal | Live Postgres/R2 provider backup open |

## Explicit non-claims

- No live Vercel / Docker daemon / Postgres / R2 / provider-sandbox proof in this stamp.
- No signed human checklist (`HUMAN-SIGNOFF` remains open).
- Not production-safe — do not flip `productionSafe` or treat local QC as a release.
- Ownership packet does **not** claim live remove-Relay / live-provider independence — only local native QC passed with live provider gate still open.
- Historical evidence docs (EH-080 and earlier) are not rewritten; this file is the EH-082 milestone report / release notes.

## Status stamp

- `ESCAPE_HATCH_SLICE = EH-082`
- `deliverable: prototype_preview_only`
- `productionSafe: false`
- Next: **`HUMAN-SIGNOFF`** — human checklist + live-provider proofs before any production claim.
