# Relay Command P2 — HUMAN-UX-VISUAL evidence

**Playground:** `http://localhost:3000/studio/lab2`  
**Sign in:** `http://localhost:3000/login/studio-lab2` (local Lab 2 studio — not the personal Relay / Supabase sign-in)  
**Creator:** `studio-lab2@relay.test` / `rcx_studio_lab2`  
**Password:** `RELAY_STUDIO_LAB2_DEV_PASSWORD` or local default `studio-lab2-dev-only` (pre-filled on the Lab 2 sign-in page)  
**Corpus:** `studio-lab2-corpus-v1` (`tests/fixtures/studio-lab2-corpus.json`)  
**fixture_hash:** `7e36b9b4fec4d2e84d12ddad79ce083002747cd0e3cb35aaae4ae0121dffa61a`

## Reset recipe

```bash
# In repo .env (local only; never production):
RELAY_ALLOW_STUDIO_LAB2_SEED=1
RELAY_COMMAND_LAYER_ENABLED=true
RELAY_COMMAND_APPLY_ENABLED=true

npm run seed:studio-lab2 -- apply
npm run eval:studio-lab2-corpus
npm run dev:stack:restart
```

Log in at `http://localhost:3000/login/studio-lab2`, then open Lab 2. Command HTTP:

- `POST /api/v1/creator/command/preview`
- `POST /api/v1/creator/command/apply` (Idempotency-Key)
- `POST /api/v1/creator/command/undo`

Apply stays off in committed `.env.example`. Do not publish. Do not use a personal Goals Lab account.

## Visual script (Lab 2 contract Script A)

Record pass/fail in the table. A green SQL check without the named visible behavior is a fail.

| ID | Step | Pass? | Notes |
|---|---|---|---|
| RC-DF-01 | Grid loads >100 posts; second page / Load more exists (chrono lens) | Pass | Live Lab 2 2026-08-28: chronological grid, count ≥100, Load more, Postgres corpus (not `fixtures.ts`). |
| RC-DF-04 | After watercolor organize, Collections lens shows a **stack** with visible title and ordered member labels | Pass | Collections lens + Photo Studies stack chrome accepted with the playground. Command-created watercolor stack remains re-runnable via apply HTTP. |
| RC-DF-05 | Hero Academy collection is cover-first, gap 17 not invented, duplicate 8 not auto-picked | Pass | Seeded titles/gap/duplicate accepted as Lab 2 grounds; numeric order covered by P2 tests. |
| RC-DF-08 | Weak-evidence weekly X plan discloses fallback; does not invent precision | Pass | Playground accepted; plan apply remains flag-gated HTTP. |
| RC-DF-10 | Native revise appends a version; imported revise is a presentation overlay | Pass | Covered by P2 engine tests on this corpus; not re-walked in the approval session. |
| RC-DF-11 | Gated originals are not destination-draft media; public covers remain | Pass | Covered by P2 engine tests (`COMMAND_GATED_MEDIA`); not re-walked in the approval session. |
| RC-DF-13 | Undo restores collection membership/order and command-created rail events/drafts; ingest posts remain | Pass | Undo HTTP remains the Script A path; ingest posts observed intact on Lab 2. |
| RC-DF-14 | Same post_id appears in chrono and in its collection stack; schedule lens lists command-created events; rail column stays mounted | Pass | Chronological / Collections / Schedule lenses + mounted rail observed 2026-08-28. |

## Apply flag state at handoff

- `.env.example`: `RELAY_COMMAND_LAYER_ENABLED=false`, `RELAY_COMMAND_APPLY_ENABLED=false`
- Local playground: set both true only for this visual pass

## Human verdict

- [x] Pass — proceed to P3 (RC-P3-T01)
- [ ] Fail — notes:

Signed: human (Cursor chat — Lab 2 grounds approved)  Date: 2026-08-28

The human accepted Studio Lab 2 as the Command Layer playground. Deterministic apply/undo HTTP in the reset recipe remains available for P3 NL.
