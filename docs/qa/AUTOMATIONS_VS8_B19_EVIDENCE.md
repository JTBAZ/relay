# Automations VS8 / B19 — AU evidence map

Batch: **B19 / AUT-VS8-T01**. Diagnoses only; no production behavior changes; `RELAY_FEATURE_AUTOMATIONS` remains default-off.

## Automated pass evidence (2026-07-20)

| AU | Automated evidence | Result |
|---|---|---|
| AU-01 | `tests/web/automations-modal.test.tsx`, `tests/web/automations-flow.test.tsx` | Pass (in full suite) |
| AU-02 | `tests/automations/automation-service.test.ts`, `tests/web/automations-flow.test.tsx`, create-body freeze in `integration.test.ts` | Pass |
| AU-03 | `tests/automations/trigger-series.test.ts` | Pass |
| AU-04 | `source-resolver`, `automation-reconcile`, `concurrency` (dual `createOrGet`) | Pass |
| AU-05 | reconcile skip + notification deliver; prepare `no_eligible_post` in `integration.test.ts` | Pass |
| AU-06 | materializer + reconcile prepare path; attention event reuse in `concurrency.test.ts` | Pass |
| AU-07 | `automation-attention.test.ts`; deep-link parity in `integration.test.ts` | Pass |
| AU-08 | `automation-approval.test.ts`, `tests/web/automation-previewizer.test.tsx` | Pass |
| AU-09 | approval plan ordering (reject before preview; include after export) | Pass |
| AU-10 | lifecycle service + reconcile expiry/skip + flow pause/archive | Pass |
| AU-11 | `delayed-release.test.ts` + create-body freeze | Pass |
| AU-12 | flag-off default; spine characterization; no shadow ledger; suite inventory; concurrency notify once-ever key | Pass |

Focused command:

```bash
npx vitest run tests/automations
# → 16 files / 146 tests passed
```

Also green: `npx prisma validate`, `npm run build`, `npm run lint --prefix web` (warnings only), `npm run build --prefix web`, `npm run build --prefix extension`.

## Named human / external gates (not fabricated)

These remain **human gates** for B20 / release owner — not claimed pass in B19:

1. **Browser a11y matrix** — keyboard-only modal, focus return, screen-reader labels, reduced motion (VS8 manual matrix).
2. **Live extension offline** — sticky reminder toast with real extension connected/offline (not store publish).
3. **Production migration apply** — deploy migrations as a separate approved step.
4. **Flag activation** — flip `RELAY_FEATURE_AUTOMATIONS` only after runbook + release owner approval.
5. **Live OAuth / destination unlink** — real Patreon/X credential paths under a QA persona.
6. **72-hour expiry fixture in a live env** — durable TTL against a real clock/worker.

## Full-repo notes (out of Automations scope)

- `npm run typecheck` reports many pre-existing errors outside Automations (extension polyfill, audience-promotion imports, coach fixtures, etc.). Not reopened as AU owners.
- `npm run test` (full vitest): Automations suites including new `integration` / `concurrency` and web automations UI tests passed inside the run. Remaining failures (goal-cycle isolation, analytics overview, patron collections, scrape, etc.) are **pre-existing / other programs** — not AU reopen owners for B19.

## Reopen status

No Automations behavior defect found that requires reopening a VS0–VS7 owner via `TRACEABILITY.md`. Harness-only fixes applied in B19 test files only.
