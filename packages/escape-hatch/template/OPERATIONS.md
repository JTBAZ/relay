# Operations (EH-030 identity path)

## Local preview

```bash
cp .env.example .env.local   # optional — build works without it
npm install
npm run build
npm run dev
```

No `RELAY_*` or monorepo root `.env` is required.

## Environment

Typed contract: `lib/env.ts`. Names-only example: `.env.example`.

### Supabase identity (optional)

| Names | Role |
|-------|------|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser + user-scoped server client |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Server aliases when public vars unset |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only** — bootstrap/recovery |
| `DATABASE_URL` | Optional direct Postgres |

When identity env is **unset** or **placeholder**: kit stays in local-preview mode — soft personas labeled; `/admin` shows **identity not configured**; mutations use loopback local-operator gating only.

When identity env is **real and non-placeholder**: Auth/DB adapters may report configured readiness (still labeled preview until EH-033); admin mutations require a staff membership session. Soft personas never authorize admin or premium server-side.

Bootstrap/recovery: `scripts/bootstrap-identity.md` and `db/README.md`.

## Database

SQL under `db/schema/` and `db/migrations/`:

1. `0001_preview_chassis.sql` — sites, tiers, posts, media registry
2. `0002_identity_rls.sql` — profiles, memberships, entitlement snapshots, RLS

Optional Compose Postgres (loopback bind only, `127.0.0.1:5433`, dev password — do not expose the profile DB):

```bash
docker compose --profile db up -d
```

Portable Postgres **without** Supabase Auth is **EH-031** (`0002` references `auth.users`).

## Deploy manifests

| Target | File | Notes |
|--------|------|-------|
| Vercel | `vercel.json` | Next App Router defaults. Golden-path verification is EH-070. |
| Docker | `Dockerfile`, `.dockerignore` | Multi-stage standalone build. Golden-path verification is EH-071. |

Adapter inventory: `escape-hatch.manifest.json` and `lib/adapters/`. Auth/DB readiness is env-honest; storage/billing/deploy remain degraded/stub until EH-033/050/070.

**Not production-safe:** `productionSafe` is false. Docker images that `COPY public/` ship `public/media` when present — prototype leakage until EH-033 private delivery.

## Security honesty

- Soft gate / demo personas are not entitlements and never authorize admin.
- Premium media may still be world-readable under `public/media` until EH-033 (including inside Docker images that copy `public/`).
- Service role keys must never appear in client bundles or committed files.
- RLS fails closed; patrons read only their own entitlement snapshots.
- Logout is **POST** `/auth/logout` only (HTTP verb hygiene).
