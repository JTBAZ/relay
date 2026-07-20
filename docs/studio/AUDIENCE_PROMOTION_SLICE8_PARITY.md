# Audience & Promotion — Slice 8 Batch 1 parity + deletion gates

@see `docs/studio/AUDIENCE_PROMOTION_CONVERSION.md` §6  
@see plan Slice 8 build contract

**Batch 1 scope:** entry map + gate evidence + Power/Bulk gap list.  
**No file deletion in this batch.** Deletes require G7–G10 closed (G10 = human).

---

## 1. Entry map (before → after)

| Legacy entry / capability | Before | After / replacement | Status |
|---------------------------|--------|---------------------|--------|
| Open packaging Hero | Grid → Hero overview | Same | Retained |
| Access / audience workspace | More → Post settings (legacy) → Inspect/PostBatch | Access tray → `audience_promotion` → `AudiencePromotionPanel` | Replaced (G9) |
| Legacy escape | Hero More → “Post settings (legacy)” → `openPostSettingsForItem` | Removed — Slice 8.3 / G9 | Deleted |
| View-as / mock audiences | `FALLBACK_AUDIENCES` in `post-audience-preview.tsx` | `AudienceSimulatorSection` (server personas) | Replaced in A&P |
| Preview style / CTA persist | Local-only Save preference | `tier_preview_settings` via presentation PATCH | Replaced in A&P |
| Choose preview | Inert | Delete target | N/A |
| Relay visibility edit | Power Placement / Bulk / A&P checklist | A&P + Power + Bulk | Outside legacy |
| Patreon minimum tier | Inspect sidebar editor | `MinimumTierAccessEditor` in A&P | Replaced |
| Description edit | `InspectPostDescription` in legacy modals | Spec: Power/Bulk | **GAP (Batch 2)** |
| Add media (upload+commit) | `InspectAddMediaControl` | Spec: Power | **GAP (Batch 2)** |
| Tags add | Power / Bulk / PostBatch details | Power + Bulk (≥2) | Partial |
| Tags remove (single-post) | PostBatch details | Power/Bulk | **GAP (Batch 2)** |
| Collections mutate (single-post) | PostBatch details | Bulk (≥2) / Power read-only | **GAP (Batch 2)** |
| Comments / Smart Tag mock | Placeholder / mock | Delete targets | Not content gaps |
| Multi-asset browse | PostBatch carousel | Grid tile carousel / strip | Retained |
| Export retry (multi-asset) | PostBatchModal only | Grid single-asset only | **GAP (Batch 2 / G8)** |
| Offers / promo / tracked link / QR | — | A&P Promotion Studio | New (Slices 4–7) |
| Packaging stats | Hero overview | Stay on Hero overview | Locked |

```text
Grid → HeroInspectOverlay (overview | audience_promotion)
  Access → AudiencePromotionPanel
Power → media / placement / engagement
BulkActionBar → selectedPostIds.length >= 2
```

---

## 2. Deletion gates G1–G10

| Gate | Status | Evidence |
|------|--------|----------|
| G1 | **PASS** | `tests/audience-promotion/hero-audience-promotion-shell.test.tsx` |
| G2 | **PASS** | `tests/audience-promotion/access-checklist.test.tsx` + ladder/adapter unit tests |
| G3 | **PASS** | `AudienceSimulatorSection` → `patchPostPresentation`; `tests/tier-preview-settings.test.ts`, `audience-simulation*.test.ts` |
| G4 | **PASS** | `tests/marketing-offers.test.ts`; Discount/Offer panels |
| G5 | **PASS** | Slice 9 locked-viewer overlay + tracked CTA; `tests/marketing/effective-marketing-offer.test.ts` + audience-promotion + offer-redirect; Path L in `LOCKED_VIEWER_PROMOTION_WIRING.md` (2026-07-15) |
| G6 | **PASS** | `tests/offer-redirect-service.test.ts`; `web/lib/offer-tracked-link-qr.test.ts`; `OfferTrackedLinkPanel` |
| G7 | **PASS (Batch 2)** | Power Placement: description + collections add/create + tag remove; Power Media: upload+commit via `InspectAddMediaControl` |
| G8 | **PASS (Batch 2)** | Grid focused-asset export retry (multi-asset carousel) in `GalleryGridTile` — PostBatch no longer required |
| G9 | **PASS (Batch 3 — 2026-07-15)** | `rg` zero hits: `InspectModal`, `PostBatchModal`, `FALLBACK_AUDIENCES` in `web/` runtime; shells deleted; `legacy-characterization.test.ts` + `hero-audience-promotion-shell.test.tsx` assert absence |
| G10 | **PASS (human signoff — 2026-07-15)** | Path L golden path (`LOCKED_VIEWER_PROMOTION_WIRING.md`), not Path M |

---

## 3. Power/Bulk parity gaps (G7) — Batch 2 targets

1. **Description edit** — port `InspectPostDescription` (or equivalent) into Power Placement.
2. **Add media upload+commit** — wire Power media path to `InspectAddMediaControl` / relay native upload commit (not stage-only).
3. **Single-post tag remove** — Power TagEditor remove affordance (Bulk already removes for ≥2).
4. **Single-post collections mutate** — Power Placement add/create (or allow Bulk at count===1).

Not G7 blockers: mock audiences, inert Choose preview, placeholder Comments, mock Smart Tag.

---

## 4. Multi-asset path (G8)

| Need | Outside legacy? | Notes |
|------|-----------------|-------|
| Browse / cycle assets | Yes | `GalleryGridTile`, `PostBatchGridCell`, `PostAssetCarouselStrip` |
| Export retry | Partial | Single-asset on `GalleryGridTile`; multi-asset focused retry only in `PostBatchModal` |

**Batch 2 done:** `GalleryGridTile` export retry uses the focused carousel asset (`item.media_id`) for any post size — PostBatch not required for G8.

---

## 5. Batch sequencing

| Batch | Work | Delete? |
|-------|------|---------|
| **8.1** | This doc + gate map | No |
| **8.2** | Close G7 gaps + G8 grid retry; keep legacy More escape | No |
| **8.3** | Remove legacy entry + delete shells after G9 `rg` clean + **G10 human signoff** | Yes — **done** |

**8.3 complete:** G5 + G10 PASS; G9 closed via zero-import `rg` + characterization flip (2026-07-15).
