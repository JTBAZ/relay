# Escape Hatch EH-043 milestone evidence

**Status:** Accepted as a preview-only OAuth choice and migration UX path  
**Completed:** 2026-07-22  
**Master planner/reviewer:** Sol  
**Implementation builder:** Cursor Grok 4.5 High ([EH-043 builder](d3409804-3378-404f-ab6a-3bbee2a96378))  
**Acceptance close-out:** Sol (contract + freeze gates + security disposition)  
**Slice:** EH-043 — OAuth choice and migration UX  
**Next dependency:** EH-050 — Billing provider contract  
**productionSafe:** `false` (unchanged)

## Scope and ownership

EH-043 ships a **neutral Hatch Console choice** between creator-owned Patreon OAuth and Relay-managed verification, with disclosure, setup/health, and switch-off without site rebuild — preserving EH-040–042 fail-closed honesty.

### Kit (`packages/escape-hatch`)
- `/admin/patreon/choice` — equal-weight options (**Own your Patreon connection** vs **Let Relay maintain it**); **neither preselected**; Continue disabled until explicit selection.
- Disclosure cards for both paths: data handled, runtime dependencies, cancellation effects, migration path; managed monthly price from EH-042 product copy (`$29.00/mo` default / `ESCAPE_HATCH_RELAY_CONNECTOR_PRICE_CENTS`).
- `/admin/patreon` — health summary (adapter + billing entitlement + kill switches), per-mode setup checklists, bounded outage copy, switch-off UI.
- Non-secret preference: `data/patreon-mode-preference.json` (fail closed; never tokens). Runtime authority remains `ESCAPE_HATCH_PATREON_MODE`.
- `POST /api/admin/patreon/mode-preference` — save choice or `switch_off_to_creator_oauth` (patrons preserved; rebuild not required).
- Status slice **EH-043** → next **EH-050**; `productionSafe` remains **`false`**.

It does **not** implement EH-050/051 Stripe adapters or flip `productionSafe`.

## Automated evidence

Builder freeze + Sol acceptance re-run 2026-07-22:

| Command | Exit | Result |
|---|---:|---|
| `npx tsx packages/escape-hatch/src/cli.ts status --json` | 0 | Slice **EH-043**; next **EH-050**; `productionSafe: false` |
| `npm run typecheck --prefix packages/escape-hatch` | 0 | Package TypeScript passed |
| `npm run escape-hatch:test` | 0 | 19 files, **313 tests** passed (incl. `escape-hatch-oauth-choice.test.ts`) |

## Security review (mandatory gate)

Security review subagent ([Security Review](e7201965-e45a-4564-98ff-99f02b1f4330)) scoped to EH-043 uncommitted owned paths.

**Result:** no medium, high, or critical findings.

| Focus | Verdict |
|---|---|
| No managed default selection | Pass |
| No secrets in UI / preference file | Pass |
| Preference not runtime authority | Pass |
| Switch-off preserves patrons / no rebuild | Pass |
| EH-040/041/042 fail-closed gates preserved | Pass |
| Open-redirect-safe links | Pass |

Optional hardening (not required): kit `buildAuthorizeUrl` could also gate on `canUseRelayManaged` (mint already gated on Relay).

## Residual / Milestone 4 gate honesty

- Both paths pass in kit/CI honesty; managed outage is **bounded** in copy + health degrade when not entitled / kill-switched / incomplete.
- Migration requires **no site rebuild** (env + preference + EH-040 checklist).
- Live multi-tenant managed-verify outage + migration drill beyond kit/CI remains open.
- Milestone 3 browser personas + broader security gate remains open → `productionSafe: false`.

## Privacy / data-processing (names only)

Preference file may store: site id, preferred mode, selected/switch-off timestamps. Must not store Patreon tokens, client secrets, assertion private keys, or Stripe secrets. Cancellation must not delete linked patrons.
