# Phase 4 brief — Schedule rail production data

**Status:** Done — live `GET /api/v1/creator/schedule-rail` + mutations verified (Dev Ava / PostBot month). UI needs a wide (`lg+`) Studio viewport; automation browser often clips the rail.  
**Master roadmap:** `[PLAN_STUDIO_RENOVATION_MASTER.md](./PLAN_STUDIO_RENOVATION_MASTER.md)`  
**Prior phases:** Phase 0–1 done (chip kit + Drop Assets mount). Phase 2 presence grid briefed/done independently. Phase 3 Linked Sets is **not** required.

---

## Goal

Replace mock `INITIAL_DATA` on the Studio Schedule rail with a **creator-scoped, timezone-aware month feed** of open `PostbotTask` rows + scheduled distribution variants, wire slice Done / Delete / Edit to real patch APIs, and derive Drop Assets `armed` from a pending post cue with empty/unattached media — so the rail is no longer prototype-only.

## Exit criteria

1. Rail on `/studio` loads live creator month data (not `INITIAL_DATA` as the sole source of truth).
2. Dual tracker shows live cadence (`posts_this_month` / target) + PostBot completion counts for the window.
3. Drop Assets `armed` only when a pending `action === "post"` cue with empty/unattached media exists; otherwise the minimized “Nothing cued” state.
4. Slice Done / Delete / Edit (time or notify) hit real APIs and survive refresh.

---

## In scope

- `GET /api/v1/creator/schedule-rail?month=YYYY-MM` aggregating tasks + variants in creator TZ
- Map response → existing `[ScheduleData](../../web/lib/schedule-rail-data.ts)` shapes (`ready`, `events`, cadence, postbot)
- TZ-aware `today_day` + `days_in_month` (drop hardcoded `TODAY_DAY = 17` / fixed 31)
- Ready strip: undated / when-ready pending post tasks
- Dated slices from `PostbotTask.suggested_time` and/or variant `scheduled_for`
- Read-time `plan_label` / `plan_index` / `plan_total` from `plan_id` sibling ordering
- Wire EventPopover Done → `patchPostbotTask({ status: "done" })`; Delete → `{ status: "dismissed" }`
- Wire Edit time / notify → `PATCH .../distribution-variants/:variant_id` (`scheduled_for`, `remind_me`)
- Derive `armed` + optional `cue` (post/plan/task ids + present/missing destinations) for Drop Assets
- Replace Drop Assets mock `DEFAULT_PRESENT` / `DEFAULT_MISSING` with cue destinations when armed
- Loading / empty month / error states on `StudioScheduleRail`
- Leave stable `task_id` / `variant_id` / `link` / `notify` on wire events for Phase 5

## Out of scope (do not build)

- Extension sticky toasts / must-dismiss reminder packets (**Phase 5**)
- Global `remind_me_global` persistence (UI toggle may stay local; Phase 5 owns preference storage)
- Custom “+” calendar events persistence (no Prisma custom-event model — disable or clearly stub)
- Linked Sets (**Phase 3**) / hero packaging inspect (**Phase 6**)
- Re-running Insights / Coach from the rail (rail **consumes** queues only)
- Google Calendar / life-OS scheduler
- Porting `.tmp/schedule-rail-v0` StickyToast panel into Studio
- Inventing a second chip language or a new calendar table

---

## Dependencies

| Dependency | Role |
| ---------- | ---- |
| Phase 0–1 Drop Assets | `[DropAssetsCard](../../web/app/components/schedule-rail/DropAssetsCard.tsx)` + `armed` prop contract — `[PLAN_DROP_ASSETS_CHIP_KIT.md](./PLAN_DROP_ASSETS_CHIP_KIT.md)` |
| `[PostbotTask](../../prisma/schema.prisma)` + `[postbot-task-service.ts](../../src/distribution/postbot-task-service.ts)` | Task atoms; `PATCH .../postbot-tasks/:id` already used by Transformer |
| `[PostDistributionVariant](../../prisma/schema.prisma)` `scheduledFor` / `remindMe` | Timed slices + per-event notify; `PATCH .../distribution-variants/:id` |
| `[posting-goal-service.ts](../../src/autopost/posting-goal-service.ts)` | `creatorLocalMonthWindow`, creator IANA TZ, cadence via posting-goal status |
| `[schedule-rail-data.ts](../../web/lib/schedule-rail-data.ts)` | UI types; demote `INITIAL_DATA` to fallback only |
| Live mutation patterns | `[PostbotTaskList.tsx](../../web/app/components/distribution/PostbotTaskList.tsx)`, `[TransformerNodePage.tsx](../../web/app/components/distribution/TransformerNodePage.tsx)` `applyPostbotSchedule` |

**Parallel OK:** Can ship alongside Phase 2 after chips. Does **not** require Phase 3.

**Defer to Phase 5:** sticky extension packets, global remind persistence, aggressive `PostbotTask.link` backfill when no external URL yet (still expose `link` field on wire when known).

---

## Data contract

### Source of truth (live)

Reuse existing tables — **no** new calendar/event table:

| Atom | Use on rail |
| ---- | ----------- |
| `PostbotTask` | Slice identity (`task_id`), action family, rationale, status, `suggested_time`, `link`, `plan_id` |
| `PostDistributionVariant` | `scheduled_for`, `remind_me`, `variant_id` for edit/notify |
| `CreatorPostingGoal` | IANA `timezone`, monthly target |
| Posting-goal status | Cadence `posted` / `target` for the creator-local month |

### Aggregation API (new)

```http
GET /api/v1/creator/schedule-rail?month=YYYY-MM
```

Omit `month` → current creator-local month from posting-goal TZ.

```ts
type ScheduleRailCue = {
  post_id: string;
  plan_id: string | null;
  task_id: string;
  present_destinations: string[]; // product destinations present on cued post
  missing_destinations: string[];
};

type ScheduleRailResponse = {
  month: string;              // creator-local YYYY-MM
  timezone: string;           // IANA
  today_day: number;          // 1..days_in_month in creator TZ
  days_in_month: number;
  remind_me_global: boolean;  // Phase 4: may default true / client-local; persistence = Phase 5
  cadence: { posted: number; target: number };
  postbot: { done: number; total: number };
  armed: boolean;
  cue: ScheduleRailCue | null;
  ready: ReadyItem[];         // same shape as web/lib/schedule-rail-data.ts
  events: ScheduleEvent[];    // id = task_id (preferred) or variant-scoped stable id
};
```

Map into UI `ScheduleData` on the client (or return already-compatible fields). Prefer including on each ready/event item:

- `variant_id` (for edit PATCH) — extend wire type if not already on `ScheduleEvent` / `ReadyItem`
- `task_id` / `id` aligned
- `notify` from variant `remind_me` (or task-level when added later)
- `link` when known (attempt / platform instance / task.link)
- `plan_label`, `plan_index`, `plan_total` computed at read time

### Mapping rules

| Rail surface | Rule |
| ------------ | ---- |
| **Ready** | Pending tasks with null/empty due time (or `action === "post"` with no usable `scheduled_for` / `suggested_time`) |
| **Events** | Tasks (and dated variant-backed steps) whose due time falls inside the month window |
| **Status** | `done` if task status done; `overdue` if pending and due &lt; now; else `pending` |
| **Dismissed** | Excluded from rail after Delete |
| **Done slices** | Remain on axis desaturated for month context (match current UI) |
| **plan grouping** | Among non-dismissed siblings sharing `plan_id`, order by due time / created; set index/total + human `plan_label` from plan/title heuristics |
| **Cadence** | From `GET /api/v1/creator/posting-goal/status` (or inline same numbers in schedule-rail response) |
| **PostBot tracker** | `done` = tasks in window with status done; `total` = done + pending in window (exclude dismissed) |

### `armed` predicate

`armed === true` iff there exists ≥1 **pending** `PostbotTask` with `action === "post"` whose linked post/plan has **empty or unattached media** suitable for Drop Assets fill (no usable attached media / draft media for that cue). Prefer the earliest such cue for `cue`.

When `armed`:

- Pass `cue.present_destinations` / `missing_destinations` into Drop Assets (derive from distribution summary or plan destinations for `cue.post_id` — align with Phase 2 present/missing rules where possible).
- When not armed: Drop Assets minimized copy → Autopost.

### Mutations (existing APIs)

| UI action | API |
| --------- | --- |
| Done | `PATCH /api/v1/creator/postbot-tasks/:task_id` `{ status: "done" }` |
| Delete | Same PATCH `{ status: "dismissed" }` — soft dismiss, never hard-delete |
| Edit time / notify | `PATCH /api/v1/relay/distribution-variants/:variant_id` `{ scheduled_for?, remind_me? }` |
| Optional | Extend task PATCH for `suggested_time` only if cheap and already patterned — otherwise keep canonical time on variant |

After mutation: optimistic UI update **or** refetch schedule-rail for the open month.

### Custom “+” add

**Out of scope for exit.** Keep “+” affordance disabled, hidden, or clearly non-persisting with UI copy that custom events are not saved yet. Do not add a Prisma model in this phase.

---

## File touch list

| Path | Action |
| ---- | ------ |
| `src/distribution/schedule-rail-service.ts` (new) | **Create** — month-window aggregate, plan labels, `armed` / `cue` |
| `[src/server.ts](../../src/server.ts)` | **Edit** — register `GET /api/v1/creator/schedule-rail` |
| `[src/autopost/posting-goal-service.ts](../../src/autopost/posting-goal-service.ts)` | **Reuse** — month/TZ helpers; call from schedule-rail service |
| `[src/distribution/postbot-task-service.ts](../../src/distribution/postbot-task-service.ts)` | **Reuse** — status patch; extend only if schedule-rail needs shared mappers |
| `[web/lib/schedule-rail-data.ts](../../web/lib/schedule-rail-data.ts)` | **Edit** — keep types; demote `INITIAL_DATA` to fallback/story; add `variant_id` if missing |
| `web/lib/schedule-rail-api.ts` (new) **or** `[web/lib/relay-api.ts](../../web/lib/relay-api.ts)` | **Create/Edit** — `fetchScheduleRail({ month? })` + map to `ScheduleData` |
| `[web/app/components/schedule-rail/StudioScheduleRail.tsx](../../web/app/components/schedule-rail/StudioScheduleRail.tsx)` | **Edit** — fetch on mount/month change; loading/error; pass API `armed` + cue destinations |
| `[web/app/components/schedule-rail/ScheduleRail.tsx](../../web/app/components/schedule-rail/ScheduleRail.tsx)` | **Edit** — real mutation callbacks; dynamic today / days-in-month |
| `[web/app/components/schedule-rail/EventPopover.tsx](../../web/app/components/schedule-rail/EventPopover.tsx)` | **Edit** — wire Edit / Done / Delete (Edit no longer inert) |
| `[web/app/components/schedule-rail/DropAssetsCard.tsx](../../web/app/components/schedule-rail/DropAssetsCard.tsx)` | **Edit** — live present/missing from cue; stop relying on DEFAULT mocks when cue present |
| `[web/app/components/schedule-rail/AddEventPopover.tsx](../../web/app/components/schedule-rail/AddEventPopover.tsx)` | **Edit or gate** — disable persist path per out-of-scope |
| `[web/app/studio/GalleryView.tsx](../../web/app/studio/GalleryView.tsx)` | **Edit** — remove hardcoded `armed={true}`; let rail host own armed from API |
| `tests/schedule-rail-service.test.ts` (new) | **Create** — window filter, armed predicate, plan index/total, dismissed exclusion |
| API auth smoke test (extend existing creator analytics/distribution tests) | **Edit** — 401/200 for schedule-rail GET |


**Do not edit:** Insights Action Hub / Coach UI; extension toast craft (`post-link-toast.ts` — Phase 5); Active Posts Phase 2/3 card internals beyond rail host props; visitor gallery.

---

## Ordered todos (builder)

Each todo is independently verifiable.

1. **Spec fixtures** — Document month-window query + `armed` predicate against real `PostbotTask` / variant fixtures (pending post with empty media → armed; dated pin_comment → event slice; dismissed excluded).
2. **`schedule-rail-service` + GET** — Implement aggregation + route; unit tests for TZ window, plan_index/total, cadence/postbot counts, armed/cue.
3. **Client fetch mapper** — `fetchScheduleRail` → `ScheduleData` (+ cue destinations / `variant_id` on items).
4. **`StudioScheduleRail` live load** — Fetch on mount; loading/error; stop using `INITIAL_DATA` as sole source; remove GalleryView hard `armed={true}`.
5. **TZ-aware axis** — Drive today marker + days-in-month from API (`today_day`, `days_in_month`); delete hardcoded `TODAY_DAY = 17` / assume-31.
6. **Done / Delete** — Wire popover to `patchPostbotTask`; optimistic or refetch; dismissed disappears; done stays desaturated.
7. **Edit time / notify** — Wire Edit to variant PATCH (`scheduled_for`, `remind_me`); slice moves on axis after save.
8. **Dual tracker** — Cadence + PostBot counts from API response (not mock 3/8 and 5/12).
9. **Drop Assets cue** — When armed, pass live present/missing from `cue`; when not, minimized empty state.
10. **Empty / custom add** — Empty month UX; disable or stub custom “+” with no false persistence.
11. **Verify** — Checklist below on a seeded creator with a multi-step `plan_id` strategy (post → pin → repost).

---

## Verify checklist

- Refresh shows the same pending/done slices (not forever-mock July `INITIAL_DATA`)
- Cadence matches posting-goal status; PostBot counts match task statuses in the window
- Armed only with pending post cue + empty/unattached media; Drop Assets minimizes otherwise
- Done / dismiss survive refresh; Edit time moves the slice on the month axis
- Plan label shows “Part of: … · N of M” / index-total when siblings share `plan_id`
- Schedule rail scroll stays independent of gallery; Drop Assets Commit still → Autopost
- No Coach re-run from the rail; no extension sticky toast shipped
- Custom “+” does not pretend to persist server-side events
- Wire events expose stable `task_id` (and `variant_id` when applicable) for Phase 5

---

## Do-not-do list

- Do not port `.tmp/schedule-rail-v0` StickyToast into Studio
- Do not hard-delete tasks (dismiss only)
- Do not invent Google Calendar sync or a custom-event DB table in this phase
- Do not leave toast stubs as “done” for due reminders (Phase 5 owns sticky packets)
- Do not replace Insights / Transformer Coach UI inside the rail
- Do not re-run Coach from schedule mutations
- Do not block on Phase 3 Linked Sets
- Do not invent a third chip style for destinations on Drop Assets

---

## Reference assets

- IA + dual tracker + popover fields: `[STUDIO_SCHEDULE_RAIL_V0_PROMPT.md](./STUDIO_SCHEDULE_RAIL_V0_PROMPT.md)`
- Drop Assets `armed` contract: `[PLAN_DROP_ASSETS_CHIP_KIT.md](./PLAN_DROP_ASSETS_CHIP_KIT.md)`
- Mock types / demote source: `[web/lib/schedule-rail-data.ts](../../web/lib/schedule-rail-data.ts)`
- Production mount (live): `[StudioScheduleRail.tsx](../../web/app/components/schedule-rail/StudioScheduleRail.tsx)`, `[GalleryView.tsx](../../web/app/studio/GalleryView.tsx)`
- Month/TZ helpers: `creatorLocalMonthWindow` in `[posting-goal-service.ts](../../src/autopost/posting-goal-service.ts)`
- v0 companion (reference only): `.tmp/schedule-rail-v0/` — do not ship StickyToast here

---

## Handoff to Phase 5

Phase 5 extension sticky reminders assume this pack leaves:

- Stable schedule-rail (or equivalent) event ids: `task_id`, `variant_id`, `post_id`, `destination`, `link`, `notify`
- Per-event `remind_me` editable on variants (global persistence still Phase 5)
- Done / dismiss semantics identical to what the toast will call
