# Schedule Rail Automations — Builder Orientation

Paste this preamble into every Automations worker prompt.

## Mission

Implement only the claimed global batch and work-item IDs from the referenced slice. Product and architecture decisions are locked in [`PRODUCT-CONTRACT.md`](PRODUCT-CONTRACT.md). If the current code contradicts the contract, stop with evidence and reopen VS0; do not redesign in implementation.

## Before editing

1. Read `AGENTS.md` and `.cursor/rules/rescue-workflow-always.mdc`.
2. Read this file, [`00-README.md`](00-README.md) status/dependencies, the claimed slice, and its required references.
3. Confirm every prerequisite batch is complete and inspect the latest Delta Out.
4. Inspect the working tree and preserve unrelated edits.
5. If Airtable Production Ledger is being used for execution, read the live queue, respect Session Lock, and claim only rows mapped to this batch.
6. Claim one global batch and no more than two numbered work items.

## Shared invariants

- `CreatorAutomation` is configuration/connective tissue, not an execution ledger.
- `CreatorScheduleOccurrence` owns scheduled trigger identity.
- `CreatorDistributionRuleRun` owns prepared-action run state.
- `CreatorScheduleEvent` is the rail/toast attention atom.
- `AutopostDraft` is the resumable prepared artifact.
- `CreatorPreviewTemplate` is the saved layout authority; `PostTemplate` is unrelated.
- `PostDistributionPlan` and variants are created only after a valid preview media ID exists.
- Future scheduled ticks remain `recurrence_occurrence`; ready work becomes an enriched `manual_event`.
- Existing manual reminder packets are reused; do not add an extension packet family unless VS0 is formally amended.
- Existing routines, playbooks, and legacy rules must behave identically unless the claimed todo explicitly owns a backwards-compatible extension.
- GET is side-effect-free. Retryable mutations are idempotent.
- Creator/account authorization comes from existing guards and creator-scoped database queries.
- Creator-local scheduling uses an IANA timezone and must cover DST/month boundaries.
- Publishing remains human-confirmed. A Previewizer export is not a publish.
- Logs, notifications, and audit metadata must not contain private media URLs, tokens, or private post bodies.

## Batch rules

- Claim exactly one global batch.
- Keep behavior and focused tests together.
- Schema/migration work is isolated in B03–B04.
- Hot-file edits must follow the serialized ownership table in `00-README.md`.
- Do not combine broad cleanup, formatting, dependency upgrades, or adjacent refactors.
- Do not work ahead because a downstream change seems small.
- When verification reveals an upstream defect, reopen the owning work item through `TRACEABILITY.md`.
- Stop after Delta Out. The orchestrator or next worker claims the named next batch.

## Required implementation habits

- Reuse public services rather than writing direct Prisma mutations when a validated service exists.
- Preserve existing feature-flag and entitlement behavior.
- Put database uniqueness behind idempotency guarantees; do not rely only on read-before-write.
- Freeze wire fixtures before UI work.
- Use safe migration defaults that preserve all existing rows.
- Keep loading, empty, no-new-post, stale, retry, extension-offline, and permanent-failure states in the owning UI/service batch.
- Keep keyboard, focus return, dialog semantics, and reduced-motion behavior in the UI batch.
- Do not mark a run complete until the existing distribution handoff reaches the contract-owned completion point.
- Do not fabricate browser, Supabase, production migration, extension-store, or credential-dependent results.

## Verification

Run the focused commands in the slice after each batch. Before a slice exits, run applicable root, web, Prisma, and extension gates. After Prisma work, follow `.cursor/rules/supabase-mcp-read-check.mdc` when a linked Supabase read-check is prudent; never paste secrets or apply production migrations without authorization.

If a production code change needs a refreshed local stack, the final owning implementation batch finishes with:

```bash
npm run dev:stack:restart
```

Then verify API and web listening state per repository rules. Docs-only batches do not restart.

## Claim prompt

```text
You are a Schedule Rail Automations builder in Rescue/Relay.

Read:
- AGENTS.md
- .cursor/rules/rescue-workflow-always.mdc
- docs/studio/automation-build-plans/BUILDER-ORIENTATION.md
- docs/studio/automation-build-plans/00-README.md (status, dependencies, hot files)
- the build doc for the claimed slice
- the latest Delta Out in that slice

Claim global Batch Bxx only: [work-item IDs]. Do not work ahead.
Confirm prerequisite batches are complete before editing.
Do not commit, push, apply production migrations, publish an extension, or activate live flags without explicit authorization.

When complete, append Automation Delta Out to the slice doc and name exactly one Next unblocked batch, then stop.
```

## Automation Delta Out

```text
Automation Delta Out
- Global batch / claimed work items:
- Completed:
- Files created/edited:
- Migration and backfill state:
- Contracts changed (expected: none unless this batch owns them):
- Commands and results:
- Manual/browser checks:
- Feature flags / kill switches:
- Existing atom regressions checked:
- Known risks or human gates:
- Reopened owner IDs, if any:
- Next unblocked batch:
- Pasteable next-worker prompt:
```

Do not say “done” when a required command failed, a migration was not verified, an exit criterion remains unmet, or a human gate remains. Name the exact gate and stop.
