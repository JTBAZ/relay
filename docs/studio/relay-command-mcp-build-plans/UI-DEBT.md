# Lab 2 / Studio command UI debt

Playground findings that **must be fulfilled** as high-quality Studio chrome. They are not Command Layer capability bugs. Functionality can pass while these remain ugly or hard to inspect.

Do **not** implement these in P3. Consume them in **RC-P4-T02** (lens refinement) unless a later Studio schedule slice is explicitly claimed. Keep the Schedule Rail mounted. Do not restyle production `GalleryView.tsx` until P4 is unblocked.

| ID | Finding | Status | Fulfill in |
|---|---|---|---|
| RC-UI-01 | Collections lens tiles are oversized; ungrouped posts belong on Chronological | Done | RC-P4-T02 |
| RC-UI-02 | Full-visual month calendar with click-through to months ahead | Done | RC-P4-T02 |

## RC-UI-01 — Collections lens density

**Human note (2026-08-28):** After a Hero Academy organize, Collections correctly showed Photo Studies + Hero Academy stacks with mock covers. The rest of the gallery “disappeared” and the stacks read as gigantic.

**Expected vs debt**

- Stacks-only Collections (no ungrouped posts) is the lens contract. Chronological still holds the library.
- Three wide `w-full` 4:3 tiles (`Lab2CollectionsLens` `xl:grid-cols-3` + `CollectionStackCard` `size="lens"`) are **not** the product density. Chronological shelf stacks are compact (`size="shelf"`, ~8.75rem).

Fulfill with a denser Collections board (smaller stacks, more columns, or a board that is not three huge cards). Do not dump ungrouped posts into Collections to “fix” emptiness.

## RC-UI-02 — Full-visual calendar grid (months ahead)

**Human note (2026-08-28):** Weekly X plan for Hero Academy applied correctly (13 unpublished slices, pages 1–6 skipped). The always-on rail is a **current-month** vertical strip. On the 28th, only Page 7 (27 Aug) can appear; Sep–Nov weekly slots are invisible. Creators need a **high-quality full-visual calendar grid** they can click to see months ahead.

This is product debt to fulfill, not a pass/fail of RC-DF-07.

### Already in the tree (reuse; do not invent a third calendar)

| Piece | What it is | Gap |
|---|---|---|
| `GET /api/v1/creator/schedule-rail?month=YYYY-MM` | Month window already exists | UI never offers prev/next |
| `fetchScheduleRail({ month })` in `web/lib/schedule-rail-api.ts` | Client already accepts a month | `StudioScheduleRail` reloads the current month only |
| `ScheduleRail` | Narrow vertical day strip for **one** month (v0: rail is not a calendar app) | No month click-through; weekly plans spanning months cannot be inspected |
| `Lab2ScheduleLens` | Title list from the same month-scoped GET | No dates; same August cutoff |
| Goals Lab `monthMatrix` + prev/next in `web/app/components/goals-lab/GoalsChatPopover.tsx` (`data-testid="flagship-custom-calendar"`) | Real 7-column month grid with month navigation | Date picker only — no event occupancy |
| shadcn `Calendar` copies under `web/onboarding_enhancement/`, `web/components/patron-mock/`, `web/b_i0ofEW9bMcy/` | Primitive month grid | Not wired to Studio events |

The v0 rail prompt (`docs/studio/STUDIO_SCHEDULE_RAIL_V0_PROMPT.md`) forbade a month grid **on the narrow rail**. That still holds: keep the rail. Add a separate full-visual grid (Schedule lens or equivalent) that can page months.

### Fulfillment bar

- 7-column month grid, not a one-month vertical strip and not a title-only list.
- Obvious prev/next (or equivalent) so a creator can click into September+ without leaving Studio.
- Days show occupancy so a weekly X plan is readable at a glance; click a day/event to inspect the slice (reuse existing event popover if it fits).
- Command-created `sl2_evt_*` rows and ordinary rail events share the same month API — no second schedule store.
- Reduced motion and keyboard access belong in the same UI batch.

**Counter-example:** shipping only a longer `Lab2ScheduleLens` list, or documenting “query September in the URL,” does not fulfill this item.
