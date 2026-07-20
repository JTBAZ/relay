# VS0 Build Plan — Baseline, Contracts, and Acceptance Fixtures

## Outcome

Freeze the atom map, automation wire vocabulary, stable errors, feature flag, and deterministic acceptance fixtures before schema or production behavior changes.

## Scope

In: read-only characterization of series/occurrence, rules/runs, drafts, manual events, rail projection, reminder packets, Previewizer templates, and distribution handoff; shared contracts; fixtures; AU trace.

Out: Prisma changes, routes, UI, worker registration, migrations, behavior fixes.

## Dependencies and permitted parallel work

No Automations dependency. Characterization tests and fixture authoring may proceed in parallel but merge through the two global batches below. VS1 is blocked until the full exit gate.

## Required reading

1. [`00-README.md`](00-README.md)
2. [`PRODUCT-CONTRACT.md`](PRODUCT-CONTRACT.md)
3. [`../../qa/AUTOMATIONS_ACCEPTANCE.md`](../../qa/AUTOMATIONS_ACCEPTANCE.md)
4. `src/autopost/social-playbook-contract.ts`
5. `src/autopost/social-playbook-service.ts`
6. `src/autopost/schedule-series-service.ts`
7. `src/autopost/distribution-rule-service.ts`
8. `src/distribution/creator-schedule-event-contract.ts`
9. `src/distribution/schedule-rail-service.ts`
10. `src/distribution/schedule-reminder-extension-api.ts`
11. `src/distribution/post-distribution-service.ts`
12. `src/distribution/preview-template-config.ts`
13. `web/lib/previewizer-session.ts`

## Locked contracts to produce

Create `src/autopost/automation-contract.ts` only in B02, containing runtime validators and wire types for:

- preset kinds: `preview_crosspost | delayed_public_release`;
- connector statuses: `active | paused | archived`;
- source kinds: `latest_patreon_post | triggering_patreon_post`;
- trigger kinds: `scheduled_occurrence | patreon_published`;
- schedule-series materialization kinds: `post_draft | automation_trigger`;
- run terminal additions confirmed by characterization: `expired | cancelled` if needed;
- stable API error codes:
  - `AUTOMATION_DISABLED`
  - `AUTOMATION_PLAN_REQUIRED`
  - `AUTOMATION_NOT_FOUND`
  - `AUTOMATION_INVALID_PRESET`
  - `AUTOMATION_INVALID_TRIGGER`
  - `AUTOMATION_TEMPLATE_NOT_FOUND`
  - `AUTOMATION_DESTINATION_UNLINKED`
  - `AUTOMATION_NO_ELIGIBLE_POST`
  - `AUTOMATION_SOURCE_MEDIA_REQUIRED`
  - `AUTOMATION_APPROVAL_EXPIRED`
  - `AUTOMATION_VERSION_CONFLICT`;
- public connector, run/history, approval-context, and mutation-receipt wires;
- version/etag field for conflict-safe patching;
- default approval TTL of 72 hours;
- `RELAY_FEATURE_AUTOMATIONS=false` parser/default.

Public wires use opaque IDs and ISO UTC timestamps. Schedule configuration includes IANA timezone plus local wall time. Prisma row shapes are not public contracts.

## Files

Create:

- `src/autopost/automation-contract.ts`
- `tests/automations/spine-characterization.test.ts`
- `tests/automations/contracts.test.ts`
- `tests/automations/fixtures.ts`

Edit only if needed:

- `.env.example` for disabled flag default
- [`TRACEABILITY.md`](TRACEABILITY.md) if characterization assigns a conflict differently

Do not touch:

- `prisma/schema.prisma`
- migrations
- `src/server.ts`
- worker registration
- production UI

## Todo work items

### AUT-VS0-T01 — Characterize the existing atom spine

1. Add read-only tests covering:
   - ordinary series occurrence generation/materialization;
   - distribution-rule discovery and draft materialization;
   - social-playbook event/draft materialization and rail enrichment;
   - manual-event rail and `schedule_reminder:manual:` packet semantics;
   - Previewizer template persistence/crop exclusion;
   - rejection of preview routing without preview media;
   - human-confirmed distribution handoff.
2. Record exact idempotency constraints and status transitions.
3. Record all conflicts between the product contract and current behavior without fixing them.

Acceptance: the test/handoff identifies every reused authority and confirms that no new rail source or extension reminder family is required.

### AUT-VS0-T02 — Freeze wire, errors, flag, and validators

1. Implement the contract module described above.
2. Validate preset-specific required/forbidden fields.
3. Add feature-flag parsing with disabled default.
4. Keep the module independent of Prisma and Express.

Acceptance: invalid fixtures fail with stable codes; later slices do not need to invent fields.

### AUT-VS0-T03 — Build acceptance fixtures and trace

1. Create one canonical creator fixture matching the QA persona.
2. Include DST/month boundaries, duplicate delivery keys, newest/processed/image-less posts, deleted-template snapshot, extension offline, and destination unlinking.
3. Name tests with AU-01 through AU-12 and confirm every AU has an owning slice in `TRACEABILITY.md`.

Acceptance: backend and frontend tests can import deterministic fixtures without live services.

## Safe batches

- **B01:** AUT-VS0-T01 only.
- **B02:** AUT-VS0-T02 + AUT-VS0-T03.

## Verification

```bash
npx vitest run tests/automations/spine-characterization.test.ts tests/automations/contracts.test.ts
npm run typecheck
```

## Exit gate

Characterization and contract tests pass; disabled flag default is present; all semantic conflicts are assigned; fixtures cover AU-01–AU-12; no production behavior or database schema changed.

## Human stop conditions

Stop if characterization indicates the existing manual-event reminder cannot carry a safe Relay deep link, the current distribution path cannot remain human-confirmed, or the requested UX requires a new source taxonomy/preset.

## Delta Out

Use [`BUILDER-ORIENTATION.md`](BUILDER-ORIENTATION.md#automation-delta-out). B01 names B02 next. B02 names B03 only after the exit gate passes.

### Batch 1 — 2026-07-20

```text
Automation Delta Out
- Global batch / claimed work items: B01 / AUT-VS0-T01
- Completed: AUT-VS0-T01
- Files created/edited:
  - tests/automations/spine-characterization.test.ts (new)
  - docs/studio/automation-build-plans/00-README.md (VS0 → In progress)
  - docs/studio/automation-build-plans/01-VS0-BASELINE-CONTRACTS.md (this Delta Out)
- Migration and backfill state: none (characterization only)
- Contracts changed (expected: none unless this batch owns them): none
- Commands and results:
  - npx vitest run tests/automations/spine-characterization.test.ts → 10 passed
  - npm run typecheck → exit 2 with pre-existing unrelated errors (extension, audience-promotion, coach fixtures, etc.); no errors in tests/automations/spine-characterization.test.ts or automation-build-plans docs
- Manual/browser checks: n/a
- Feature flags / kill switches: none touched; RELAY_FEATURE_AUTOMATIONS not introduced yet (B02)
- Existing atom regressions checked: characterization asserts export seams only; no production edits
- Known risks or human gates: none blocking. Confirmed manual HTTPS deep links work for custom events; no new reminder family or rail source required. Full-repo typecheck remains red for pre-existing reasons outside this batch.
- Reopened owner IDs, if any: none
- Conflict inventory assigned (do not fix in VS0):
  - VS4: series always createScheduledPostForRail — need automation_trigger discriminator
  - VS1: rule-run statuses lack expired|cancelled for approval TTL
  - VS3/VS5: rule materialization is draft-only (no rail attention yet)
  - VS6: PreviewizerSession lacks initial template config
  - Confirmed OK: no automation_occurrence; reuse manual reminder; preview_media_id before plan; CreatorPreviewTemplate authority; Streak Keeper deferred
- Next unblocked batch: B02 (AUT-VS0-T02 + AUT-VS0-T03)
- Pasteable next-worker prompt:
  You are a Schedule Rail Automations builder in Rescue/Relay.
  Read AGENTS.md, .cursor/rules/rescue-workflow-always.mdc,
  docs/studio/automation-build-plans/BUILDER-ORIENTATION.md,
  docs/studio/automation-build-plans/00-README.md,
  docs/studio/automation-build-plans/01-VS0-BASELINE-CONTRACTS.md (latest Delta Out).
  Claim global Batch B02 only: AUT-VS0-T02 + AUT-VS0-T03.
  Do not edit prisma/schema, routes, workers, or production UI.
  When complete, append Automation Delta Out and name B03 next, then stop.
```

**Slice status after B01:** VS0 remained **In progress**. B02 completes the exit gate.

### Batch 2 — 2026-07-20

```text
Automation Delta Out
- Global batch / claimed work items: B02 / AUT-VS0-T02 + AUT-VS0-T03
- Completed: AUT-VS0-T02, AUT-VS0-T03
- Files created/edited:
  - src/autopost/automation-contract.ts (new) — wire types, validators, error codes, flag helpers, idempotency key helpers
  - tests/automations/contracts.test.ts (new)
  - tests/automations/fixtures.ts (new) — QA persona, AU-01–AU-12 trace, sample create/connector/run/approval wires
  - .env.example — documented RELAY_FEATURE_AUTOMATIONS=false default
  - docs/studio/automation-build-plans/00-README.md (VS0 → Done)
  - docs/studio/automation-build-plans/01-VS0-BASELINE-CONTRACTS.md (this Delta Out)
- Migration and backfill state: none (contract/fixtures only; no Prisma)
- Contracts changed (expected: none unless this batch owns them): introduced automations-wire-v1 public contract module (owned by VS0)
- Commands and results:
  - npx vitest run tests/automations/spine-characterization.test.ts tests/automations/contracts.test.ts → 32 passed (10 + 22)
- Manual/browser checks: n/a
- Feature flags / kill switches: RELAY_FEATURE_AUTOMATIONS defaults OFF (isAutomationsFeatureEnabled); documented in .env.example
- Existing atom regressions checked: no production schema/routes/workers/UI edits; spine characterization still green
- Known risks or human gates: none blocking. VS1 must add Prisma enum/status values for expired|cancelled to match contract vocabulary. Preview_crosspost requires preview_template_id at create (service still validates template ownership in VS2).
- Reopened owner IDs, if any: none
- Next unblocked batch: B03 (AUT-VS1-T01)
- Pasteable next-worker prompt:
  You are a Schedule Rail Automations builder in Rescue/Relay.
  Read AGENTS.md, .cursor/rules/rescue-workflow-always.mdc,
  docs/studio/automation-build-plans/BUILDER-ORIENTATION.md,
  docs/studio/automation-build-plans/00-README.md,
  docs/studio/automation-build-plans/01-VS0-BASELINE-CONTRACTS.md (latest Delta Out),
  docs/studio/automation-build-plans/02-VS1-CONNECTOR-SCHEMA.md,
  and Prisma migration/schema workspace rules + supabase-mcp-read-check.
  Claim global Batch B03 only: AUT-VS1-T01 (connector schema + migration).
  Do not implement services, routes, workers, or UI.
  Align field names with src/autopost/automation-contract.ts; do not invent CreatorAutomationRun.
  When complete, append Automation Delta Out and name B04 next, then stop.
```

**Slice status:** VS0 **Done**. Next batch is B03 (VS1 schema).

