# Phase 3 brief — Linked Sets (analytics grouping)

**Status:** Implemented — verify on comic / A-B fixtures in Studio  
**Master roadmap:** `[PLAN_STUDIO_RENOVATION_MASTER.md](./PLAN_STUDIO_RENOVATION_MASTER.md)`  
**Prior phases:** Phase 0–1 done (chip kit + Drop Assets). Phase 2 presence-first Active Posts grid — `[PLAN_PHASE_2_ACTIVE_POSTS_GRID.md](./PLAN_PHASE_2_ACTIVE_POSTS_GRID.md)` (hard dependency).

---

## Goal

Add **Linked Sets** to Studio Active Posts: multi-select posts → confirm sheet → mosaic set card, with membership persisted as a non-default `CreativeWork` + `CreativeWorkMember` rows. Creators can group comic pages / A-B variants for shared analytics without conflating carousel (one post, many media) or Collections (profile curation).

## Exit criteria

1. Multi-select ≥2 Active Post cards → Link confirm sheet → mosaic Linked Set card; membership survives refresh via `CreativeWorkMember`.
2. Set summary shows member list + totals that match `fetchPerformanceWorkBundle` where metrics exist.
3. Carousel multi-asset posts remain distinct cards (never auto-linked into a set).
4. No measured SVG thread / `AggregateNode` / radial connectors shipped in this phase.

---

## In scope

- Optional `memberLabel` on `CreativeWorkMember` (schema + migration)
- Bulk link API (N posts → one non-default work in one transaction)
- Gallery owner-list enrichment: `creative_work_id`, `is_default_bundle`, `creative_work_member_count`, `member_label` / `variant_role` when useful
- Grid model: `PostCard | LinkedSetCard` — collapse posts sharing a non-default work with `member_count ≥ 2`
- “Link posts” affordance when ≥2 post cards selected (bulk bar or floating bar)
- `LinkConfirmSheet`: roles, labels, cover radio, Collection clarifier copy
- `LinkedSetCard`: stacked/mosaic thumb, Linked·N badge, presence chip union (Phase 2 helpers)
- Simplified set summary panel: title, filmstrip, reach comparison, unlink — **not** SVG thread
- Unlink via existing split semantics; last-member → default 1:1 edge cases
- User-facing copy: **Linked Set** (never “bundle” / “Collection” for this concept)

## Out of scope (do not build)

- Measured SVG thread / `SetDrilldown` AggregateNode geometry from v0 (**ban for Phase 3 v1**; superseded by `[PLAN_PHASE_6_2_LINKED_SET_DATA_TREE.md](./PLAN_PHASE_6_2_LINKED_SET_DATA_TREE.md)`)
- Hero unfold / packaging inspect / Relay View set-wide rollup (**Phase 6**)
- Schedule rail production data / `armed` (**Phase 4**)
- Extension sticky toasts (**Phase 5**)
- Collections UX changes (profile curation stays separate)
- Auto-merge from bundle-suggestions as an exit requirement (optional later; link flow is explicit multi-select)
- Porting the entire `.tmp/social-media-post-creator-8/app/studio/page.tsx` monolith
- Inventing a second platform icon set or a new `LinkedSet` Prisma table

---

## Dependencies

| Dependency | Role |
| ---------- | ---- |
| Phase 2 presence cards | Grid already presence-first; Phase 3 adds a second card type + link chrome |
| Phase 0 chip kit | `PresentChip`, `GhostChip`, `CrosspostChipRow`, `PRESENCE_DESTINATIONS` |
| `[creative-work-bundling-service.ts](../../src/analytics/creative-work-bundling-service.ts)` | Reuse `confirmMergeCreativeWorkBundle` / `splitCreativeWorkMember` transaction patterns |
| `[CREATIVE_WORK_SCHEMA.md](../analytics/CREATIVE_WORK_SCHEMA.md)` / `[SUGGESTED_BUNDLING.md](../analytics/SUGGESTED_BUNDLING.md)` | Persist via Work/Bundle — do not invent tables |
| `GET .../performance/works/:creative_work_id` | Set aggregates (`fetchPerformanceWorkBundle`) |
| Phase 2 presence helpers | Union present/missing across set members for mosaic card rings |

**Independent of:** Phase 4 rail, Phase 5 extension.

**Gap vs today:** Confirm is pairwise only (`source_post_id` → `target_creative_work_id`). Phase 3 adds bulk `link` that creates or targets one work and moves N members in one transaction.

---

## Data contract

### Persistence (no new LinkedSet table)

| Concept | Storage |
| ------- | ------- |
| Linked Set | `CreativeWork` with `is_default_bundle = false` and `member_count ≥ 2` |
| Member | `CreativeWorkMember` (`post_id` unique → one work max) |
| Cover | Member with `sort_order === 0` after link (reorder on confirm); **no** `coverPostId` column |
| Page / variant label | Optional `CreativeWorkMember.member_label` (new nullable string) |
| Role | Existing `variant_role`: `full` \| `teaser` \| `promo` \| `repost` \| `standalone` |

### Gallery enrichment (owner library list)

Append to each gallery row (or once per `post_id` group — prefer post-level fields mirrored on each media row for that post):

```ts
creative_work_id?: string;
is_default_bundle?: boolean;
creative_work_member_count?: number;
member_label?: string | null;
variant_role?: string | null;
```

Still keep Phase 2 `distribution_summary` for per-post presence.

### Grid model

```ts
type ActivePostsGridCard =
  | { kind: "post"; post_id: string; /* Phase 2 presence card props */ }
  | {
      kind: "linked_set";
      creative_work_id: string;
      title: string;
      cover_post_id: string; // sort_order === 0
      member_count: number;
      members: Array<{
        post_id: string;
        member_label: string | null;
        variant_role: string;
        thumb_src: string | null;
        present: Array<{ destination: string; external_url: string | null }>;
        missing: string[];
      }>;
      /** Union of member presents / product-set missing for set-level chip row */
      present: Array<{ destination: string; external_url: string | null }>;
      missing: string[];
    };
```

**Collapse rule:** If `!is_default_bundle && creative_work_member_count >= 2`, render one `linked_set` card for that `creative_work_id` (cover thumb + peek edges). Default 1:1 bundles stay as normal presence post cards.

**Carousel rule:** `PostGalleryGroup.items.length > 1` is still a **post** card (multi-asset), never a Linked Set.

### Bulk link API (new)

```http
POST /api/v1/creator/analytics/creative-works/link
```

```ts
// Request
{
  title?: string;
  members: Array<{
    post_id: string;
    variant_role?: "full" | "teaser" | "promo" | "repost" | "standalone";
    member_label?: string | null;
    is_cover?: boolean; // exactly one preferred; default first full / first member
  }>;
}

// Response
{
  creative_work_id: string;
  title: string;
  member_count: number;
  members: Array<{
    post_id: string;
    variant_role: string;
    member_label: string | null;
    sort_order: number;
  }>;
}
```

**Server behavior (transaction):**

1. Require ≥2 distinct `post_id`s owned by creator.
2. Create new `CreativeWork` (`is_default_bundle = false`, title from body or cover post title) **or** document a later “link into existing set” path — v1: always create new work from selected posts.
3. Move each `CreativeWorkMember` onto the new work; set roles/labels; cover → `sort_order = 0`, others `1..n-1`.
4. Delete empty source default works (same cleanup as `confirmMergeCreativeWorkBundle`).
5. Metrics remain at `postId + destination` grain; set totals are read-time only.

### Unlink

Reuse:

```http
POST /api/v1/creator/analytics/creative-works/members/:post_id/split
```

Body optional `{ title? }`. If previous work drops to one member, mark that work `is_default_bundle = true` (existing split behavior). If work becomes empty, delete it.

### Set aggregates

```ts
fetchPerformanceWorkBundle(creative_work_id, { range?: string })
```

Use `totals` / `total_reach` / `variants[]` for set summary bars and per-member reach. Do **not** invent a metrics table.

### Presence on set card

- Per member: Phase 2 `summaryToPresence(distribution_summary)`.
- Set-level chip row: union of member **present** destinations (prefer URL from any member); **missing** = product destinations not in that union.
- Ghost click → Autopost using cover post’s media ids (or `suggested_source_post_id` if work gaps already available — optional enhancement, not blocking).

### Confirm sheet copy (required)

One-line clarifier (user-facing):

> Linking groups these posts' analytics together. It won't change how they look on Patreon or your profile — that's what Collections are for.

---

## File touch list

| Path | Action |
| ---- | ------ |
| `[prisma/schema.prisma](../../prisma/schema.prisma)` | **Edit** — `CreativeWorkMember.memberLabel String?` |
| Prisma migration | **Create** — add `member_label` column |
| `[src/analytics/creative-work-bundling-service.ts](../../src/analytics/creative-work-bundling-service.ts)` | **Edit** — `linkCreativeWorkMembers` (bulk) reusing merge cleanup |
| `[src/server.ts](../../src/server.ts)` | **Edit** — register `POST .../creative-works/link`; gallery enrichment |
| `[src/gallery/types.ts](../../src/gallery/types.ts)` + gallery query / list path | **Edit** — attach work membership fields on owner list |
| `[web/lib/relay-api.ts](../../web/lib/relay-api.ts)` | **Edit** — gallery types; `linkCreativeWorkPosts` / split client helpers |
| `[web/lib/gallery-group.ts](../../web/lib/gallery-group.ts)` | **Edit** — extend beyond `PostGalleryGroup` to mixed grid cards **or** add sibling helper |
| `web/lib/active-post-linked-sets.ts` (new, optional) | **Create** — pure collapse + presence-union helpers |
| `web/app/components/studio/LinkConfirmSheet.tsx` (new) | **Create** — confirm UI (roles, labels, cover) |
| `web/app/components/studio/LinkedSetCard.tsx` (new) | **Create** — mosaic card + Linked·N + chip row |
| `web/app/components/studio/LinkedSetSummaryPanel.tsx` (new) | **Create** — simplified filmstrip + aggregates + unlink |
| `[web/app/components/GalleryGrid.tsx](../../web/app/components/GalleryGrid.tsx)` | **Edit** — render post vs set cards |
| `[web/app/components/BulkActionBar.tsx](../../web/app/components/BulkActionBar.tsx)` | **Edit** — “Link posts” when ≥2 **post** cards selected (not mixing sets) |
| `[web/app/studio/GalleryView.tsx](../../web/app/studio/GalleryView.tsx)` | **Edit** — selection → sheet → link; open set summary; refetch after link/unlink |
| `[web/app/components/distribution/platform-presence-chips.tsx](../../web/app/components/distribution/platform-presence-chips.tsx)` | **Reuse only** |
| `tests/creative-work-bundling-service.test.ts` (extend) | **Edit** — bulk link + cover sort + empty-work cleanup |
| `tests/creator-analytics-api-bundle.test.ts` (extend) | **Edit** — auth + link route smoke |


**Do not edit:** schedule-rail Drop Assets (Phase 1/4), Autopost composer internals, extension, Insights Action Hub, visitor/patron gallery redesign.

---

## Ordered todos (builder)

Each todo is independently verifiable.

1. **Schema `memberLabel`** — Add nullable `memberLabel` / `member_label` on `CreativeWorkMember`; migrate; regenerate client.
2. **Bulk link service + HTTP** — Implement transactional `link` (≥2 posts → new non-default work; cover `sort_order = 0`; delete empty defaults). Unit tests for happy path, &lt;2 posts rejection, cross-creator rejection, cover defaulting.
3. **Gallery enrichment** — Owner `GET /api/v1/gallery/items` attaches `creative_work_id`, `is_default_bundle`, `creative_work_member_count` (and label/role when cheap). Fixture/test that multi-member non-default works surface counts ≥ 2.
4. **Client types + helpers** — `relay-api.ts`: wire fields, `linkCreativeWorkPosts`, split helper if missing. Optional pure `collapsePostsToGridCards` + presence union util with small tests.
5. **Grid grouping** — Active Posts renders one `LinkedSetCard` per linked work; default 1:1 and carousels stay post cards. Selection keys remain stable for unlinked posts.
6. **Link flow UI** — ≥2 selected post cards → “Link posts” → `LinkConfirmSheet` (role dropdowns, editable labels, cover radio defaulting to first `full` / first selected, Collection clarifier). Cancel clears nothing destructive; confirm calls link API then refetch/clears selection.
7. **`LinkedSetCard` UI** — Mosaic/stacked cover thumb, Linked·N badge, title, presence chip union, selection behavior that does not select individual members unless product already requires it. Ghost → Autopost via cover media; Present → open URL when known.
8. **Simplified set summary** — Open set card → panel/sheet with filmstrip (label + role + reach), simple reach comparison (bars or ranked list), unlink on a member. Member click → existing post inspect/focus path (not Phase 6 hero). **No SVG thread.**
9. **Unlink edge cases** — Split restores a post card; last remaining member collapses set card back to a normal post card (`is_default_bundle` true). Empty work deleted.
10. **Verify** — Run checklist below on seeded comic (5 pages) and A/B teaser+full fixtures; confirm performance totals match work drilldown read for the same `creative_work_id`.

---

## Verify checklist

- Link ≥2 posts → one mosaic card; refresh still shows the set
- Set summary member count and reach totals match `fetchPerformanceWorkBundle` for that work
- Multi-asset carousel post is still a single post card (amber/carousel affordance), not a Linked Set
- Collection clarifier appears on confirm sheet; no “bundle” user copy on new UI
- Solid/ghost rings on set card use shared chip kit; ghost opens Autopost; solid opens URL when present
- Unlink one member restores that post as its own card; unlinking down to one member dissolves the set card
- Multi-select + existing BulkActionBar actions still work for non-link flows
- Schedule rail + Drop Assets still visible/functional on `/studio`
- No import of v0 `studio/page.tsx` monolith components
- No measured SVG connectors / `AggregateNode` / radial set thread

---

## Do-not-do list

- Do not create a `LinkedSet` / `PackagingInstance` table — extend `CreativeWork` / `CreativeWorkMember` only
- Do not port `SetDrilldown` SVG thread, `HeroUnfold`, or `RadialPlatformCard` from the v0 zip
- Do not merge carousel (multi-media one post) and Linked Set into one card type
- Do not use “Collection” language for analytics grouping
- Do not require Phase 6 hero / instances Relay View to call Phase 3 complete
- Do not treat toast-only “Linked!” stubs as done — persistence + refresh is required
- Do not invent a third chip style or a second SVG icon set
- Do not silently auto-merge from bundle suggestions as the primary link path

---

## Reference assets (visual / patterns only)

- v0 link flow + mosaic card: `.tmp/social-media-post-creator-8/app/studio/page.tsx` — `LinkConfirmSheet`, `handleLinkConfirm`, `LinkedSetCard`, `LinkedSet` types (**cite / port patterns, do not import monolith**)
- Product naming + confirm copy: `[STUDIO_HERO_UNFOLD_V0_PROMPT.md](../analytics/STUDIO_HERO_UNFOLD_V0_PROMPT.md)` Round 2 §§2–4 (simplify drilldown: filmstrip + reach comparison; drop SVG thread)
- Packaging / aggregates: `[STUDIO_PACKAGING_DATA.md](../analytics/STUDIO_PACKAGING_DATA.md)`
- Merge/split semantics: `[SUGGESTED_BUNDLING.md](../analytics/SUGGESTED_BUNDLING.md)`
- Phase 2 presence contract: `[PLAN_PHASE_2_ACTIVE_POSTS_GRID.md](./PLAN_PHASE_2_ACTIVE_POSTS_GRID.md)`
