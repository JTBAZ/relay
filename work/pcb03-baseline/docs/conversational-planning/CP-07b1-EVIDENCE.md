# CP-07b1 evidence — core persistence repository

**Status:** Implementation complete for root review. This slice covers the bounded composition repository only. It does not implement checked pointer resolution, apply DDL, connect to a database, or prove PostgreSQL behavior.

`src/conversational-planning/persistence.ts` defines closed command and sparse manual-patch types, runtime shape/bounds checks, versioned SHA-256 request identities, replay lookup, Tenant provisioning checks, validated current-row projections, context-backed source/template validation, create/get/list/revise/approve/cancel, immutable revision inserts, and conditional revision compare-and-swap. The repository takes the generated Prisma `TransactionClient` delegate surface, and `assertPersistenceClientAssignable` is a compile-time proof that the generated `PrismaClient` satisfies it. Database and context-loader failures propagate rather than being disguised as missing plans.

Reads validate `PlanSnapshot` shape and current-row projections and re-run `validatePlanWithContext`. A current row with pointers returns `authority_gap` until CP-07b2 can validate the live authority and parent links. This prevents an unvalidated pointer from appearing in an `ok` result. Cancellation also requires current trusted context; unavailable source, template, connection, or entitlement validation is reported as a scoped failure rather than loosening the check.

Manual `title` edits to a `prepare_distribution` step update both its display `title` and effective `copy_title`, preserving their shared semantic meaning. AI-revision hashes cover the bounded creator request envelope before compilation, while manual hashes cover the exact validated patch. Replay returns the immutable revision number separately from the currently validated plan revision. A stale compare-and-swap is returned as a conflict without retrying against a newer base.

Focused mocked repository tests:

```text
npx vitest run tests/conversational-planning/persistence.test.ts
16 tests passed
```

The test file also passes a direct TypeScript check (including the discriminated `PlanStep` unions):

```text
npx tsc --noEmit --strict --esModuleInterop --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext --types node --types vitest/globals tests/conversational-planning/persistence.test.ts
passed
```

Backend build:

```text
npm run build
passed (Prisma client generation, backend TypeScript build, asset copy)
```

The mocked suite checks create/replay after approval; AI replay after a later revision using the original key and stale base; changed-hash and target-handle conflicts; omitted/empty handle normalization; sparse manual edits retaining sibling steps; paired X distribution copy edits; Tenant/source failures; zero-row CAS; cancellation and terminal revision transitions; complete source projection equality; rollback after an injected revision-insert unique failure with same-hash winner reread and different-hash conflict; surfaced database failures; creator-scoped get/list; equal-timestamp ID ordering and cursor pagination; corrupt projection rejection; and pointer fail-closed behavior. The mock transaction stages a copy, commits only when its callback resolves, and can inject an external winner before raising a unique error. These tests exercise repository control flow but do not prove PostgreSQL isolation, locking, uniqueness arbitration, tenant FKs, immutability enforcement, grants, RLS, or SQL checks. Real PostgreSQL proof remains pending the separately approved disposable-database gate. No database URL was used by this slice.
