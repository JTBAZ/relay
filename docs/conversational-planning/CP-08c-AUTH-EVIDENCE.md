# CP-08c read-only identity evidence

Added an optional `SessionReadOptions` argument to the identity store's `getSession` surface and forwarded it through `IdentityService.resolveSession`. Omitting the argument keeps historical cleanup behavior. With `cleanupExpired: false`, the database and file stores still reject an expired session but do not delete or save anything. Revoked and missing database sessions remain rejected without cleanup writes.

`requireAccount` has an opt-in `readonlySession` dependency. When enabled it resolves the existing cookie/Bearer token with `{ cleanupExpired: false }`; its default path still calls the original one-argument method. Conversational-planning routes always opt in after the required database identity readiness gate. Account lookup, creator derivation, Tenant verification and RLS context behavior remain in the existing middleware.

Evidence: `npx vitest run tests/identity/require-account.test.ts tests/identity/session-readonly.test.ts` — 14 tests passed within the final combined 60-test focused run; the read-only tests exercise actual `DbIdentityStore`, `FileIdentityStore`, `IdentityService`, and `requireAccount` over temporary files and mocked Prisma. They cover read-only expired-session rejection without delete/save, legacy default expired-session cleanup, valid/revoked/missing database sessions, cookie-before-Bearer precedence, and forwarding of the read-only option. The focused strict TypeScript check over the changed route and identity files passed, followed by the final coordinated `npm run build`.

These mocks prove store-call behavior, not persisted PostgreSQL behavior. CP-08e must assert that a real expired session row remains present after an authenticated conversational-planning GET.
