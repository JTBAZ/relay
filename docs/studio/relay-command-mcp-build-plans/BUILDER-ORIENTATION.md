# Relay Command Layer — Builder Orientation

Paste this preamble into every Command Layer / MCP worker prompt.

## Role

**Cursor Grok 4.6 X-High** is the sole approved implementation builder for this program: contracts, schema, services, tests, Lab 2 seed/eval, MCP adapter, Studio command UX, fixtures, and bounded integration. Do not recruit a faster/cheaper model for security-critical, migration, or capability-facade work.

## Mission

Implement only the claimed todo IDs from the referenced phase. Product decisions for P1–P4 are locked in [`PRODUCT-CONTRACT.md`](PRODUCT-CONTRACT.md). Product decisions for P5–P10 are locked in [`CONVERSATION-CONTRACT.md`](CONVERSATION-CONTRACT.md). If implementation reveals a contradiction, stop with evidence; do not redesign the product in code.

## Before editing

1. Read `AGENTS.md` and `.cursor/rules/rescue-workflow-always.mdc`.
2. Read this file, [`00-README.md`](00-README.md), the claimed phase, [`TRACEABILITY.md`](TRACEABILITY.md), and — when the work touches Lab 2 or RC-DF — [`LAB2-TEST-GROUND-CONTRACT.md`](LAB2-TEST-GROUND-CONTRACT.md) and [`../../qa/RELAY_COMMAND_DREAM_FLOW_ACCEPTANCE.md`](../../qa/RELAY_COMMAND_DREAM_FLOW_ACCEPTANCE.md). When the work is P5–P10, also read [`CONVERSATION-CONTRACT.md`](CONVERSATION-CONTRACT.md) and [`LAB3-TEST-GROUND-CONTRACT.md`](LAB3-TEST-GROUND-CONTRACT.md).
3. Confirm upstream exit gates. P2 is blocked on P1 Done. P3 is blocked on **HUMAN-UX-VISUAL**. P4 is blocked on **HUMAN-UX-NL**. P5 is **Done**. P6 is **Done** (**HUMAN-UX-SELECTION** Pass 2026-08-30). P7 is **Done** (**HUMAN-UX-NL-LIVE** Pass 2026-08-30). P8 is **Done**. P9 is **In progress** (T01–T04 landed). Next **RC-P9-T05 HUMAN-UX-PLAN**. P10 is blocked on **HUMAN-UX-PLAN**.
4. Inspect the working tree and preserve unrelated edits.
5. Claim no more than two numbered todos unless the phase lists a sealed larger batch.

## Resume protocol

On session start: read the latest Delta Out in the claimed phase **and** the `00-README.md` status row. Do not re-derive scope from `git diff` alone. Name exactly one next unblocked batch, then work it.

P5–P10: claim **one phase**. Lab 2 `npm run eval:relay-command -- --facade-only` must stay green on every batch. Lab 3 is the conversational playground; do not treat Lab 3 teaching strings as a substitute for the eval corpus.

This program is **Git-only**. Do not query or update Airtable Production Ledger for Command Layer status.

## Shared invariants

- Creator/account authorization comes from existing server guards and tenant rows, never UI cookies.
- GET is side-effect free (`docs/qa/HTTP_VERB_HYGIENE.md`). Mutations are explicit and idempotent where retry is expected.
- The artist supplies meaning; Relay executes mechanics. No unsolicited clustering or cleanup chores.
- Capabilities are typed. No SQL/Prisma tools, no dumping media bytes into model context, no wrapping every `src/server.ts` route as MCP.
- Imported posts: presentation/overrides. Native posts: append `PostVersion`. Collections: collection service. Schedule: plan/draft/rail — not publish.
- ChangeSets snapshot target IDs before apply. Expected revision conflicts fail closed.
- Publishing remains creator-confirmed on existing Autopost / extension / distribution paths.
- Logs and tool audit never contain prompts, provider excerpts, tokens, private URLs, or patron identity.
- Lab 2 corpus seed refuses production. `RELAY_ALLOW_STUDIO_LAB2_SEED` is required.
- Command Layer flags default off.
- Do not reconstruct `.docs/anthropic/`. This pack is self-contained.
- Do not reopen Goal Cycle, Automations, Escape Hatch, or Studio renovation Phases 0–6 contracts.

## Batch rules

- Maximum two numbered todos per session unless the phase says otherwise.
- Keep behavior and its focused tests together.
- Schema and migration work is a standalone first batch unless the phase says otherwise.
- Pure types, fixtures, and isolated tests can batch together.
- A hot-file change batches only with the service/route it registers.
- Do not combine broad formatting, dependency upgrades, or adjacent cleanup.
- After a local API/web behavior change, finish the owning batch with `npm run dev:stack:restart` when ports **8787** / **3000** would otherwise be stale.

## Hot files

Serialized ownership is mandatory for the list in [`00-README.md`](00-README.md#hot-file-ownership). In particular:

- `prisma/schema.prisma` and migrations;
- `src/server.ts`;
- `web/lib/relay-api.ts`;
- `web/app/studio/GalleryView.tsx` (Lab 3 floorspace P5–P9; production CommandBox P10 + HUMAN-FLAG only);
- `web/app/components/studio-lab2/*`;
- `web/app/components/studio-lab3/*` and `web/app/components/studio/command/*` (P6/P9);
- `src/studio/command/library-items-from-db.ts` and `src/studio/command/contracts.ts` (P5);
- `src/ai/*` (P7);
- identity session issuance;
- identity session issuance;
- idempotency store wiring.

## Required implementation habits

- Reuse Gallery, collection, presentation, distribution, and schedule-rail services. Facade over them; do not fork a second CMS.
- Put unique constraints behind idempotency guarantees, not only application checks.
- Freeze API fixtures before frontend work.
- Add feature flags before live side effects.
- Handle loading, empty, retry, resume, stale, clarification, and permanent-failure states in the same UI batch that ships the happy path.
- Accessibility and reduced-motion belong in the UI batch.
- Visible Lab 2 success is **physical**: stacks, labels, order, rail slices. A green SQL assertion without a UI check is incomplete for P2–P4 UI todos.
- Visible Lab 3 selection success is **ID parity**: command snapshots match the tiles the artist can see, including effective presentation/override tags. Incomplete scans must fail closed (`complete=false` is not an accepted apply input).
- After Prisma or identity work, follow `.cursor/rules/supabase-mcp-read-check.mdc` (read-only). Never paste secrets.

## Verification

Run the focused commands in the phase after each batch. Before a phase exit gate, run applicable root/web typecheck and the named vitest files. Database-backed checks require `DATABASE_URL`; record them as blocked rather than fabricating a pass.

Hosted `prisma migrate deploy` and RLS gap lockdown remain **HUMAN-MIGRATE** / **HUMAN-SECURITY**.

## Delta Out format

```text
Relay Command Delta Out
- Slice / claimed todos:
- Completed:
- Files created/edited:
- Migration and backfill state:
- Contracts changed (expected: none unless this todo owns them):
- Commands and results:
- Manual/browser checks:
- Feature flags / kill switches:
- Known risks or human gates:
- Next unblocked todo IDs:
```

Do not say “done” when a required command failed, a migration was not applied, or a human gate remains. Name the exact gate.

## Claim prompt template

```text
Role: Cursor Grok 4.6 X-High — sole implementation builder for Relay Command Layer + MCP.
Read (in order):
  AGENTS.md
  .cursor/rules/rescue-workflow-always.mdc
  docs/studio/relay-command-mcp-build-plans/BUILDER-ORIENTATION.md
  docs/studio/relay-command-mcp-build-plans/00-README.md
  docs/studio/relay-command-mcp-build-plans/PRODUCT-CONTRACT.md
  docs/studio/relay-command-mcp-build-plans/CONVERSATION-CONTRACT.md   # P5–P10
  docs/studio/relay-command-mcp-build-plans/{claimed-phase}.md
  latest Delta Out in that phase

Claim: todos {IDs} only. Max 2 unless the phase seals a larger batch.
Owned files: {list}
Off-limits: Goal Cycle / Automations / Escape Hatch programs; production GalleryView CommandBox until P10 + HUMAN-FLAG; unclaimed hot files.

Do not: commit, push, HUMAN-MIGRATE, HUMAN-FLAG, HUMAN-CREDENTIALS,
        or mark a phase Done without exit-gate evidence.

On complete: append Relay Command Delta Out, update 00-README status if the
             phase gate passed, write docs/qa/RELAY_COMMAND_{ID}_EVIDENCE.md
             at UX/security/migrate gates, name exactly one next unblocked
             batch, STOP if a human gate is now required.
```
