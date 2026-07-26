# Phase 7 brief — Hardening and Studio shell

**Status:** In progress — list mode removed; LibraryEmptyState + grid virtualization landing  
**Master roadmap:** `[PLAN_STUDIO_RENOVATION_MASTER.md](./PLAN_STUDIO_RENOVATION_MASTER.md)`  
**Prior phases:** Phases 0–6 feature packs briefed (and largely implemented for 0–3). Phase 7 is **chrome + performance + empty alignment** around the cue→fill→deliver→monitor spine — not a rewrite of distribution, linked sets, rail data, sticky toasts, or hero inspect.

---

## Goal

Make Studio Library read as **one product**: Schedule rail + presence-first Active Posts + Import Bay / filters coexist at a coherent density, Active Posts **grid** scrolls performantly under load, and empty states for **no posts / no cues / no gaps** share one voice — so a future visual renovation has a single shell to restyle, not three parallel UIs.

## Exit criteria

1. Library chrome (top bar, sidebar, Import Bay, Active Posts, Schedule rail, Power) coexists without fighting scroll or density; rail scroll stays independent of the main Active Posts scroller.
2. List vs grid decision is resolved: **list toggle removed** (dense + normal remain); dead list stub / orphan `GalleryListRow` cleaned up.
3. Active Posts **grid** uses `@tanstack/react-virtual` windowing for collapsed cards; large libraries remain usable.
4. Canonical empty states cover no posts, no cues (rail / Drop Assets), and no gaps (filters / no distribution) with shared primitive + aligned copy.

---

## In scope

- Density / shell harmonization toward `--lib-*` tokens while keeping rail mint identity readable (do not fork a second chip language)
- Remove half-broken **list** view mode; keep `dense` | `normal` grid densities; update `localStorage` key migration (map legacy `list` → `normal`)
- Delete or stop shipping unused `[GalleryListRow.tsx](../../web/app/components/GalleryListRow.tsx)` if list is removed
- Virtualize Active Posts **grid** with existing `@tanstack/react-virtual` (row-based over collapsed `ActivePostsGridCard[]`, responsive column count from density breakpoints)
- Preserve independent scroll: main column `overflow-auto`; rail day axis own `overflow-y-auto`; parent `overflow-hidden`
- Shared empty primitive (e.g. `LibraryEmptyState`) + map scattered empties: library empty, filtered empty, Drop Assets disarmed/armed-empty, silent empty month on rail, Power “nothing selected”, optional distribution “no gaps/data”
- Toolbar / section eyebrow polish so Import Bay + Active Posts + rail read as one Library
- Light Power / BulkActionBar chrome only (no feature rewrite)
- Mobile / `lg` breakpoints: rail may remain desktop-first; document behavior; avoid breaking grid on small screens
- Verify UX guardrail: Relay visibility ≠ Patreon access copy on Library surfaces (`[UX_ACCEPTANCE_GUARDRAILS.md](../qa/UX_ACCEPTANCE_GUARDRAILS.md)`)

## Out of scope (do not build)

- Re-implementing Phase 2 presence cards, Phase 3 link flow, Phase 4 schedule-rail API, Phase 5 extension sticky, Phase 6 packaging hero
- Adding `react-window` or a second virtualization library
- Implementing a full production **list** view with presence + linked sets (unless product reverses the locked decision — default is **remove**)
- New visual brand system / full Studio “future renovation” art direction (Phase 7 prepares the shell; it is not the renovation itself)
- Google Calendar, Coach-in-rail, Autopost composer rewrite, radial hero, v0 monolith import
- Changing chip grammar or inventing a third icon set
- Merging carousel posts with Linked Sets

---

## Dependencies

| Dependency | Role |
| ---------- | ---- |
| Phase 2–3 grid model | `GalleryGrid` + `collapsePostGroupsToGridCards` + presence / Linked Set cards — virtualizer must consume **collapsed** cards |
| Phase 4 rail (when live) | Empty “no cues” / empty month polish around live data — do not replace schedule-rail service |
| Phase 5–6 (when live) | Do not break sticky toast or hero overlays; shell z-index / overflow must leave overlays usable |
| `@tanstack/react-virtual` | Already in `web/package.json`; used today only for list mode in `GalleryView` |
| `--lib-*` / rail tokens | `[globals.css](../../web/app/globals.css)`, schedule-rail local palette |

**Master dependency:** `Phase1–6 → Phase7 shell polish`. Prefer Phase 2–3 (and ideally 4–6) landed enough that polish does not fight unfinished stubs — but the pack can be written now; builders should not rip unfinished phase features.

---

## Data contract

Phase 7 is mostly UI/chrome. No new persistence tables.

### View mode (client)

```ts
type GalleryViewMode = "dense" | "normal"; // "list" removed

// localStorage: "relay.galleryViewMode"
// Migration: if stored value === "list", treat as "normal" and rewrite key
```

### Virtualizer input

```ts
// Same collapsed model as GalleryGrid today
type ActivePostsGridCard =
  | { kind: "post"; /* ... */ }
  | { kind: "linked_set"; /* ... */ };

// Virtualize rows of N columns where N = dense ? moreCols : fewerCols (match GalleryGrid breakpoints)
```

### Empty state variants (shared primitive)

| Variant | When | Primary CTA (examples) |
| ------- | ---- | ---------------------- |
| `no_posts` | Owner library empty | Sync Patreon / create post |
| `no_results` | Filters/collections yield zero | Clear filters |
| `no_cues` | Rail / Drop Assets nothing armed | Schedule in Autopost |
| `no_month_events` | Month loaded, zero ready+events | Quiet copy — no faux mock slices |
| `no_selection` | Power / bulk needs a post | Select a post |
| `no_distribution` | Gaps/summary empty where relevant | Cross-post / Autopost |

Copy must keep Relay visibility language distinct from Patreon access (guardrails).

### Scroll contract (must not regress)

| Region | Scroll owner |
| ------ | ------------ |
| Active Posts + Import Bay main column | Main pane |
| Schedule rail day axis | Rail internal scroller |
| Power slide-over | Panel internal |
| Hero / Link sheets / Inspect | Overlay portals |

---

## File touch list

| Path | Action |
| ---- | ------ |
| `[web/app/studio/GalleryView.tsx](../../web/app/studio/GalleryView.tsx)` | **Edit** — remove list mode UI + virtualizer-for-list; add grid virtualizer host; empty-state unification; view-mode migration |
| `[web/app/components/GalleryGrid.tsx](../../web/app/components/GalleryGrid.tsx)` | **Edit** — support windowed rendering / row chunks for virtualizer |
| `web/app/components/studio/LibraryEmptyState.tsx` (new) | **Create** — shared empty primitive |
| `[web/app/globals.css](../../web/app/globals.css)` | **Edit** — shell token harmonization (density, borders) without breaking rail mint |
| `[LibraryTopBar.tsx](../../web/app/components/LibraryTopBar.tsx)`, `[GallerySidebar.tsx](../../web/app/components/GallerySidebar.tsx)`, `[LibraryImportBay.tsx](../../web/app/components/LibraryImportBay.tsx)`, `[LibrarySectionEyebrow.tsx](../../web/app/components/LibrarySectionEyebrow.tsx)` | **Edit** — density / token alignment |
| `[StudioScheduleRail.tsx](../../web/app/components/schedule-rail/StudioScheduleRail.tsx)`, `[ScheduleRail.tsx](../../web/app/components/schedule-rail/ScheduleRail.tsx)`, `[DropAssetsCard.tsx](../../web/app/components/schedule-rail/DropAssetsCard.tsx)` | **Edit** — empty month / no-cues copy; scroll contract only |
| `[GalleryListRow.tsx](../../web/app/components/GalleryListRow.tsx)` | **Delete** (preferred) or leave unused with comment if deletion risky for another branch |
| `[LibraryPowerPanel.tsx](../../web/app/components/LibraryPowerPanel.tsx)`, `[BulkActionBar.tsx](../../web/app/components/BulkActionBar.tsx)` | **Edit lightly** — empty / chrome only |
| Tests | Optional: view-mode migration util; virtualizer smoke if repo has web test pattern |


**Do not rewrite:** `ActivePostPresenceCard`, `LinkedSetCard`, `LinkConfirmSheet`, `platform-presence-chips`, schedule-rail service/API, extension sticky, hero inspect data join — chrome wrappers only if needed for density/overflow.

---

## Ordered todos (builder)

Each todo is independently verifiable.

1. **Inventory chrome seams** — Screenshot/map three-column layout, scroll owners, and all empty-string call sites; note list-mode divergence (no linked-set collapse / no presence).
2. **Remove list mode** — Drop toolbar list control; migrate `relay.galleryViewMode`; delete list stub JSX + list-only virtualizer; remove or quarantine `GalleryListRow.tsx`.
3. **Shared `LibraryEmptyState`** — Primitive + variants; replace library empty / filtered empty first.
4. **Align cue / rail empties** — Drop Assets disarmed + empty month rail message; no silent barren month without copy.
5. **Grid virtualization** — `@tanstack/react-virtual` over collapsed cards with density column counts; verify Linked Set + presence cards still mount correctly while scrolling.
6. **Scroll independence** — Confirm rail day scroll ≠ main grid scroll; Power / hero / sheets still overlay correctly (z-index / `overflow`).
7. **Density / token pass** — Harmonize Import Bay + Active Posts + sidebar toward `--lib-*` without erasing rail identity or chip kit.
8. **Guardrails + verify** — Run checklist; confirm Relay visibility ≠ Patreon access on touched copy.

---

## Verify checklist

- Dense and normal grid both work; no list button; legacy `list` in localStorage opens as normal
- Linked Set cards + presence chips still appear correctly while fast-scrolling a large library
- Main Active Posts scroll does not move the Schedule rail day axis (and vice versa)
- Empty library, filtered-zero, Drop Assets “nothing cued”, and empty month each show intentional copy (not blank chrome)
- Power / Bulk / Phase 6 hero (if present) still open and dismiss cleanly
- Drop Assets Commit → Autopost and ghost-chip Autopost still work
- No new virtualization dependency beyond `@tanstack/react-virtual`
- No v0 monolith import; no third chip style; carousel ≠ Linked Set unchanged
- Library copy still respects visibility ≠ Patreon access guardrail

---

## Do-not-do list

- Do not re-build Phase 2–6 features under the guise of “shell polish”
- Do not add `react-window` or reinvent the chip kit
- Do not ship a second half-broken list path — remove it or fully implement (default: **remove**)
- Do not merge rail and gallery into one page scroll
- Do not port `.tmp` Studio / schedule-rail prototypes wholesale
- Do not put Coach / Insights Action Hub inside the rail
- Do not treat Phase 7 as the full visual brand renovation

---

## Reference assets

- Master Phase 7 stub + `Phase1–6 → Phase7` dependency order
- Shell orchestrator: `[GalleryView.tsx](../../web/app/studio/GalleryView.tsx)`
- Grid: `[GalleryGrid.tsx](../../web/app/components/GalleryGrid.tsx)`
- Rail: `[StudioScheduleRail.tsx](../../web/app/components/schedule-rail/StudioScheduleRail.tsx)`
- Tokens: `[globals.css](../../web/app/globals.css)`
- UX copy guardrails: `[UX_ACCEPTANCE_GUARDRAILS.md](../qa/UX_ACCEPTANCE_GUARDRAILS.md)`
- Deferred-to-7 notes: `[PLAN_PHASE_5_EXTENSION_STICKY_REMINDERS.md](./PLAN_PHASE_5_EXTENSION_STICKY_REMINDERS.md)`, `[PLAN_PHASE_6_HERO_PACKAGING_INSPECT.md](./PLAN_PHASE_6_HERO_PACKAGING_INSPECT.md)`
