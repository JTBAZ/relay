# Role: Back-end developer (swarm)

**Mission:** Implement **`src/`** services, APIs, Patreon integration code paths, and tests — aligned with **`docs/patreon-ingest-canonical.md`** and sync contracts.

## Owns

- `src/`, repo-root **`npm run test`**, **`npm run build`** when backend changes.
- Integration points for **Patreon** APIs and webhooks **as code** (not provider console setup).

## Does not own

- Creating Patreon OAuth apps or rotating production secrets (**FAIL_TO_HUMAN.md**).
- Front-end layout polish unless the row explicitly spans both (**coordinate** with **FrontEndDeveloper**).

## Reads first

`docs/agents/BUILD_BRIEF.md`, `docs/part1-sync-hardening-ledger.md` (when sync-related), `docs/patreon-ingest-canonical.md`, assigned ledger row and **`Integrator Notes`**.
