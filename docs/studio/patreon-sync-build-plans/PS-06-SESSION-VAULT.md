# PS-06: Shared encrypted Patreon session vault

Status: complete locally (2026-10-20, Review Patreon sync flow). Hosted migration and cutover remain pending.

The ticket, active chats, current diff, and recent commits were checked before claiming this item. The save chat is waiting for other chats to finish; it is not implementing the vault. Existing posting-rhythm schema changes and server edits are unrelated and remain preserved. PS-03's ownership policy stays in its separate decision record.

Scope: encrypted creator-scoped database storage, safe local file mutation, compatible status/age/rejection/deletion behavior, server/worker selection, and a restartable migration that preserves stored age and does not overwrite hosted state. No provider account match is inferred from cookie storage. No production migration, deployment, or live credential movement is included.

## Storage and runtime behavior

`PatreonCookieStore` separates the existing caller contract from persistence. The file and PostgreSQL adapters share age, rejection, expiry, and deletion transitions. The default local maximum age remains 90 days from `stored_at`; importing a record never renews that age.

The new `patreon_sessions` table stores AES-256-GCM ciphertext through the existing `TokenEncryption`, original storage time, remote rejection time, and key label. Its creator key references an existing studio. It creates no tenant, merges no identity, and does not verify which Patreon account supplied a browser session. The existing authenticated account/creator guards remain on the cookie routes.

Database changes take a creator advisory lock before reading and save in the same Read Committed transaction. Expiry checks compare the observed encrypted record and storage time before clearing it. Remote rejection removes only the session used by the failing request, so an older request cannot erase a fresh upload. Empty database rows retain deletion/expiry state and prevent a later file migration from restoring removed credentials. Voluntary delete clears the rejection marker as before.

The table enables row-level security with no browser policies and revokes public, anon, and authenticated access. Use the server's privileged database connection. HTTP credential operations return a generic 503 on vault failures; corruption and connection errors do not become an empty store or a file fallback.

Production with Prisma selects the shared adapter by default and refuses a file override. `RELAY_DB_STORE_PATREON_COOKIE=1` explicitly selects it in other environments. The actual split API and dedicated worker startup paths require shared storage. Both use the same `createApp` factory; a local app constructed without starting workers can retain file mode. Configure the same database, key, and flag on every API/worker instance before enabling multiple writers.

Local file mutation uses process coordination plus `proper-lockfile` across processes, followed by a same-directory temporary write, file sync, and atomic rename. The existing installed lock implementation is now a direct production dependency; its TypeScript declarations are build dependencies. Missing files initialize normally. Invalid JSON/schema, unreadable files, and decryption failures surface without resetting the vault or echoing its contents. File symlinks are refused for writes/migration because they could split the lock and replacement paths. Use the same regular vault path for all local processes. The lock heartbeat supports recovery of an abandoned lock after its 60-second stale interval; waiting is bounded.

## Migration and rollout

1. Drain legacy cookie writers and sync workers. Keep them stopped through interrupted/retried cutover; old versions do not participate in the new file/database coordination. Inventory the source path and exact creator/studio mappings, and retain the existing encryption key.
2. Apply the reviewed `20261020000000_patreon_session_vault` migration before starting the new hosted writers. This implementation applied it only to a disposable PostgreSQL database.
3. Build the CLI with `npm run build`. Set `DATABASE_URL` to the intended target and `RELAY_TOKEN_ENCRYPTION_KEY` to the source vault's key through the existing environment/secret configuration.
4. Run the default dry-run, then apply the reviewed cutover:

   ```sh
   node scripts/migrate-patreon-cookie-vault.mjs --source path/to/patreon_cookies.json
   node scripts/migrate-patreon-cookie-vault.mjs --source path/to/patreon_cookies.json --apply
   ```

5. The apply command creates an encrypted `<source>.ps06-backup.json` before target writes, using mode 0600 where supported. Windows inherits the vault directory's ACL; keep that directory private. Backup creation is atomic and does not replace an existing backup. A changed source/backup pair stops the migration for operator resolution. Wrong keys and invalid files fail before importing rows. Missing studios stop progress without provisioning or reassignment; earlier committed creator rows remain safe for retry.
6. Rerun the same command after interruption. Each creator is imported under the same database lock used by runtime updates and read back before transaction completion. Every existing hosted row wins, including a fresh upload, rejection, expiry purge, or voluntary deletion. Legacy rejection markers take precedence over any accompanying session record. Original source timestamps and ciphertext are retained for new imported rows. The command prints counts or a generic failure, never credentials.
7. Set `RELAY_DB_STORE_PATREON_COOKIE=1` consistently on API and workers, deploy compatible writers together, and verify authorized status reads from both instances. Keep the source and backup until production read-back succeeds. Archival/removal is a later operator step; the migration never deletes them.

The file adapter remains available for local use through `RELAY_PATREON_COOKIE_STORE_PATH` (default `.relay-data/patreon_cookies.json`). No production cutover, credential transfer, or ownership-policy decision was performed by this item.

## Verification

Six of the nine initial local-vault cases failed against the old implementation: concurrent updates were lost, corrupt/unreadable files were treated as empty, and a stale rejection marked a fresh session. The final vault suites have 28 passing cases and one OS-permission skip. They cover encrypted storage, atomic replacement failure/retry, concurrent instances and actual processes, corrupt data, age, stale expiry/rejection, real sync handling of an old 401 after a new upload, private HTTP failures, store selection, and database failure without file fallback.

Eight PostgreSQL cases use the real adapter, two clients, and actual writer processes. They verify shared updates and status, persisted deletion markers, corrupt material/key labels, a fresh upload during expiry cleanup, partial migration/resume, preserved age and hosted state, dry-run/wrong-key behavior, migration/upload locking, studio foreign keys, row-level security, and denied unprivileged access. The reviewed SQL migration was applied only to the disposable loopback test database. No linked Supabase read-check tool was available; hosted schema/security verification remains part of rollout.

The final command `node node_modules/vitest/vitest.mjs run` passed all 24 connected suites: `patreon-cookie-store` (file and integration), `patreon-cookie-selection`, `patreon-cookie-vault-route`, `patreon-cookie-auth`, `patreon-cookie-oauth-body`, `patreon-sync-health`, `patreon-sync-state-watermark`, `patreon-sync-media-source`, `workstream-patreon-scrape`, `extension-consent-rate-limit`, `extension-cors`, `relay-creator-tenant-authz`, `patreon-platform-webhook-route`, `patreon-sync-post-access-route`, `patreon-sync-members-route`, `patreon-webhooks-register-route`, `patreon-sync-baseline`, `ingest-service-events` (unit and integration), `canonical-store-shared-media.integration`, `canonical-store-concurrency.integration`, `incremental-autosync-worker`, and `worker-entry`. Result: 146 passed and one skipped, including 44 PostgreSQL cases and the five expected-failure baseline assertions still assigned to PS-09/11/12. Windows denied the file-symlink fixture; its guard was reviewed but not exercised on this host.

Strict TypeScript checks passed for the four new vault suites and connected migration/runtime source. `npm run build` passed, including Prisma generation, backend compilation, and copied assets. The built worker completed `--smoke` with shared-vault configuration. The built CLI passed a default dry-run, apply, committed decryption/timestamp read-back, resume after a hosted deletion, retained-backup comparison, and corrupt-source rejection with output checked for fixture-key/session leakage. Direct PostgreSQL timestamp read-back used UTC, matching Prisma's stored-time convention.

The initial preservation audit covered 87 existing files. Reversing only this item's hunks in memory reproduced the initial hashes for `src/server.ts`, `prisma/schema.prisma`, and `package.json`; existing posting-rhythm and extension changes were preserved. PS-04/PS-05 source and regression files remained unchanged. Five Library-planning documents changed concurrently and were left intact. Whitespace checks preserve the server's existing CRLF convention; new-file whitespace and document links passed. The disposable PostgreSQL server was stopped after verification. No commit, push, provider request, production migration, or deployment is included.

## Ponytail Review

What this change does: Hosted API and workers share encrypted Patreon browser sessions. Local writes and file-to-database cutover preserve other creators' records, credential age, and rejection/deletion state.

Scope: Only this item's cookie-store interface/transitions and adapters, migration helper/CLI, selection factory, cookie wiring/errors in `src/server.ts`, cookie handling in `src/patreon/patreon-sync-service.ts`, environment/worker wiring, the `PatreonSession` model and migration, dependency declarations/lock changes, new vault tests/helpers, worker-smoke flag, and PS-06 contract/completion notes. Existing server/schema/package changes and other dirty files are excluded. Connected code inspected includes encryption, creator/account route guards, OAuth storage, both runtime entry points, cookie scraper failures, sync-state/fallback callers, database/RLS conventions, and all cookie-store call sites. Expected load is multiple hosted API/worker processes using PostgreSQL, with local file mode on one machine.

Looks good. Ship. No blocking finding remains in scope. Sensitive state transitions share one implementation. Database mutation and migration use the same creator lock; file replacement retains a complete previous snapshot on failure. No provider identity is fabricated and no ownership policy is changed. The new runtime dependency promotes the already installed lock implementation rather than adding another locking framework.

Not checked: Full repository suite, live Patreon/extension traffic, linked hosted Supabase schema/roles, production cutover, key rotation, or forced process-kill/power-loss recovery. The Windows file-symlink test was skipped for OS permission. Metadata/product phases and PS-07 onward are not started.
