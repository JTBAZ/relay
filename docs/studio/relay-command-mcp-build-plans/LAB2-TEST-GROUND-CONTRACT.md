# Studio Lab 2 — Command Layer test ground contract

**Status:** Frozen for Phases 2–4  
**Program hub:** [`00-README.md`](00-README.md)  
**Product:** [`PRODUCT-CONTRACT.md`](PRODUCT-CONTRACT.md)  
**Acceptance IDs:** [`../../qa/RELAY_COMMAND_DREAM_FLOW_ACCEPTANCE.md`](../../qa/RELAY_COMMAND_DREAM_FLOW_ACCEPTANCE.md)  
**Owning phase:** [`02-PHASE-2-DETERMINISTIC-PLAYGROUND.md`](02-PHASE-2-DETERMINISTIC-PLAYGROUND.md)

Lab 2 is the **required human playground** for Command Layer. Production Library (`web/app/studio/GalleryView.tsx`) is not the P2/P3 host. The corpus is **Postgres-backed**, consumed through real Gallery / Collection / Schedule APIs. Static thumbs in existing `web/app/components/studio-lab2/fixtures.ts` are **not** the corpus.

## Why Lab 2

`/studio/lab2` already mounts a live Active Posts grid and Schedule Rail (`web/app/studio/lab2/lab2-page-client.tsx`, `web/app/components/studio-lab2/StudioLab2Chassis.tsx`, `Lab2ActivePostsLive.tsx`). Command Layer reuses that route so humans watch **physical** organization: labels, Collection stacks, order, rail slices. P2 replaces Lab 2’s forked fetch-only subset with a **shared Studio content projection** over the same `post_id`s; it does not freeze final chrome.

## Dedicated creator (stable IDs)

Do **not** bind this corpus to a personal Goals Lab email or a pilot-ux walkthrough account.

| Field | Frozen value |
|---|---|
| `relayCreatorId` | `rcx_studio_lab2` |
| Account key | `studio_lab2` |
| Email | `studio-lab2@relay.test` |
| Display name | Studio Lab 2 |
| Campaign id | `sl2_campaign` |
| Fixture label | `studio-lab2-corpus-v1` |
| Import / seed label | `studio-lab2-corpus-v1` |
| Synthetic metrics label | `studio-lab2-corpus-v1` |

Password follows the pilot-ux pattern: env `RELAY_STUDIO_LAB2_DEV_PASSWORD` with a documented local default in the seed spec *(future)*, never committed as a production secret.

## Environment and refusal

Seed apply / cleanup **must**:

1. Require `RELAY_ALLOW_STUDIO_LAB2_SEED=1`.
2. Refuse `NODE_ENV=production` even if the allow flag is set (no override for production).
3. Operate only against the dedicated creator; never invent or overwrite posts for other `creator_id`s.
4. Be idempotent: second `apply` does not duplicate posts, media, tags, or metric rows.
5. Cleanup only rows labeled `studio-lab2-corpus-v1` (and the dedicated creator’s command-created collections / rail events from this program). Leave other tenants intact.

Reuse patterns from existing:

- `tests/fixtures/pilot-ux-seed.json` + `src/pilot-ux/pilot-ux-seed-spec.ts` (declarative JSON, stable ids)
- `src/goal-cycle/planner/goals-lab-synthetic-metrics.ts` + `scripts/seed-goals-lab-synthetic-metrics.mjs` (labeled synthetic metrics, production refusal)
- `scripts/seed-pilot-multi-media-qa.mjs` (ingest batch + cleanup)

Do **not** write Goals Lab metrics into this creator. Do **not** reuse `GOALS_LAB_SYNTHETIC_LABEL`.

## Future vs existing files

**Existing (read / consume, do not treat as corpus):**

- `web/app/studio/lab2/*`
- `web/app/components/studio-lab2/StudioLab2Chassis.tsx`
- `web/app/components/studio-lab2/Lab2ActivePostsLive.tsx`
- `web/app/components/studio-lab2/fixtures.ts` (leave unused as data source)
- `src/gallery/parse-query.ts` (`limit` default 50, **max 100** — corpus must exceed one page)
- Gallery list/filter in `src/gallery/query.ts`, collection APIs, schedule-rail month window

**Future (P2 unless noted):**

- `tests/fixtures/studio-lab2-corpus.json`
- `src/studio/lab2/corpus-spec.ts`
- `src/studio/lab2/seed-studio-lab2.ts`
- `scripts/seed-studio-lab2.mjs`
- `scripts/eval-studio-lab2-corpus.mjs`
- `src/studio/projection/studio-content-projection.ts`
- Lab 2 lens switcher + Collection stack chrome (Lab 2 only)
- `docs/qa/RELAY_COMMAND_P2_VISUAL_EVIDENCE.md` (filled at HUMAN-UX-VISUAL)

## Corpus JSON shape *(future)*

Top-level keys (names frozen):

```json
{
  "version": 1,
  "label": "studio-lab2-corpus-v1",
  "fixture_hash": "<sha256 of canonicalized JSON excluding fixture_hash>",
  "creator": { "relayCreatorId": "rcx_studio_lab2", "accountKey": "studio_lab2", "email": "studio-lab2@relay.test" },
  "tags": [],
  "tiers": [],
  "posts": [],
  "distribution": [],
  "metrics": [],
  "eval": {}
}
```

Every post has a **stable** `post_id`, **fixed** `published_at` (ISO-8601 UTC), `source` (`PATREON` | `RELAY`), visibility / access, tag ids, optional `series_id` + `title`, and media stubs. Timestamps must not be `now()` at seed time.

`fixture_hash` is computed over a canonical JSON serialization with keys sorted and `fixture_hash` omitted. Eval fails if the on-disk hash disagrees.

## Composition table (target 112 published posts)

Counts are the P2 authoring contract. Implementers may ±8 posts only if `eval.min_published_posts >= 100` still holds and every eval ID below still exists. Total **must** be **greater than 100** so `GET /api/v1/gallery/items` with `limit` max 100 exercises a second page / Load more (RC-DF-01).

| Bucket | Count | `post_id` prefix | Purpose |
|---|---:|---|---|
| Hero Academy comic | 21 | `sl2_ha_` | Numbered series, mixed titles, gap, duplicate, already-on-X subset |
| Starlight Harbor | 12 | `sl2_sh_` | Clean `Part N` sequence (control series) |
| Night Market sketches | 10 | `sl2_nm_` | Loose numbering + `sketch` tag |
| Watercolor landscapes | 18 | `sl2_wc_` | Exact-tag organize; `watercolor` + `landscape` |
| Carousel WIPs | 8 | `sl2_car_` | Multi-media posts; `wip` tag |
| Gated studio shots | 8 | `sl2_gt_` | Public cover + gated original; RC-DF-11 |
| Relay-native sketches | 6 | `sl2_rn_` | `source=RELAY`; RC-DF-10 native append |
| Academy Studies | 4 | `sl2_as_` | Second “Academy” token for ambiguity |
| Mixed standalone | 25 | `sl2_st_` | Photos / writing / video stubs; fill to 112 |
| **Total published posts** | **112** | | |

Command-created **Hero Academy and watercolor collections start empty** at baseline. Seed does **not** pre-build those. Lab 2 home does include one visual default stack, **Photo Studies** (`sl2_col_photo_studies`): five similarly named image posts `sl2_st_01`–`sl2_st_05` (`Standalone photo 1`–`5`, `media_type=photo`). Deterministic P2 scenarios still create the Hero Academy / watercolor collections.

### Hero Academy title variants (required)

| `post_id` | Title (exact enough for parse tests) | Parse |
|---|---|---|
| `sl2_ha_cover` | `Hero Academy Cover` | cover; sorts before page 1 |
| `sl2_ha_p01` | `Hero Academy Page 1` | 1 |
| `sl2_ha_p02` | `Hero Academy Page 2` | 2 |
| `sl2_ha_p03` | `Hero Academy Part 3` | 3 |
| `sl2_ha_p04` | `Hero Academy Pg. 4` | 4 |
| `sl2_ha_p05` | `Hero Academy P. 5` | 5 |
| `sl2_ha_p06` | `Hero Academy page 06` | 6 (zero-pad) |
| `sl2_ha_p07` … `sl2_ha_p16` | `Hero Academy Page N` | 7–16 |
| *(no `sl2_ha_p17`)* | — | **gap at 17** |
| `sl2_ha_p18` … `sl2_ha_p20` | `Hero Academy Page N` | 18–20 |
| `sl2_ha_p08_dup` | `Hero Academy Page 8` | **duplicate 8** (second post, later `published_at`) |

Pages 1–6 (`sl2_ha_p01`–`sl2_ha_p06`) have **completed X distribution attempts** in the `distribution` block. Later pages do not.

At least one Hero Academy post is `source=PATREON` (imported revise path). At least one `sl2_rn_*` post is `source=RELAY`.

### Access mix

- Public: watercolor set, most standalones, Hero Academy covers/pages intended for destination drafts.
- Gated: `sl2_gt_*` originals (`access` / tier gate). Each gated post has a **public-safe cover** media id distinct from the original.
- Carousels: mixed public media; no gated originals inside carousels (keeps RC-DF-11 isolated).

### Tags (frozen ids)

| `tag_id` | Label |
|---|---|
| `sl2_tag_watercolor` | watercolor |
| `sl2_tag_comic` | comic |
| `sl2_tag_sketch` | sketch |
| `sl2_tag_wip` | wip |
| `sl2_tag_landscape` | landscape |

Hero Academy posts carry `sl2_tag_comic`. Watercolor landscapes carry `sl2_tag_watercolor` and `sl2_tag_landscape`. Night Market carries `sl2_tag_sketch`. Carousels carry `sl2_tag_wip`.

### Synthetic metrics

Labeled `studio-lab2-corpus-v1`. Patterns (reuse Goals Lab *idea*, new label):

- `timing_cluster` — several watercolor / Hero Academy posts with Tuesday-evening engagement (supports RC-DF-08).
- `ordinary` — majority.
- `weak_promo` — enough that a weekly X plan must **disclose weak evidence** rather than invent precision.
- `forbidden_primary` outliers that must not drive the plan.

Metrics bind to existing corpus `post_id`s after ingest. They never create posts.

## Eval block (frozen keys)

`tests/fixtures/studio-lab2-corpus.json` `eval` must include:

| Key | Contract |
|---|---|
| `min_published_posts` | `>= 100` (author 112) |
| `hero_academy_series_id` | stable series token used by sequence resolve |
| `hero_academy_ordered_ids` | cover, then 1–16, 18–20; **exclude** duplicate until the artist chooses |
| `hero_academy_missing_page` | `17` |
| `hero_academy_duplicate_page` | `8` |
| `hero_academy_duplicate_ids` | `[sl2_ha_p08, sl2_ha_p08_dup]` (exact second id as authored) |
| `watercolor_post_ids` | all 18 `sl2_wc_*` |
| `already_on_x_post_ids` | `sl2_ha_p01`–`sl2_ha_p06` |
| `imported_revise_post_id` | one PATREON Hero Academy id |
| `native_revise_post_id` | one `sl2_rn_*` id |
| `gated_original_post_ids` | all `sl2_gt_*` |
| `academy_ambiguous_labels` | `["Hero Academy", "Academy Studies"]` |
| `pagination_requires_second_page` | `true` |

`scripts/eval-studio-lab2-corpus.mjs` *(future)* exits 1 if any key fails against live Postgres for `rcx_studio_lab2`.

## CLI lifecycle *(future npm scripts)*

| Command | Behavior |
|---|---|
| `npm run seed:studio-lab2 -- apply` | Upsert creator, tags, posts, media stubs, distribution attempts, metrics. Idempotent. |
| `npm run seed:studio-lab2 -- status` | JSON: creator_id, post_count, fixture_hash, metric_rows, last_apply_at |
| `npm run seed:studio-lab2 -- cleanup` | Delete labeled corpus + command-created Lab 2 collections/rail events for this creator only |
| `npm run eval:studio-lab2-corpus` | Eval block vs live DB |

Reset recipe for every human gate:

```bash
# flags: RELAY_ALLOW_STUDIO_LAB2_SEED=1, NODE_ENV≠production
npm run seed:studio-lab2 -- cleanup
npm run seed:studio-lab2 -- apply
npm run eval:studio-lab2-corpus
npm run dev:stack:restart
```

Then sign in at `/login/studio-lab2` (local Lab 2 studio, not personal Relay / Supabase sign-in) and open `/studio/lab2`.

## Shared projection and lenses

P2 introduces `StudioContentProjection` *(future)* so chronological, Collections, and Posting Schedule lenses read the **same** `post_id`s:

| Lens | Source | Visible success |
|---|---|---|
| Chronological | Gallery list (`published_at` desc or documented sort) | ≥100 posts; Load more / cursor for the remainder |
| Collections | `LibraryCollection` membership + `sort_order` | Stacks + labels; baseline **Photo Studies** (5 image posts); Hero Academy / watercolor empty until command apply |
| Posting schedule | Schedule-rail month window + command-created drafts | Slices appear after release-plan apply; rail column stays mounted. **Current-month rail is not enough to inspect a weekly plan** — see [`UI-DEBT.md`](UI-DEBT.md) RC-UI-02 |

Lenses are **capacity**. Chrome may be a segmented control, toggle, or stacked panels. Do **not** persist a database preset model in P2. Do **not** treat CreativeWork linked-set cards as Collection stacks (carousel ≠ linked set; collection stacks are a third presentation).

`Lab2ActivePostsLive.tsx` must consume the projection (or a thin wrapper). It must not keep a private data model that the command engine cannot update.

## Visual acceptance matrix

Database assertions alone **fail** P2 UI todos. Each row needs a screenshot or browser note in `docs/qa/RELAY_COMMAND_P2_VISUAL_EVIDENCE.md` *(future, at gate)*.

| ID | Action (deterministic, no LLM) | Must see | Must not |
|---|---|---|---|
| V-01 | Baseline after seed | Chronological grid populated; Load more or second page; no Hero Academy collection | Thumbs from `fixtures.ts` only; empty “demo” tiles substituting for posts |
| V-02 | Apply watercolor collection newest-first | Named collection label; stack of watercolor posts; order newest at the documented end | Tag-only change with no grouping |
| V-03 | Apply Hero Academy cover-first numeric order | Stack labeled Hero Academy; Cover then 1…16, 18…20; gap/duplicate surfaced in the ChangeSet or banner | Lexicographic `Page 10` before `Page 2`; invented page 17 |
| V-04 | Hard refresh | Same stacks and order | Reset to ungrouped baseline |
| V-05 | Weekly X plan skipping already-on-X | Rail slices for pages **not** in `already_on_x_post_ids`; skipped ids listed | Completed distribution attempts; `publishState` flipped to published. Month-ahead inspectability is [`UI-DEBT.md`](UI-DEBT.md) RC-UI-02, not a V-05 fail |
| V-06 | Undo last ChangeSet | Collections and rail restore to pre-apply; source posts remain | Deleted ingest posts |
| V-07 | Switch lenses | Same `post_id` in chrono and in its collection stack; schedule lens lists new slices | Unmounted rail; second inventory of copied posts |
| V-08 | Narrow Lab 2 (~1280 with rail; note ~390 for P4) | Grid usable with rail mounted | Horizontal clip that hides Apply/Undo |

## Human test scripts

### Script A — HUMAN-UX-VISUAL (end of P2)

Builder leaves the stack running and this recipe. Human does **not** need Cursor.

1. Reset (cleanup → apply → eval → restart) and log in as Lab 2.
2. Open `/studio/lab2`. Confirm chronological density and pagination (RC-DF-01).
3. Run the documented deterministic apply for watercolor (HTTP preview/apply or seed-scenario CLI named in the P2 Delta Out). Confirm V-02.
4. Apply Hero Academy organize. Confirm V-03, including gap 17 and duplicate 8 called out — **no invented page**.
5. Switch to Collections lens. Confirm stacks, not only a sidebar filter.
6. Apply weekly X plan. Confirm V-05 on the rail.
7. Hard refresh (RC-DF-17 / V-04).
8. Undo (RC-DF-13 / V-06).
9. Record pass/fail in `RELAY_COMMAND_P2_VISUAL_EVIDENCE.md`. Do not start P3 on a visual fail.

### Script B — HUMAN-UX-NL (end of P3)

Same reset. Use the **plain Lab 2 command harness** (not production chrome).

1. Type a Hero Academy organize+plan sentence (RC-DF-02).
2. If the instruction is exact, **no** clarification. If the tester types only “Academy,” one question with both labels (RC-DF-03).
3. Confirm/apply. Watch the gallery **physically** restack (RC-DF-04).
4. Inspect schedule slices; confirm already-on-X skipped (RC-DF-07).
5. Undo. Record `RELAY_COMMAND_P3_NL_EVIDENCE.md`.

### Script C — HUMAN-UX-JOURNEY (end of P4)

Five-minute path in [`../../qa/RELAY_COMMAND_DREAM_FLOW_ACCEPTANCE.md`](../../qa/RELAY_COMMAND_DREAM_FLOW_ACCEPTANCE.md) **RC-DF-16**. Productized CommandBox on this corpus. Do not mount production `/studio` unless a human explicitly enables Studio UX.

Reset to baseline first (Confirm). Chronological should be selected. Type **exact** eval instructions (no LLM).

1. `Organize Hero Academy into a collection, cover first, in page order.` Preview: gap 17 + duplicate 8, no clarification. Apply. Watch the Hero Academy **stack** (Collections may open).
2. `Plan a weekly X schedule for Hero Academy, skipping pages already posted on X.` Preview: skip pages 1–6 **and** a disclosed metric window (no invented minute). Apply. Rail hint; open **Schedule**, Next into September+ to inspect occupancy.
3. `Organize the watercolor landscapes newest first into a collection.` Apply (the “revise one instruction” step).
4. Hard refresh. Hero Academy + watercolor stacks and rail slices persist (RC-DF-17).
5. **Undo** (button). Last ChangeSet (watercolor) rolls back. Posts remain.
6. Record `docs/qa/RELAY_COMMAND_P4_JOURNEY_EVIDENCE.md`. Optionally resize ~390px: command field and Preview/Apply stay usable; rail stays mounted.

Builder dry-run is **not** this gate. Stop after T04 for the human sitting.

## Accessibility and responsive (P2 minimum)

- Lens control keyboard reachable; visible focus.
- Collection stack labels are text, not color-only.
- Reduced motion: no required celebratory animation to understand order.
- Chronological: collections stay a compact shelf; the Active Posts feed is its own inner window and must show at least four rows on desktop Lab 2 (~1280 with rail).
- P2 may note ~390px failures without blocking HUMAN-UX-VISUAL if desktop Lab 2 with rail is usable. P4 must address the command box on the layout humans will ship.

## Isolation

- Eval and seed never read/write other creators.
- A second session as a different creator must not see `sl2_*` posts (RC-DF-15).
- Cleanup must not delete pilot-ux or Goals Lab rows.

## Baseline vs after-command state

| State | Collections | Rail command slices | Posts |
|---|---|---|---|
| After `apply` seed | None from this program | None from this program | 112 labeled posts + metrics + X history on HA 1–6 |
| After deterministic organize+plan | Hero Academy + watercolor (as applied) | Weekly X drafts for remaining HA pages | Posts unchanged except presentation/native revise scenarios |
| After undo of that ChangeSet | Back to none (for those collections) | Command slices removed | Ingest posts remain |
