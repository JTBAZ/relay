# Escape Hatch — Information Architecture

> **Prototype IA.** This document describes the current generated soft-gate Hatch Console. It is not the production wizard/admin contract. The finished product experience is defined in [`docs/studio/escape-hatch-build-plans/02-WIZARD-UX-CONTRACT.md`](../../docs/studio/escape-hatch-build-plans/02-WIZARD-UX-CONTRACT.md) and [`08-GENERATED-SITE-ADMIN.md`](../../docs/studio/escape-hatch-build-plans/08-GENERATED-SITE-ADMIN.md).

**Product job:** Prove a Patreon-shaped library is correct and beautiful enough to commit to an independent membership site.

**Console metaphor:** Hatch Console = Structure → Style → Preview.  
**Engine (not the story):** SiteBundle JSON + CLI fill → `.out/<slug>/`.

---

## Route map

| Route | Pillar | Purpose | Default? |
|-------|--------|---------|----------|
| `/` | — | Redirects to Structure | Entry |
| `/structure` | Structure truth | Confirm tiers + which posts belong where | **Yes — land here** |
| `/style` | Light customization | See / live-tweak the few aesthetic dials | No |
| `/preview` | Compelling whole | Walk the gallery as a visitor (soft gate) | No |
| `/p/[slug]` | Compelling whole | Single post (from Preview) | Deep link |

Shell chrome (always visible in console modes): **Escape Hatch** wordmark + Structure | Style | Preview tabs + soft-gate disclaimer strip.

---

## Field bindings

### From `data/site.json` (SiteBundle) — **Structure owns these**

| Field | Structure UI | Style | Preview |
|-------|--------------|-------|---------|
| `creator.display_name`, `handle` | Header identity | — | Hero fallback if needed |
| `tiers[]` | Tier cards / columns | — | Persona labels |
| `posts[]` + `access.level` / `tier_ids` | Grouped under Public / Patrons / Tier | — | Gallery cards + locks |
| `posts[].media` | Media count badge | — | Thumbnails |
| `demo_personas[]` | Listed as “visitor hats” derived from tiers | — | **View as** switcher |
| `total_media`, `generated_at` | Meta footer | — | — |

Do **not** edit these in Style. Wrong mapping = Structure bug or bad JSON feed-in, not a theme issue.

### From `data/theme.json` (and `site.theme`) — **Style owns these**

| Field | Designer-aligned? | Style UI | Preview effect |
|-------|-------------------|----------|----------------|
| `color_scheme` (`dark` \| `light` \| `warm`) | Yes (`PageLayout.theme`) | Scheme picker | `--eh-bg/fg/muted/card` |
| `accent_color` | Yes | Accent swatches | `--eh-accent` |
| `hero.title` / `subtitle` / `bio` | Yes (hero copy) | Text fields (live peek) | Hero on Preview |
| `paywall_style` (`blur` \| `hard` \| `teaser`) | Escape Hatch–only | Three options | Lock chrome on cards |

**Persist path:** CLI `wizard` / `build` writes theme into the kit. In-browser Style dials are **session peek** unless we later add Studio save (EH-3).

### Fixed house style (not user fields) — **Template owns these**

Layout grid, type ramp, card geometry, console tab chrome, paywall CTA copy pattern. Creators do not fork these in v0.

---

## Screen contracts

### 1. Structure (`/structure`)

**Headline:** “What we detected from your library.”

**Body:**
1. Creator strip: display name · @handle · post count · media count · generated_at  
2. Buckets (always in this order):
   - **Public** — `access.level === "public"`
   - **All patrons** — `access.level === "member_only"`
   - **One section per `tiers[]` entry** — posts whose `tier_ids` include that tier (and level `tier_gated`)
3. Each post row: title · published date · media count · access badge  
4. Callout: personas that Preview will offer (from `demo_personas`)

**Primary CTA:** Continue to Style →  
**Secondary:** Skip to Preview →

**Success:** Creator confirms tier/post map in &lt;60s without opening Preview.

### 2. Style (`/style`)

**Headline:** “Dress the house — few dials only.”

**Body:**
- Live swatch panel bound to CSS variables  
- Hero copy fields  
- Paywall style radio  
- Note: “Session preview. Persist with Escape Hatch CLI wizard, then rebuild.”

**Primary CTA:** Open Preview →  
**Secondary:** Back to Structure

**Success:** Four dials change Preview enough to feel “mine.”

### 3. Preview (`/preview`)

**Headline:** none competing with brand — hero *is* the brand.

**Body:** Immersive gallery (current soft-gate experience) + **View as** personas.

**Chrome:** Console tabs still available but visually quieter (preview mode).

**Success:** Creator wants the Export Kit.

---

## Hierarchy rules (eng)

1. Default route is Structure, never Preview.  
2. Preview must not be the only place tiers are visible.  
3. Style never mutates `posts` / `tiers` in SiteBundle.  
4. Theme token names stay aligned with Relay Designer for EH-3 import.  
5. Soft gate stays labeled non-production on every console page.

---

## Mapping to codebase

| IA piece | Location |
|----------|----------|
| Engine | `packages/escape-hatch/src/*` |
| Shell template | `packages/escape-hatch/template/` |
| Structure screen | `template/app/structure/page.tsx` |
| Style screen | `template/app/style/page.tsx` |
| Preview screen | `template/app/preview/page.tsx` |
| Shared nav | `template/components/ConsoleNav.tsx` |
| This doc | `packages/escape-hatch/IA.md` |
