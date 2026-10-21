# CP-07b3 disposable PostgreSQL harness

This slice adds an opt-in local harness for a later disposable-database proof. Importing `scripts/conversational-plan-test-db.mjs` is safe: it does not load `.env`, connect to PostgreSQL, create a database, run migrations, or start child processes. Execution requires the explicit `--run` argument.

From the repository root, prepare a private loopback PostgreSQL bootstrap URL in the project's existing `.env` as `CONVERSATIONAL_PLAN_TEST_BOOTSTRAP_URL` (preferred) or `DATABASE_URL`, then run:

```powershell
node scripts/conversational-plan-test-db.mjs --run
```

The script quietly loads `.env` itself. Do not paste the URL into a shell command or pass it as a command-line argument. The bootstrap database is used only to connect to the local `postgres` maintenance database; it is never migrated. The runner creates a fresh `relay_cp07_test_<32-hex-nonce>` database, supplies only its derived URL as child `DATABASE_URL`, invokes this repository's fixed `prisma migrate deploy` command and fixed conversational-plan integration-test path, then rechecks a database comment ownership marker before dropping exactly that database. Child output is suppressed and failures are reported with stable codes so credentials and URLs are not included in logs.

The exported helpers support deterministic tests through injected client and child runners. A cleanup handle is authenticated by private in-process provenance as well as the generated name, loopback host/port, nonce, and the database's ownership comment. If creation or ownership is uncertain, the harness refuses cleanup and reports the database name for manual inspection; it never searches for or drops databases by a broad prefix. SQL database identifiers are restricted to safe lowercase characters and quoted.

Safety checks reject non-loopback hosts, inherited test-database targets, pre-existing nonce targets, unsafe names, ambiguous connection query parameters (including endpoint aliases such as `hostaddr` and `service`), and ordinary-database collisions. The child environment removes inherited PostgreSQL endpoint variables, alternate database URLs, dotenv path/override settings, and Node preload/module-path hooks before setting the guarded target URL. Environment names are matched case-insensitively to cover Windows variants. Dotenv loading in the Prisma child is quiet and cannot override that URL.

This authoring slice has not executed the harness and makes no claim of database-backed proof. It creates no roles. A local PostgreSQL account used for a future run needs enough privilege to create a database, set its comment, connect to the target for migration and tests, and drop that same database. An interrupted process can leave a disposable database behind; inspect only the exact name reported by the harness, verify its ownership marker, and remove it manually if appropriate. The current fixed integration-test path must exist before a later authorized run.
