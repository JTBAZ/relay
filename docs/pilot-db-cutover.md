# Pilot Postgres cutover (PILOT-002)

**Work item:** `PILOT-002` — pilot host uses Postgres-backed stores, not `.relay-data` JSON for core paths.  
**Depends on:** `PILOT-001` (Patreon-only scope).  
**Canonical plan:** [`pilot-build-plan.md`](pilot-build-plan.md) (pilot environment checklist, feature-flag matrix).

## Intent

The pilot API reads **identity**, **canonical posts/tiers**, and related surfaces from **PostgreSQL + Prisma** when the matching `RELAY_DB_STORE_*` flags are on. File-backed `.relay-data` remains the default when flags are off; the pilot cohort host should run with the cutover block in root `.env`.

## Minimum pilot stack (pilot UX + patron feed + comments)

| `RELAY_DB_STORE_*` | Pilot | Surfaces |
| --- | --- | --- |
| `RELAY_DB_STORE_IDENTITY` | **On (`1`)** | Login, sessions, patron feed/follows, comments API, `npm run seed:pilot-ux` |
| `RELAY_DB_STORE_CANONICAL` | **On (`1`)** | Creator Library grid, patron feed posts/tiers, pilot-ux seed |

**Also recommended for full PUX gates** (hidden visibility, paywall parity tests):

| Flag | When |
| --- | --- |
| `RELAY_DB_STORE_OVERRIDES` | After migrate + `npm run backfill:overrides` (or `backfill:curation`) — PUX-006 hidden posts |
| `RELAY_DB_STORE_CREATOR_OAUTH` | Real Patreon creator OAuth (not required for `/login/pilot-ux` password personas) |

**Defer until product needs them:** `WATERMARK`, `SYNC_HEALTH`, `COLLECTIONS`, `SAVED_FILTERS`, `LAYOUT`, `DLQ`, `EVENTS`, `ANALYTICS`, `PATRON_ENGAGEMENT`. Part 2 flags (`CLONE`, `PAYMENTS`, `MIGRATION`, `DEPLOY`) stay **off** for pilot unless explicitly in scope.

Full matrix: [`migration-from-relay-data.md`](database/migration-from-relay-data.md) and `node scripts/pilot-env-check.mjs`.

## Operator checklist

1. **Secrets:** `DATABASE_URL`, `RELAY_TOKEN_ENCRYPTION_KEY`, Patreon OAuth vars (see [`pilot-build-plan.md`](pilot-build-plan.md) checklist).
2. **Migrations (per environment):** only when `DATABASE_URL` in your shell points at the target DB — **never** run migrate against production by accident.

```bash
# Confirm which database you are targeting (host/db name only — do not paste secrets into chat)
echo $env:DATABASE_URL   # PowerShell — or omit if unset

# Apply pending Prisma migrations (staging / local pilot DB)
npx prisma migrate deploy
```

3. **Backfills (only for stores you enable):** see [`docs/database/README.md`](database/README.md). Typical pilot path from existing `.relay-data`:

```bash
npm run backfill:identity    # before RELAY_DB_STORE_IDENTITY=1
npm run backfill:canonical   # before RELAY_DB_STORE_CANONICAL=1
npm run backfill:overrides   # optional, before RELAY_DB_STORE_OVERRIDES=1
```

4. **Enable flags** in repo-root `.env` (copy from `.env.example` **Pilot cutover** block), restart API.
5. **Pilot UX seed (local):**

```bash
npm run seed:pilot-ux
```

Requires `RELAY_DB_STORE_IDENTITY=1` and `RELAY_DB_STORE_CANONICAL=1` (enforced by seed script).

6. **Verification:**

```bash
npm run build
npx vitest run tests/pilot-db-cutover.test.ts
node scripts/pilot-env-check.mjs
npm run verify:m10   # full gate when web + DB are wired
```

Staging identity/canonical soak: [`staging-identity-verification.md`](database/staging-identity-verification.md), [`staging-canonical-verification.md`](database/staging-canonical-verification.md). M10 theme: [`M10_VERIFICATION.md`](database/M10_VERIFICATION.md).

## `.env` template (pilot cutover)

See root [`.env.example`](../.env.example) section **PILOT-002 — Pilot cutover**. Keep `RELAY_PILOT_PATREON_ONLY=1` from PILOT-001.

## Tier display labels (PILOT-003)

When `RELAY_DB_STORE_CANONICAL=1`, **tier names in UI** (library access chips, designer tier picker, patron feed badges, `GET /api/v1/gallery/facets`, `GET /api/v1/relay/compose-tiers`) come from the Postgres **`Tier.title`** column populated by Patreon ingest (`applySyncBatch` → `DbCanonicalStore`) or `npm run seed:pilot-ux`. Patreon **`campaign_display`** JSON is only for campaign avatar/banner/vanity — not tier catalog labels.

## Related docs

- Patreon-only scope: [`pilot-patreon-only-scope.md`](pilot-patreon-only-scope.md)
- Pilot UX dev login: [`pilot-ux-dev-login.md`](pilot-ux-dev-login.md)
- Store ↔ table map: [`migration-from-relay-data.md`](database/migration-from-relay-data.md)
