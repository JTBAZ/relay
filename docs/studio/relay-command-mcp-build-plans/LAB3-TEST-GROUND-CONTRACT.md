# Studio Lab 3 — Conversational Command test ground

**Status:** Frozen for Phases 5–10  
**Program hub:** [`00-README.md`](00-README.md)  
**Conversation contract:** [`CONVERSATION-CONTRACT.md`](CONVERSATION-CONTRACT.md)  
**Lab 2 (eval corpus, immutable):** [`LAB2-TEST-GROUND-CONTRACT.md`](LAB2-TEST-GROUND-CONTRACT.md)  
**Shell evidence (visual gates unsigned as of 2026-08-30):** [`../../qa/RELAY_LAB3_LANGUAGE_UX_EVIDENCE.md`](../../qa/RELAY_LAB3_LANGUAGE_UX_EVIDENCE.md)

Lab 3 is the **required human playground** for conversational Command Layer. Production Library (`/studio`) is not the P5–P9 host. Lab 2 remains the immutable fixture and `--facade-only` eval corpus. Do not treat Lab 3 teaching copy as a second eval corpus until P7 adds held-out phrases.

## Why Lab 3

`/studio/lab3` mounts production-shaped `GalleryView` (`floorspace="lab3"`) with the Studio Command instrument, compact collections shelf, square grid, and Schedule rail/calendar. That is the shell conversational selection and planning must inhabit. P4 signed the Lab 2 journey; Lab 3 is the production-shaped host for P5–P10 UX.

## Data plane (P5 Done)

| Surface | After P5 | Remaining |
|---|---|---|
| Visible gallery | Lab 1 / Dev Ava data plane via `GalleryView` | Unchanged |
| Command interpret | `surface=lab3` (and non-Lab-2 `studio`): `interpretCreatorHarnessInstruction` over DB items with Gallery-effective title/tags/visibility. `surface=lab2` stays `interpretLab2HarnessInstruction` fixture JSON. Search returns a complete snapshot (`complete=true`, checksum, evidence). P7: Lab 3 novel wording uses `CommandSemanticPlanner` when `RELAY_COMMAND_PLANNER_ENABLED` (fixture still wins on exact eval strings). Compact catalogs + `--live-model` skip/run are landed (T03–T04). Selection review is a contact-sheet workbench with pinned refine composer. After freeze, Organize Apply compiles a collection ChangeSet when the apply flag is on. Schedule journeys (flag on) squash selection and open the plan calendar; Confirm schedule is the one apply. Proposals/ChangeSets/undo persist. MCP apply uses the DB engine. Finite plan compiler + versioned ProposalPatch HTTP exist (`RELAY_COMMAND_SCHEDULE_PLAN_ENABLED`). | **HUMAN-UX-PLAN** (RC-P9-T05) |
| Command apply | Prisma for the authenticated creator | Same creator; interpret IDs are that creator’s posts |
| Lab 2 `/studio/lab2` | Fixture interpret + `rcx_studio_lab2` apply | Unchanged golden path |
| Completeness / tenant | Probe: Lab 2 JSON+DB and Dev Ava DB catalogs complete; search p95 under 1000 ms; **no index**. Foreign `requestedCreatorId` is 403. Stale checksum is `COMMAND_STALE_SELECTION`. Seeded `--facade-only` `db.status=ok` | P6 consumes frozen snapshots; do not re-query into an approved set |

**First technical debt (P5-T01, landed 2026-08-30):** Lab 3 teaching examples remain Lab 2 eval strings until P7. Dev Ava interpret no longer returns `sl2_*` IDs: a matching fixture searches the creator library, or fails closed if nothing matches. Lab 2 harness stays fixture-backed for CI and HUMAN-UX-NL replay.

## Auth and route

| Field | Value |
|---|---|
| URL | `http://localhost:3000/studio/lab3` |
| Auth | Studio session or Dev Ava (`/login/pilot-ux?returnTo=/studio/lab3`) |
| Production `/studio` | Unchanged until P10 + **HUMAN-FLAG** |
| CommandBox mount | `GalleryView` only when `floorspace === "lab3"` (until P10) |

## Shell vs capability

Lab 3 visual Gates 1–2 in `RELAY_LAB3_LANGUAGE_UX_EVIDENCE.md` measure the instrument/rail shell. They are **not** a substitute for P5 completeness, P6 **HUMAN-UX-SELECTION**, or P7 **HUMAN-UX-NL-LIVE**. Builders may record a live parity walk during P5; they must not mark those Lab 3 visual gates signed without a human.

## Do not

- Seed or overwrite Lab 2 corpus rows from Lab 3 work.
- Mount CommandBox on production `/studio` in P5–P9.
- Use Lab 3 as a live-model playground before `RELAY_COMMAND_PLANNER_ENABLED` + HUMAN-CREDENTIALS and **HUMAN-UX-NL-LIVE** (T05). P5–P6 stay deterministic / fixture. `--live-model` CLI is T04 (skipped unless eval flag + key).
- Invent a second inventory beside Gallery, Collections, or the Schedule Rail.
