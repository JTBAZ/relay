# CP-06c evidence — revision handles and sparse patches

`mergePlanRevision` is a pure boundary over the current composition snapshot, the server's opaque handle map, one CP-05 interpretation, the exact latest user text, and an expected revision. It produces compiler-facing add/revise/remove operations; it does not build a replacement snapshot, persist anything, or alter drafts, events, attempts, review state, or execution pointers. Every revised field carries the current value as an expected value so a later integration can compare before applying it. Fields omitted from `changed_fields` are absent from the patch and therefore retain manual edits.

The merge validates the root and every request with the accepted `INTERPRETED_REQUEST_SCHEMA`, then checks exact request quote containment and exact title/time/template text evidence. It does not infer destinations with a second keyword parser. It also checks revision equality and the complete `(creatorId, planId, revision, stepId)` handle binding. Adds have no handle. Revises and removes without a handle ask for clarification, with an ambiguous-target result when several compatible steps match. A template-only teaser edit must target its related preview handle. A destination or target replacement asks for a repair plan, and removal asks for clarification when dependencies or distribution-group references would remain. Add retries return `unchanged` only when the requested known semantics match the existing step; follow-up identity includes its action and calendar-day offset. Competing destination additions and multiple edits to one step return conflicts.

Focused proof:

- `npx vitest run tests/conversational-planning/revision-merge.test.ts` — passed, 9 tests; fixtures also assert `validatePlanShape` accepts the composition graphs.
- `npx tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --esModuleInterop --skipLibCheck src/conversational-planning/revision-merge.ts` — passed.
- `npm run build` — passed.

Remaining integration gap: the current CP-05 intent has no expected-value token or explicit dependent repair list. This module carries expected values in its patch and safely clarifies graph-changing edits; CP-06 integration must compile and validate the resulting snapshot before persistence is considered in CP-07.
