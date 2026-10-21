# CP-09a1 — Transaction-compatible metadata reads

Root accepted 2026-10-17. `ConnectedPlatformReadDb`, `PlanningLookupReadDb` and `PlanningContextReadDb` expose generated Prisma delegate Picks accepted directly by both PrismaClient and Prisma.TransactionClient. The connected-platform, lookup and context factory arguments are narrowed; their queries, fingerprints, readiness and entitlement behavior remain unchanged.

`tests/conversational-planning/read-transaction-types.test.ts` checks generated-client assignability and supplies a delegate-only object with no transaction opener. It exercises source relations, templates, readiness, entitlement, timezone and the actual request-context fingerprint path. Pool connection/query traps establish this sentinel made no database connection; default-creation and entitlement mutation spies remain unused. This proves structural assignability and read binding, not actual PostgreSQL isolation or concurrency.

Root independently passed 22 focused tests across read types, lookup and context, and the backend build. Worker strict targeted TypeScript passed for all three test files. No schema, ordinary database, provider, ledger, server enablement or publication change belongs to this slice. CP-09a2 draft preparation/reservation is dispatched separately; CP-09 remains incomplete.
