# Portable Docker path (EH-071)

Kit-local Path B recipe for Escape Hatch. **Not** a live Docker certification and **not** production-safe.

## Contents

| File | Role |
|------|------|
| `compose.path-b.yml` | App service overlay (`--profile app`) on top of root `docker-compose.yml` |
| `Caddyfile.sample` | Reverse-proxy + TLS terminate sample → app:3001 |
| Root `Dockerfile` | Multi-stage Next standalone image |
| Root `docker-compose.yml` | Loopback Postgres (`--profile db`) for portable identity |

## Operator steps (manual)

1. `docker build -t escape-hatch:local .`
2. Optional: `docker compose --profile db up -d` and apply portable migrations.
3. `docker compose -f docker-compose.yml -f deploy/docker/compose.path-b.yml --profile app up`
4. Point Caddy (or nginx) at the app using `Caddyfile.sample`; set `NEXT_PUBLIC_SITE_URL` to the public origin.
5. Register OAuth/billing/webhook callbacks from `/admin/deploy` checklist.
6. Fixture rehearsal (no daemon): `/admin/deploy` → Docker Path B section.

## MojoHost (policy candidate only)

[MojoHost](https://mojohost.com/) is the first **policy-reviewed portable host candidate** (legal adult-friendly VM/infrastructure guidance). It is **not** a supported wizard option until Docker/TLS/domain, backups/restore, monitoring, SLA/security, and human gates in `docs/studio/escape-hatch-build-plans/13-PROVIDER-POLICY-EVIDENCE.md` pass.

## Explicit non-claims

- Live `docker build` / compose in CI is optional and not required for EH-071 acceptance.
- Live ACME/DNS/TLS probes are deferred.
- Transactional email is EH-072; backup/restore EH-073; deploy wizard EH-074.
- `productionSafe` remains false.
