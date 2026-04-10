"""One-off generator for run-NN.md; delete after use or keep for regeneration."""
from __future__ import annotations

import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.normpath(os.path.join(BASE_DIR, "..", "..", ".."))

PREAMBLE = """You are a coding agent working on the Rescue / Relay repo.

Repository: follow AGENTS.md for layout (backend src/, web/, docs/database/ for Postgres+Prisma plan).

Queue: Relay Database Tracker → DB Integration Pipeline only. Do not search or update Project tracker Production Ledger for roadmap step IDs (1.x, 2.x, 3.x, …) from integration-roadmap.md — those steps are tracked in DB Integration Pipeline, not Production Ledger.

Rules:
- Minimal, focused diffs; do not refactor unrelated code.
- No secrets in commits, Airtable, or logs. Use .env.example placeholders only.
- If OAuth, production Patreon, or missing credentials block verification, stop and report per .docs/anthropic/FAIL_TO_HUMAN.md — do not loop.

After implementation:
- Run the verification commands listed in the task.
- Summarize files changed and any manual follow-up for the human.

Airtable: update Relay Database Tracker → DB Integration Pipeline rows for this task's Step IDs: Pipeline status In progress while working, Complete when done; append a short completion summary to **Notes** (this table has no separate Integrator Notes field)."""

# Bodies copied from sub-agent-prompts.md (inside ```text after [Include Universal preamble.])
RUNS: list[tuple[int, str, str, str, str, str]] = [
    (
        1,
        "Local Postgres (M1 · Phase 1.1)",
        "`1.1.1` · `1.1.2` · `1.1.3` · `1.1.4`",
        "1–4",
        "None (first run).",
        """Goal: Milestone 1 Phase 1.1 — local + documented database connectivity.

Tasks:
1. Add repo-root docker-compose.yml: service postgres:16-alpine, port 5432, named volume for data, POSTGRES_USER/PASSWORD/DB aligned with next step.
2. Add DATABASE_URL to root .env.example (placeholder values matching compose defaults, e.g. postgresql://relay:relay@localhost:5432/relay_dev). Ensure .gitignore keeps real .env out of git.
3. web/.env.local.example: add DATABASE_URL only if the task owner confirms Next.js will use direct DB access; otherwise add a one-line comment that web talks to API only and skip the variable.
4. Add a small dev helper: scripts/db-up.ps1 or extend docs snippet — document "docker compose up -d" before npm start for local Postgres. Keep it consistent with existing scripts/ style.

Verify: docker compose config valid; docker compose up -d succeeds; pg_isready or psql select 1 against the container.

Out of scope: Prisma install, schema models, CI — next runs.

Airtable: Complete rows for Step IDs 1.1.1–1.1.4 when done.""",
    ),
    (
        2,
        "Prisma bootstrap (M1 · Phase 1.2)",
        "`1.2.1` · `1.2.2` · `1.2.3` · `1.2.4` · `1.2.5`",
        "5–9",
        "Run 01 complete (Postgres starts; DATABASE_URL documented).",
        """Goal: Install Prisma at repo root; empty schema with PostgreSQL datasource; npm scripts; generate on build.

Tasks:
1. npm install prisma (devDependency) and @prisma/client (dependency) at repo root.
2. npx prisma init — prisma/schema.prisma with datasource postgresql and generator; no models yet unless needed for first migrate.
3. Adjust .gitignore: commit prisma/schema.prisma and migrations; ignore env-specific noise per team convention.
4. package.json scripts: db:migrate (prisma migrate dev), db:push (prisma db push), db:generate (prisma generate); document briefly in package.json or docs/database if needed.
5. Ensure npm run build runs prisma generate (prebuild or explicit step) so CI/build always has a client.

Verify: npx prisma validate; npm run build succeeds.

Out of scope: src/lib/db.ts, CI workflow files — next runs.

Airtable: Complete 1.2.1–1.2.5.""",
    ),
    (
        3,
        "Prisma client singleton (M1 · Phase 1.3)",
        "`1.3.1` · `1.3.2` · `1.3.3`",
        "10–12",
        "Run 02 complete.",
        """Goal: Single PrismaClient for the Node API; safe hot-reload; disconnect on shutdown.

Tasks:
1. Create src/lib/db.ts — export prisma singleton using globalThis.__prisma pattern; optional dev logging.
2. Wire prisma.$disconnect() in src/main.ts (or central shutdown) on SIGINT/SIGTERM alongside existing teardown.
3. Confirm tsc/build includes src/lib/db.ts (no orphan module).

Verify: npm run build; npm run test if tests import db later.

Out of scope: Domain models, server.ts store injection.

Airtable: Complete 1.3.1–1.3.3.""",
    ),
    (
        4,
        "Migration CI + Windows helper (M1 · Phase 1.4)",
        "`1.4.1` · `1.4.2` · `1.4.3`",
        "13–15",
        "Run 02–03 complete (migrate + client exist).",
        """Goal: CI can run prisma migrate deploy; ops doc has rollback note; Windows dev script.

Tasks:
1. Locate CI workflow(s) in repo; add step with DATABASE_URL from secrets to run prisma migrate deploy (or document placeholder if no CI yet — prefer adding real step if GitHub Actions etc. exist).
2. Append rollback procedure to docs/database/operations-and-security.md (prisma migrate resolve --rolled-back <migration>).
3. Add scripts/db-migrate.ps1 calling npx prisma migrate dev for local dev.

Verify: CI config YAML valid; script runs from repo root on Windows.

Airtable: Complete 1.4.1–1.4.3.""",
    ),
    (
        5,
        "Identity schema (M2 · Phase 2.1)",
        "`2.1.1` · `2.1.2` · `2.1.3`",
        "16–18",
        "M1 runs complete.",
        """Goal: Prisma models for identity per docs/database/relational-model.md — Tenant, User, Session, ProviderAccount, OAuthCredential (creator_ingest), CreatorProfile, PatronProfile; legacy_file_id where needed; indexes per integration-roadmap.

Tasks:
1. Add models and relations; session stores token hash only in schema design (implementation in next run).
2. prisma migrate dev --name identity_sessions
3. Add indexes: User (tenantId, kind), Session (userId, expiresAt), ProviderAccount unique (provider, providerUserId).

Verify: prisma migrate deploy dry-run; prisma validate.

Out of scope: DbIdentityStore implementation, server wiring, backfill.

Airtable: Complete 2.1.1–2.1.3.""",
    ),
    (
        6,
        "Identity DB stores (M2 · Phase 2.2)",
        "`2.2.1` · `2.2.2` · `2.2.3`",
        "19–21",
        "Run 05 complete.",
        """Goal: Implement DbIdentityStore and DbPatreonTokenStore (creator) matching File*Store APIs; hash session tokens.

Tasks:
1. src/identity/identity-store-db.ts — same public methods as FileIdentityStore (read identity-store.ts + identity-store file).
2. Session persistence: store only hash of opaque token; align with docs/database/operations-and-security.md.
3. src/auth/token-store-db.ts — creator OAuth; encrypted blobs compatible with existing TokenEncryption / RELAY_TOKEN_ENCRYPTION_KEY.

Verify: unit tests if present; npm run test; npm run build.

Out of scope: server.ts feature flag wiring — next run.

Optional: One sub-agent per bullet if three agents available; coordinate on shared types.

Airtable: Complete 2.2.1–2.2.3.""",
    ),
    (
        7,
        "Identity wiring + backfill + staging (M2 · Phase 2.3)",
        "`2.3.1` · `2.3.2` · `2.3.3` · `2.3.4` · `2.3.5`",
        "22–26",
        "Run 06 complete.",
        """Goal: RELAY_DB_STORE_IDENTITY in server.ts; backfill identity.json; parity tests; staging checklist; production note.

Tasks:
1. Inject DbIdentityStore when RELAY_DB_STORE_IDENTITY=1 else FileIdentityStore in createApp/server.ts.
2. `scripts/backfill-identity.mjs` (loads built `src/identity/backfill-identity-from-file.ts`) — idempotent upsert from identity.json; use `npm run backfill:identity` or `node scripts/backfill-identity.mjs [path]`.
3. Test: after backfill, DB matches file for users/sessions (counts + sample).
4. Document staging verification against docs/qa/UX_ACCEPTANCE_GUARDRAILS.md relevant routes.
5. 2.3.5 may be human-gated: document production enable + soak; do not remove file store until owner approves.

Verify: npm run test; manual login smoke if env allows.

Airtable: Complete 2.3.1–2.3.5 (note 2.3.5 may stay In progress until production soak — use Notes field).""",
    ),
    (
        8,
        "Canonical schema (M3 · Phase 3.1)",
        "`3.1.1` · `3.1.2` · `3.1.3` · `3.1.4` · `3.1.5`",
        "27–31",
        "M1 complete; can parallel M2 if M2 not blocking — prefer M2 identity schema done if FKs require User (else use string creator_id only per current file stores).",
        """Goal: Prisma models for Campaign, Post, PostVersion, MediaAsset, Tier, PostTier; SyncCursor; CreatorSyncState; IngestIdempotencyKey; indexes per integration-roadmap.

Tasks:
1. Map src/ingest/canonical-store.ts types to tables; preserve stable IDs strategy from roadmap.
2. migrate dev --name canonical_content
3. Indexes for hot paths (campaign+createdAt, postId, tier uniqueness).

Verify: prisma validate; migration applies on empty DB.

Out of scope: DbCanonicalStore — next run.

Airtable: Complete 3.1.1–3.1.5.""",
    ),
    (
        9,
        "Canonical DB stores (M3 · Phase 3.2)",
        "`3.2.1` · `3.2.2` · `3.2.3`",
        "32–34",
        "Run 08 complete.",
        """Goal: DbCanonicalStore, DbSyncWatermarkStore, DbPatreonSyncHealthStore — match existing file APIs.

Tasks:
1. canonical-store-db.ts implementing load/save/mutate or slimmer explicit methods if mutating full snapshot is too heavy.
2. sync-watermark-store-db.ts
3. patreon-sync-health-store-db.ts

Verify: npm run test; npm run build; optional integration test with docker Postgres.

Airtable: Complete 3.2.1–3.2.3.""",
    ),
    (
        10,
        "Canonical backfill + wire + promote (M3 · Phase 3.3)",
        "`3.3.1` · `3.3.2` · `3.3.3` · `3.3.4` · `3.3.5`",
        "35–39",
        "Run 09 complete.",
        """Goal: backfill-canonical.ts; parity; RELAY_DB_STORE_CANONICAL; staging idempotency test; production note.

Tasks:
1. Chunked backfill from .relay-data/canonical.json (or configured path).
2. Parity tests counts + sample posts.
3. server.ts flag for DbCanonicalStore + watermarks + health stores.
4. Staging: run ingest twice same batch — identical counts.
5. 3.3.5 human-gated: archive canonical.json; do not delete.

Verify: npm run test; ingest smoke on staging.

Airtable: Complete 3.3.1–3.3.5.""",
    ),
    (
        11,
        "Curation schema (M4 · Phase 4.1)",
        "`4.1.1` · `4.1.2` · `4.1.3` · `4.1.4` · `4.1.5`",
        "40–44",
        "M3 canonical schema stable.",
        """Goal: PostOverride, LibraryCollection + join, SavedFilter, PageLayout; migrate creator_curation.

Follow docs/database/relational-model.md and integration-roadmap notes (text[] tags, layoutJson).

Verify: prisma migrate dev; validate.

Airtable: Complete 4.1.1–4.1.5.""",
    ),
    (
        12,
        "Curation DB stores (M4 · Phase 4.2)",
        "`4.2.1` · `4.2.2` · `4.2.3` · `4.2.4`",
        "45–48",
        "Run 11 complete.",
        """Goal: DbGalleryOverridesStore, DbCollectionsStore, DbSavedFiltersStore, DbPageLayoutStore — mirror src/gallery/*-store.ts APIs.

Verify: npm run test; npm run build.

Airtable: Complete 4.2.1–4.2.4.""",
    ),
    (
        13,
        "Curation wire + backfill (M4 · Phase 4.3)",
        "`4.3.1` · `4.3.2` · `4.3.3` · `4.3.4`",
        "49–52",
        "Run 12 complete.",
        """Goal: Per-store RELAY_DB_STORE_* flags; backfill from JSON; validate post_ids for collections.

Verify: gallery API smoke tests; npm run test.

Airtable: Complete 4.3.1–4.3.4.""",
    ),
    (
        14,
        "Operations + DLQ + durable events (M5)",
        "`5.1.1` · `5.1.2` · `5.1.3` · `5.1.4` · `5.2.1` · `5.2.2` · `5.2.3` · `5.2.4`",
        "53–60",
        "M3 complete (canonical); can parallel M4 if teams split — avoid conflicting server.ts edits without coordination.",
        """Goal: JobRun + OutboxEvent schema; DbDeadLetterQueue; DbEventBus; RELAY_DB_STORE_DLQ and RELAY_DB_STORE_EVENTS.

Tasks:
1. Schema + migrate operations_dlq.
2. Implement DLQ and EventBus DB backends per src/ingest/dlq.ts and src/events/event-bus.ts contracts.
3. Wire flags in server.ts; keep InMemoryEventBus fallback until verified.

Verify: npm run test; publish test event survives restart if testing infra allows.

Airtable: Complete 5.1.1–5.2.4.""",
    ),
    (
        15,
        "Analytics (M6)",
        "`6.1.1`–`6.1.6` · `6.2.1`–`6.2.4`",
        "61–70",
        "M2 + M3 complete.",
        """Goal: AnalyticsSnapshot, RecommendationRecord, ActionExecution, RecommendationOutcome; partition doc note; DbAnalyticsStore; backfill analytics.json; RELAY_DB_STORE_ANALYTICS; verify ActionCenterService + SnapshotGenerator.

Follow src/analytics/types.ts and analytics-action-center-spec alignment.

Verify: npm run test; npm run build; analytics API smoke.

Human ops (turning on DB analytics): on each environment, `npx prisma migrate deploy` → `npm run backfill:analytics` → set `RELAY_DB_STORE_ANALYTICS=1` and restart. See `docs/database/README.md` (Enabling Postgres-backed analytics).

Airtable: Complete 6.1.1–6.2.4 (note 6.1.6 is documentation-only if no partition DDL yet).""",
    ),
    (
        16,
        "Patron engagement (M7)",
        "`7.1.1`–`7.1.3` · `7.2.1`–`7.2.3`",
        "71–76",
        "M2 + M3 complete.",
        """Goal: Favorite + PatronSavedCollection + entries schema; DbPatronFavoritesStore; DbPatronCollectionsStore; flag + backfill patron_favorites.json and patron_collections.json.

Verify: npm run test; visitor/favorites routes per UX guardrails if applicable.

Airtable: Complete 7.1.1–7.2.3.""",
    ),
    (
        17,
        "Part 2 backend stores (M8)",
        "`8.1.1`–`8.1.5` · `8.2.1`–`8.2.5`",
        "77–86",
        "M2 + M3 complete.",
        """Goal: CloneSite, PaymentConfig, CheckoutRecord, migration tables, Deployment; four Db* stores + backfill clone/payments/migrations/deploy JSON.

Verify: npm run test; npm run build; payment paths dry-run only — no live charges without human.

Human ops (turning on DB Part 2 stores): on each environment, `npx prisma migrate deploy` → `npm run backfill:part2` → enable only the `RELAY_DB_STORE_*` flags you need (`CLONE`, `PAYMENTS`, `MIGRATION`, `DEPLOY` are independent) and restart. See `docs/database/README.md` (Enabling Postgres-backed Part 2 stores).

Airtable: Complete 8.1.1–8.2.5.""",
    ),
    (
        18,
        "Future stubs (M9) — schema-only, open pipes",
        "`9.1.1`–`9.4.3` (ranges in integration-roadmap)",
        "87–102",
        "M2 + M3 complete; rest of app can be in flight.",
        """Goal: Add Prisma models + migrations for Part 3 patron network, engagement, Smart Tag stubs, WebhookEndpoint, operational indexes — NO production feature logic required; migrations must apply cleanly.

Tasks:
1. Follow integration-roadmap M9 sections exactly; use @@ignore or Unsupported for vector if needed.
2. Document pgvector raw migration note in relational-model.md if touching 9.3.x.
3. No backfill for stubs unless a JSON file maps 1:1 (e.g. webhook metadata) — owner decides per row Notes in Airtable.

Verify: prisma migrate dev; npm run build.

Airtable: Complete 9.1.1–9.4.3.""",
    ),
    (
        19,
        "Verification + cleanup + docs (M10)",
        "`10.1.1`–`10.1.5` · `10.2.1`–`10.2.4` · `10.3.1`–`10.3.3`",
        "103–114",
        "All prior milestones Complete per dependency graph.",
        """Goal: Full test/build with all RELAY_DB_STORE_* on; web lint/build; UX guardrails; cross-tenant isolation test; security audit no tokens in logs; remove file fallbacks and flags; archive .relay-data; update migration-from-relay-data.md; pooling + deploy docs; AGENTS.md / road map.md DB-complete note.

Human gates: production flag removal and .relay-data archive dates — coordinate with owner.

Verify: AGENTS.md verification commands; docs/qa/UX_ACCEPTANCE_GUARDRAILS.md.

Airtable: Complete 10.1.1–10.3.3.""",
    ),
]

HANDOFF = [
    "Postgres is up and DATABASE_URL is documented; Prisma can be installed next.",
    "Prisma CLI and empty schema exist; add the singleton client next.",
    "Prisma client is wired; add CI migrate deploy and db-migrate.ps1 next.",
    "CI and local migrate flow exist; add identity Prisma models next.",
    "Identity schema exists; implement DbIdentityStore and token stores next.",
    "DB identity stores exist; wire RELAY_DB_STORE_IDENTITY and backfill next.",
    "Identity is wired from DB; add canonical content schema next.",
    "Canonical schema exists; implement canonical + watermark + health DB stores next.",
    "Canonical DB stores exist; backfill, wire RELAY_DB_STORE_CANONICAL, and promote next.",
    "Canonical path is complete; add curation schema next.",
    "Curation schema exists; implement gallery/curation DB stores next.",
    "Curation stores exist; wire flags and backfill curation JSON next.",
    "Curation path is wired; add operations/DLQ/events schema and DB backends next.",
    "Operations path is in place; add analytics schema and DbAnalyticsStore next.",
    "Analytics path is in place; add patron engagement schema and stores next.",
    "Patron engagement path is in place; add Part 2 backend tables and stores next.",
    "Part 2 stores exist; add M9 stub migrations next.",
    "Stub migrations apply; run full verification, cleanup, and docs (M10) next.",
    None,
]

GH = "https://github.com/JTBAZ/relay/blob/main/docs/database/runs"


def main() -> None:
    for idx, (num, title, steps, sorto, pre, body) in enumerate(RUNS, start=1):
        nn = f"{num:02d}"
        next_nn = f"{num + 1:02d}" if num < 19 else None
        path = os.path.join(BASE_DIR, f"run-{nn}.md")
        lines: list[str] = []
        lines.append(f"# Run {nn} — {title}")
        lines.append("")
        lines.append("## Orientation")
        lines.append("")
        lines.append(
            "Use with **Relay Database Tracker** → **DB Integration Pipeline** (not Project tracker Production Ledger). "
            "Canonical roadmap: [`integration-roadmap.md`](../integration-roadmap.md)."
        )
        lines.append("")
        lines.append("| | |")
        lines.append("|---|---|")
        lines.append(f"| **Step IDs** | {steps} |")
        lines.append(f"| **Sort order** | {sorto} |")
        lines.append(f"| **Precondition** | {pre} |")
        lines.append("")
        lines.append("## Full prompt (paste into agent)")
        lines.append("")
        lines.append("```text")
        lines.append(PREAMBLE)
        lines.append("")
        lines.append(body.strip())
        lines.append("```")
        lines.append("")
        lines.append("## Links")
        lines.append("")
        lines.append(f"- **This run (GitHub):** [{GH}/run-{nn}.md]({GH}/run-{nn}.md)")
        if next_nn:
            lines.append(f"- **Next run (GitHub):** [{GH}/run-{next_nn}.md]({GH}/run-{next_nn}.md)")
        lines.append("")
        lines.append("---")
        lines.append("")
        lines.append("## Handoff (queue the next agent)")
        lines.append("")
        if num < 19:
            assert HANDOFF[num - 1] is not None
            lines.append(
                f"When this run’s steps are verified and **Pipeline status** is **Complete** for the relevant Step IDs, "
                f"start the next agent with the **full** prompt from **[Run {next_nn}](run-{next_nn}.md)** "
                f"(folder: `docs/database/runs/`)."
            )
            lines.append("")
            lines.append(f"**Carry forward:** {HANDOFF[num - 1]}")
        else:
            lines.append(
                "This is the final integration run (M10). Coordinate human gates (production flags, `.relay-data` archive) "
                "with the owner; close out the DB Integration Pipeline when verification is done."
            )
        lines.append("")
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            f.write("\n".join(lines))
        print("Wrote", path)

    print("Done:", len(RUNS), "files")


if __name__ == "__main__":
    main()
