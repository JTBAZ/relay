# Delta Out — T-014 (Gallery performance budget at scale)

## 1. Delta

- **`web/lib/use-debounced-value.ts`:** Shared hook for debouncing values (320ms delay, aligned with visitor gallery search).
- **`web/app/GalleryView.tsx`:** **Find Assets** uses debounced query for `GET /api/v1/gallery/items` — avoids one network round-trip per keystroke while typing. Facets + collections initial loads run in **parallel** (`Promise.all`). List view virtualizer **`overscan`** increased 6 → **10** for smoother scrolling with large post counts.
- **`web/app/components/GalleryGrid.tsx`:** Wrapped in **`React.memo`** to skip re-renders when parent updates but grid props are unchanged.

## 2. Measurement (manual)

- **Before/after:** Chrome DevTools → **Network** — filter `gallery/items`; type a multi-character search on Library `/`. Before: one request per character; after: one request after ~320ms pause (plus any filter-driven refetches).
- **Optional:** Performance panel → record scroll in **list** view with many posts; list mode already uses `@tanstack/react-virtual` — grid/dense still renders full CSS grid (scale-sensitive workloads: prefer list view or pagination via “Load more”).

## 3. Risks / blockers

- Full **grid** virtualization not implemented (layout change); road-map P95 targets may still need backend/index tuning for very large libraries.

## 4. Next step hint

**T-015** — Postgres + Prisma durable stores (separate DB tracker scope); see `docs/database/integration-roadmap.md`.

---

## Manual handoff (no autopipeline Runs row)

Operator: paste summary into your tracker if needed; next task **T-015** set **Ready** with **Delta In** below.
