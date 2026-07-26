# Phase 6.3 — Slim selection bar + click-to-unfold

**Status:** Implemented  
**Master roadmap:** `[PLAN_STUDIO_RENOVATION_MASTER.md](./PLAN_STUDIO_RENOVATION_MASTER.md)`  
**Related:** Phase 6/6.1 hero — `[PLAN_PHASE_6_HERO_PACKAGING_INSPECT.md](./PLAN_PHASE_6_HERO_PACKAGING_INSPECT.md)`, `[PLAN_PHASE_6_1_HERO_VISUAL.md](./PLAN_PHASE_6_1_HERO_VISUAL.md)`; Linked Set tree — `[PLAN_PHASE_6_2_LINKED_SET_DATA_TREE.md](./PLAN_PHASE_6_2_LINKED_SET_DATA_TREE.md)`

---

## Goal

Match the 3010 click-to-unfold grammar: **card body opens** packaging (hero / Linked Set tree); **checkbox selects**; the bottom dock is a **multi-select-only** toolkit (≥2 posts). Single-post inspect, cross-post, access, and delete live on card/chip/hero — not a parallel Studio footer.

---

## Interaction grammar

| Affordance | Behavior |
| ---------- | -------- |
| Card body / Enter (Active Post) | Open packaging hero |
| Card body / Enter (Linked Set) | Open Linked Set data-tree |
| Checkbox / Space | Toggle selection |
| Present chip | Open external URL |
| Ghost chip | Cross-post / DistributionSheet (or Autopost as today) |
| Selection dock | Mount only when **≥2 distinct `post_id`s**; **v0 `LinkPostsFloatingBar` chrome** — fixed bottom-center viewport float; text “N posts selected”; primary Link CTA; hide while hero / Linked Set overlays open |
| Slim bar actions | Count + clear, Link (primary), Tags, Visibility, Collection, Delete (multi) |
| Hero Access | Post settings (audience) |
| Hero More → Delete | Relay-native single delete → close hero, clear that post’s selection, refresh |
| Schedule rail | Unchanged |

**Removed from dock:** Cross-post, Details, Audience, Export, single-post permission billboard.

---

## Key files

- `[ActivePostPresenceCard.tsx](../../web/app/components/ActivePostPresenceCard.tsx)` — `onOpen` vs `onToggleSelect`
- `[LinkedSetCard.tsx](../../web/app/components/studio/LinkedSetCard.tsx)` — body → `onOpenSummary`; checkbox select
- `[BulkActionBar.tsx](../../web/app/components/BulkActionBar.tsx)` — slim multi-post toolkit
- `[GalleryView.tsx](../../web/app/studio/GalleryView.tsx)` — gate `selectedPostIds.length >= 2`; hero delete wiring
- `[HeroActionBar.tsx](../../web/app/components/studio/HeroActionBar.tsx)` / `[HeroInspectOverlay.tsx](../../web/app/components/studio/HeroInspectOverlay.tsx)` — More → Delete post

---

## Out of scope

- Phase 7 virtualization / shell density
- New Collection UX, reorder APIs, monetization tray
- Moving Tags/Visibility into hero
- Export rehome to Power (removed from bar only)
- Changing Scheduler rail
