# Staging — identity store (Postgres)

Use this after **`RELAY_DB_STORE_IDENTITY=1`** is set in staging and migrations are applied.

## Preconditions

- `DATABASE_URL` points at the staging Postgres instance.
- `npm run build && npx prisma migrate deploy` (or equivalent) applied.
- Optional one-time: `npm run build && npm run backfill:identity` (or `node scripts/backfill-identity.mjs [path]`) if migrating from `identity.json`.

## Automated vs manual parity

- **Vitest:** `tests/identity-backfill-parity.test.ts` exercises backfill with a **mocked** Prisma transaction (counts + upsert calls) so CI does not require a live DB.
- **Manual gate (recommended before production):** After backfill against a real DB, compare patron `User` row count and active `Session` row count to `identity.json` users/sessions; spot-check `email_norm` / `tier_ids` for one account.

## Smoke checks (API)

Align with **`docs/qa/UX_ACCEPTANCE_GUARDRAILS.md`** expectations for patron/creator flows where applicable. Automated coverage for the same HTTP surface lives in **`tests/workstream-g.access-identity.test.ts`** (independent register/login/logout, Patreon fallback paths, gated clone posts).

| Check | Request |
|--------|---------|
| Register | `POST /api/v1/identity/register` with `creator_id`, `email`, `password`, `tier_ids` → `201` |
| Duplicate email | Same register again → `409` |
| Login | `POST /api/v1/identity/login` → `200`, `data.token` present |
| Gated content | `GET /api/v1/clone/posts/:id?creator_id=…` with `Authorization: Bearer <token>` → `200` for entitled tier |
| Logout | `POST /api/v1/identity/logout` with Bearer → `200`; same GET without valid session → `403` |
| Patreon fallback | `POST /api/v1/identity/register-patreon` / `login-patreon` as in workstream G test |

## Production (2.3.5)

Enable **`RELAY_DB_STORE_IDENTITY=1`** only after staging soak and owner approval. The **`FileIdentityStore`** path remains the default when the env is unset, until you intentionally remove that fallback per **`docs/database/integration-roadmap.md`** phase 2.3.5.
