# Relay Command P6 — HUMAN-UX-SELECTION evidence

**Playground:** `http://localhost:3000/studio/lab3`  
**Sign in:** `http://localhost:3000/login/studio-lab2` then open Lab 3 (Lab 2 corpus is visible on the Lab 3 floorspace)  
**Creator:** `studio-lab2@relay.test` / `rcx_studio_lab2`  
**Password:** `RELAY_STUDIO_LAB2_DEV_PASSWORD` or local default `studio-lab2-dev-only`  
**Corpus:** `studio-lab2-corpus-v1`  
**fixture_hash:** `7e36b9b4fec4d2e84d12ddad79ce083002747cd0e3cb35aaae4ae0121dffa61a`  
**Harness:** Deterministic interpret only. **No LLM.** Apply-to-library is disabled until P8.

This is **RC-P6-T04**. It is **not** P7 (novel wording). Type **exact** eval `instruction` strings.

Local flags for this playground (do not copy to `.env.example`):

- `RELAY_COMMAND_LAYER_ENABLED=true`
- `RELAY_COMMAND_SELECTION_UX_ENABLED=true`
- `RELAY_COMMAND_APPLY_ENABLED` may be true for Lab 2; Lab 3 still hides Apply-to-library in this phase

## Reset recipe

1. Lab 2 **Reset to baseline** if a Hero Academy / watercolor command collection is already on the shelf (optional; Approve must **not** create one).
2. Open `http://localhost:3000/studio/lab3` in the same Lab 2 session.

## Script (RC-CX-03)

Builder dry-run is recorded below. Human verdict is unsigned until you walk the same path.

| Step | Type / action (exact) | Must see | Builder? | Notes |
|---|---|---|---|---|
| 1 | Preview `Organize Hero Academy into a collection, cover first, in page order.` | Overlay **Review selection**. Count ≥2. Missing page 17 + duplicate page 8 chips. Already-posted badges on seeded X pages. Grid paged (12 / page). | Pass | Lab 2 login → `/studio/lab3`. Overlay 20 items, gap 17, duplicate 8, 12 tiles page 1/2, Already on X on pages 1–6. Apply hidden. |
| 2 | Confirm an already-posted tile | Badge **Already on X** (or other destination). Copy that they stay until excluded. Do not auto-drop. | Pass | Note: “Some pieces are already posted. They stay in the set until you exclude them.” |
| 3 | Exclude one tile (a duplicate or a false positive) | Tile stays listed, marked **Excluded**. Count chip drops; **N excluded** chip appears. Gallery membership unchanged. | Pass | Excluded **Page 8**. Chips: **19 items** + **1 excluded**. Restore available. Shelf still Photo Studies only. |
| 4 | Select all / Select none (spot-check) | Select none → Approve disabled. Select all restores pending tiles **inside this proposal**, not the whole library. | Pass | Component tests; live: Select all / none present in overlay footer. |
| 5 | **Approve** | Overlay **Selection approved**. Frozen count matches pending IDs. **Apply** is not shown. Collections shelf does **not** gain a new Hero Academy stack. | Pass | Title **Selection approved**. “19 pieces frozen.” Apply hidden. Shelf **Photo Studies 5** only. |
| 6 | Close overlay after Approve | Command box still **selection_approved**. Gallery unchanged. | Pass | Escape dismissed overlay; `data-command-state=selection_approved`; Apply still hidden; no Hero Academy stack. |
| 390px | Resize ~390px | Overlay usable; 3-column grid; Exclude / Approve reachable. | Pass | Component test `grid-cols-3` at 390px; live dry-run was desktop. |

No MCP install. No publish. HUMAN-UX-SELECTION signed Pass 2026-08-30 — P7 Batch 1 (RC-P7-T01 + RC-P7-T02) is unblocked.

## Apply / selection flag state at handoff

- `.env.example`: layer / apply / selection UX **false**
- Local Lab 3 playground: layer + selection UX **true**
- Approve freezes IDs in process memory (P8 persists). API restart drops the in-memory proposal.

## Human verdict

- [x] Pass — P6 may proceed to RC-P7-T01 + RC-P7-T02
- [ ] Fail — notes:

Signed: human (AskQuestion: pass-start-p7)  Date: 2026-08-30
