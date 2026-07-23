# ESCAPE_HATCH_EH_063_EVIDENCE

**Slice:** EH-063 Optional Patreon sync  
**Date:** 2026-07-23  
**productionSafe:** false  
**Builder:** Cursor Grok 4.5 High

## Delivered

1. **Sync state** — `data/patreon-sync-state.json` (`lib/patreon/sync-state.ts`) with origin, `locally_edited`, upstream revision, conflict queue.
2. **Read-only merge** — `lib/patreon/sync.ts` + injectable `fetchPosts`; never writes to Patreon.
3. **Local-edit protection** — CMS `upsertPost` marks posts locally edited; revision changes enqueue conflicts without overwriting.
4. **Admin** — `PatreonSyncPanel` on `/admin/patreon`; `GET/POST /api/admin/patreon/sync` (fixture_posts for preview); posts list shows origin / locally-edited badges + conflict banner.
5. **Mapper** — `mapPatreonPostsPage` for JSON:API-shaped fixtures.

## Explicit non-claims / deferrals

- Live Patreon campaign posts network fetch (fail closed without fixtures).
- Accept-upstream / dismiss conflict actions, cron/webhooks, media binary pull.
- `relay_managed` CMS content sync.
- `productionSafe` remains false.

## Verification

- Kit unit tests: `escape-hatch-patreon-sync.test.ts` + full `packages/escape-hatch` suite.
- Status: `ESCAPE_HATCH_SLICE = EH-063`, next `EH-064`.
