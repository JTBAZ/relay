# Relay Command P3 — HUMAN-UX-NL evidence

**Playground:** `http://localhost:3000/studio/lab2`  
**Sign in:** `http://localhost:3000/login/studio-lab2`  
**Creator:** `studio-lab2@relay.test` / `rcx_studio_lab2`  
**Password:** `RELAY_STUDIO_LAB2_DEV_PASSWORD` or local default `studio-lab2-dev-only`  
**Corpus:** `studio-lab2-corpus-v1`  
**fixture_hash:** `7e36b9b4fec4d2e84d12ddad79ce083002747cd0e3cb35aaae4ae0121dffa61a`  
**Eval corpus:** `tests/fixtures/relay-command-eval/corpus.json` (13 scenarios / 39 paraphrases)  
**Harness:** Lab 2 command strip — fixture match only, **no LLM**

This is **RC-P3-T07**. It is **not** P4. It is **not** a new sentence engine.

The box only accepts an **exact** eval `instruction` or `paraphrase` (character-for-character). A novel combined sentence fails on purpose. Optional live-model trials remain **RC-P3-T05** (skipped; does not block this gate).

## Reset recipe

Preferred between trials (does not wipe posts):

1. Lab 2 **Reset to baseline** (confirm). Expect Photo Studies only; Hero Academy / watercolor collections gone; command rail slices gone.
2. Chronological still shows the corpus.

Full reseed if posts look wrong:

```bash
# Local .env only — never production; committed .env.example stays off.
RELAY_ALLOW_STUDIO_LAB2_SEED=1
RELAY_COMMAND_LAYER_ENABLED=true
RELAY_COMMAND_APPLY_ENABLED=true

npm run seed:studio-lab2 -- apply
npm run eval:studio-lab2-corpus
npm run dev:stack:restart
```

Then `/login/studio-lab2` → `/studio/lab2`. Do not use a personal Goals Lab account.

## Script B (type these, in order)

Reset to baseline before step 1 and before step 4 if a prior apply is still on.

Builder walked this in the Cursor browser on 2026-08-28 (`/studio/lab2`, harness fixture match). Human verdict is signed below.

| ID | Type this (exact) | Must see | Pass? | Notes |
|---|---|---|---|---|
| RC-DF-03 | `Organize Academy into a collection.` | One clarification: Hero Academy vs Academy Studies. Do not apply until a choice. | Pass | Radios Academy Studies / Hero Academy; Continue disabled until a choice. Chose Hero Academy → preview (20 posts, gap 17, duplicate 8). |
| RC-DF-03/04 | `Organize Hero Academy into a collection, cover first, in page order.` | No clarification. Preview: gap 17, duplicate 8, cover first. Apply → Hero Academy stack. | Pass | Exact string: preview, **no** radios. Apply from the clarification path also created **Hero Academy, 20 pieces** on Collections. |
| RC-DF-02 alt | `Put the Hero Academy comic into its own stack, cover then pages.` | Same organize as the canonical instruction (paraphrase, not a new engine). | Skip | Canonical + clarification path already passed. |
| RC-DF-07 | `Plan a weekly X schedule for Hero Academy, skipping pages already posted on X.` | Preview lists skipped 1–6. Apply → 13 unpublished X slices (Page 7 starts 27 Aug; rest Sep–Nov). Calendar month grid is RC-UI-02, not this fail. | Pass | Preview: “Weekly X plan for 13 posts” + “Skipping 6 posts already posted on X.” Rail: **Hero Academy Page 7 · X on day 27**. Schedule lens is month-scoped (RC-UI-02). |
| RC-DF-13 | Undo (button, not typed “undo”) | Last ChangeSet rolled back; posts remain. | Pass | Undo after weekly X: “Undone…”; rail back to **No scheduled steps this month**; chronological posts still present. Undo is last ChangeSet only — Hero Academy stack remained until **Reset to baseline**. |
| Fail-closed | `Invent page 17 and publish it to X tonight.` | Validation error; no collection invented. | Pass | Alert: sentence not in the Lab 2 eval fixture. |

Unknown text must fail closed (validation), not invent a collection.

## Apply flag state at handoff

- `.env.example`: layer/apply **false**
- Local playground: both **true** for this pass only

## Human verdict

- [x] Pass — P3 may be marked Done; next is RC-P4-T01
- [ ] Fail — notes:

Signed: human (AskQuestion: pass-start-p4)  Date: 2026-08-28

T05 live-model trials stay skipped until after P4 (or the expansion go/no-go).
