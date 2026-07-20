# v0 prompt — Studio Hero Unfold (post packaging + cross-platform stats)

> **Phase 10b** of Cross-Platform Performance Intelligence.
> **Data layer:** [STUDIO_PACKAGING_DATA.md](./STUDIO_PACKAGING_DATA.md) — all API shapes referenced below are real.
> **Reference mockups (user-provided):** grid search → hero unfold → radial platform cards → merged Relay View.

Copy everything inside the block below into v0. This generates a **self-contained prototype with mock data** matching our real API shapes — no live wiring expected from v0; we wire it to `web/lib/relay-api.ts` afterward.

---

```
You are building an interactive "hero unfold" overlay for Relay, a creator media-management + analytics studio. A creator has a grid of published posts ("Active Posts"). They search for or click one post, and it transforms into a focused inspection view showing every platform it's been cross-posted to, with performance per platform and the ability to merge stats or schedule missing cross-posts.

## Brand & theme (must match — dark "studio" aesthetic, NOT the older warm-amber theme)

- **Background (stage):** near-black **#050706**.
- **Panel / card surface:** **#0A0A0A** to **#101010**, 1px border **#1f1f1f** to **#2a2a2a**, rounded-2xl (16px).
- **Primary accent (mint/green):** **#9bf0c4** for active states, links, primary numbers. Positive-tone panels use border **#2a7a4a** at ~45-55% opacity with background **#0f1a14** or **#0D3D2C**.
- **Muted text:** **#888** / **#aaa** / **#666** for secondary labels.
- **Danger:** red only on hover for destructive actions (e.g. delete) — never idle red.
- **Typography:** Display/serif **Fraunces** for hero titles; body **DM Sans** for everything else. Tabular numbers for stats.
- **Feel:** calm, premium, dark control-room — not neon, not cluttered.

## Screen 1 — Active Posts grid (starting state)

- Header: eyebrow "PUBLISHED CONTENT" (small caps, muted, letter-spaced), title "Active Posts" (Fraunces, large).
- Toolbar row: post/asset count on the left (e.g. "26 posts · 26 assets"), selection count when active, a "Power" density toggle and grid/list view icons on the right.
- Grid of post cards (5-6 columns desktop, responsive down to 2 on mobile). Each card:
  - Thumbnail image filling the card.
  - Small platform chips at bottom-left showing which destinations this post is on (e.g. "Patreon · X · DA") in tiny muted pills.
  - Title + audience label (e.g. "Supporter") bottom row.
  - On hover: subtle lift + border brightens to **#333**.
- One card can show a **selected state**: mint-green border (#9bf0c4), checkmark badge top-left.

## Screen 2 — Hero unfold (triggered by clicking a card)

**Transition:** the rest of the grid dims to near-black with a soft dark scrim (stage darkens); the clicked card animates/scales up into a larger "hero" position left-of-center. Use a smooth 200-300ms ease transition (scale + opacity), not an abrupt cut.

**Layout (three zones, left to right):**

1. **Vertical action bar** — thin rail immediately left of the hero card (see "Action bar" section below).
2. **Hero card** — the enlarged selected post: full image/preview, title, audience/tier label, and small role badges (e.g. "Full" / "Teaser") at the bottom.
3. **Radial platform cards** — smaller cards positioned around/right of the hero, each connected to the hero by a thin animated line (SVG or CSS), labeled by platform name above each card (e.g. "patreon", "twitter", "Deviantart"). Use each platform's brand color for the connecting line and label text:
   - Patreon: orange/amber (#F1615A or similar warm orange)
   - X/Twitter: blue (#3B82F6 or sky blue)
   - DeviantArt: green (#4ADE80 or mint-green, matching brand)
   - Stack these radially (arced positions around the hero, not a rigid grid) — top, right, bottom-right, etc.

**Mock data shape for the hero unfold (use this exact structure):**

```json
{
  "creative_work_id": "cw_demo_1",
  "title": "Character turnaround — full body",
  "role_badge": "full",
  "hero_post_id": "post_full_1",
  "platform_instances": [
    {
      "destination": "patreon",
      "platform_instance_id": "pi_1",
      "external_url": "https://patreon.com/posts/character-turnaround-123",
      "status": "active",
      "last_refreshed_at": "2026-06-30T10:00:00.000Z",
      "refresh_eligible": true,
      "stats": { "impressions": 3000, "likes": 210, "comments": 18 }
    },
    {
      "destination": "x",
      "platform_instance_id": "pi_2",
      "external_url": "https://x.com/artist/status/1234567890",
      "status": "active",
      "last_refreshed_at": "2026-06-29T18:00:00.000Z",
      "refresh_eligible": true,
      "stats": { "impressions": 8400, "likes": 540, "comments": 32 }
    },
    {
      "destination": "deviantart",
      "platform_instance_id": "pi_3",
      "external_url": "https://www.deviantart.com/artist/art/Character-Turnaround-987",
      "status": "stale",
      "last_refreshed_at": "2026-06-20T09:00:00.000Z",
      "refresh_eligible": true,
      "stats": { "impressions": 1200, "likes": 95, "comments": 4 }
    }
  ],
  "crosspost_gaps": {
    "present_destinations": ["patreon", "x", "deviantart"],
    "missing_destinations": ["bluesky"],
    "missing_teaser_destinations": [],
    "suggested_source_post_id": "post_full_1"
  },
  "role_breakdown": {
    "full": { "member_count": 1, "total_reach": 12600, "totals": { "impressions": 12600, "likes": 845, "comments": 54 } },
    "teaser": { "member_count": 1, "total_reach": 3200, "totals": { "impressions": 3200, "likes": 140, "comments": 9 } }
  },
  "totals": { "impressions": 12600, "likes": 845, "comments": 54 }
}
```

### Radial platform card — hover behavior

On hover over any radial card, expand it slightly to reveal:

- Stat rows: impressions, likes, comments (from `stats`).
- A **"Refresh"** icon button — only enabled when `refresh_eligible` is true; shows a small spinner state on click (simulate with a 1s timeout in the mock).
- A **link icon** that opens `external_url` in a new tab.
- A tiny freshness label: "Updated 2h ago" derived from `last_refreshed_at`, using amber tone if status is `"stale"`.

### Blank platform card (cross-post gap)

For every destination in `crosspost_gaps.missing_destinations`, render a **ghost/dashed card** in the same radial ring, visually distinct (dashed border, low opacity, muted platform icon, no stats):

- Label: "Not on {Platform} yet"
- CTA button inside: **"Schedule cross-post"** — clicking simulates opening a small confirmation toast: "Cross-post to {Platform} scheduled from {suggested_source_post_id}."
- If `missing_teaser_destinations` includes a destination that already has a `missing_destinations` blank card, add a small sub-label: "no teaser here yet" rather than a second card.

### Action bar (vertical, left of hero) — 5 icon segments, hover-to-reveal tray

Render as a slim vertical rail (roughly 48-56px wide) with 5 icon buttons stacked with generous spacing. On hover (or tap on touch), a horizontal tray of labeled pill buttons slides out to the RIGHT of the icon, into the dark gutter between the bar and the hero card (do not cover the hero card). Icons use the muted gray idle state, mint-green (#9bf0c4) on hover/active.

1. **Package** (layers icon) → tray: "Merge into bundle", "Split from bundle", "Set role: Full / Teaser / Promo / Repost" (small role pills, one highlighted to match current role_badge)
2. **Distribute** (share/send icon) → tray: "Schedule cross-post" (opens the same flow as blank cards), "Refresh all instances", "View distribution plan"
3. **Access** (eye icon) → tray: "Visibility: Visible / Hidden / Review" (segmented control), "Audience / tier gating"
4. **Library** (folder-plus icon) → tray: "Add to collection", "Export / download"
5. **More** (kebab icon, visually separated by a thin divider above it) → tray: "Advanced view" (muted link style), and below a second thin divider: "Delete" in red text — ONLY red on hover, gray idle, and requires a confirm click (button changes to "Confirm delete" on first click).

### Merge button → "Relay View" toggle

Above or near the radial cards, include a toggle control (segmented button, two options): **"Per-platform"** (default, shows radial cards as described) and **"Relay View"** (merged).

When "Relay View" is selected:

- The radial cards animate/collapse into **two large stat panels** side by side (or stacked on mobile):
  1. **"All Platforms"** — sum of `totals` across every linked instance (Patreon + X + DeviantArt + Relay), large mint-green numbers for impressions/likes/comments.
  2. **"Ads + Teasers"** — sum of `role_breakdown.teaser` + `role_breakdown.promo` (label this panel "Ads + Teasers performance"; if there is no teaser/promo data, show a muted empty state: "No ad or teaser variants tracked for this piece yet.")
- Keep the hero card and action bar in place; only the radial region transforms.
- Toggling back to "Per-platform" restores the radial layout with the same transition style as the initial unfold (smooth, not abrupt).

## Closing the hero view

- An "X" close button top-right of the hero region, or clicking the darkened scrim background, animates back to the grid (reverse of the unfold transition) and restores full brightness.

## Explicitly OUT OF SCOPE for this prototype (do not build)

- Platform-specific quick actions beyond refresh/link (e.g. a "Retweet" shortcut on the X card) — this is a **future feature**, not part of this build.
- Real API wiring — use the mock JSON structure above as local component state; shape must match exactly so it's easy to swap for real fetches later.
- Bulk multi-select actions across many posts at once — this prototype is single-post/single-bundle focused.
- Mobile-specific radial re-layout beyond a reasonable responsive fallback (e.g. stacking platform cards vertically below the hero on small screens is acceptable).

## Tech stack

- **Next.js** App Router, **Tailwind CSS**, **shadcn/ui**-style primitives (Button, Tooltip, Toast/Sonner for the cross-post confirmation).
- Framer Motion (or CSS transitions if simpler) for the grid→hero unfold and radial→merged toggle animations.
- All data as local mock JSON/state in the same file, structured exactly as shown above so real API responses can later be dropped in with minimal changes.

## Success criteria

A creator can: (1) click a post and watch it become a focused hero with a scrim-darkened backdrop, (2) see exactly which platforms it's live on with live-feeling stats and a working (simulated) refresh, (3) spot at a glance which platform it hasn't been posted to yet via a distinct blank card with a one-click "Schedule cross-post" action, (4) use a compact 5-icon action bar (not 10+ buttons) to access packaging, distribution, access, library, and destructive actions via hover trays, and (5) toggle between per-platform detail and one merged "Relay View" that separates canonical content performance from ad/teaser performance.

Build this as a polished, animated single-screen interaction — not a static wireframe.

```

---

## Repo reference (for you, not v0)

- **Data contracts used above** are real API response shapes — see [STUDIO_PACKAGING_DATA.md](./STUDIO_PACKAGING_DATA.md) for `role_breakdown`, `crosspost_gaps`, and instance list fields.
- **Theme tokens** pulled from production: `[WorkDrilldownView.tsx](../../web/app/studio/analytics/WorkDrilldownView.tsx)` (`#050706`, `#9bf0c4`, `#0f1a14`, `#2a7a4a`).
- **Fonts:** Fraunces (display) + DM Sans (body) — see `[web/app/layout.tsx](../../web/app/layout.tsx)`.
- **Existing legacy action bar** (being partially superseded by this design): `[BulkActionBar.tsx](../../web/app/components/BulkActionBar.tsx)` — Visibility, Audience, Collection, Export, Details, Delete actions folded into the 5-segment bar above.
- **Existing modal/darken pattern** for reference: `[InspectModal.tsx](../../web/app/components/InspectModal.tsx)`.
- **Cross-post scheduling backend** (real, not mocked once wired): `POST /api/v1/relay/posts/:post_id/distribution-plan`.
- **Grid starting point:** `[GalleryGrid.tsx](../../web/app/components/GalleryGrid.tsx)` / `[GalleryGridTile.tsx](../../web/app/components/GalleryGridTile.tsx)` — "Active Posts" grid referenced in Screen 1.

## Action bar decision record

Approved 5-segment structure (see [STUDIO_PACKAGING_DATA.md](./STUDIO_PACKAGING_DATA.md) for API fields feeding each):

| Segment | Icon | Child actions |
|---------|------|----------------|
| Package | Layers | Merge into bundle, Split from bundle, Set role (full/teaser/promo/repost) |
| Distribute | Share | Schedule cross-post, Refresh all instances, View distribution plan |
| Access | Eye | Visibility (visible/hidden/review), Audience/tier gating |
| Library | FolderPlus | Add to collection, Export/download |
| More | Kebab | Advanced view (legacy drilldown link), Delete (red-on-hover, confirm-to-execute) |

`Details` (legacy) is folded into **More → Advanced view** since the hero-unfold itself becomes the primary inspection surface.

## Deferred (explicitly out of scope for v0 + Phase 10b)

- Platform-specific quick actions (e.g. one-click Retweet from the X card) — noted by the user as "a feature to discuss later."
- Real data wiring — Phase 10c once the v0 output is reviewed.
- Bulk/multi-post hero interactions.

---

## Round 2 — "Linked Set" vs "Collection" disambiguation + multi-page series

**Trigger:** first v0 build reviewed against real screenshot. Two gaps found:

1. **No simulated multi-item groups** — comic pages (Page 1 vs Page 5 view counts) and A/B teaser-vs-real-post content have no visual representation yet; everything in the prototype is a single image.
2. **Merge/Split don't belong on the hero action bar** — you've already drilled into one post; there's nothing else there to merge with. Merge is a multi-select operation that belongs on the grid, where multiple posts are actually visible and selectable.

### Naming decision (carries through all future prompts)

Rename the analytics-grouping concept from **"Bundle"** to **"Linked Set"** in all user-facing copy. Reserve the word **"Collection"** exclusively for the existing visitor-facing curation feature (which controls what appears on the public profile). These must never be described with overlapping language:

| Concept | User-facing name | Icon | Affects public profile? |
|---------|-------------------|------|--------------------------|
| Visitor curation (existing) | **Collection** | Folder | Yes |
| Analytics grouping (renamed) | **Linked Set** | Chain/link | No — cosmetic to analytics only |

Any UI copy introducing "Linked Set" for the first time should include a one-line clarifier: *"Linking groups these posts' analytics together. It won't change how they look on Patreon or your profile — that's what Collections are for."*

### Delta prompt — paste this into the same v0 session to iterate on the existing build

```

Update the existing Relay studio hero-unfold build with the following changes. Keep everything else (theme, radial cards, blank cross-post cards, Relay View toggle) as-is.

## 1. Remove Merge/Split from the hero action bar

The first icon segment (currently "Package" with Merge/Split/Role) should become a segment called "Role" containing only:

- "Set role" (pills: Full / Teaser / Promo / Repost, plus an editable text field for a custom label like "Page 3" or "Variant A")
- "Unlink from set" — only visible/enabled when this post is currently part of a Linked Set; removes just this one post from its set.

Do NOT include any merge action here. Merge only happens from the grid (see below).

## 2. Add multi-select "Link posts" action to the grid

On the Active Posts grid screen, when the creator checks 2 or more post cards (checkbox already exists top-left of each card), show a small floating action bar at the bottom of the screen with one primary button: "Link posts" (chain/link icon, mint-green #9bf0c4 accent).

Clicking it opens a small confirmation sheet:

- Title: "Link 3 posts together"
- One-line explainer in muted gray: "Linking groups these posts' analytics together. It won't change how they look on Patreon or your profile — that's what Collections are for."
- A vertical list of the selected posts, each with a thumbnail, a role dropdown (Full / Teaser / Promo / Repost), and an editable label text field (e.g. "Page 1").
- One of the posts should be marked "Cover" (radio button) — this becomes the thumbnail shown on the grid for the resulting Linked Set.
- Primary button: "Link posts". Secondary: "Cancel".

After confirming, replace the individual grid cards for those posts with a single new "Linked Set" card (see below) and clear the selection.

## 3. New grid card type: Linked Set (stacked thumbnail)

A Linked Set card looks different from a normal post card so it's never confused with a Collection folder:

- Thumbnail area shows the "cover" post's image with 2 additional thumbnail edges peeking out from behind it (fanned/stacked card effect — like a small deck of cards), NOT a folder icon.
- Small badge bottom-left: a chain-link icon + count, e.g. "Linked · 5" in a dark pill with mint-green (#9bf0c4) text.
- Everything else about the card (title, audience label) stays the same as a normal post card.

Use this exact mock data for one Linked Set on the grid (a 5-page comic):

```json
{
  "linked_set_id": "set_reapers_comic",
  "cover_post_id": "post_comic_page_1",
  "title": "The Reapers — full issue",
  "members": [
    { "post_id": "post_comic_page_1", "member_label": "Page 1", "role": "full", "total_reach": 1200 },
    { "post_id": "post_comic_page_2", "member_label": "Page 2", "role": "full", "total_reach": 980 },
    { "post_id": "post_comic_page_3", "member_label": "Page 3", "role": "full", "total_reach": 1050 },
    { "post_id": "post_comic_page_4", "member_label": "Page 4", "role": "full", "total_reach": 890 },
    { "post_id": "post_comic_page_5", "member_label": "Page 5", "role": "full", "total_reach": 640 }
  ]
}
```

Also add a second Linked Set example representing an A/B teaser test (2 members, roles "teaser" and "full", labels "Variant A — teaser crop" and "Variant B — full reveal") to prove the same card pattern handles both the comic case and the A/B case.

## 4. New screen: Set drilldown (between grid and hero-unfold)

Clicking a Linked Set card (instead of going straight to the single-post hero-unfold) opens a new intermediate screen:

- Same dark scrim/stage-darken treatment as the hero-unfold.
- Header: the set title ("The Reapers — full issue"), with a small "Linked · 5" chain badge next to it.
- A horizontal filmstrip of member thumbnails (scrollable if it overflows), each thumbnail showing:
  - The `member_label` (e.g. "Page 1") as a caption below the thumbnail.
  - A small role chip (Full/Teaser/etc.) if not the default.
  - The `total_reach` number directly under the label, in tabular numerals.
- Directly above or below the filmstrip, render a simple horizontal bar chart with one bar per member (height proportional to `total_reach`), so the creator can see at a glance which page underperforms (Page 5 should visibly be the shortest bar in the mock data above).
- Clicking any individual thumbnail in the filmstrip transitions into the existing single-post hero-unfold (radial platform cards, Relay View toggle, etc.) for that specific post — reuse the exact same hero-unfold screen already built, just entered from this new intermediate screen instead of directly from the grid.
- A close "X" or clicking the scrim returns to the grid, same as the existing hero-unfold close behavior.

## 5. Keep everything else unchanged

The single-post hero-unfold (radial platform cards, blank "Not on X yet" cards, Relay View merge toggle, the 4 remaining action bar segments: Role/Distribute/Access/Library/More) stays exactly as already built. This update only adds the grid-level linking flow and the new Set drilldown screen as an optional detour before reaching that existing hero-unfold.

```

### Other misalignments to verify against the live build

- **Icon check:** confirm the "Role" segment (formerly "Package") uses a tag icon, not the layers icon — layers/stacked-squares now visually belongs to the new Linked Set card treatment, so don't reuse it for the action bar segment or the two will look related when they're not.
- **Verb consistency:** audit all copy in the existing build for the word "bundle" or "merge" and replace with "link" / "Linked Set" so the rename is consistent everywhere, not just in the new delta.
- **Cover selection UX:** when linking posts, "Cover" should default to whichever selected post has role "Full" (or the first selected if none), not an arbitrary default — reduces friction in the common case.
- **Relay View scope while inside a Set drilldown:** the merged "Relay View" toggle lives on the single-post hero-unfold, not the Set drilldown. Do not add a set-wide Relay View toggle yet — that's a reasonable Round 3 idea (aggregate stats for the whole comic across all platforms) but should wait until this round is validated.

### Recommended backend follow-up (not needed yet)

Once this visual pattern is validated in v0: add an optional `memberLabel: String?` column to `CreativeWorkMember` (alongside existing `sortOrder`, `variantRole`) so real linked sets can carry page/variant labels. No schema change needed for this round — mock data only.
```

