# Relay artist metadata (survives Patreon re-ingest)

Patreon **live scrape / sync** writes **new post versions** into **`canonical.json`** (`applySyncBatchToSnapshot` in [`src/ingest/apply-batch.ts`](../src/ingest/apply-batch.ts)). Each version’s `tag_ids` are **whatever Patreon sent that run**—there is **no merge** with the previous canonical version’s tags.

**Relay-only edits** must live in **separate stores** and are **merged at read time** with canonical data. Do **not** write artist-controlled tags or visibility into canonical via gallery APIs.

---

## Relay-controlled stores (not overwritten by ingest)

| Concern | Store (default path) | Written by |
|--------|----------------------|------------|
| Tag **add** / **remove** deltas (post-level or per-media) | `gallery_post_overrides.json` | `POST /api/v1/gallery/media/bulk-tags` → [`FileGalleryOverridesStore`](../src/gallery/overrides-store.ts) |
| Gallery **visibility** (visible / hidden / review) | same file | `POST /api/v1/gallery/visibility` → overrides store |
| **Collections** (post membership, theme tags, access ceiling) | `collections.json` | Collections CRUD + add/remove posts APIs |
| **Saved filters** | `gallery_saved_filters.json` | Saved-filters API |
| **Designer layout** (sections, hero copy, etc.) | `page_layout.json` | Layout API |
| **Patreon campaign display** (`patreon_name` from campaign `vanity`, lowercased; profile image, banner URL, `patron_count` from OAuth) | `creator_campaign_display.json` (override: `RELAY_CREATOR_CAMPAIGN_DISPLAY_PATH`) | [`PatreonSyncService.scrapeOrSync`](../src/patreon/patreon-sync-service.ts) after each successful campaigns fetch; surfaced on **`GET /api/v1/patreon/sync-state`** as `campaign_display`. **Patreon-sourced only** (overwritten each scrape), not artist overrides. Library shows **`patreon.com/{patreon_name}`** under the Relay display name when set. |

Ingest **never** mutates these files.

---

## How tags appear in the Library and post detail

[`effectiveTags()`](../src/gallery/query.ts) and [`applyMediaRowTagDelta()`](../src/gallery/query.ts):

- **Base** = `post.current.tag_ids` from canonical (Patreon + any tags Patreon lists on the post).
- **Apply** `add_tag_ids` / `remove_tag_ids` from [`PostOverride`](../src/gallery/types.ts) for that creator/post (and optional per-`media_id` overrides).

So a **Relay-only tag** added in the UI is stored only under **`add_tag_ids`** in overrides; the next Patreon sync can replace canonical `tag_ids`, and **Relay tags remain** because they are layered on read.

**Removing** a Patreon-delivered tag in Relay uses **`remove_tag_ids`** in overrides: Patreon may still send that tag on the next ingest, but it is **hidden** in the effective list until the override is cleared.

---

## Related docs

- Media export / retries / `export_failures`: [export-behavior.md](export-behavior.md)
- Ingest pipeline and duplicate media: [patreon-ingest-canonical.md](patreon-ingest-canonical.md)
- Product patterns: [pattern-library.md](pattern-library.md) (Tagging section)
- Agent entry: [AGENTS.md](../AGENTS.md)
