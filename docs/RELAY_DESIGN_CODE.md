# Relay Design Code

**The binding reference for every front-end element built in `web/`.** Link this doc to any agent building UI. It removes guesswork: when a rule here answers a question, follow it; when it doesn't, imitate the canonical exemplars listed in §2 and extend this doc in the same PR.

**Companions:** [pattern-library.md](pattern-library.md) (product intent + workflows) · [UI_SPECIALIST_RELAY.md](UI_SPECIALIST_RELAY.md) (role scope) · [web-components-ui-policy.md](web-components-ui-policy.md) (import policy). This doc owns **visual + code style**; those own product semantics.

---

## 1. Design identity

Relay Studio is a **dark control room with a living green pulse**. The analysis of `/studio` (Library) that this doc canonizes:

- **Near-black canvas, not gray.** Backgrounds sit at `#0a0a0a`–`#131a19`. Surfaces separate by *hairline borders and 1-step lightness*, never by heavy fills or drop shadows at rest.
- **One accent hue, used as signal.** Emerald/mint green means *Relay, alive, selected, positive*. It is never decoration — every green pixel carries meaning (active nav, sync ok, selection, primary action, revenue).
- **Amber is the second semantic** — *multiplicity and caution* (multi-media badge, carousel dots, syncing, review/18+).
- **Brand colors belong to platforms.** Patreon coral, X blue, DeviantArt green, Bluesky sky — only ever used to identify that platform (chips, rows, cross-post CTAs).
- **Content is the hero.** Media fills tiles edge-to-edge; chrome is overlaid at low opacity and resolves to full opacity on hover. UI recedes at rest, sharpens on intent.
- **Micro-typography.** Studio labels run 9–13px with weight and letterspacing doing the hierarchy work, not size. Display serif (Fraunces) is reserved for big editorial moments ("Active Posts").
- **State is always drawn.** Empty, loading, gated, and "coming soon" states are designed objects (dashed boxes, muted uppercase), never blank space.

---

## 2. Canonical exemplars (imitate these files)

| Pattern | Source of truth |
|---|---|
| **Post media card (bread & butter)** | `web/app/components/ActivePostPresenceCard.tsx` |
| Linked-set card variant | `web/app/components/studio/LinkedSetCard.tsx` |
| Presence / cross-post chips | `web/app/components/distribution/platform-presence-chips.tsx` |
| Per-platform drilldown rows | `web/app/components/studio/HeroPlatformRow.tsx` |
| Grid layout + virtualization | `web/app/components/GalleryGrid.tsx` |
| Top nav (app chrome) | `web/app/components/AppNav.tsx` |
| Toolbar header + status pill | `web/app/components/LibraryTopBar.tsx` |
| Section eyebrow | `web/app/components/LibrarySectionEyebrow.tsx` |
| Toggle switch | `GallerySidebar.tsx` (`ToggleRow`, h-5 w-9 pattern) |
| Data page (load/unavailable/ready/error) | `web/app/studio/settings/billing/BillingSettingsClient.tsx`, `web/app/(consumer)/plans/FanPlansClient.tsx` |
| Patron consumer tiles | `web/components/patron/TipRevealModal.tsx` (`TipBlurredTile`), `GatedTile.tsx` |

---

## 3. Shells and token scopes — pick the right one first

Global CSS variables are **scoped by shell class** (`web/app/globals.css`). Before styling anything, identify which shell the component lives in and use *its* tokens. Do not import another shell's tokens.

| Shell class | Where | Key tokens |
|---|---|---|
| `.library-shell` | Studio Library + most `/studio/*` pages | `--lib-bg`, `--lib-card`, `--lib-border`, `--lib-muted`, `--lib-input`, `--lib-fg`, `--lib-fg-muted`, `--lib-primary` (emerald), `--lib-primary-fg`, `--lib-success`, `--lib-warning`, `--lib-destructive`, `--lib-ring`, `--lib-selection` (`#00aa6f`), `--lib-grid-bg` (`#131a19`), `--lib-accent-border` (`#00ffb4`) |
| `.onboarding-shell`, `.login-shell` | Full-page auth/onboarding | `--relay-bg`, `--relay-surface-1/2`, `--relay-border`, `--relay-green-950/800/600/400`, `--relay-gold-500/400`, `--relay-fg`, `--relay-fg-muted`, `--relay-electric` (`#00aa6f`), `--relay-glow`(`-strong`) |
| `.designer-site-shell`, `.public-profile-wysiwyg-shell` | Site Designer + public WYSIWYG | same `--relay-*` family + `--relay-border-hi`, `--relay-fg-subtle` |
| `.patron-mock-root dark` | Consumer `(consumer)` routes (feed, plans, discover) | shadcn-style `--background/--foreground/--card/...` via `patron-mock.css`; components also use the **patron literal palette** (below) |
| Studio card internals | Inside cards/overlays that sit on media | **Literal hex** values from §4 (the card system is deliberately token-free for fidelity) |

**Rules**
- New `/studio` surface → wrap in / assume `.library-shell`, style with `var(--lib-*)`.
- New consumer surface → `(consumer)` route group; use the patron palette + existing `--lib-*` usage seen in `FanPlansClient` for shared bits.
- Never hardcode a new accent green. Use the ladder in §4.
- Post-media-card internals may use the literal hex values in §5 exactly as specified — that's the canon, not a violation.

---

## 4. Color system

### Neutrals (dark ladder)

| Value | Use |
|---|---|
| `#000000` / `black` | Grid canvas behind media tiles (`bg-black`), onboarding bg |
| `#0a0a0a` | Card/tile background, consumer page bg, hero panels |
| `#0c0c0c`–`#111111` | Raised row/panel on black (`HeroPresentRow`, surface-1) |
| `#141414` | Buttons on dark (Account strip), consumer cards |
| `#1a1a1a` | Surface-2, hover fill of `#141414` |
| `#1f1f1f` | **Resting card border** |
| `#242424`–`#2a2a2a` | Panel borders, dashed empty-state borders, input borders |
| `#333` | **Hover border** (non-semantic) |
| `#3a3a3a` | Hover border for buttons |
| `#555` | Muted-2 text (metadata, disabled icons), ghost-chip resting border |
| `#666` | Muted text on media cards ("No preview", audience label) |
| `#888` | Generic muted / unknown-platform gray |
| `#444` | Stat label uppercase (deepest legible gray) |
| `#ddd`–`#E0E0E0` | Primary text on literal-hex surfaces |
| `white` | Card title on media scrim |

### Relay greens (single accent family)

| Value | Name | Use |
|---|---|---|
| `#00AA6F` | **Relay electric** | Active nav pill, selection outline (`--lib-selection`), glows, logo |
| `#9bf0c4` | **Mint** | Card selection (checkbox fill, selected border/glow), Relay platform color, hover-icon color on dark rows |
| `#00ffb4` | Accent border | Rare high-emphasis edge (`--lib-accent-border`) |
| `oklch(0.65 0.15 160)` | `--lib-primary` | Studio primary buttons, eyebrow text, links |
| `#40916C` / `#2D6A4F` / `#1B4332` / `#0d1f17` | Green 400→950 | Patron-side accents, pinned-comment tint, avatar fallbacks, gradients |

**Semantic greens:** success = `--lib-success`; revenue/money figures = `--lib-primary` + `tabular-nums`.

### Amber (multiplicity + caution)

`#F59E0B` — multi-media badge, carousel dots, multi-hover border (`{AMBER}55`), "N pages ·" label tint (`{AMBER}88`), review/18+ badge (`bg-amber-500/90`), `--lib-warning` for syncing.

### Platform brand colors (identification only)

From `CHIP_META` / `HERO_PLATFORM_CONFIG`: Patreon `#F1615A` (hero `#F96854`), X `#3B82F6`, DeviantArt `#4ADE80`, Bluesky `#38BDF8` (hero `#0085FF`), Relay `#9bf0c4`, unknown `#888`. Use hex-alpha suffixes for washes: `30` border, `35` CTA border, `0d` CTA bg, `1a` CTA hover bg, `60` hover border, `18` glow.

### Destructive / gold

Destructive: `--lib-destructive`, patron `#7f1d1d` bg + `#fca5a5` fg, error text `text-red-400`. Gold `#d4af37`/`#c5b358`: premium/gold accents only (onboarding, badges) — never as a second UI accent inside Studio tools.

---

## 5. THE POST MEDIA CARD — canonical spec (front end)

The **Active Posts card** (`ActivePostPresenceCard`) is the flagship component. Anything tile-like anywhere in Relay must derive from this spec.

### 5.1 Chrome

```
container: rounded-xl border, overflow-hidden, aspect-ratio 3/4 (portrait), bg #0a0a0a
group/hover: translateY(-2px) scale(1.01), zIndex 10, transition-all duration-200
focus: [&:has(:focus-visible)]:ring-2 ring-[var(--lib-ring)]
```

### 5.2 Border/state grammar (exact precedence)

| State | Border | Shadow |
|---|---|---|
| Selected | `#9bf0c480` (mint 50%) | `0 0 0 1px #9bf0c440, 0 0 20px #9bf0c415` |
| Partially selected | `#9bf0c455` | — |
| Hover + multi-media | `#F59E0B55` | `0 4px 24px rgba(245,158,11,0.12)` |
| Hover | `#333` | `0 4px 24px rgba(0,0,0,0.4)` |
| Rest + multi-media | `#F59E0B22` | none |
| Rest | `#1f1f1f` | none |

Selection is **mint**, multiplicity is **amber**, neutral hover is **gray**. Never mix.

### 5.3 Overlay stack (bottom → top)

1. **Full-bleed media** — `absolute inset-0`, `object-cover object-center`. Video: `muted playsInline preload="metadata" aria-hidden`. Fallbacks: "Preparing media" / "No preview" centered `text-[11px] text-[#666]`.
2. **Bottom scrim** — `linear-gradient(to top, rgba(5,7,6,0.9) 0%, transparent 50%)`, `pointer-events-none`.
3. **Hidden overlay** — when `visibility === "hidden"`: `bg-black/35` + centered `EyeOff h-8 w-8 text-white/85`.
4. **Top-right badge** — multi-media: amber pill (`{AMBER}18` bg, `{AMBER}44` border, `backdrop-blur`, Layers icon + count `text-[9px] font-semibold`); else review: `18+` amber solid.
5. **Top-left checkbox** — 20px circle; fill mint when selected, `rgba(0,0,0,0.55)` when hovered, transparent at rest; input is `sr-only` with `aria-label`; check stroke `#050706`; `stopPropagation` on click.
6. **Carousel dots** (multi only) — bottom 44px, active 12×4 amber, inactive 4×4 `{AMBER}40`, `transition-all duration-300`; auto-advance 900ms while hovered, reset on leave.
7. **Presence chip row** — `bottom-12 left-2 right-2`, wraps `CrosspostChipRow`, `stopPropagation` on both click and keydown.
8. **Label block** — `bottom-0 px-2.5 pb-2.5 pointer-events-none`: title `text-[10px] font-semibold text-white truncate`; second line `text-[10px]` — `"N pages · "` in `{AMBER}88` when multi, audience/tier label in `#666`, em-dash when unknown.

### 5.4 Presence chip grammar (Present / Ghost)

- **PresentChip** (posted): 20px circle, `rgba(5,7,6,0.82)` bg, **solid** 1px brand-color border + `0 0 0 1px {color}22` ring, platform icon at 10px in brand color. Opacity 0.5 at rest → 1 when the *card* is hovered. Click opens external URL (caller owns `window.open`).
- **GhostChip** (missing): 20px circle, **dashed** `#555` border, icon grayed at 0.4 opacity. On own hover: dashed border in brand color, icon fades, **lightning bolt** in brand color appears. Click = start cross-post for that destination.
- Row: present chips first, then ghosts; `gap-1`, `flex-wrap`.

**This solid=present / dashed=missing / lightning=fill-the-gap grammar is a platform-wide vocabulary.** Reuse it anywhere presence/absence-with-CTA appears.

### 5.5 Interaction contract

| Input | Action |
|---|---|
| Click body / Enter | Open post (hero inspect) |
| Space | Toggle select |
| Checkbox click | Toggle select (no open) |
| Chip click / Enter / Space | Chip action only (never opens post) |
| Focus | `onFocusIndex(flatIndex)`; visible ring via `:has(:focus-visible)` |

Container: `role="listitem"` + `data-gallery-tile` + `tabIndex={0}` inside a `role="list"` scroller.

### 5.6 Linked-set variant

`LinkedSetCard`: same chrome/selection; mosaic of member thumbs (≤2 rows / 3 featured / 4 grid2x2 / ≥5 grid3x2, `gap-px`, `#111` placeholder), height 72% + label area below, `Linked · N` mint-bordered pill top-left (`rgba(5,7,6,0.92)` bg), checkbox moves top-right, presence = **union across members** (`unionMemberPresence`).

### 5.7 Per-platform drilldown rows (hero)

- **Present row:** `rounded-xl`, bg `#0c0c0c`, border `#242424` (Relay row `#2a3a33`) → `{color}60` + `0 0 16px {color}18` on hover; header = 1.5px brand dot + icon + label in brand color; 24px square icon-buttons (border `#2a2a2a`, bg `#0a0a0a`, icon `#555` → mint on hover) for refresh/open; stats = `text-[18px] font-semibold tabular-nums #ddd` over `text-[9px] uppercase tracking-wider #444`.
- **Gap row:** dashed `{color}30` border, transparent bg, icon at 35% opacity, `"Not on {Platform} yet"` in `#555`, right-aligned **Cross-post** button (`{color}35` border, `{color}0d` bg → `{color}1a`, brand-color text, `text-[10px] font-semibold rounded-lg px-2.5 py-1`).
- Entrance: framer-motion `initial={{opacity:0, x:16}}`, `duration: 0.22`, ease `[0.34, 1.06, 0.64, 1]`, stagger via `delay`.

---

## 6. THE POST MEDIA CARD — canonical spec (back end)

The card renders **only** from the gallery wire; never invent client-side post state.

### 6.1 Wire contract

`GalleryItem` (`web/lib/relay-api.ts` ≈1914, mirrored in `src/gallery/types.ts`). Fields the card system reads:

- Identity/media: `post_id`, `media_id`, `title`, `mime_type`, `content_url_path`, `thumb_url_path`, `preview_url_path`, `processing_status`, `has_export`
- Policy: `visibility` (`visible|hidden|review`), `tier_ids`, `is_public`
- Dedupe: `shadow_cover` (duplicate Patreon cover row — filter out of slides, keep for recovery)
- Presence (owner-only): `distribution_summary.destinations[] { destination, variant_status, attempt_status, attempt_id, external_url, external_id }`
- Linked sets (owner-only): `creative_work_id`, `is_default_bundle`, `creative_work_member_count`, `member_label`, `variant_role`, `creative_work_sort_order`

Enrichment: `GET /api/v1/gallery/items` attaches `distribution_summary` per post in `src/server.ts` (batch lookup, **fail-open**: enrichment failure logs a warning and returns base items — presence UI degrades to all-ghost, list never breaks). Post detail attaches the same summary.

### 6.2 Client pipeline (do not bypass)

```
items → groupGalleryItemsByPost()            (web/lib/gallery-group.ts — first appearance = group order)
      → collapsePostGroupsToGridCards()      (web/lib/active-post-linked-sets.ts)
          post card             — default bundle or <2 members
          linked_set card       — creative_work with ≥2 members, cover = sort_order 0
      → GalleryGrid (virtualized rows)
```

Presence derivation: `summaryToPresence()` (`web/lib/active-post-presence.ts`) — a destination is **present** iff `attempt_status === "posted"` or a non-empty `external_url` exists; everything else in `PRESENCE_PRODUCT_DESTINATIONS` (`patreon, x, deviantart, bluesky`) is **missing**. Best-row-per-destination wins. Reuse this helper; never re-derive presence ad hoc.

### 6.3 Rendering rules bound to the wire

- Slides = `items.filter(i => !i.shadow_cover)`, fall back to all items.
- Presence/tier read from the **primary** (first non-shadow) item.
- Tier chip: `pickPrimaryAccessTierIdForChip(tier_ids, tierFacets)` → `accessChipLabel` — never print raw tier ids.
- Grid: virtualized (`@tanstack/react-virtual`), row height from 3/4 aspect; columns 2/3/4/6/7 (dense) or 2/3/4/5 (normal) at Tailwind breakpoints; `gap-3`; scroller `bg-black`.
- Viewer-facing derivatives of this card (visitor gallery, patron feed, discover) must run the **same entitlement pipeline** (`pattern-library.md` §viewer-parity) — presence chips and `distribution_summary` are **owner-only** and must not leak to visitor payloads.

---

## 7. Typography

- **Fonts:** `--font-body` DM Sans (default via layout), `--font-display` Fraunces — display serif for editorial headings only (e.g. "Active Posts", landing heroes). Monospace (`font-mono`) only for dev/session metadata.
- **Studio micro-scale (px):** 9 badge/stat-label · 10 card title/metadata/pills/eyebrow · 11 row labels/body-small · 12 nav items/body · 13 emphasized body · 18 stat numerals · `text-2xl font-semibold tracking-tight` page h1.
- **Eyebrow pattern** (`LibrarySectionEyebrow`): `text-[10px] font-bold uppercase tracking-[0.28em]` in `--lib-primary`, flanked by 3px dots — use to introduce major page sections; pair with a large display heading beneath.
- Numbers that align in columns (money, counts, stats): always `tabular-nums`.
- Truncate with `truncate` + `min-w-0` on the flex parent; never let metadata wrap a card label to two lines.

---

## 8. Shape, spacing, borders, elevation

- **Radii:** `rounded-full` pills/nav/chips/toggles · `rounded-xl` media cards + hero rows/panels · `rounded-2xl` large hero containers (top-bar identity card, Import Bay) · `rounded-md`/`rounded-lg` buttons and inputs. Never square-corner a new element.
- **Borders do the work of elevation.** Rest `#1f1f1f`/`--lib-border` → hover `#333`/brand-tinted. Shadows appear only on hover/selection (see §5.2) or as inset glows (`shadow-[inset_0_0_28px_rgba(0,170,111,0.08)]` on the logo pill). No resting drop shadows.
- **Dashed border = "not yet"**: staging zones, empty states, ghost chips, gap rows, coming-soon slots.
- **Spacing:** dense control-room padding — `px-3 py-2` bars, `px-2.5 pb-2.5` card labels, `gap-1`–`gap-3` clusters. Consumer pages breathe more: `max-w-2xl/3xl mx-auto px-4 py-8`.
- **Buttons:** toolbar `h-7 rounded-md px-3 text-xs font-medium` + icon `h-3.5 w-3.5` in `--lib-primary`; hierarchy = primary (`bg-[var(--lib-primary)] text-[var(--lib-primary-fg)]`) → accent-outline (`border-[var(--lib-primary)]/40 bg-[color-mix(...12%,transparent)]`) → neutral (`border-[var(--lib-border)] bg-[var(--lib-card)]`, hover border-primary/50). Disabled = `opacity-75` + title explaining why.
- **Toggle switch:** button `h-5 w-9 rounded-full p-0.5` (`--lib-primary` on / `--lib-muted` off) + `h-4 w-4` fg knob `translate-x-4|0`, `aria-pressed`.
- **Status pill:** `rounded-full border px-1.5 text-[10px]` with `{semantic}/35` border + `{semantic}/10-12` bg + 1.5px dot (or spinner when in-flight), `role="status"`, `title` with detail.

---

## 9. Motion

- **Micro:** `transition-colors`/`transition-all` at 150–200ms; card hover 200ms; chips 150ms; dots 300ms.
- **Entrances:** fade+slide 12–16px, 220–400ms; framer ease `[0.34, 1.06, 0.64, 1]` or CSS `cubic-bezier(0.16, 1, 0.3, 1)`; stagger with small delays.
- **Ambient** (`globals.css` utilities): `relay-pulse-glow`, `relay-shimmer`/`.shimmer`, `relay-scan-line` — onboarding/marketing/loading only, never in dense tool areas.
- **Always** honored: `prefers-reduced-motion` kills ambient + entrance animation (already wired in `globals.css`; new keyframes must join that block).
- No layout-shifting hover states; lifts are transform-only.

---

## 10. State display (empty / loading / gated / error)

Every data component ships all four; use the discriminated-union load state:

```ts
type LoadState = { status: "loading" } | { status: "unavailable"; message: string }
              | { status: "ready"; data: T } | { status: "error"; message: string };
```

- **Loading:** short muted line ("Loading plans…") with `data-testid="*-loading"`; shimmer only for big visual zones.
- **Empty:** dashed `rounded-xl border-dashed` box (`#2a2a2a` border, `#0a0a0a` bg), icon at low opacity, headline `text-[13px] font-medium text-white`, sub `text-[11px] #555` telling the user *how content arrives here*.
- **Feature off (build-dark):** API returns 404 → render `unavailable` message ("X is not enabled on this environment yet.") + **Retry** outline button. **The web app never reads feature-flag env vars** — availability is inferred from API 404s / wire fields (`tips_beta`). Follow `TipWalletChip` (hide) or `BillingSettingsClient` (explain) precedents.
- **Gated/upgrade:** show the control disabled + reason ("upgrade required", tooltip), link to the plans surface when one exists. Never silently hide a gated feature the user could buy.
- **Coming soon:** `uppercase tracking-wider` muted label + dashed placeholder (Import Bay "Channel picker — coming soon").
- **Error:** `role="alert" text-sm text-red-400` + `data-testid="*-error"`; keep prior data visible when the failure is a refresh.

---

## 11. Accessibility contract

- Interactive tiles: `tabIndex={0}`, `role` appropriate (`listitem` in `role="list"`), Enter=open / Space=select, focus ring via `[&:has(:focus-visible)]:ring-2 ring-[var(--lib-ring)]`.
- Hidden inputs: `sr-only` checkbox with explicit `aria-label` including the item name and count.
- Toggles: `aria-pressed`; status: `role="status"` + `aria-label`; errors: `role="alert"`.
- Icon-only buttons always get `aria-label` and `title`; decorative icons/SVGs get `aria-hidden`.
- Nested interactivity (chips inside clickable cards): `stopPropagation` on click **and** keydown, and the inner element is itself keyboard-activatable (`role="button"` + Enter/Space).
- Contrast floor: `#555` on `#0a0a0a` is the minimum for metadata; never go darker than `#444` (and only for 9px uppercase stat labels).

---

## 12. Code conventions

- **Tailwind first**; inline `style` is reserved for (a) dynamic values (border colors from state grammar, brand-color washes, virtualizer transforms) and (b) the literal-hex card system in §5. Don't move token-able static styles inline.
- Class merging: `[cond ? "a" : "b", "base"].join(" ")` array pattern (as in `AppNav`).
- Client components declare `"use client"`; pages stay server components that wrap a `*Client.tsx` (see `plans/page.tsx`, `billing/page.tsx`).
- **No barrel imports** from `@/components/ui` — deep paths only (`web-components-ui-policy.md`).
- API access only through `web/lib/relay-api.ts` typed clients; catch `RelayApiError` and branch on `status`/`code`.
- `data-testid` on every state branch and primary control (`fan-plans-loading`, `billing-dunning-banner` naming style: `{surface}-{element}`).
- Remote/Relay-served media: `<img>` with the ESLint disable comment used across the repo; `decoding="async"` where offscreen.
- Shared constants (colors like `MINT`, chip metadata, plan catalogs) live in one module and are imported — never re-declared locally.
- Quarantined trees (`web/b_i0ofEW9bMcy`, `web/onboarding_enhancement`) are reference-only.
- Verify with `npm run lint` + `npm run build` under `web/`; component QA in real routes or `/dev/bench` (no Storybook).

---

## 13. Decision quick-list

1. **Building anything tile/card-like?** Start from §5. Portrait 3/4, `#0a0a0a`, `#1f1f1f` border, mint selection, amber multiplicity, scrim + 10px overlay labels.
2. **Showing presence/absence across platforms?** Solid brand ring = present, dashed = missing, lightning hover = CTA. Use `CrosspostChipRow` / `HeroGapRow`, `summaryToPresence`.
3. **New Studio page?** `.library-shell` tokens, `text-2xl` h1, eyebrow + display heading for major sections, toolbar buttons `h-7`.
4. **New consumer page?** `(consumer)` group, `max-w-*` centered column, card list pattern from `FanPlansClient`.
5. **Feature can be off?** 404 → `unavailable` state with Retry; never read flag envs in web.
6. **Money/counts?** `tabular-nums`, money in green only when it's Relay revenue/earnings.
7. **Green?** Only if it means Relay/alive/selected/positive. **Amber?** Only multiplicity/caution. **Brand color?** Only its platform.
8. **Animation?** ≤400ms, transform/opacity only, reduced-motion safe.
9. **Empty state?** Dashed box + how-it-fills copy — never blank.
10. **Unsure?** Copy the nearest exemplar in §2, then record the new rule here.
