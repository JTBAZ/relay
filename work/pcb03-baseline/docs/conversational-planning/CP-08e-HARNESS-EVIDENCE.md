# CP-08e disposable database harness evidence

The opt-in harness now accepts only the default `--run` CP-07 suite or the exact `--run --suite cp07|cp08` forms. The programmatic API uses the same closed `cp07`/`cp08` selector and validates it before database creation. Both child test paths come from a fixed literal map; migration remains the fixed `prisma migrate deploy` command. Unknown suites, paths, prototype property names, duplicate flags and extra arguments fail before dotenv loading, environment lookup or database setup.

CP-07 still resolves to `tests/conversational-planning/persistence-postgres.integration.test.ts`. CP-08 resolves only to `tests/conversational-planning/api-postgres.integration.test.ts`. That API test file is not present yet; the selector is ready for the separately gated 08d test authoring. This slice did not run either database suite or create a database. Harness behavior was verified only with mocked clients and mocked child runners. Existing loopback/query allowlisting, endpoint-alias rejection, environment scrubbing, ownership nonce/marker checks, safe child spawning, and non-FORCE cleanup remain covered by the harness suite.

Validation:

- `npx vitest run tests/conversational-planning/test-db-harness.test.ts` — 10 tests passed.
- `npx tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --esModuleInterop --skipLibCheck --types node,vitest/globals tests/conversational-planning/test-db-harness.test.ts` — passed.
- No database connection, migration, provider call or backend build was run.

The repository's existing Vitest configuration loads dotenv when Vitest starts, so the focused test command emitted its ordinary dotenv injection notice. The harness does not call its dotenv loader for malformed CLI arguments, as covered by a mocked CLI test; no environment secrets are included in this evidence.
