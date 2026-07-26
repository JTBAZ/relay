# WYSIWYG public profile (Designer ↔ `/patron/c/{slug}`)

This doc is the integration contract for the shared **public gallery shell**: creators edit a layout in Site Designer; visitors see the same curated hero + section rendering, with **tier and visitor rules** applied per request.

## Source of truth

| Concern | Where |
|--------|--------|
| Persisted layout (API shape) | `PageLayout` in `@/lib/relay-api` — `GET/PUT /api/v1/gallery/layout`, public `GET …/gallery-layout` |
| Hero view model (plain data) | `buildPublicProfileHeroModel` + `PublicProfileHeroModel` in `@/lib/public-profile-hero` |
| Hero UI | `CreatorPublicHero` — `@/app/components/public-profile/CreatorPublicHero` |
| Curated sections UI | `PatronLayoutSections` — `@/app/components/patron/PatronLayoutSections` |
| Section item loading | `useLayoutSectionItems` — must use **visitor** + tier simulation on the designer canvas when mirroring public redaction |

Cover URL helper shared with layout bridge: `publicProfileHeroCoverExportUrl` in `@/lib/public-profile-hero` (same path as `exportHeroCoverUrl` in `@/lib/designer-layout-bridge`).

## Shared shell vs visitor-only chrome

**In the WYSIWYG shell (match Designer preview and public page):**

- `CreatorPublicHero` — cover, avatar (placeholder if no URL), headline, bio/subtitle stack, Patreon link position.
- `PatronLayoutSections` — grid / masonry / list / featured per `PageLayout.sections`, tier overlays, same sorting as `layout.theme.gallery_arrangement`.

**Stays on the patron route only (below / outside that shell):**

- Stats strip (`Posts` / `Assets` / `Tags`), browse mode (chrono / collections / shuffle), Saved, unpublished banner, dev tier simulator, curated search/filter strip when using layout sections, full-library filter strip when `sections` is empty.

Hero subtree should sit in a wrapper that defines **`--relay-*`** tokens (see `.public-profile-wysiwyg-shell` + `.designer-site-shell` in `web/app/globals.css`). Patron tiles use **`--lib-*`**; on the designer canvas those are aliased to relay in `CanvasPreview` via `patronLibShellStyle`.

## Site Designer canvas (`CanvasPreview`)

- **Hero:** `buildPublicProfileHeroModel({ pageLayout: previewLayout, visitorHero: facets?.visitor_hero, creatorId, patreonVanitySlug })` + `CreatorPublicHero`.
- **Sections:** `PatronLayoutSections` with `layout={patronCanvasLayout}` (visible library blocks only), `sectionItems` from `useLayoutSectionItems` with **`visitor: true`** and **`dev_sim_patron` / `simulate_tier_ids`** aligned to the “Viewing as” control (facet tier rank).
- **Designer chrome:** `renderDesignerSectionChrome` wraps each API section body in `SectionCanvasFrame` (outline, presentation chips, reorder, hide).
- **Ordering:** All visible curated sections render as **one** `PatronLayoutSections` block at the **first visible library** slot; shop / engagement blocks keep their own frames. Interleaving shop between two library blocks is not supported in preview.

## Tests

- `web/lib/public-profile-hero.test.ts` — hero model (cover precedence, bio stack, fallbacks, `patreonVanitySlug`).

## Manual check

Same creator: compare `/designer` (desktop, public sim tier = logged out) with `/patron/c/{slug}` — hero geometry, typography, grid columns, tier-locked blur on tiles.
