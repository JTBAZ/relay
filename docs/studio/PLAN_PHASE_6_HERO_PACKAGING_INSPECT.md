# Phase 6 brief — Hero / packaging inspect (credibility)

**Status:** Implemented — verify hero on two posts + Linked Set member; packing stats only in hero  
**Master roadmap:** `[PLAN_STUDIO_RENOVATION_MASTER.md](./PLAN_STUDIO_RENOVATION_MASTER.md)`  
**Prior phases:** Phase 2 presence cards + chip kit (required). Phase 3 `creative_work_id` on gallery / Linked Sets (required for set → member hero). Packaging read APIs (Phase 10a) — done. Phase 4–5 are **not** required for code, but Phase 5 verify should be signed off before starting (master sequencing).

---

## Goal

Replace Studio Library inspect / Power-adjacent **stats** paths with a **packaging-backed hero** keyed on `(creative_work_id, post_id)` — per-platform rows + gap rows using the shared Present/Ghost chip kit, Relay View only after work instances are wired — so **clicking post A never shows post B’s stats**.

## Exit criteria

1. Opening hero for post A loads work-scoped packaging data for that post’s key; switching to post B cancels/replaces A’s fetch — no cross-contamination or global `HERO_DATA`.
2. Per-platform present rows show real destination stats from the work bundle; missing destinations render Ghost gap rows with **real** Autopost / distribution-plan CTAs (not toast stubs).
3. **Column layout only** — no radial cards / SVG connectors shipped; dead v0 radial code is not ported.
4. Relay View (merged vs teaser/promo via `group_by=variant_role`) ships only after `fetchPerformanceWorkInstances` is wired for per-row refresh eligibility on the selected work.

---

## Frozen decisions (v1)

| Topic | Decision |
| ----- | -------- |
| **Selection key** | Every fetch, loading state, and row set is tagged with `HeroInspectKey = { creative_work_id, post_id, range }`. On key change: abort in-flight or ignore stale via generation counter. |
| **Shell** | New **`HeroInspectOverlay`** — centered scrim + hero card (thumb/title/role) + **vertical column** of platform/gap rows (v0 `HeroUnfold` / `PlatformRowCard` / `GapRowCard` kinship). **Not** a side sheet. Z-index ≥ InspectModal (`z-[100]`) so it sits above Bulk / Linked Set summary. |
| **Stats home** | Packaging stats live **only** in the hero. Remove `PostReachPanel` from primary Library paths (`InspectModal`, `PostBatchModal`). |
| **Entry — Bulk bar** | Bulk bar button is labeled **Details** (not “Inspect”). **Details → opens hero** for the focused / single selected post with `(creative_work_id, post_id)`. Multi-select race: prefer last-focused `post_id` when tracked; else first selected item — document in join util tests. |
| **Entry — Linked Set** | Member click in `[LinkedSetSummaryPanel](../../web/app/components/studio/LinkedSetSummaryPanel.tsx)` → hero with `(set creative_work_id, member post_id)`. Supersedes Phase 3 “member → InspectModal” line. |
| **Entry — Power** | Power “Open source post” / Engage path → same hero key (kill `seededMetric` fakes). |
| **Entry — card body** | **`ActivePostPresenceCard` body click stays select-only** (Phase 2). No card→hero in v1. |
| **Legacy InspectModal** | Demote to **post settings / audience / tags / tiers** only (no reach panel). Reachable from hero footer link **“Post settings”** (or keep Bulk Details as hero-only and add settings entry inside hero). Do **not** open both overlay and InspectModal for stats. |
| **Multi-asset** | Keep `[PostBatchModal](../../web/app/components/PostBatchModal.tsx)` for carousel / batch asset UX; **strip `PostReachPanel`**. Packaging stats → hero via Details / set member (same key). Do not conflate carousel with Linked Set. |
| **Missing `creative_work_id`** | **No invented “work-for-post” resolver** (none exists in web today). Open hero with empty safe state: copy **“No packaging work yet”** + no stats from any other post. Optional soft CTA: stay on Library / link set later — not invent create-work API. |
| **Range** | Default **`30d`**. No range picker in hero v1 (Advanced analytics page has 7d/30d/90d). |
| **Reach formula** | Per destination: `reach = impressions + seen + views` (same as `WorkDrilldownView.reachFromDay` / hierarchy panel). |
| **Instances gate** | Hero **must** call `fetchPerformanceWorkInstances(creative_work_id)` for `refresh_eligible` / `platform_instance_id`. Bundle `variants[].platform_instances` may supply metrics ids but **does not** satisfy the Relay View gate alone. |
| **Relay View** | Toggle **hidden** until instances fetch succeeds. UI = three summary panels per `[STUDIO_PACKAGING_DATA.md](../analytics/STUDIO_PACKAGING_DATA.md)` (merged / ads+teasers / canonical) from `role_breakdown`. Single-post / single-work scope only — **no set-wide rollup**. |
| **Gap CTA** | For an **existing Relay Post**, open the **cross-post DistributionSheet** (seed destination). Do **not** send post-attached `media_ids` into Autopost — staging only accepts unattached bin media (`primaryPostId` null). Autopost remains for Import Bay / schedule-rail staged assets. No toast-only “done”. |
| **Gaps list** | Primary gaps = `crosspost_gaps.missing_destinations` scoped with `suggested_source_post_id` favoring selected `post_id` when present. `missing_teaser_destinations` **out of v1** (do not block on teaser-gap UI). |
| **Thumb** | Single cover / primary thumb only (no v0 media strip) in hero **Phase 6** credibility v1. **Phase 6.1** adds media-strip fidelity — `[PLAN_PHASE_6_1_HERO_VISUAL.md](./PLAN_PHASE_6_1_HERO_VISUAL.md)`. |
| **Advanced** | Link inside hero → `/studio/analytics/works/:creative_work_id?range=30d` when `creative_work_id` present. |
| **Chips** | Import icons / Present / Ghost **only** from `[platform-presence-chips.tsx](../../web/app/components/distribution/platform-presence-chips.tsx)`. |
| **Preload** | `include_instances=true` on gallery fetch is **optional follow-up** (Phase 6.1) — not required for exit. |

---

## In scope

- Packaging-backed `HeroInspectOverlay` for Library Active Posts + Linked Set member → hero
- Data join: gallery `creative_work_id` + selected `post_id` → work bundle variants / `by_destination` + `crosspost_gaps` + instances merge
- Wire `fetchPerformanceWorkInstances` for refresh eligibility on platform rows
- Column `PlatformRow` + `GapRow` UI (v0 column patterns only)
- Shared chip kit for present / gap grammar (master rule 3)
- Relay View toggle using `role_breakdown` **after** instances path is live
- Demote legacy stats: strip `PostReachPanel` from InspectModal + PostBatchModal; kill Power `seededMetric`
- Fetch cancellation / request-id keyed by `(creative_work_id, post_id)`
- Thin join util + unit tests (post A vs B)

## Out of scope (do not build)

- Radial / `RadialPlatformCard` / `ConnectorLines` / measured SVG thread (**ban**)
- Global mock `HERO_DATA` or any shared stats blob across posts
- Set-wide Relay View rollup across all Linked Set members
- Schedule rail / extension sticky (**Phase 4–5**)
- Studio shell density / virtualization (**Phase 7**)
- Porting `.tmp/social-media-post-creator-8/app/studio/page.tsx` monolith
- Designer / public-profile `HeroEditor` surfaces
- Inventing a second chip language
- Card-body → hero (`ActivePostPresenceCard`)
- Teaser-gap UI (`missing_teaser_destinations`)
- Gallery `include_instances` preload (optional 6.1)
- Full WorkDrilldown parity inside hero (extract presentational kinship only)

---

## Dependencies

| Dependency | Role |
| ---------- | ---- |
| Phase 2 chip kit + presence cards | `[platform-presence-chips.tsx](../../web/app/components/distribution/platform-presence-chips.tsx)`, ghost → Autopost grammar |
| Phase 3 gallery enrichment | `creative_work_id`, `is_default_bundle`, `creative_work_member_count` on owner list; Linked Set summary member → hero |
| `[STUDIO_PACKAGING_DATA.md](../analytics/STUDIO_PACKAGING_DATA.md)` | Work bundle, instances, `crosspost_gaps`, `role_breakdown` |
| `fetchPerformanceWorkBundle` / `fetchPerformanceWorkInstances` | `[web/lib/relay-api.ts](../../web/lib/relay-api.ts)` — instances **unused in web today** (Phase 6 wires it) |
| Analytics drilldown | `[WorkDrilldownClient.tsx](../../web/app/studio/analytics/works/[creative_work_id]/WorkDrilldownClient.tsx)` — refresh handoff to reuse; Advanced deep link |

**Master dependency:** `Phase2/packaging API → Phase6 hero`. Independent of Phase 4–5 features.

---

## Data contract

### Selection key (credibility)

```ts
type HeroInspectKey = {
  creative_work_id: string | null; // null → empty safe hero (no foreign stats)
  post_id: string;
  range?: "7d" | "30d" | "90d"; // v1 default "30d"
};
```

Every fetch, loading state, and rendered row set must be tagged with this key. On key change: abort in-flight requests (or ignore stale responses via generation counter).

### Live APIs

| Need | Call |
| ---- | ---- |
| Metrics + gaps | `fetchPerformanceWorkBundle(creative_work_id, { range: "30d" })` |
| Relay View | Same with `{ range: "30d", group_by: "variant_role" }` → `role_breakdown` |
| Instances / refresh | `fetchPerformanceWorkInstances(creative_work_id)` — **required** for refresh + Relay gate |
| Gap CTA | Autopost (preferred) or `createPostDistributionPlan(suggested_source_post_id, { destinations })` |

### Join algorithm (`buildHeroInspectModel`)

```
1. If !key.creative_work_id → empty model (title from gallery preview if available; rows=[]; gaps=[]; error=null)
2. Pick variant = bundle.variants.find(v => v.post_id === key.post_id)
   - If missing → empty rows + clear “Not in this work package” (do NOT fall back to another member’s stats)
3. Present rows: for each dest in variant.by_destination (or PRESENCE_DESTINATIONS ∩ present):
     stats.reach = impressions + seen + views; likes; comments
     merge instances row where post_id + destination match → refresh_eligible, platform_instance_id, external_url
4. Gaps: crosspost_gaps.missing_destinations
     prefer suggested_source_post_id === key.post_id when API provides per-gap source; else use key.post_id as CTA source when it is a bundle member
5. Relay (only if instancesOk && role_breakdown loaded): map three panels per packaging doc
```

### View model

```ts
type HeroPlatformRow = {
  destination: string;
  present: boolean;
  external_url: string | null;
  stats: { reach?: number; likes?: number; comments?: number };
  refresh_eligible?: boolean;
  platform_instance_id?: string | null;
};

type HeroInspectModel = {
  key: HeroInspectKey;
  title: string;
  thumb_src: string | null;
  variant_role: string | null;
  member_label: string | null;
  empty_reason: "no_work" | "not_in_work" | "error" | null;
  rows: HeroPlatformRow[];
  gaps: string[];
  relay?: {
    merged: unknown;
    ads_teasers: unknown;
    canonical: unknown;
  } | null;
};
```

### Layout lock: **column only**

Ship vertical platform + gap rows (v0 `PlatformRowCard` / `GapRowCard` as used in live `HeroUnfold`).  
**Do not** implement or import `RadialPlatformCard`, `ConnectorLines`, or dual column+radial modes.

### Relay View gate

1. Wire instances fetch + row refresh affordances first.  
2. Then show Relay View toggle; load `group_by=variant_role`; three panels (merged / ads+teasers / canonical).  
3. Do **not** claim Relay View done if it only toggles empty UI without instances-backed eligibility.

### Empty / error copy (freeze)

| State | Copy |
| ----- | ---- |
| No `creative_work_id` | “No packaging work yet” |
| Bundle/instances error | “Couldn’t load packaging stats” |
| Variant not in work | “This post isn’t in that package” |

---

## File touch list

| Path | Action |
| ---- | ------ |
| `web/app/components/studio/HeroInspectOverlay.tsx` (new) | **Create** — scrim + hero card + column rows + optional Relay View + Advanced + Post settings |
| `web/app/components/studio/HeroPlatformRow.tsx` (new) | **Create** — present row + gap row + chip kinship |
| `web/lib/hero-inspect-data.ts` (new) | **Create** — pure `buildHeroInspectModel` + stale-key helper |
| `[web/app/studio/GalleryView.tsx](../../web/app/studio/GalleryView.tsx)` | **Edit** — Details / set member / Power → hero key; cancel stale fetches; strip stats from inspect path |
| `[web/app/components/studio/LinkedSetSummaryPanel.tsx](../../web/app/components/studio/LinkedSetSummaryPanel.tsx)` | **Edit** — member open → hero `(work_id, member post_id)` |
| `[web/app/components/InspectModal.tsx](../../web/app/components/InspectModal.tsx)` | **Edit** — remove `PostReachPanel`; keep audience/preview/settings |
| `[web/app/components/PostBatchModal.tsx](../../web/app/components/PostBatchModal.tsx)` | **Edit** — remove `PostReachPanel` |
| `[web/app/components/inspect/post-reach-panel.tsx](../../web/app/components/inspect/post-reach-panel.tsx)` | **Retire from Library paths** (keep file only if analytics still needs; else dead) |
| `[web/app/components/LibraryPowerPanel.tsx](../../web/app/components/LibraryPowerPanel.tsx)` | **Edit** — remove `seededMetric` fakes; open hero |
| `[web/app/components/BulkActionBar.tsx](../../web/app/components/BulkActionBar.tsx)` | **Edit** — Details → hero (label stays “Details”) |
| `[web/lib/relay-api.ts](../../web/lib/relay-api.ts)` | **Read** — use bundle + instances helpers; optional thin wrapper |
| `[platform-presence-chips.tsx](../../web/app/components/distribution/platform-presence-chips.tsx)` | **Reuse only** |
| `[WorkDrilldownClient.tsx](../../web/app/studio/analytics/works/[creative_work_id]/WorkDrilldownClient.tsx)` | **Optional** — reuse refresh handoff only; do not fork chip grammar |
| Tests | **Create** — `buildHeroInspectModel` A vs B; missing work id; not-in-work |

**Do not edit:** schedule-rail / extension sticky; Drop Assets commit path; v0 monolith import; Designer `HeroEditor`; `ActivePostPresenceCard` inspect affordance.

---

## Ordered todos (builder)

Each todo is independently verifiable.

1. **Map legacy path** — Call sites: Bulk Details, Power open, Linked Set `onOpenPost`, InspectModal + PostBatchModal `PostReachPanel`, multi-select first-item race.
2. **Hero data join util** — Pure `buildHeroInspectModel(bundle, instances, key)` + fixtures: post A vs B never share rows; null `creative_work_id` → empty; wrong member → `not_in_work`.
3. **Fetch + stale guard** — Overlay loads bundle + instances with abort/generation; rapid A→B cannot paint A onto B.
4. **`HeroInspectOverlay` column UI** — Scrim, thumb/title, stacked present + gap rows, chip kit; Ghost → Autopost / distribution-plan (real).
5. **Wire entry points** — Details, Power, Linked Set member → hero with correct key; Post settings link → demoted InspectModal.
6. **Instances + refresh** — `fetchPerformanceWorkInstances`; show refresh eligibility; reuse drilldown refresh handoff where possible.
7. **Relay View** — Enable toggle with `group_by=variant_role` only after step 6; three panels; single-work only.
8. **Demote legacy stats** — Strip `PostReachPanel` from InspectModal + PostBatchModal; kill Power seeded metrics; Advanced → analytics work page.
9. **Verify** — Checklist below on two posts in different works and two members of one Linked Set.

---

## Verify checklist

- Open post A hero → stats match A’s work variant; open post B → stats match B (never A’s leftover)
- Rapid A→B switch does not flash or stick A’s numbers on B
- Present destinations show solid chip + stats; missing show Ghost gap + real CTA
- Linked Set member opens hero for that member’s `post_id` under the set’s `creative_work_id`
- Bulk **Details** opens hero (not Patreon-only reach panel)
- `PostBatchModal` has no `PostReachPanel`; multi-asset still manageable
- No radial / SVG connector UI in the build
- Relay View hidden until instances succeed; role panels match `role_breakdown`
- Power panel does not show seeded fake impressions
- Advanced navigates to `/studio/analytics/works/:creative_work_id?range=30d` when available
- Missing `creative_work_id` → empty copy, never another post’s stats
- Chip icons import only from `platform-presence-chips.tsx`
- No import of v0 `studio/page.tsx` monolith
- Post-link / schedule sticky extension behavior unchanged

---

## Do-not-do list

- Do not port `RadialPlatformCard`, `ConnectorLines`, or ship column **and** radial
- Do not use global `HERO_DATA` or cache one bundle for all grid cards
- Do not leave toast-only gap CTAs as “done”
- Do not invent a third chip style
- Do not invent a work-for-post API / fallback that shows another member’s stats
- Do not require Phase 4–5 features to ship Phase 6
- Do not add set-wide Relay View in this phase
- Do not conflate carousel multi-asset with Linked Set hero entry
- Do not open hero from Active Post card body click
- Do not port full WorkDrilldown into the overlay

---

## Reference assets

- Packaging API map: `[STUDIO_PACKAGING_DATA.md](../analytics/STUDIO_PACKAGING_DATA.md)`
- v0 prompt (radial language is historical; live v0 uses column): `[STUDIO_HERO_UNFOLD_V0_PROMPT.md](../analytics/STUDIO_HERO_UNFOLD_V0_PROMPT.md)`
- v0 column patterns (cite only): `.tmp/social-media-post-creator-8/app/studio/page.tsx` — `PlatformRowCard`, `GapRowCard`, `HeroUnfold` (ignore `RadialPlatformCard`)
- Analytics Advanced: `[WORK_DRILLDOWN_UI.md](../analytics/WORK_DRILLDOWN_UI.md)`, `WorkDrilldownClient.tsx`
- Phase 2 / 3 deferrals: `[PLAN_PHASE_2_ACTIVE_POSTS_GRID.md](./PLAN_PHASE_2_ACTIVE_POSTS_GRID.md)`, `[PLAN_PHASE_3_LINKED_SETS.md](./PLAN_PHASE_3_LINKED_SETS.md)`
