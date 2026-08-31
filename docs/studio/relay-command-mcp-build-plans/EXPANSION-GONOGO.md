# Relay Command Layer — Expansion go/no-go

**Date:** 2026-08-29  
**Gate:** HUMAN-UX-JOURNEY pass (AskQuestion: pass) + RC-P4-T05  
**Evidence:** [`../../qa/RELAY_COMMAND_P4_JOURNEY_EVIDENCE.md`](../../qa/RELAY_COMMAND_P4_JOURNEY_EVIDENCE.md)  
**Product contract:** [`PRODUCT-CONTRACT.md`](PRODUCT-CONTRACT.md)  
**Conversation contract (P5–P10):** [`CONVERSATION-CONTRACT.md`](CONVERSATION-CONTRACT.md)

This record is the post–P4 expansion lock. It does not authorize new implementation in this file. Autonomous publish remaining **off** is success, not a gap.

## Verdicts

| Item | Verdict | Owner | Why |
|---|---|---|---|
| Autonomous / in-box publish | **Never** | — | Product contract. Destination drafts and rail slices are not published posts. Existing Autopost / extension remain the confirm path. |
| Publishing tools as Command Layer apply | **Never** | — | Same as above. A later “open the existing publish handoff” command is not in this record. |
| Production `/studio` CommandBox (`GalleryView.tsx`) | **Defer** | Later slice + **HUMAN-FLAG** | Lab 2 is the signed playground. `shouldMountStudioCommandChrome` already waits for `RELAY_COMMAND_STUDIO_UX_ENABLED` on `surface: "studio"`. Do not mount the hot file until a shared-host flag gate. |
| Prisma / DB view presets | **Defer** | Later slice + **HUMAN-MIGRATE** | Last lens is `localStorage` only. A server table needs hosted migrate + RLS. |
| Profile / presence commands | **Defer** | Later program | Not in the five POC capabilities. Expand the facade only after organization is the paid path on a flagged Studio. |
| Recurring automations via Command Layer | **Defer** | Automations program | Reuse Automations. Do not invent a second recurrence store. |
| Live-model eval (P3 T05) | **Defer** | After a production-shaped mount or explicit waiver | Facade-only + fixture harness already passed HUMAN-UX-NL / JOURNEY. Do not fake a vendor trial. |

## Evidence citations

- HUMAN-UX-VISUAL: `docs/qa/RELAY_COMMAND_P2_VISUAL_EVIDENCE.md`
- HUMAN-UX-NL: `docs/qa/RELAY_COMMAND_P3_NL_EVIDENCE.md`
- HUMAN-UX-JOURNEY: `docs/qa/RELAY_COMMAND_P4_JOURNEY_EVIDENCE.md` (signed 2026-08-29)
- CommandBox fitted left of the fixed Schedule Rail (gallery column, not full-bleed under `z-[60]` rail)
- Flags in committed `.env.example` remain off (`RELAY_COMMAND_LAYER_ENABLED`, apply, MCP, Studio UX)

## Follow-up todos (2026-08-30)

1. **RC-P5-T01 + RC-P5-T02** — first implementation batch (selection data plane + effective loader).
2. Shared-host **HUMAN-FLAG** before `RELAY_COMMAND_STUDIO_UX_ENABLED=true` (P10).
3. Flag-gated production `GalleryView.tsx` mount (P10; extract a host boundary first).
4. Optional DB lens presets only with HUMAN-MIGRATE + RLS (still deferred).
5. Automations composition through the existing chassis, not a Command Layer fork (P9 finite plans only).

## Program complete

Phases 1–4 of Relay Command Layer + MCP are **Done**. Lab 2 reset/replay works. Deterministic organization is visible. Fixture NL and five-minute journey have recorded human passes. Production command chrome is flag-gated and **not** mounted. Tenant isolation, gated-media refuse, and Undo remain in force.

## Amendment — conversational expansion authorized (2026-08-30)

**Direction:** feature director authorized a Lab 3 conversational workbench (bounded active proposal; stage-gate selection then one schedule approval). Execution pack: [`CONVERSATION-CONTRACT.md`](CONVERSATION-CONTRACT.md), [`LAB3-TEST-GROUND-CONTRACT.md`](LAB3-TEST-GROUND-CONTRACT.md), phases [`05-PHASE-5-SELECTION-TRUTH.md`](05-PHASE-5-SELECTION-TRUTH.md) through [`10-PHASE-10-HANDOFF-AND-ROLLOUT.md`](10-PHASE-10-HANDOFF-AND-ROLLOUT.md). Git-only. Airtable is not execution truth.

| Item | 2026-08-29 | 2026-08-30 amendment | Owner |
|---|---|---|---|
| Autonomous / in-box publish | **Never** | Unchanged | — |
| Publishing tools as Command Layer apply | **Never** | Unchanged. P10 may **open** the existing handoff; it must not submit. | P10 |
| Live-model eval (P3 T05) | Defer | **Superseded by P7.** Live-model **selection** work is authorized **in Lab 3** after P5+P6. Do not fake a vendor trial; implement `--live-model` against the eval + held-out corpus. | P7 |
| Lab 3 conversational chrome | (unsigned shell) | **Authorized** as the P5–P9 playground. Production `/studio` mount still **Defer** + HUMAN-FLAG. | P5–P9 |
| Production `/studio` CommandBox | **Defer** + HUMAN-FLAG | Unchanged | P10 |
| Prisma / DB view presets | **Defer** + HUMAN-MIGRATE | Unchanged for lens presets. P8 durable proposal/ChangeSet/undo **is** in scope (SQL written locally; hosted apply HUMAN-MIGRATE). | P8 |
| Profile / presence commands | **Defer** | Unchanged | Later program |
| Recurring automations via Command Layer | **Defer** | Unchanged. P9 finite plans only; reuse Automations for true recurrence. | Automations program |

This amendment does not authorize P8–P10 code until P7 + **HUMAN-UX-NL-LIVE**. P5 exit evidence exists (2026-08-30). P6 is **Done** (HUMAN-UX-SELECTION Pass 2026-08-30). P7 Batch 1 is **RC-P7-T01 + RC-P7-T02**.
