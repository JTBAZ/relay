# CP-06 integration evidence

**Status:** Implemented for parent review. This records deterministic compiler behavior only; mocked interpreted requests do not establish runtime natural-language accuracy.

## Integrated journey

`compileNewPlan` used mocked creator-owned Library rows and the real calendar resolver with a request clock of `2026-10-15T10:00:00.000Z` in `Europe/London`. The initial snapshot placed the X teaser at Friday, 16 October 2026, 17:30 local (`2026-10-16T16:30:00.000Z`). It also retained the Patreon original-media delivery, one saved Previewizer template and shared preview, X and DeviantArt variants, plus two explicit X publication-relative follow-ups.

The test then simulated an accepted manual X-title edit at revision 1, supplying the exact server-scoped confirmed-time evidence for the unchanged X step. A sparse `changed_fields: ["time"]` revision moved only that teaser to Friday, 23 October 2026, 17:30 local (`2026-10-23T16:30:00.000Z`). Its manual title and all other step fields, sibling IDs and fields, group, source, review state, and creation time remained unchanged. The candidate advanced once to revision 2, passed `validatePlanWithContext` against freshly loaded rows and source fingerprint `fp-v1`, and had zero unresolved requests. Reusing the old base revision and handle returned `stale_revision`; the proposed snapshot remained unchanged.

Additional compiler cases cover missing trusted time confirmation, timezone disagreement, title-only edits without a timezone, follow-up additions inheriting the frozen zone when the intent omits it, follow-up addition and terminal removal, X disable clarification when enabled dependent handoff exists, new teaser disable propagation limited to that teaser chain, unavailable Patreon clarification, stale source and template authority, foreign creator scope, and source-reference, delivery-mode, and publication-relative-time checks on additions. A new DeviantArt variant append preserves a creator-edited X title and the existing source, group, and step IDs.

## Verification

- `npx vitest run tests/conversational-planning/compiler.test.ts tests/conversational-planning/calendar-resolver.test.ts tests/conversational-planning/revision-merge.test.ts` — passed, 3 files / 36 tests.
- `npm run build` — passed after final compiler changes, including Prisma client generation, `tsc -p tsconfig.build.json`, and build-asset copying.

## Boundaries and remaining gaps

The compiler remains pure and read-only. It does not persist the proposal or perform external publication. The frozen CP-04 teaser-only discriminator gap still returns `contract_gap`; it does not manufacture a source helper or include a snapshot in that result. CP-08 must define how its trusted adapter derives revision-scoped confirmation evidence without treating a proposed `TimeSpec` as creator confirmation. Authority-aware edits to approved or materialized plans remain for CP-07/09. Destination/target replacement and removal with dependents continue to require the separately reviewed dependent-repair contract.
