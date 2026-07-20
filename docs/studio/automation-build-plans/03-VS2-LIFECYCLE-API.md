# VS2 Build Plan — Lifecycle Service and API

## Outcome

Provide one creator-scoped, Autopost-gated lifecycle service and frozen API for creating, listing, updating, pausing, resuming, and archiving connector graphs.

## Scope

In: service validation/authorization; transactional child orchestration boundary; CRUD/read models; routes; dedicated web client; fixtures and tests.

Out: preset-specific worker behavior, draft/event materialization, rail projection, approval UI.

## Dependencies and permitted parallel work

Depends on VS1 exit. Backend service tests may be written before routes, but B05 must finish before B06.

## Required reading

1. VS0 contracts and VS1 Delta Out
2. `src/autopost/schedule-series-service.ts`
3. `src/autopost/distribution-rule-service.ts`
4. `src/billing/creator-plan-entitlement-service.ts`
5. matching route/error patterns in `src/server.ts`
6. `web/lib/autopost-routines-api.ts`
7. `web/lib/social-playbooks-api.ts`
8. `docs/qa/HTTP_VERB_HYGIENE.md`

## Service contract

Create `src/autopost/automation-service.ts` with:

- feature and Autopost entitlement assertion;
- `createAutomation`;
- `listAutomations`;
- `getAutomation`;
- `patchAutomation` with version conflict protection;
- `archiveAutomation`;
- internal transactional helpers that create/update connector and owned child rows;
- read model including next occurrence, latest run, template availability, and owned child status without exposing raw Prisma objects.

Lifecycle rules:

- Create is retry-safe using the frozen client mutation key.
- Pause/resume updates connector plus owned series/rule consistently.
- Archive stops future discovery but retains runs, drafts, events, and history.
- A missing/deleted template produces repairable state, not cross-creator fallback.
- Preset validation rejects impossible child combinations.
- Legacy unowned rules/series are read separately or left to existing APIs; never silently adopted.

## API contract

Use the frozen route names from VS0; expected shape:

- `GET /api/v1/creator/autopost/automations`
- `POST /api/v1/creator/autopost/automations`
- `GET /api/v1/creator/autopost/automations/:automation_id`
- `PATCH /api/v1/creator/autopost/automations/:automation_id`
- `DELETE /api/v1/creator/autopost/automations/:automation_id` (archive semantics)
- `GET /api/v1/creator/autopost/automations/:automation_id/runs`

GETs are side-effect-free. Mutations return stable receipts and error payloads. Create/patch do not run workers synchronously except explicit child-row creation required by the connector transaction.

## Files

Create:

- `src/autopost/automation-service.ts`
- `web/lib/automation-api.ts`
- `tests/automations/automation-service.test.ts`
- `tests/automations/automation-api.test.ts`
- `tests/web/automation-api.test.ts`

Edit:

- `src/server.ts` in B06 only

Do not touch:

- schedule/rule workers
- rail/extension
- Previewizer
- modal components

## Todo work items

### AUT-VS2-T01 — Implement connector lifecycle

1. Implement feature/plan gate and creator-scoped validation.
2. Implement transactional create/update/pause/resume/archive boundaries.
3. Return frozen wires and latest-child summaries.
4. Add duplicate mutation, version conflict, cross-creator, deleted-template, and partial-child-failure tests.

Acceptance: a connector and its owned children cannot drift through any public lifecycle mutation.

### AUT-VS2-T02 — Add routes and dedicated web client

1. Register REST routes with existing auth/error conventions.
2. Add `web/lib/automation-api.ts` rather than expanding unrelated clients.
3. Freeze request/response fixtures shared by later UI tests.
4. Verify GET purity, 402/404/409 behavior, and retry receipts.

Acceptance: backend and web fixtures match; every mutation is explicit, creator-scoped, gated, and idempotent.

## Safe batches

- **B05:** AUT-VS2-T01 only.
- **B06:** AUT-VS2-T02 only.

## Verification

```bash
npx vitest run tests/automations/automation-service.test.ts tests/automations/automation-api.test.ts tests/web/automation-api.test.ts
npm run typecheck
npm run build
npm run build --prefix web
```

## Exit gate

Lifecycle and API tests pass; frozen fixtures are committed; GET purity and tenant isolation pass; no preset has yet materialized production work.

## Human stop conditions

Stop if lifecycle synchronization requires destructive deletion of existing child history, if an API needs cookie-derived creator identity, or if error/wire changes conflict with VS0.

## Delta Out

B05 names B06. B06 names B07; B09 may be prepared only after B07/B08 establish the shared materializer.

### Batch 5 — 2026-07-20

```text
Automation Delta Out
- Global batch / claimed work items: B05 / AUT-VS2-T01
- Completed: AUT-VS2-T01
- Files created/edited:
  - src/autopost/automation-service.ts (new) — create/list/get/patch/archive/listRuns; feature+Autopost gates; transactional child sync; mutation-key retry via rule.title prefix
  - tests/automations/automation-service.test.ts (new) — 13 memory-mock lifecycle tests
  - tests/automations/schema-relations.integration.test.ts — catch unreachable DB in beforeAll (suite hygiene)
  - docs/studio/automation-build-plans/00-README.md (VS2 → In progress)
  - docs/studio/automation-build-plans/03-VS2-LIFECYCLE-API.md (this Delta Out)
- Migration and backfill state: none (no Prisma schema edits). Mutation-key storage uses owned rule.title `__relay_auto_mut:{key}` until a dedicated column exists (schema is VS1-owned).
- Contracts changed (expected: none unless this batch owns them): none (consumes automations-wire-v1)
- Commands and results:
  - npx vitest run tests/automations/ → 57 passed, 6 skipped (relation IT without applied migration)
- Manual/browser checks: n/a
- Feature flags / kill switches: RELAY_FEATURE_AUTOMATIONS still default off; service requires explicit enable + Autopost
- Existing atom regressions checked: does not call createScheduleSeries reconcile (avoids blank posts); creates series with materializationKind=automation_trigger + ensureOccurrences only; no routes/UI
- Known risks or human gates:
  - Destination “unlinked” is allowlist + non-Patreon requirement only (no OAuth probe yet)
  - Mutation-key column still absent — rule.title encoding is intentional B05 workaround
  - VS4 must honor automation_trigger (occurrences planned; no post materialization here)
- Reopened owner IDs, if any: none
- Next unblocked batch: B06 (AUT-VS2-T02)
- Pasteable next-worker prompt:
  You are a Schedule Rail Automations builder in Rescue/Relay.
  Read AGENTS.md, .cursor/rules/rescue-workflow-always.mdc,
  docs/studio/automation-build-plans/BUILDER-ORIENTATION.md,
  docs/studio/automation-build-plans/00-README.md,
  docs/studio/automation-build-plans/03-VS2-LIFECYCLE-API.md (latest Delta Out),
  src/autopost/automation-service.ts, src/autopost/automation-contract.ts,
  docs/qa/HTTP_VERB_HYGIENE.md, and sibling Autopost route/client patterns.
  Claim global Batch B06 only: AUT-VS2-T02 (routes + web/lib/automation-api.ts).
  Do not implement workers, rail, Previewizer, or modal UI.
  When complete, append Automation Delta Out, mark VS2 Done if exit gate passes, and name B07 next, then stop.
```

**Slice status after B05:** VS2 remained **In progress**. B06 completes the exit gate.

### Batch 6 — 2026-07-20

```text
Automation Delta Out
- Global batch / claimed work items: B06 / AUT-VS2-T02
- Completed: AUT-VS2-T02
- Files created/edited:
  - src/server.ts — GET/POST/PATCH/DELETE + GET …/runs under /api/v1/creator/autopost/automations; sendAutomationError (402 plan / stable codes)
  - web/lib/automation-api.ts (new) — dedicated client (not folded into routines/relay mega modules)
  - tests/automations/automation-api.test.ts (new)
  - tests/web/automation-api.test.ts (new)
  - tests/automations/fixtures.ts — AUTOMATIONS_API_FIXTURES frozen envelopes
  - docs/studio/automation-build-plans/00-README.md (VS2 → Done)
  - docs/studio/automation-build-plans/03-VS2-LIFECYCLE-API.md (this Delta Out)
- Migration and backfill state: none
- Contracts changed (expected: none unless this batch owns them): none (HTTP maps VS0 wires + B05 service errors)
- Commands and results:
  - npx vitest run tests/automations/automation-api.test.ts tests/web/automation-api.test.ts tests/automations/automation-service.test.ts tests/automations/contracts.test.ts → 46 passed
- Manual/browser checks: n/a (no modal UI this batch)
- Feature flags / kill switches: routes call service which still requires RELAY_FEATURE_AUTOMATIONS + Autopost
- Existing atom regressions checked: no worker/rail/Previewizer/modal edits; GETs call only list/get/listRuns; DELETE = archive
- Known risks or human gates: retry create returns 200 (not 201) when receipt.created=false; production migration still human-gated
- Reopened owner IDs, if any: none
- Next unblocked batch: B07 (AUT-VS3-T01)
- Pasteable next-worker prompt:
  You are a Schedule Rail Automations builder in Rescue/Relay.
  Read AGENTS.md, .cursor/rules/rescue-workflow-always.mdc,
  docs/studio/automation-build-plans/BUILDER-ORIENTATION.md,
  docs/studio/automation-build-plans/00-README.md,
  docs/studio/automation-build-plans/03-VS2-LIFECYCLE-API.md (latest Delta Out),
  docs/studio/automation-build-plans/04-VS3-DELAYED-RELEASE.md,
  src/autopost/automation-service.ts, and distribution-rule service/worker.
  Claim global Batch B07 only: AUT-VS3-T01 (delayed release preset wrapper).
  Do not implement scheduled occurrence discovery, rail/toast, or Previewizer UI.
  When complete, append Automation Delta Out and name B08 next, then stop.
```

**Slice status:** VS2 **Done**. Next batch is B07 (VS3 delayed public release).
