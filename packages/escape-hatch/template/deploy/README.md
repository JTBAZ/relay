# Deploy assets

Kit root contains the actionable manifests:

- `vercel.json` — Vercel / Next App Router
- `Dockerfile` + `.dockerignore` — portable container build (`output: "standalone"`)
- `docker-compose.yml` — optional local Postgres (`--profile db`)
- `escape-hatch.manifest.json` — versioned adapter + env **names** inventory

Verified creator deploy rehearsals are **EH-070** (Vercel) and **EH-071** (Docker). This folder documents the EH-020 chassis only.
