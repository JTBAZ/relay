# Schedule Rail Automations — release evidence & human checklist

Program handoff for VS8 / **B20 (AUT-VS8-T02)**. Automated AU pass map: [`AUTOMATIONS_VS8_B19_EVIDENCE.md`](AUTOMATIONS_VS8_B19_EVIDENCE.md). Operations: [`../studio/AUTOMATIONS_RUNBOOK.md`](../studio/AUTOMATIONS_RUNBOOK.md).

**Do not forge signatures.** Agents stage the package; humans authorize production migration, flag flips, and live checks.

---

## Agent package status (2026-07-20)

| Item | Status |
|------|--------|
| AU-01…AU-12 automated evidence | **Pass** (or named human gate) — see B19 evidence |
| Runbook (flags, workers, rollback, recovery) | **Written** — `docs/studio/AUTOMATIONS_RUNBOOK.md` |
| Flag default | **`RELAY_FEATURE_AUTOMATIONS=false`** (unchanged) |
| Production migration applied | **Not performed** (human stop) |
| Production / staging flag on | **Not performed** (human stop) |
| Extension store publish | **Not in scope** / not performed |
| Browser a11y + live extension matrix | **Human gate** |

Immutable build SHA: _record at human sign-off_  
Environment recorded for agent package: local verification commands only (not production)

---

## Deploy sequence (human)

1. **Migrate** staging DB with Automations Prisma migrations (see runbook §3).
2. Deploy API + workers with flag **false** and optionally `RELAY_AUTOPOST_AUTOMATIONS_MS=0`.
3. Smoke flag-off: create automation → `AUTOMATION_DISABLED`; no reconcile materialization.
4. Enable worker interval on staging; set `RELAY_FEATURE_AUTOMATIONS=true` for a **named QA persona only**.
5. Walk manual/browser matrix (below); confirm no autonomous publish.
6. Soft rollback rehearsal (`MS=0` then flag false) before any production flip.
7. Production: migrate → deploy flag-off → observe → flag on only after checklist signatures.

---

## Manual / browser matrix (sign each)

| Check | Signer | Date | Result |
|-------|--------|------|--------|
| Autopost eligible vs gated creator | ________ | ________ | ☐ |
| Empty modal + two presets + missing-template repair | ________ | ________ | ☐ |
| Weekly Preview & crosspost; visible-month rail ticks | ________ | ________ | ☐ |
| Due ready event; sticky reminder; deep-link resume | ________ | ________ | ☐ |
| Previewizer preload / tweak / cancel / export / explicit send | ________ | ________ | ☐ |
| Extension connected + offline fallback | ________ | ________ | ☐ |
| Delayed public release create/edit/pause/resume/history | ________ | ________ | ☐ |
| 72-hour expiry fixture (staging clock or accelerated TTL) | ________ | ________ | ☐ |
| Keyboard-only, focus return, labels, reduced motion | ________ | ________ | ☐ |
| Wide rail + narrow mobile Automations entry | ________ | ________ | ☐ |

---

## Human sign-off checklist (do not forge)

| Gate | Signer | Date | Result |
|------|--------|------|--------|
| Staging migration applied + verified | ________ | ________ | ☐ |
| Staging flag-on QA persona OK; no autonomous publish | ________ | ________ | ☐ |
| Rollback owner + runbook §4 reviewed | ________ | ________ | ☐ |
| Browser/extension matrix rows above accepted | ________ | ________ | ☐ |
| Production migration authorized | ________ | ________ | ☐ |
| Production `RELAY_FEATURE_AUTOMATIONS=true` authorized | ________ | ________ | ☐ |
| Expand beyond initial cohort (if any) | ________ | ________ | ☐ blocked until prior rows signed |
| Mark Automations program **release complete** | ________ | ________ | ☐ only after above |

---

## Disposition

- **Agent portion (B20):** Runbook + this checklist; flag remains default-off; VS8 engineering exit is complete pending human gates.
- **Human portion:** Migration, flag activation, live browser/extension/OAuth checks — **awaiting signatures**.
- **Next named gate (no B21):** Human release gate — production migration + flag activation + signed matrix above.
- **Do not:** invent cohort results, flip production flags, apply production migrations from an agent, or waive AU failures.
