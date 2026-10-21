# Staging upgrade preparation

Status: approved schema steps 1 and 3 through 10 applied and verified. Steps 3 through 8 ran on 2026-10-20 UTC; steps 1, 9 and 10 ran on 2026-10-21 UTC. Step 2 remains held and PS-12 remains excluded. The user authorized bringing Supabase up to current specifications, and the supervisor issued bounded apply GOs after independent review. No provider refresh, deployment, runtime configuration or writer activation ran.

## Target and evidence

The connected project is **RELAY - STAGING**, `nxfawnuflagbimcyrsqs`, matching the repository's historical project reference. Its Supabase API is `https://nxfawnuflagbimcyrsqs.supabase.co`. This checkout's `.env` still targets loopback development PostgreSQL and its web API points to `localhost:8788`; those settings were left unchanged.

The read-only catalog snapshot began at `2026-10-20T22:10:42Z`. It contains 149 public tables, 1,396 columns, 466 indexes, 255 constraints, 66 enums and 14 policies. All 149 public tables have RLS enabled; existing foreign keys are validated. Exact definitions, ACLs, default grants, function security attributes, sequences and triggers are saved in the local review bundle.

Relaytest resolves to creator `cr_b938cb926e9d4afeae4c44b9aff21fa9`, tenant `cmrpj793q0018jcwongxtf4yu`, public profile `relayer`, and canonical Patreon campaign `16496629` (`patreon_campaign_16496629`, name `Relaytest`). The owning account has a Supabase Auth link. Creator-ingest OAuth material exists, but its expiry hint is 2026-10-01; the stored healthy flag alone does not establish current validity. No credential values were retrieved.

The bound webhook has one registered callback at hostname `api.relayapp.me`, with stored registration status `ok`. A credential-free `GET https://api.relayapp.me/api/v1/health` returned HTTP 200 and `status: ok`; that route exposes no version or database identity. The user confirmed `relayapp.me` as the public website. These observations establish the public web host, a historical callback destination and a live API, without proving the deployment's build/database binding. The activity snapshot showed idle client/pooler connections and no active mutation. It does not establish that old writers have stopped.

## Proposed migration scope

The six committed October migrations are current core requirements. Their upgrade safety is included in this independent review; being committed does not establish prior independent approval. The four subsequent reliability migrations have local approval records, and their hosted application is also part of this review.

| Step | Original migration | Scope |
|---|---|---|
| 1 | `20261011010000_gallery_editor_naming` | Series, durable editor sessions/commits, title modes, creator-scoped relationship constraints. |
| 2 | `20261011020000_gallery_editor_title_validity` | Enforce consistent custom/source titles. |
| 3 | `20261015120000_creator_conversational_plans` | Durable plans, revisions, pointers and nullable authority correlation keys. |
| 4 | `20261018120000_creator_schedule_event_media_ids` | Ordered event media references. |
| 5 | `20261019150000_posting_rhythms` | Rhythm configuration, enrollments, draft state and receipt references. |
| 6 | `20261019160000_posting_rhythm_windows` | Rhythm windows and post-version reconciliation index. |
| 7 | `20261020000000_patreon_session_vault` | PS-06 shared encrypted browser-session storage. |
| 8 | `20261020010000_patreon_change_work` | PS-08 durable signed resource work. |
| 9 | `20261020020000_patreon_member_reconciliation` | PS-10 observations, fences, member/roster state and keyed ledger transitions. |
| 10 | `20261020030000_patreon_post_progress` | PS-11 archive/checkpoint leases and fair scheduler state. |

The proposal adds 17 tables and the missing columns/indexes required by these migrations while retaining existing objects and rows. Each source file is copied byte-for-byte into the review bundle. Each proposed wrapper records its source SHA-256, uses a transaction with a five-second lock timeout and sixty-second statement timeout, serializes upgrade attempts, and aborts on unrecorded partial schema or mismatched source history. A completed matching source skips execution and rechecks object/access postconditions. Any failed step rolls back its source changes and source history entry together.

The wrappers enable RLS and revoke `PUBLIC`, `anon` and `authenticated` access on every newly created table before commit. This closes the gallery migration's missing-RLS window and keeps new operational state private. Existing policies, role memberships, grants on existing objects and function behavior remain unchanged. Independent review exercised the dynamic SQL wrappers and repeat-run behavior on a disposable database before the approved hosted applications recorded below.

PS-12 migration `20261020040000_patreon_media_repair` is copied to `deferred/` for identification only. It is excluded from the proposed sequence while its implementation/review remains active. Later unreviewed work and concurrent Library/editor changes are outside this upgrade. Escape Hatch remains deferred, including its separate migrations and fixtures.

## Data and writer gates

Preflight found zero cross-creator creative-work memberships or presentations, three presentations with two nonblank custom titles and no blank title overrides, eleven tenant memberships, no membership ledger events, and two sync cursors. These are aggregate observations, not permission to repair later conflicts. The gallery wrapper repeats ownership checks. The title-validity wrapper aborts if a noncustom title acquired a value after preparation, preserving that value for investigation instead of clearing it.

Step 1 alone permits the historical title-only writer. Step 2's title constraint rejects that writer, so it remains held until compatible gallery writers are ready. New title-mode readers must wait for the coordinated change. The additive vault/work/plan/rhythm tables can be prepared separately after review. No writer pause was performed by this task.

PS-10 requires replacing or draining all old identity/member writers before relying on observation fences and keyed-ledger guarantees. PS-11 similarly requires compatible canonical/progress writers; old processes ignore its leases and versions. Hosted cutover must consistently select shared identity, canonical, watermark, creator OAuth and browser-session stores, with BullMQ/Redis and the later approved media-storage path. Apply schema before activating new writers, then verify runtime flags and deployment identity. A schema upgrade alone does not establish PS-15 readiness.

## Drift and migration provenance

Staging has 119 Prisma history rows and five Supabase migration rows. There are no unfinished, unrolled-back Prisma entries. Of the 104 repository migration names already applied, 85 checksums match byte-for-byte and 18 match after CRLF-to-LF normalization. Preserve their original ledger checksums. The remaining mismatch is `20260423171217_relay_post_source_and_delta_sync`; its current `PostSource` enum, column and index exist, including the later SubscribeStar enum value. Preserve its recorded checksum and investigate historical source independently; replay is unnecessary for this upgrade.

Eight applied migration names are absent from this checkout: `20260731180000_relay_master_lineage`, `20260731200000_rls_lockdown_postgrest_gap_tables`, `20260827210000_studio_gallery_snappy`, `20260828120000_gallery_published_at`, `20260828200000_command_grants_audit`, `20260831010000_command_proposals_changesets`, `20260831020000_command_idempotency`, and `20260901180000_command_send_work_orders`. Retain all their tables, lineage/gallery columns, constraints, policies and history. Fourteen current index names and one foreign-key name differ while their compared definitions match; renaming them is unnecessary.

Two existing `creator_goal_cycle_materialization_receipts` columns, `materialized_at` and `created_at`, are `timestamptz`, whereas the current Prisma reference requests millisecond timestamps without time zone. The table has seven rows and the database reports UTC. The proposal retains these values and types pending a separate semantic/precision decision; it does not silently cast real timestamps to make a schema diff empty.

Use the exact reviewed wrappers through this project's Supabase `apply_migration` route so Supabase records the actual wrapper SQL. Each wrapper inserts a new Prisma record only after executing the complete corresponding source body and passing its object/access checks in the same transaction. Its checksum refers to the captured original source bytes. Only the source's outer transaction delimiters are replaced, and the wrapper adds preconditions and private-table hardening. This controlled source-history insert is proposed for independent review because no staging CLI connection string is configured here. It does not rewrite any existing entry or mark a skipped/partial source as applied. If review selects the official `prisma migrate resolve --applied` route instead, remove the wrapper's source-history insert and resolve only after the same exact-source execution and verification; do not do both.

The eight database-only history entries and genuine historical source mismatch remain visible after this upgrade. A future clean checkout needs their original migrations recovered before claiming full migration-history parity. Do not use `db push`, reset, unconditional `migrate deploy`, blanket `migrate resolve`, or checksum edits to hide that drift.

## Review bundle and verification

Bundle: `C:/Users/jorda/AppData/Local/Temp/relay-staging-upgrade-20261021`.

- `database-inventory.json`, `data-checks-and-catalog-formats.json`, and `migration-ledgers-and-writers.json`: exact captured schema/access metadata, safe aggregate checks and both history ledgers.
- `repository-migrations.json` and `drift-report.json`: source hashes, line-ending classifications and catalog comparison, with retained extra objects.
- `sources/`, `proposed/`, `upgrade-manifest.json`: original SQL bytes, ten guarded wrappers and their hashes. The manifest approved for steps 3 through 8 is preserved unchanged as `apply-approved-manifest.json`, SHA-256 `2d4100795643d8040e05807bf6ae8753096322d72b6f9786a2414854121e7893`. The current manifest changes only wrapper 9's privilege postconditions; its SHA-256 is `4ecf791fcada152cec5aa81370cb73f484fadd25faa69fc33e44a92d6c23650d`.
- `current-schema-reference.sql`: local Prisma reference only, including deferred PS-12; never apply it as a whole.
- `verify-upgrade.sql`: read-only post-upgrade table/privacy, constraint, ownership and source-ledger checks.
- `prepare-upgrade.mjs`: reproducible artifact preparation with source-hash and scope assertions. It writes local artifacts only.

Preparation assertions passed. The independent reviewer exercised the original ten wrappers twice on a reconstructed disposable 149-table database and verified preservation of its original history. That review found wrapper 9's sequence privilege repeat-check gap; the correction, independent rereview and approved application are recorded below. Scoped Ponytail Review covered only the upgrade artifacts and this record, reading the source migrations, identity/ownership and cutover contracts. No runtime tests, Prisma generation/build, fixture seeding on Supabase, provider requests, OAuth refresh or deployment ran in this upgrade task.

## Applied additive steps

The supervisor approved only steps 3 through 8 against the frozen manifest above. Every wrapper and repository source was rehashed before its apply; live schema preconditions passed. Step 3 was applied first and its actual schema/privacy and both history records were verified before continuation. All six applies returned `success: true`; no retry was needed.

| Step | Supabase migration version | Stored wrapper name |
|---|---|---|
| 3 | `20261020222728` | `relay_staging_upgrade_03_creator_conversational_plans` |
| 4 | `20261020222803` | `relay_staging_upgrade_04_schedule_event_media_ids` |
| 5 | `20261020222847` | `relay_staging_upgrade_05_posting_rhythms` |
| 6 | `20261020222851` | `relay_staging_upgrade_06_posting_rhythm_windows` |
| 7 | `20261020222857` | `relay_staging_upgrade_07_patreon_session_vault` |
| 8 | `20261020222901` | `relay_staging_upgrade_08_patreon_change_work` |

Each readback passed the wrapper's object/access postconditions. Each new Prisma row has the exact captured source checksum, a completion timestamp and one applied step. Each Supabase history entry contains one statement whose MD5 matches the exact reviewed wrapper bytes. Per-step readbacks are in `apply-step-03.json` through `apply-step-08.json`.

Post-apply assertions retained all 149 original tables, 1,396 original column definitions, 255 original constraints, 466 original indexes and 3,294 original grants. Existing enum values, policies and function security metadata are unchanged. All 119 original Prisma history rows and all five original Supabase history rows compare unchanged. Counts for every original table are unchanged except `_prisma_migrations`, which grew from 119 to 125 as intended. Supabase migration history grew from five to eleven rows. Relaytest's owner, tenant and campaign bindings are unchanged. The database now has 158 public tables, including nine new private RLS tables, 1,491 columns and 499 indexes. No held gallery/member/checkpoint/media-repair table was created.

Evidence: `apply-baseline.json`, `apply-post-inventory.json`, `apply-post-retained.json` and `apply-retention-verification.json`. The retention assertion script passed. Original reviewed sources and wrappers for steps 3 through 8 were preserved byte-for-byte.

## Wrapper 9 correction and remaining gates

Wrapper 9 now checks effective `USAGE`, `SELECT` and `UPDATE` sequence privileges for both `anon` and `authenticated`, plus an explicit `PUBLIC` sequence ACL check. A later grant therefore makes repeat verification fail. Its source migration is unchanged. The previous wrapper is retained in `prior-review/`; only wrapper 9 and its generator postconditions changed.

- Original source SHA-256: `8bc5d8b6c1e16efd4cc438a8b11457b2c1c2bd9ab555fb45de88da4ddd791b9a`.
- Revised wrapper SHA-256: `71b0d62a9c11cbf14976f821246ef3195cd76ca4bdd55ab8e8ea6f2e10e058da`.
- Revised manifest SHA-256: `4ecf791fcada152cec5aa81370cb73f484fadd25faa69fc33e44a92d6c23650d`.

Independent final rereview passed all 52 recorded cases, including adversarial sequence grants to `PUBLIC`, `anon` and `authenticated`, rollback, repeats and historical caller shapes. Evidence: `C:/Users/jorda/AppData/Local/Temp/relay-staging-upgrade-rereview-20261021.json`. It approved schema steps 1, 9 and 10 against the revised manifest, while holding step 2 and all runtime activation. The supervisor then issued a bounded apply GO for those three steps alone.

## Applied schema preparation: steps 1, 9 and 10

Each source/wrapper hash matched the final reviewed manifest before apply. Fresh ownership, aggregate data, schema and history preconditions passed. Step 1 was applied and read back before step 9; step 9 was verified before step 10. All three applies returned `success: true`; no retry was needed.

| Step | Supabase migration version | Stored wrapper name |
|---|---|---|
| 1 | `20261021073714` | `relay_staging_upgrade_01_gallery_editor_naming` |
| 9 | `20261021073849` | `relay_staging_upgrade_09_patreon_member_reconciliation` |
| 10 | `20261021073854` | `relay_staging_upgrade_10_patreon_post_progress` |

Each source checksum matches its completed Prisma row. Each exact wrapper matches its stored Supabase statement MD5. Eight new tables have RLS and no effective browser-role access. The member observation sequence has no `PUBLIC`, `anon` or `authenticated` privileges. The legacy membership event index is unique only where `dedupe_key IS NULL`, and all eleven existing memberships received the intended zero observation default. Both existing cursor rows retain their original values and null counts, with zero initial versions and no progress or lease material.

Post-apply assertions retained all 158 prior tables, 1,490 prior column definitions and all 3,420 prior grants. The remaining prior column, `sync_cursors.last_synced_at`, has only the reviewed nullable relaxation. Three single-column gallery foreign keys were replaced with their creator-scoped composite counterparts; the other 280 prior constraints are unchanged. The old full membership-event uniqueness index was replaced by the reviewed keyed and legacy-partial indexes; the other 498 prior indexes are unchanged. Existing enums, policies and function security metadata are unchanged. All 125 prior Prisma rows and eleven prior Supabase history rows compare unchanged. Counts for every prior table are unchanged except `_prisma_migrations`, which grew from 125 to 128. Raw title aggregate fingerprints and original cursor value fingerprints match; Relaytest's owner/tenant/campaign binding is unchanged.

The database now contains 166 public tables, all with RLS, 1,549 columns, 526 indexes and 302 validated constraints. Step 2's constraint and completed history entry are absent. PS-12's media-repair table remains absent. Evidence: `apply-step-01.json`, `apply-step-09.json`, `apply-step-10.json`, `apply-second-baseline.json`, `apply-second-post-inventory.json`, `apply-second-retention-verification.json` and `apply-second-proof.json`. The approved revised manifest is preserved as `apply-approved-second-manifest.json`; applied wrapper/source bytes were not regenerated. No local PostgreSQL client was opened or left running by this application task; Supabase calls completed through the connector.

Step 1 accepts the actual historical title-only set/clear writer. Keep new title-mode readers off until compatible writers and step 2 are ready together. PS-10's platform projection correction and PS-12 now have local runtime approval; member-writer activation and PS-11 writer cutover remain held. Later [running-container inspection](DEPLOYMENT-READINESS.md) established that the project named staging also serves production. The additive applications above retained their recorded preservation and legacy-writer checks; the name did not establish isolation. Further hosted DDL, activation and provider acceptance are held pending the actual target and rollout decision. The combined build and PS-15 provider/browser evidence remain open.
