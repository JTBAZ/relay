# Locked viewer promotion QA

> Slice 9 manual verification matrix (**Path L**).  
> Automated: `tests/marketing/`, `tests/audience-promotion/`, `tests/offer-redirect-service.test.ts`

## Contract

- Promo is **resolved presentation** on a locked result (`deny` / `locked_preview`).
- Never widens Layer A / never restores export URLs.
- Precedence: exact post/persona offer → matching creator **tier default** → none.
- CTA uses public `/go/:slug` only (no raw Patreon destination in patron JSON).
- Marketing Previewizer / teaser attach / A&P cross-post are **out of scope**.

### Patron-safe DTO

```ts
effective_promo?: {
  headline: string;
  cta_text: string;
  code: string | null;
  percent_off: number | null;
  tracked_url: string | null; // path `/go/:slug` or absolute
  source: "explicit" | "tier_default";
}
```

## Path L — Golden path

| Step | Action | Expected |
|------|--------|----------|
| L1 | Open `/studio/promos` | Hub loads; Pieces / Tier rules / Codes / Preview tabs |
| L1b | Empty pool | Dashed empty window + green **Add Post** under it |
| L1c | Add Post modal | Active posts via `display=post_primary`; Linked Set members listed separately; max 5; **Make Promos** |
| L2 | Save 1–5 posts; reorder; refresh | Cards persist; `promo_piece_id` stable across reorder (rank is display only) |
| L3 | Set Layer A minimum tier on that post (Hero Access) | Gate saved; Layer C visibility honest |
| L4 | Add Discount Code 1 in Codes | Code listed; Patreon Discounts link → `https://www.patreon.com/promotions/discounts` |
| L4b | Add code from Tier Rules with empty library | Draft preserved; return to Rules with new code preselected |
| L5 | Create live Tier X → Code 1 default for unpermissioned | Rule listed with **server-computed** `inherited_piece_count` ≥ 1 only when a current Promo Piece matches that gate |
| L5b | Public / ungated Promo Piece | Shown under unmatched; does not inflate inherited counts |
| L6 | Preview tab: anonymous / below-tier | Locked overlay + status chain; source `tier_default` or `explicit`; **No distribution data yet** until a real metrics service exists |
| L7 | Patron/visitor view as locked | Same overlay; CTA hits `/go/:slug`; export still redacted; **no** owner `promo_piece_id` / rank markers on patron DTOs |
| L8 | Entitled viewer | Full content; **no** `effective_promo` |
| L9 | Post override for anonymous | Source becomes `explicit`; override wins |
| L10 | Clear override | Returns to tier default |
| L11 | Refresh / reopen | Persistence + click attribution on tracked link |

## Hub identity & future work

- Durable Promo Piece identity is `promo_piece_id` (owner-only markers on studio cards). Slot rank is presentation order, not attribution identity.
- Placement / impressions / Patreon conversion ingestion are **not** shipped; Preview performance is unavailable (distinct from zero).
- See [`TRACKED_OFFER_LINKS.md`](../studio/TRACKED_OFFER_LINKS.md) for planned `promo_piece_impression` / `promo_piece_link_clicked` handoff.

## Silo / regression

| Check | Expected |
|-------|----------|
| Autopost Previewizer | Distribution mode still Blur Plug; unchanged |
| A&P Promotion tab | No Create promo preview / teaser / Cross-post |
| Hidden Layer C post | No promo DTO for visitors |

## Pass criteria (Slice 9 / revised G5)

1. Locked personas see discount-backed text + tracked CTA.
2. Allowed / hidden viewers never receive promo leakage.
3. Tier defaults inherit to new/changed gates without re-bulk.
4. No marketing Previewizer entry from Audience & Promotion.
5. `/studio/promos` is the hub for pool + rules + codes.

---

## Verification record (2026-07-15)

### Automated (PASS)

```bash
npx vitest run tests/marketing/effective-marketing-offer.test.ts \
  tests/offer-redirect-service.test.ts \
  tests/audience-promotion/ \
  web/lib/previewizer-session.test.ts
# → 61/61 passed

npx vitest run tests/pilot-permission-architecture.test.ts \
  tests/web/relay-api-audience-access.test.ts \
  web/lib/audience-access-tier-diff.test.ts \
  tests/hero-inspect-data.test.ts
# → 20/20 passed
```

Covered by tests / code evidence:

- Resolver: allow/hidden/missing → no promo; tier_default inheritance; explicit override precedence; inactive override return-to-default; patron-safe DTO keys only (`tests/marketing/effective-marketing-offer.test.ts`).
- `/go/:slug` for offer + tier_default (`tests/offer-redirect-service.test.ts`).
- A&P has no marketing Previewizer / teaser / Cross-post (`tests/audience-promotion/hero-audience-promotion-shell.test.tsx`).
- PreviewizerMode is `standalone` \| `distribution` only (`web/lib/previewizer-session.ts` + characterization).
- Visitor post modal + grid/slide overlays render `LockedPromoOverlay` when `effective_promo` is present (`VisitorGalleryView`, `VisitorBatchSlideMedia`, `PostBatchGridCell`, patron feed carousel).

### Promos hub enhancement verification (2026-07-15)

```bash
npx vitest run tests/web/promos-hub-pieces.test.tsx tests/web/promos-hub-tier-rules.test.tsx \
  tests/web/promos-hub-codes.test.tsx tests/web/promos-hub-preview.test.tsx \
  tests/web/promos-hub-coverage.test.ts tests/creator-promo-slots.test.ts \
  tests/creator-promo-piece-markers.test.ts tests/marketing/promotion-hub-summary.test.ts
# → focused suite PASS (137 tests in VS6-T02 aggregate run)

Browser (Dev Ava / Dev Riley pilot login): empty→Add Post→Make Promos; Linked Set members separate;
reorder preserves identity; Tier Rules inherited count + tracked `/go/:slug`; Codes draft return;
Preview tier_default + entitled no-promo + unavailable performance; patron feed has no `promo_piece` /
`AVA10` owner leakage; `/go/:slug` → 302 Location to Patreon only.
```

### Known unrelated failures (not G5 blockers)

- `tests/pilot-permission-signoff.test.ts` and `tests/pilot-012-permission-guardrails.test.ts` still fail on BulkActionBar missing `{PILOT_PERMISSION_HEADLINE}` — pre-existing Library copy drift, outside Slice 9 promo contract.

### Prune note

- Marketing Previewizer helpers removed from A&P; `PreviewizerMode` no longer includes `marketing`.
- `promo_preview_media_id` column may still exist on `PostPresentation` (dormant); not required to block G5.
