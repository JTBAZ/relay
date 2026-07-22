# Operations (preview chassis)

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
Required production security material is empty for this preview slice; future adapters fail closed via `requireEnv` when called.

## Database

SQL under `db/schema/` and `db/migrations/`. Optional Compose Postgres (loopback bind only, `127.0.0.1:5433`, dev password — do not expose the profile DB):

```bash
docker compose --profile db up -d
```

Do not treat this as EH-030 identity/RLS.

## Deploy manifests

| Target | File | Notes |
|--------|------|-------|
| Vercel | `vercel.json` | Next App Router defaults. Golden-path verification is EH-070. |
| Docker | `Dockerfile`, `.dockerignore` | Multi-stage standalone build. Golden-path verification is EH-071. |

Adapter inventory: `escape-hatch.manifest.json` and `lib/adapters/`. Runtime adapter `health()` reports degraded/stub until EH-030/033/050/070 — manifests alone are not readiness.

**Not production-safe:** `productionSafe` is false. Docker images that `COPY public/` ship `public/media` when present — prototype leakage until EH-033 private delivery. Do not claim a production-safe deploy from these manifests.

## Security honesty

- Soft gate / demo personas are not entitlements.
- Premium media may still be world-readable under `public/media` until EH-033 (including inside Docker images that copy `public/`).
- Library-truth operator gating is header + loopback only (EH-013) — not authentication; no remote env override.

