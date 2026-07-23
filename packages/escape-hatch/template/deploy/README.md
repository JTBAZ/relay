# Deploy assets

Kit root contains the actionable manifests:

- `vercel.json` — Vercel / Next App Router
- `Dockerfile` + `.dockerignore` — portable container build (`output: "standalone"`)
- `docker-compose.yml` — optional local Postgres (`--profile db`)
- `escape-hatch.manifest.json` — versioned adapter + env **names** inventory

## EH-070 — Vercel golden path (fixture rehearsal)

Use `/admin/deploy` (or `POST /api/admin/deploy`) for a kit-local preview → promote → rollback rehearsal. State lives in `data/deploy-state.json`. Callback absolute URLs derive from `NEXT_PUBLIC_SITE_URL` (placeholders fail closed).

This does **not** call the live Vercel API. Live project linking, promote, and instant rollback remain operator dashboard steps. `productionSafe` remains false.

## EH-071 — Docker Path B

Portable Compose / reverse-proxy / TLS host recipe is **EH-071**. This folder’s Dockerfile is chassis-only until that slice.
