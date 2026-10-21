# CP-07b2 evidence — checked live authority pointers

**Status:** Implementation complete for root review. This slice resolves retained plan pointers against current owned authority rows and adds an approved-plan-only pointer insertion operation. It does not materialize or mutate any execution authority.

`src/conversational-planning/persistence.ts` now validates every stored pointer when reading a plan, listing plans, returning an idempotent replay, or accepting a revision. The resolver checks each supported slot against the exact live Prisma row, creator ownership, and the relevant source, group, variant, or destination relationship. Supported slots are `draft`, `relay_post`, `distribution_plan`, `variant`, and `current_attempt`. It does not permit a current-attempt pointer to be replaced by a later attempt.

`preview_media` returns `authority_gap` because the available media model does not establish the required export provenance. `attention_event` and `engagement_event` return `authority_gap` because there is no accepted mapping from conversational step to schedule event. These outcomes are explicit on both insertion and subsequent reads. Missing, foreign-owned, stale, or incorrectly linked supported authorities fail closed.

`putCheckedPointer` is available only after the plan is `approved_for_preparation`. In one Prisma transaction it locks the current approved plan row with `SELECT ... FOR UPDATE` on `public.creator_conversational_plans`, matching creator, plan, and composition revision, then resolves and inserts the pointer. The pointer write does not increment composition revision or alter authority status. An identical occupied slot is idempotent; a different authority in that slot conflicts. A lost row lock returns a revision conflict. Unique-race recovery rereads the slot and succeeds only if the live winner is the same pointer. Reads continue to validate retained pointers even after cancellation.

Focused mocked repository tests:

```text
npx vitest run tests/conversational-planning/persistence.test.ts
22 tests passed
```

The suite covers positive resolution for each supported slot; ownership and parent/source/group/destination mismatches; current-attempt immutability; pointer validation after cancellation; explicit gaps for unsupported authority mappings; approved-state enforcement; same-pointer retry and occupied-slot conflict; stale-plan and row-lock conflicts; and unique-insert winner reread. It also retains the CP-07b1 persistence regressions. The transaction mock stages writes and models rollback and injected winners, but does not prove PostgreSQL locking or concurrent arbitration.

The test file passes a direct strict TypeScript check:

```text
npx tsc --noEmit --strict --esModuleInterop --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext --types node --types vitest/globals tests/conversational-planning/persistence.test.ts
passed
```

The backend build passes:

```text
npm run build
passed (Prisma client generation, backend TypeScript build, asset copy)
```

No database connection or pointer-race integration test was run by this slice. The mocked tests do not prove SQL lock behavior, isolation, uniqueness arbitration, tenant constraints, or schema deployment. No production authority writes, migrations, API routes, or paid calls are part of this implementation.
