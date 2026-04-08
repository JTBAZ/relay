# Agent context (Rescue)

- **Airtable + v0 attended workflow:** See **`Automation/README.md`** and **`Automation/docs/`**. MCP and scripts target base **`applW4dOjVNHoWBM9`** (Production Ledger **`tblDDAKjaaBBIBuPf`**).
- **Bridge script:** **`Automation/scripts/ledger-to-v0.mjs`** — requires **`Automation/.env`** (`V0_API_KEY`, Airtable PAT). Node ≥ 22.
- **Chat handoff / summary:** **`Automation/docs/CURSOR_HANDOFF.md`**
- **Cursor project rules:** **`.cursor/rules/`** (`.mdc` files with frontmatter).

## Cursor Cloud specific instructions

### Services overview

| Service | Directory | Start command | Port |
|---------|-----------|---------------|------|
| Relay API (Express backend) | `/workspace` | `npm run build && npm start` | 8787 |
| Web frontend (Next.js 14 dev) | `/workspace/web` | `npm run dev` | 3000 |

### Environment files (not committed)

- **`/workspace/.env`** — must contain `RELAY_TOKEN_ENCRYPTION_KEY` (32-byte base64 key; generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`). `PATREON_CLIENT_ID` and `PATREON_CLIENT_SECRET` can be set to placeholder values for local dev without real Patreon OAuth.
- **`/workspace/web/.env.local`** — must contain `NEXT_PUBLIC_RELAY_API_URL=http://127.0.0.1:8787`. See `web/.env.example` for optional keys.

### Running tests and lint

- **Tests:** `npm test` from repo root — runs Vitest (44 test files, ~168 tests). All tests mock external services; no Patreon or network access needed.
- **Lint:** `npm run lint` from `web/` — runs ESLint via Next.js. Note: the codebase has pre-existing lint warnings/errors (unused vars, missing deps in hooks) that are not regressions.
- **Build backend:** `npm run build` from repo root — TypeScript compilation to `dist/`.

### Gotchas

- The backend **requires** `RELAY_TOKEN_ENCRYPTION_KEY` in `.env` or it will refuse to start.
- All data is stored as JSON flat files in `.relay-data/` (no database required).
- The backend must be built (`npm run build`) before starting (`npm start`); there is no watch/dev mode for the backend.
- The frontend `npm run dev` binds to `127.0.0.1` by default (via `--hostname 127.0.0.1` in `web/package.json`).
