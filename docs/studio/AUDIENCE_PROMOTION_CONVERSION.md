# Audience & Promotion — Conversion Spec (Slice 0)

**Status:** Conversion track complete (2026-07-15). Slices 0–4, 7–9 done; Slices 5–6 marketing Previewizer **superseded**; Slice 8.3 / G9 legacy shells deleted. G1–G10 **PASS**.  
**Plan:** Cursor plan `locked-promos-hub_71348a20` (prior: `audience_promotion_conversion_f9e9363a`)  
**ADR:** [`docs/architecture/adr/004-pilot-three-layer-permissions.md`](../architecture/adr/004-pilot-three-layer-permissions.md)  
**Contracts:** [`web/lib/audience-promotion-contracts.ts`](../../web/lib/audience-promotion-contracts.ts)  
**Characterization:** [`tests/audience-promotion/legacy-characterization.test.ts`](../../tests/audience-promotion/legacy-characterization.test.ts)  
**Shell test:** [`tests/audience-promotion/hero-audience-promotion-shell.test.tsx`](../../tests/audience-promotion/hero-audience-promotion-shell.test.tsx)  
**QA (Slice 9):** [`docs/qa/LOCKED_VIEWER_PROMOTION_WIRING.md`](../qa/LOCKED_VIEWER_PROMOTION_WIRING.md)

---

## Locked product direction (do not re-litigate)

| Decision | Value |
|----------|--------|
| Shell | In-Hero mode `overview \| audience_promotion` — **no** second modal for the workspace |
| A&P layout | Height-capped tabbed Hero right rail (`HERO_H` ≈ Packaging media), **not** a freestanding scrollable sheet — tabs **Access \| Simulator \| Promotion**; only the tab body scrolls |
| Patreon access | Public **or** one minimum required tier; higher tiers implied |
| Relay visibility | Separate Layer C checklist (Hidden / Adult); never writes tier ids |
| Content tools | Description, media, tags, collections stay in Power / Bulk |
| Offers | Creator-level Patreon code library + per-post per-persona overrides; live **tier defaults** for unpermissioned viewers; Relay does **not** create Patreon coupons |
| Promo output | **Discount-backed text overlay + tracked `/go/:slug` CTA** on locked results — not a generated teaser image or cross-post target |
| Hub | Authenticated `/studio/promos` for pool, tier rules, codes, and preview |
| Stats | Packaging / platform gaps stay in Hero overview only |

---

## 1. Entry chain

### Current (Slice 1+)

```text
Active Posts grid / Linked Set member
  → GalleryView.openHeroForItem
  → HeroInspectOverlay (mode: overview | audience_promotion)
  → HeroActionBar segment "access"
  → TrayButton "Audience & Promotion" / "Back to packaging"
  → in-place AudiencePromotionPanel (no second modal)
```

Temporary legacy escape: Hero **More → Post settings (legacy)** still calls `openPostSettingsForItem` until Slice 8.

### Legacy (retained until Slice 8 gates)

```text
More → Post settings (legacy)
  → openPostSettingsForItem(heroPreview)
       ├─ closes Hero
       ├─ 1 asset  → InspectModal  (z-[100])
       └─ 2+ assets → PostBatchModal (z-[100])
```

**Anchors**

| Step | File | Notes |
|------|------|--------|
| Open Hero | `web/app/studio/GalleryView.tsx` `openHeroForItem` | Sets `heroKey` / `heroPreview` / `heroPostItems` |
| Access tray | `web/app/components/studio/HeroActionBar.tsx` | Toggles `workspaceMode`; does **not** call legacy |
| Panel shell | `web/app/components/studio/AudiencePromotionPanel.tsx` | Height-capped rail with Access / Simulator / Promotion tabs; body owns `overflow-y-auto` + `overscroll-contain` |
| Settings router | `GalleryView.openPostSettingsForItem` | Legacy More only; closes Hero; branches on asset count |
| Single-asset shell | `web/app/components/InspectModal.tsx` | Patron preview + meta sidebar |
| Multi-asset shell | `web/app/components/PostBatchModal.tsx` | Same + carousel + working tags/collections |

**Detail load:** both shells call `fetchGalleryPostDetail(creatorId, postId)` after open.

---

## 2. Legacy affordance inventory

Status key: **working** · **mock/local-only** · **inert** · **redundant** · **retained elsewhere**

### Shared (InspectModal + PostBatchModal)

| Affordance | Status | Evidence |
|------------|--------|----------|
| Patron feed preview card | working (visual) | `PostAudiencePreviewCard` — blur/lock overlay |
| View as audience pills | **mock/local-only** | `FALLBACK_AUDIENCES` (Basic/Advanced/Goku) merged with real tiers in `buildAudienceOptions` |
| Client `audienceCanView` | **mock/local-only** | Heuristic label/amount match — not `evaluatePostPermission` |
| Preview style + CTA controls | **mock/local-only** | Local React state |
| “Save preference” | **mock/local-only** | Writes `audiencePreferences` in component state only — **no** `patchPostPresentation` |
| “Choose preview” | **inert** | Button, no `onClick` handler |
| Unlock CTA button in overlay | **inert** | Display-only |
| Relay visibility badge | working (read-only) | `InspectMetaSidebar` chip from `GalleryItem.visibility` |
| Audience access editor | **working** | `InspectAudienceAccessEditor` → `patchPostAudienceAccess` (Layer A) |
| Tags chips (sidebar) | working (read) | From detail / item |
| “Add Tags” / “Add to Collection” (sidebar) | **inert** | Buttons with no handlers in `inspect-meta-sidebar.tsx` |
| Description edit | **working** | `InspectPostDescription` → `patchPostPresentation` |
| Add media | **working** | `InspectAddMediaControl` → native upload commit |

### InspectModal only (1 asset)

| Affordance | Status | Evidence |
|------------|--------|----------|
| Full single-asset inspect layout | working shell | Portal dialog |
| Tags/collections edit | **inert** in sidebar; **retained elsewhere** | Power / Bulk / PostBatch details |

### PostBatchModal only (2+ assets)

| Affordance | Status | Evidence |
|------------|--------|----------|
| Asset carousel | **working** | `PostAssetCarouselStrip` |
| Export retry | **working** | Retry button on failed export |
| Shadow-cover toggle | **working** | Local UI |
| Fullscreen asset | **working** | Opens asset fullscreen |
| Tags / collections editors | **working** | `PostBatchPostDetails` `tagsAndCollectionsOnly` |
| Comments block | **inert** / placeholder | “Patreon comments are not synced yet” |
| Smart Tag panel (via details) | **mock/local-only** | `InspectSmartTagPanel` — not connected |

### Outside the modal (related, keep)

| Affordance | Status | Location |
|------------|--------|----------|
| Relay visibility edit (Hidden / Adult) | **working** | `BulkActionBar` (≥2 posts); `LibraryPowerPanel` placement (single) |
| Packaging stats / gaps | **working** | `HeroInspectOverlay` — **do not duplicate** |
| Linked Set structure | **working** | `LinkedSetDrilldown` |
| Previewizer (teaser export) | **working** | Autopost `TransformerNodePage` only today |
| Action Center discount mock | **mock/local-only** | `ActionCenterView` — not the Slice 4 source of truth |

---

## 3. Locked destinations for retained capabilities

| Capability | Destination after conversion | Slice |
|------------|------------------------------|-------|
| Relay visibility audit + edit | Audience & Promotion → Access (Layer C checklist) | 2 |
| Patreon minimum-tier audit + edit | Audience & Promotion → Access (Layer A ladder) | 2 |
| Audience / persona simulation | Audience & Promotion → Audience Simulator | 3 |
| Preview treatment + CTA persistence | `PostPresentation.tier_preview_settings` via simulator | 3 |
| Discount codes + per-post offers | Audience & Promotion → Promotion Studio | 4 |
| Promo graphic generation | Previewizer `marketing` mode from Promotion Studio | 5–6 |
| Tracked offer link + QR | Promotion Studio | 7 |
| Packaging / platform stats | **Hero overview only** (unchanged) | — |
| Description / add media | Library Power (+ existing inspect actions until Slice 8) | Power / Bulk |
| Tags / collections | Library Power + BulkActionBar | Power / Bulk |
| Multi-asset carousel / export retry | Slim retained path or Power (Slice 8 gate) | 8 |
| Fake tiers / inert Choose preview / placeholder comments / mock Smart Tag | **Delete** after gates | 8 |
| Legacy InspectModal / PostBatchModal shells | **Delete** after gates | 8 |

---

## 4. Shared TypeScript contracts

Module: [`web/lib/audience-promotion-contracts.ts`](../../web/lib/audience-promotion-contracts.ts)

| Type | Role |
|------|------|
| `HeroWorkspaceMode` | Hero body mode |
| `AudiencePersonaKey` | `"anonymous" \| \`tier:${string}\`` — no fallback names |
| `PreviewTreatment` | Persisted preview styles |
| `MinimumTierAccessState` | Layer A read model |
| `RelayPresentationState` | Layer C read model |
| `TierLadderRow` | Access checklist UI |
| `AudiencePromotionPanelProps` | Slice 1 panel mount |
| `TierPreviewSettingsV1` | Presentation JSON schema |

### Slice 3 — simulator envelope & settings (server)

| Artifact | Path |
|----------|------|
| Pure simulator | [`src/gallery/audience-simulation.ts`](../../src/gallery/audience-simulation.ts) |
| Settings normalize | [`src/gallery/tier-preview-settings.ts`](../../src/gallery/tier-preview-settings.ts) |

**Persona keys:** `anonymous` | `tier:${relayTierId}` — only Public (logged out) + synced compose/catalog tiers. Never Basic/Advanced/Goku-style labels.

**`TierPreviewSettingsV1`:** `{ schema_version: 1, personas: Partial<Record<AudiencePersonaKey, { preview_style, cta_text }>> }`  
- `preview_style` ∈ `default` \| `partial-unblur` \| `free-cta` \| `partial-unlock`  
- `cta_text` max 120 chars; JSON blob max 16 384 chars; reject `__proto__` / `constructor` / `prototype` keys  

**Simulation read envelope (Batch 2 route):** gate tier ids, relay visibility, persona list with canonical `allow` \| `deny` \| `locked_preview`, saved `tier_preview_settings`. Always evaluates with `isContentOwner: false`. Not blocked by studio sync-write guard.

**Write-path invariants (ADR 004)**

| Layer | Mutation | Must not |
|-------|----------|----------|
| A — tier gate | `PATCH /api/v1/gallery/posts/:post_id/audience-access` | Touch `PostOverride` |
| C — visibility | `POST /api/v1/gallery/visibility` via `buildGalleryVisibilityBody` | Carry `tier_ids` |
| Presentation overlay | `PATCH …/presentation` (`tier_preview_settings`, titles, etc.) | Widen Layer A |

---

## 5. Slice index (builder)

| Slice | Title | Depends |
|-------|--------|---------|
| 0 | Contracts + characterization | — |
| 1 | In-Hero shell | 0 |
| 2 | Access checklist | 0–1 |
| 3 | Server-aligned simulator | 0–2 |
| 4 | Codes + offers | 1, 3 |
| 5 | Previewizer marketing mode | **Superseded by Slice 9** (kept as historical) |
| 6 | Attach / download / distribute | **Superseded by Slice 9** (kept as historical) |
| 7 | Tracked link + QR | 4 |
| 8 | Legacy decommission | 1–4, 7 + gates below |
| 9 | Locked-viewer promo overlay + `/studio/promos` hub | 2–4, 7 |

---

## 6. Slice 8 deletion gates (required before any delete)

| # | Gate | Evidence when done |
|---|------|--------------------|
| G1 | Hero Access opens Audience & Promotion in place | Slice 1 UI test |
| G2 | Relay visibility + minimum tier editable there | Slice 2 tests + manual |
| G3 | Real-tier simulator persists preview settings | Slice 3 parity + refresh |
| G4 | Code library + per-post offers persist | Slice 4 route/service tests |
| G5 | Locked viewers receive discount-backed text overlay + tracked CTA without widening access | Slice 9 + [`LOCKED_VIEWER_PROMOTION_WIRING.md`](../qa/LOCKED_VIEWER_PROMOTION_WIRING.md) Path L |
| G6 | Tracked link + QR work | Slice 7 redirect + QR tests |
| G7 | Description / media / tags / collections via Power / Bulk | Slice 8 parity audit |
| G8 | Multi-asset browse/export retry retained or approved slim sheet | Slice 8 |
| G9 | Zero runtime imports of `InspectModal`, `PostBatchModal`, `FALLBACK_AUDIENCES` | `rg` + static guard |
| G10 | Manual E2E signoff | Human |

**Frozen deletion targets (must remain until G9):** `FALLBACK_AUDIENCES`, local-only Save preference, inert Choose preview, inert sidebar Add Tags/Collection, mock Smart Tag panel, placeholder Comments, `InspectModal` / `PostBatchModal` shells.

Characterization suite currently **asserts these still exist** so Slice 8 can flip those tests when deleting.

---

## 7. Characterization findings (Batch 2)

| Path | Finding |
|------|---------|
| Layer C visibility body | Keys: `creator_id`, `post_ids`, `media_targets`, `visibility` — **no** `tier_ids` |
| Axis helpers | Hidden blocks mature/general changes; `set_hidden` → `hidden` |
| Layer A compose save | `gateFromComposeSelection` emits **one** `relayTierIds` entry (or public) |
| Multi-tier upstream | `gateFromAccessTiers` preserves multiple ids; confirm copy has `multiTierCollapse` note |
| Previewizer port | Modes `standalone` \| `distribution` \| `marketing`; result `{ previewMediaId }`; upload is injected adapter; previewizer package has no `relay-api` / staging imports |
| Contracts | `AudiencePersonaKey` rejects Basic/Goku-style labels |

---

## 8. Regression commands

```bash
# Slice 0 characterization
npx vitest run tests/audience-promotion/

# Permission / audience baseline
npx vitest run tests/pilot-permission-signoff.test.ts
npx vitest run tests/pilot-012-permission-guardrails.test.ts
npx vitest run tests/pilot-permission-architecture.test.ts
npx vitest run tests/web/relay-api-audience-access.test.ts
npx vitest run web/lib/audience-access-tier-diff.test.ts
npx vitest run web/lib/previewizer-session.test.ts

# After UI slices
npx vitest run tests/hero-inspect-data.test.ts

# Full gate before Slice 8 delete
npm run build
```

---

## 9. Batch notes

| Batch | Work items | Artifacts |
|-------|------------|-----------|
| **0.1** | 1–4 | This doc + `audience-promotion-contracts.ts` |
| **0.2** | 5–9 | `tests/audience-promotion/legacy-characterization.test.ts`; §6–§8 finalized |
| **1.1** | 1–4 | `AudiencePromotionPanel.tsx`; Hero mode + body swap; GalleryView `postItems` wiring |
| **1.2** | 5–7 | Access toggle + legacy under More; `hero-audience-promotion-shell.test.tsx`; framer-motion vitest mock |
| **2.1** | 1–3 | `VisibilitySwitchRow`; `relay-visibility-post-adapter`; `minimum-tier-ladder` + unit tests |
| **2.2** | 4–6 | `RelayVisibilityChecklist`; `MinimumTierAccessEditor` (inline review); panel mount |
| **2.3** | 7–9 | `studioWriteBlocked` gates; refresh after save; `access-checklist.test.tsx` |
| **3.1** | 1–3 | `audience-simulation.ts`; `tier-preview-settings.ts` wired into presentation mutate |
| **3.2** | 4–6 | GET `audience-simulation` route; `fetchAudienceSimulation`; preview card (no fallbacks) |
| **3.3** | 7–10 | `AudienceSimulatorSection` mount + save; Hero path free of FALLBACK audiences |

| **4.x** | Codes + offers | Schema/migration; discount + offer routes; Promotion Studio library/assign |
| **5.1–5.3** | Marketing Previewizer | `previewizer-marketing-context`; Overlay `mode`; Hero launch + staging adapter; `docs/qa/PREVIEWIZER_MARKETING_WIRING.md` |

| **6.1–6.3** | Attach / download / distribute | `promo_preview_media_id` on `PostPresentation`; marketing export actions; Distribution `initialPreviewMediaId` prefill |

| **7.1–7.3** | Tracked link + QR | `redirect_slug` + click events; `/go/:slug`; `OfferTrackedLinkPanel`; QR encodes Relay URL |

| **8.1** | Gate map + parity audit | `docs/studio/AUDIENCE_PROMOTION_SLICE8_PARITY.md` |
| **8.2** | Close G7/G8 | Power description/media/tags/collections; grid multi-asset export retry |

**8.3 complete (2026-07-15):** G5 + G9 + G10 PASS. Legacy Inspect/PostBatch shells and “Post settings (legacy)” entry removed.

---

## 10. Slice 9 — Locked-viewer promos + `/studio/promos`

**Supersedes** marketing portions of Slices 5–6 (Previewizer teaser attach / Cross-post). Slices 0–4 and 7 remain valid; standalone/distribution Previewizer unchanged.

| Decision | Value |
|----------|--------|
| Promo | Resolved text/link on `deny` / `locked_preview` only |
| Tier defaults | Live `CreatorTierPromotionDefault` by minimum gate Relay tier + `unpermissioned` segment |
| Overrides | Existing `PostMarketingOffer` per post/persona |
| Precedence | Exact override → matching tier default → none |
| CTA | `/go/:slug` tracked redirect; no raw destinations in patron DTO |
| Hub | `/studio/promos` — Promo Pieces (Add Post / Make Promos), Tier Rules with server inheritance summary, Codes (controlled hub state), Preview with simulation + honest unavailable performance |

Patron-safe field: `effective_promo: { headline, cta_text, code, percent_off, tracked_url, source }` where `source` is `explicit` \| `tier_default`.

Owner-only (studio): `promo_piece_id`, slot rank markers — never on visitor/patron DTOs.

**Out of scope until a future slice:** discovery/feed insertion, impressions, Patreon conversion reconciliation. Tracked-link redirects and locked-viewer overlays are shipped.

| Batch | Work | Artifacts |
|-------|------|-----------|
| **9.0** | Reframe gates | This §10; Path L QA; G5 redefined in Slice 8 parity |
| **9.1** | Tier defaults + resolver | Prisma model; `src/marketing/*`; creator routes |
| **9.2** | Overlay + reads | Patron DTO; shared overlay; simulator parity |
| **9.3** | Unplug A&P marketing Previewizer | Panel + Hero/Gallery handoff prune |
| **9.4** | Hub | `web/app/studio/promos/page.tsx` + AppNav |
| **9.5–9.6** | Prune + verify | Marketing Previewizer helpers removed from A&P; Path L + revised G5 **PASS** (2026-07-15) |

---

| **9.x** | Locked promos + hub | **COMPLETE** — tier defaults; effective resolver; overlay; `/studio/promos`; Path L / G5 |
