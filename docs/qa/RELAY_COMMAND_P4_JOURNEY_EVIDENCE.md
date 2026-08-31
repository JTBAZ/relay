# Relay Command P4 — HUMAN-UX-JOURNEY evidence

**Playground:** `http://localhost:3000/studio/lab2`  
**Sign in:** `http://localhost:3000/login/studio-lab2`  
**Creator:** `studio-lab2@relay.test` / `rcx_studio_lab2`  
**Password:** `RELAY_STUDIO_LAB2_DEV_PASSWORD` or local default `studio-lab2-dev-only`  
**Corpus:** `studio-lab2-corpus-v1`  
**fixture_hash:** `7e36b9b4fec4d2e84d12ddad79ce083002747cd0e3cb35aaae4ae0121dffa61a`  
**Eval corpus:** `tests/fixtures/relay-command-eval/corpus.json`  
**Harness:** Productized CommandBox — fixture match only, **no LLM**

This is **RC-P4-T04** builder dry-run. It is **not** a substitute for the human sitting Script C.

Type **exact** eval `instruction` strings. Unknown sentences fail closed. Typed “undo” is rejected; use the **Undo** button.

## Reset recipe

1. Lab 2 **Reset to baseline** (confirm). Chronological is selected. Expect Photo Studies only; Hero Academy / watercolor command collections gone; command rail slices gone.
2. Full reseed only if posts look wrong (same as P3; never production).

## Script C (RC-DF-16)

Builder walked this in the Cursor browser on 2026-08-28 after `npm run dev:stack:restart`. Human verdict is unsigned below.

| Step | Type / action (exact) | Must see | Builder? | Notes |
|---|---|---|---|---|
| 1–3 | `Organize Hero Academy into a collection, cover first, in page order.` | No clarification. Preview: gap 17, duplicate 8, cover-first. Apply → Hero Academy stack (20). | Pass | Preview: “Collection Hero Academy — 20 posts,” missing 17, duplicate 8. Apply opened Collections. Board: Photo Studies + **Hero Academy, 20 pieces**. |
| 4–6 | `Plan a weekly X schedule for Hero Academy, skipping pages already posted on X.` | Skip 1–6. Disclosed metric window (no invented minute). Apply. Rail + Schedule month grid. | Pass | Preview: “Skipping 6 posts already posted on X” + Tuesday-evening cluster; no 7:03. Rail: **Hero Academy Page 7**. Schedule Next → September occupancy 3/10/17/24. Click 3 Sep → **Hero Academy Page 8**. |
| 7 | `Organize the watercolor landscapes newest first into a collection.` | Watercolor stack. | Pass | Collections board: Photo Studies, Hero Academy 20, **Watercolor landscapes, 18 pieces**. |
| 8 | Hard refresh | Stacks + slices persist (RC-DF-17). Undo still available. | Pass | Reload: Undo restored from sessionStorage. Board still Photo Studies + Hero Academy + watercolor. |
| 9 | Undo (button) | Last ChangeSet (watercolor) rolls back; posts remain. | Pass | After refresh Undo, watercolor left the **database**; a stale gallery cache briefly kept the stack until chassis `onUndone` also clears cache. Re-apply + Undo then dropped watercolor **without** a second reload. Hero Academy 20 remained. |
| 390px | Resize ~390px | Command field + Preview/Reset usable; rail stays mounted. | Pass | Viewport 390×844. Command chrome lives in the gallery column (not full-bleed under the fixed rail). Rail still 304px (gallery cramped). |

**Human Script C (2026-08-29):** Functional path passed via keyboard (tab to Preview / Apply / Reset). Visual: those controls were hidden under the fixed Schedule Rail. Fitted 2026-08-29: CommandBox is in the gallery column, so Preview / Apply / Reset sit left of the rail (elementFromPoint hits the buttons, not the rail).

No MCP install, no dashboard tour, no publish.

## Apply flag state at handoff

- `.env.example`: layer/apply **false**
- Local playground: both **true** for this dry-run only
- `RELAY_COMMAND_STUDIO_UX_ENABLED` still off; Lab 2 still mounts the box

## Human verdict

- [x] Pass — P4 may proceed to RC-P4-T05 (expansion go/no-go)
- [ ] Fail — notes:

Signed: human (AskQuestion: pass)  Date: 2026-08-29

T05 live-model trials stay skipped until after P4 (or the expansion go/no-go). Do not mount production `GalleryView.tsx` until this go/no-go says so.
