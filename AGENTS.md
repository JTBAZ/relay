# Agent / builder onboarding

Read this before changing **Patreon ingest**, **cookie-based post fetch**, or **gallery list shaping for duplicate media**.

## Required reading

1. **[docs/patreon-ingest-canonical.md](docs/patreon-ingest-canonical.md)** — current contract: what canonical ingest stores, how duplicate covers are handled, and **legacy patterns to avoid** (re-ingesting the old way will break Library + post-batch UX).
2. **[docs/relay-artist-metadata.md](docs/relay-artist-metadata.md)** — **where Relay-only tags, visibility, collections, and layout live** so they are **not** wiped by Patreon sync (canonical vs overrides merge at read time).
3. **[docs/pattern-library.md](docs/pattern-library.md)** — Library vs stage semantics, viewer parity, post-batch affordances.

## Context handoff (recent batches)

- **[docs/agent-handoff-library-v2.md](docs/agent-handoff-library-v2.md)** — incremental notes, file list, and suggested `vitest` commands.
- **[docs/part1-sync-hardening-ledger.md](docs/part1-sync-hardening-ledger.md)** — **Slices 1–4** shipped map: export retries, tier/cookie hardening, watermark + Patreon menu, sync health (APIs, env, tests).

## Quick verification (after ingest / gallery changes)

```bash
npx vitest run patreon-media-url-normalize patreon-ingest-cover-collapse shadow-cover-gallery library-refinement effective-tags-relay-metadata export-media-retry
```

After **Patreon sync surface** (scrape, sync-state, health, watermark) changes:

```bash
npx vitest run export-media-retry patreon-tier-mapping patreon-cookie-oauth-body workstream-patreon-scrape patreon-sync-state-watermark patreon-sync-health
```

Product sequencing and milestones: [road map.md](road%20map.md) (Builder Navigation section links the same reference docs).
