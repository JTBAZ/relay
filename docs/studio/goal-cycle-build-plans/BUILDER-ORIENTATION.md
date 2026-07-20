# Goal Cycle Builder Orientation

Paste this preamble into every Goal Cycle worker prompt.

## Mission

Implement only the claimed Goal Cycle todo IDs from the referenced slice. The product decisions are locked in [`../GOAL_CYCLE_PRODUCT_CONTRACT.md`](../GOAL_CYCLE_PRODUCT_CONTRACT.md). If implementation reveals a contradiction, stop with evidence; do not redesign the product in code.

## Before editing

1. Read `AGENTS.md` and `.cursor/rules/rescue-workflow-always.mdc`.
2. Read this file, the claimed slice, and its required references.
3. Confirm upstream exit gates and migrations landed.
4. Inspect the current working tree and preserve unrelated edits.
5. Claim no more than two numbered todos.

## Shared invariants

- Creator/account authorization comes from existing server guards and tenant rows, never UI cookies.
- GET is side-effect free. Mutations are explicit and idempotent where retry is expected.
- Only one active cycle exists per creator.
- One Plan has at most eight new-post slots, two questions, and two AI revisions.
- One credit covers the entire bounded planning run; silence is free.
- AI narrates supplied facts and proposes; deterministic services calculate metrics, eligibility, credit balance, and materialization.
- External evidence is untrusted data with provenance. Weak evidence is disclosed.
- Only linked destinations become tasks. Publishing remains creator-confirmed.
- Approval persists before UI choreography and never duplicates downstream objects.
- Planned/unpublished posts do not count as published.
- Estimated conversion lift is never labeled deterministic.
- Patreon-origin data remains upstream truth; Goal Cycle state is a Relay-owned overlay.
- Logs and usage metadata never contain prompts, provider excerpts, tokens, private URLs, or patron identity.

## Batch rules

- Maximum two numbered todos per session.
- Keep behavior and its focused tests together.
- Schema and migration work is a standalone first batch unless the slice says otherwise.
- Pure types, fixtures, and isolated tests can batch together.
- A hot-file change batches only with the service/route it registers.
- Do not combine broad formatting, dependency upgrades, or adjacent cleanup.

## Hot files

Serialized ownership is mandatory for:

- `prisma/schema.prisma` and migrations;
- `src/server.ts`;
- `web/lib/relay-api.ts`;
- `web/app/studio/GalleryView.tsx`;
- Studio navigation;
- BullMQ/repeat job registration;
- extension reminder registration.

Read [`00-README.md`](00-README.md#hot-file-ownership) for merge order.

## Required implementation habits

- Use existing service/store patterns and shared error shapes.
- Put unique constraints behind idempotency guarantees, not only application checks.
- Freeze API fixtures before frontend work.
- Add migration-safe defaults only when they preserve existing behavior.
- Add feature flags/kill switches before live side effects.
- Handle loading, empty, retry, resume, stale, and permanent-failure states.
- Use creator-local time explicitly and test DST/month boundaries.
- Keep accessibility semantics and reduced-motion behavior in the same UI batch.

## Verification

Run the focused commands in the slice after each batch. Before exit, run applicable root/web/extension build and lint gates. Database-backed and live-provider checks are conditional on credentials; record them as blocked rather than fabricating a pass.

If a production behavior change needs a refreshed local stack, finish the final owning batch with:

```bash
npm run dev:stack:restart
```

Then verify the API and web ports described in the repository rules.

## Delta Out format

```text
Goal Cycle Delta Out
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
