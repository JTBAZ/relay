# Deploy assets

Kit root contains the actionable manifests:

- `vercel.json` — Vercel / Next App Router
- `Dockerfile` + `.dockerignore` — portable container build (`output: "standalone"`)
- `docker-compose.yml` — optional local Postgres (`--profile db`)
- `escape-hatch.manifest.json` — versioned adapter + env **names** inventory
- `deploy/docker/` — Path B compose overlay, Caddy sample, operator README (EH-071)

## EH-070 — Vercel golden path (fixture rehearsal)

Use `/admin/deploy` Path A for kit-local preview → promote → rollback. State: `data/deploy-state.json`. Callbacks from `NEXT_PUBLIC_SITE_URL`. Not a live Vercel API.

## EH-071 — Portable Docker path (fixture + recipe)

- Recipe: `deploy/docker/compose.path-b.yml`, `Caddyfile.sample`, README (MojoHost = policy candidate only).
- Fixture: `/admin/deploy` Path B section (no Docker daemon required for kit tests).
- Live `docker build` / compose / ACME remain operator steps; `productionSafe` remains false.
