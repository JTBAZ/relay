# Phase 6.4 — Active Posts / Linked Set card chrome (v0)

**Status:** Implemented (visual pass)  
**Master:** `[PLAN_STUDIO_RENOVATION_MASTER.md](./PLAN_STUDIO_RENOVATION_MASTER.md)`  
**Reference:** v0 `PostGridCard` / `LinkedSetCard` in `.tmp/social-media-post-creator-8/app/studio/page.tsx` (3010)

## Goal

Strangler-restyle grid cards to match v0 tile geometry while keeping live click / checkbox / chip grammar.

## Frozen visuals

| Token | Decision |
| ----- | -------- |
| Aspect | `3 / 4` |
| Radius | `rounded-xl` |
| Grid | `gap-3`; dense ≈ v0 compact cols; normal ≈ v0 normal cols |
| Presence card | Full-bleed media + bottom gradient; chips above title; title + audience overlay |
| Multi-media | Amber layers badge + hover slide cycle + pager dots |
| Selection | Circular mint checkbox (post: top-left; set: top-right) |
| Linked Set | Mosaic (~72%) + label area; Linked · N badge top-left |

## Live behaviors kept

- Body / Enter → hero or Linked Set tree  
- Checkbox / Space → select  
- Present chip → open URL; ghost → DistributionSheet / Autopost  
