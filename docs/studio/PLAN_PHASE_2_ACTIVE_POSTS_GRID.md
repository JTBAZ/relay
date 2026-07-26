# Phase 2 brief — Active Posts grid replace (presence-first)

**Status:** Implemented — verify on a seeded creator library with mixed distribution  
**Master roadmap:** `[PLAN_STUDIO_RENOVATION_MASTER.md](./PLAN_STUDIO_RENOVATION_MASTER.md)`  
**Prior phases:** Phase 0–1 done — chip kit at `[web/app/components/distribution/platform-presence-chips.tsx](../../web/app/components/distribution/platform-presence-chips.tsx)`

---

## Goal

Surgical replace **Active Posts grid cards** on `/studio` with presence-first portrait cards that answer **where is this posted / what’s missing?** using the shared Present/Ghost ring kit and **live** distribution data already on gallery list items.

## Exit criteria

1. Active Posts tiles show Present (solid) / Ghost (dashed) rings derived from real `distribution_summary` (not mock `HERO_DATA`).
2. Solid ring with `external_url` opens that URL; Ghost ring navigates into Autopost for that post/destination gap.
3. Selection, bulk actions, inspect, and Import Bay / Schedule rail continue to work.
4. No LinkedSet drilldown, hero unfold, or SVG thread shipped in this phase.

## In scope

- Presence-first card UI for creator Library Active Posts (post groups in the grid)
- Map `GalleryItem.distribution_summary` → present / missing destination lists
- Wire Present / Ghost click grammar (same as master plan rule 3)
- Keep existing selection / partial-selection / isolate-asset / bulk bar behavior
- Preserve tier/access/visibility affordances that still matter on the card (or demote to secondary chrome without removing capability)

## Out of scope (do not build)

- Linked sets, link-confirm sheet, set aggregates, SVG branch drilldown (**Phase 3**)
- Hero unfold / packaging inspect / Relay View (**Phase 6**)
- Schedule rail production PostBot data / `armed` from API (**Phase 4**)
- Extension sticky toasts (**Phase 5**)
- Porting the entire `.tmp/social-media-post-creator-8/app/studio/page.tsx` monolith
- Inventing a second platform icon set (must import from `platform-presence-chips.tsx`)
- Visitor/patron gallery redesign

---

## Dependencies


| Dependency                                              | Role                                                                                                       |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Phase 0 chip kit                                        | `PresentChip`, `GhostChip`, `CrosspostChipRow`, `PRESENCE_DESTINATIONS`                                    |
| Gallery list owner path                                 | Already attaches `distribution_summary` per post (`src/server.ts` gallery list)                            |
| `[galleryItemImageGridSrc](../../web/lib/relay-api.ts)` | Thumb URLs                                                                                                 |
| Autopost route                                          | `/studio/autopost` — prefer `?media_ids=` and/or post context; destination query only if already supported |


---

## Data contract

### Source of truth (live)

`GalleryItem.distribution_summary` on creator library list items (`[web/lib/relay-api.ts](../../web/lib/relay-api.ts)`):

```ts
distribution_summary?: {
  post_id: string;
  destinations: Array<{
    destination: "patreon" | "x" | "deviantart" | "bluesky";
    variant_status: string | null;
    attempt_status: string | null;
    attempt_id: string | null;
    external_url: string | null;
    external_id: string | null;
  }>;
};
```

### Derive present / missing

Use product destination set from chip kit: `patreon | x | deviantart | bluesky`.

- **Present:** destination row where `attempt_status === "posted"` **or** non-empty `external_url` (align with existing `[GalleryGridTile](../../web/app/components/GalleryGridTile.tsx)` `distributionChipLabel` / badge filter logic).
- **Missing (ghost):** destinations in the product set **not** in Present.
- Destinations that only have draft/sent variants without posted/url: treat as **not present** (ghost) unless product later defines a third “in flight” state — **do not invent a third chip style in Phase 2**.

### Card props (suggested)

```ts
type ActivePostPresenceCardProps = {
  postId: string;
  title: string;
  audienceLabel: string; // tier/access chip text
  thumbSrc: string | null;
  present: Array<{ destination: string; external_url: string | null }>;
  missing: string[];
  selected: boolean;
  partiallySelected: boolean;
  onToggleSelect: () => void;
  onOpenPost: () => void; // existing inspect / focus path
  onPresentClick: (destination: string, externalUrl: string) => void;
  onGhostClick: (destination: string) => void;
};
```

Aggregate at **post group** level (`PostGalleryGroup`), not per media asset — one card per `post_id` (same as today’s grid grouping).

### Autopost entry (ghost)

Minimum: `router.push(/studio/autopost?media_ids=…)` using the group’s media ids when available, else `/studio/autopost` with a documented query if one already exists for `post_id`.  
Do **not** block Phase 2 on new Autopost destination deep-link params; if unsupported, still open Autopost and leave destination preselect for a later slice.

---

## File touch list


| Path                                                                                                                               | Action                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[web/app/components/distribution/platform-presence-chips.tsx](../../web/app/components/distribution/platform-presence-chips.tsx)` | **Reuse only** (extend only if a shared helper for present/missing derivation belongs here)                                                       |
| `web/app/components/ActivePostPresenceCard.tsx` (new) **or** under `web/app/components/studio/`                                    | **Create** — portrait card + chip row                                                                                                             |
| `web/lib/active-post-presence.ts` (new, optional)                                                                                  | **Create** — pure helpers: summary → present/missing                                                                                              |
| `[web/app/components/GalleryGrid.tsx](../../web/app/components/GalleryGrid.tsx)`                                                   | **Edit** — render new card instead of / wrapping tile for Active Posts density                                                                    |
| `[web/app/components/GalleryGridTile.tsx](../../web/app/components/GalleryGridTile.tsx)`                                           | **Edit or thin** — keep exports used elsewhere (`accessChipLabel`, `visDot`, `mediaTypeLabel`); migrate distribution text badges → presence rings |
| `[web/app/studio/GalleryView.tsx](../../web/app/studio/GalleryView.tsx)`                                                           | **Edit** — pass Autopost navigation / open handlers into grid if needed                                                                           |
| `[web/lib/relay-api.ts](../../web/lib/relay-api.ts)`                                                                               | **Read**; edit only if list must opt into a field already available but not requested                                                             |


**Do not edit:** schedule-rail Drop Assets (Phase 1), Autopost composer internals (beyond deep-link), extension, analytics Action Hub.

---

## Ordered todos (builder)

Each todo is independently verifiable.

1. **Map current path** — Document how `GalleryView` → `GalleryGrid` → `GalleryGridTile` handles select, isolate asset, inspect, and existing `distribution_summary` text badges. Note which tile exports other modules import.
2. **Presence helpers** — Implement pure `summaryToPresence(summary, allDestinations)` → `{ present, missing }` with unit-style checks or a small fixture test if the repo pattern allows; otherwise a focused storybook-free assert in a tiny util test.
3. `**ActivePostPresenceCard` UI** — Portrait card (dark studio tokens), thumb, title, audience line, `CrosspostChipRow`, selection ring matching Library selection mint. No set mosaic / Linked badge.
4. **Click grammar** — Present + url → `window.open` / `<a target=_blank>`; Ghost → Autopost entry; card body → existing open/inspect/focus behavior; chip clicks `stopPropagation` so they don’t toggle selection accidentally (match Drop Assets / v0 chip behavior).
5. **Swap grid renderer** — `GalleryGrid` uses the new card per `PostGalleryGroup`; preserve `selected` / `partiallySelected` / `onToggleSelectGroup` / `onIsolateAssetSelection` contracts. Multi-asset posts: keep carousel affordance **only if** already on the tile and low-cost; otherwise show primary thumb + optional “N assets” hint — **no Phase 3 set UI**.
6. **Wire GalleryView** — Handlers for ghost → Autopost; ensure owner list still receives `distribution_summary` (confirm server list path; fix query flag only if missing).
7. **Polish** — Empty summary (all ghosts or no rings + quiet “Not cross-posted yet”); loading unchanged; no layout break with Schedule rail on the right.
8. **Verify** — Run checklist below on a real seeded creator with at least one cross-posted and one single-destination post.

---

## Verify checklist

- Active Posts cards show solid rings for destinations with posted/`external_url`
- Missing product destinations show dashed Ghost rings
- Click solid ring opens external URL when present
- Click Ghost opens Autopost (media_ids or documented fallback)
- Click chip does not unintended-deselect / open inspect unless intended
- Multi-select + BulkActionBar still work
- Schedule rail + Drop Assets still visible and functional on `/studio`
- No import of v0 `studio/page.tsx` monolith components
- No new SVG platform icons outside `platform-presence-chips.tsx`

---

## Do-not-do list

- Do not port `HeroUnfold`, `SetDrilldown`, `LinkedSetCard`, `RadialPlatformCard`, or toast-only cross-post stubs from the v0 zip
- Do not change Drop Assets destination semantics to selector pips (forecast markers stay B)
- Do not add LinkedSet persistence or link-confirm UX
- Do not require packaging `creative_work_id` hero APIs to ship Phase 2 (optional enhancement only if already on the list item)
- Do not restart a full Active Posts visual system with a second chip language

---

## Reference assets (visual only)

- v0 Active Posts cards / Present+Ghost rings: `.tmp/social-media-post-creator-8/app/studio/page.tsx` (`PresentChip` / `GhostChip` — already ported)
- Screenshots attached in prior chat (platform ring row on media cards)
- Live distribution badge precursor: `[GalleryGridTile.tsx](../../web/app/components/GalleryGridTile.tsx)` `distributionBadgeChips`

