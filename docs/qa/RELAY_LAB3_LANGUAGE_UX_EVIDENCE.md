# Relay Lab 3 — language-first UX evidence

**Playground:** `http://localhost:3000/studio/lab3`  
**Auth:** Studio session or Dev Ava (`/login/pilot-ux?returnTo=/studio/lab3`). Not Lab 2 corpus login.  
**Source clone:** Lab 1 `/studio/lab` data plane (`GalleryView` floorspace `lab3`). Production `/studio` is unchanged.  
**Flags:** Command Layer committed flags stay **off**. The Studio Command instrument remains visible when the layer is off.

This document records Lab 3 renovation evidence. It does **not** reopen Command Layer P4 status.

## Composition (Studio Command instrument)

Collapsed (default, even when old schedule events exist):

- Lab 3 top bar (Relay / Lab 3 / account) aligned to 20–24px gutters — no Goals, Automations, Crossposter, Patreon Health, Distribution, or Autopost
- **Studio Command** plate is the page’s centered visual anchor. Wrapper gutters stay `px-5 sm:px-6` (no `mx-auto` / no max-width on the wrap). The console is `mx-auto w-full max-w-[68rem]` (**1088px** cap) with desktop `sm:min-h-[7.5rem]` (**120px**). Gallery toolbar and grid stay full remaining canvas, so their left edges sit outside the narrower plate. Resting desktop console **120px** (caption + one-line command row **32px**, inline modes **44px**, `rounded-2xl` / 16px, fill `--lab3-instrument` `#0F1210` / `rgb(15, 18, 16)`). Resting border is the hairline `--lab3-hairline` `#1C211F`; mint is only for active/focus/execution. Desktop rhythm below the 40px identity bar: **40px** above (`sm:pt-10`) and **16px** below (`sm:pb-4`) → instrument `y≈80`, toolbar `y≈216`, then the existing **12px** gallery inset. Mobile keeps the compact pad (`pt-5` / `pb-2` → instrument `y=60`, height **115px**). Visible title **Studio Command** + descriptor **Arrange, schedule, or prepare drafts** (`hidden sm:block`, truncate). Accessible field name is **Studio Command** (`aria-labelledby` + `aria-describedby`). Empty idle state shows a clickable example in quieter command type (`text-[13px] sm:text-[14px]`, `--lab3-text-command` `#b8c2bc`, aria-hidden, no live region). Preview is a **32px** mint-ringed circle with a right arrow, aligned to the command line. Modes sit **inside** the same bordered surface below a hairline (Organize uses `LayoutGrid` / 4-dot grid). Status lives in a lower console region with a divider only when content exists.
- Compact collections shelf (**72px** row) when collections exist; no reserved empty band
- Gallery header 48px: All work + count · Import · (gap) search · Filters · mobile Schedule (`lg:hidden`)
- Square `ActivePostPresenceCard` grid (container-width columns). Designed **No preview** fallback; no native broken-image glyph
- Seam-mounted **Schedule** pull-tab at mid-height (`top-1/2`) using the same `CalendarDays` icon as the inspect header; no mint outline. Closed sits on the right edge with a thin neutral-green seam (`data-lab3-rail-edge`); open stays on the rail’s left seam at the same Y with no outline

Open:

- In-flow schedule aside **312px** at `lg+` (240–280ms displacement unchanged)
- Same Schedule pull-tab expresses open/close (`aria-expanded`); inspect header is title/month + calendar only (collapse is the seam tab)
- Main canvas **and** the instrument contract together with no overlap
- Below `lg`: overlay sheet; Schedule lives in the gallery header (no bottom-right float)

## Visual gates

### Gate 1 — shell, proportions, rail motion

| Check | Target | Builder |
|---|---|---|
| 1440 collapsed | Centered instrument cap, shelf, square columns, calendar handle only | **Pass with viewport note** — Native Cursor pane **`innerWidth=2304`**: console **1088×120** at `x=608` `y=80` (equal **608** side margins), fill `rgb(15, 18, 16)` / `#0F1210`, hairline `rgb(28, 33, 31)`. Toolbar **2304** at `y=216` (**16px** below instrument); first card **12px** below toolbar. `Emulation` 1440×900 reported **`innerWidth=1728`**: same `y=80` / `h=120` / toolbar `y=216` rhythm; console stayed **1088** and centered in remaining canvas. |
| 1440 open | 304–320px in-flow rail; instrument contracts with canvas; no overlap | **Pass with column note** — rail panel remains **312px**. Native pane: wrap **2304→2090**, console stays **1088** and recenters in remaining canvas (**501 / 501**). Handle `aria-expanded=true` / Close schedule on the left seam. 1440 override screenshot showed Schedule / August 2026 month grid with today **30** mint. |
| ~1024 transition | Flow vs sheet threshold (`lg`); title/descriptor/modes remain legible | Unit: `tests/web/studio-lab3-rail.test.tsx` sheet vs flow; below `lg` no floating handle. In-pane desktop override without `mobile: true` stayed **1229px**. Console **1088×120** at `y=80`, centered (**70 / 71**). Descriptor `display: block`. Modes height **44px**, labels intact. Toolbar `y=216`. |
| ~390 overlay | Descriptor collapses; command + Preview one row; compact mobile pad; sheet fallback | Browser: `Emulation` **390×844** `mobile: true`. Console **350×115**, **20px** pad (`console.y` 60), **8px** below. Descriptor `display: none`. Field and Preview (`32×32`) share a row. Modes height **44px**. Handle absent; sheet layout present. |
| Command preview / apply / undo | Arrow preview; Apply after preview; Undo after apply; no Reset | Unit: `tests/web/command-box.test.tsx` instrument describe. Instrument console + status region asserted. Browser: ghost fill without Preview (`idle`); Preview → Apply → Undo. Applied copy + “Schedule slices are on the rail.” After Undo: “Undone. Those changes are restored.” No Reset. |
| Command teaching | Ghost examples rotate 7s; starters change example set; no submit; pause on focus/hover/hidden; reduced motion static; layer-off examples not actionable | Unit: `tests/web/command-box.test.tsx` “Lab 3 command teaching” + instrument describe. Ghost is `aria-hidden` (span, not a button / no `aria-live`). Browser: idle Organize ghost; **Schedule** switches example and leaves the field empty; click-to-fill copies the example, state stays `idle`, starters unmount. Focus mint border `rgb(155, 240, 196)`. Starters are Organize / Schedule / Prepare drafts only, inline inside the console. |
| Layer off | Instrument stays visible and disabled | Unit: field, Preview, and modes disabled; `[data-command-instrument-console]` / `[data-command-instrument-status]`; wrapper has `px-5` / `sm:px-6` / `pt-5` / `sm:pt-10` / `sm:pb-4`; wrap **not** `max-w-[68rem]` / `mx-auto`; console **does** `mx-auto` + `sm:min-h-[7.5rem]`; fill `#0f1210`; **not** `min-h-[144px]`. |
| Collection filter | Compact shelf; All work clears | Shelf omits empty space; chips are 72px with title/count beside thumbs |
| Import / Filters / Calendar | Shared Lab 3 overlay grammar | Import / Filters / Calendar use `Lab3Overlay` (Escape, Close, focus restore). Calendar = August 2026 with icon month nav; occupied days 1,2,3,10,17,24,26,31 enabled after load. Filters sheet titled Filters, not raw production sidebar chrome. |
| Card keyboard / inspect | Unchanged default presence card | `lab3` density keeps 1:1 + default presentation |
| Hidden surfaces | Inert / unmounted when closed | Closed rail **unmounts** inspect children (no Collapse / Open calendar / events in a11y tree). Power panel not mounted on Lab 3. Filter sheet unmounts when closed. |
| Schedule auto-open | Applied `lens_hint: "schedule"` opens the rail | `lab3RailShouldOpen` + GalleryView handler; browser Apply opened the rail |
| Reduced motion | Rail transition duration 0 | `lab3RailTransition(true)` |

**Human Gate 1:** unsigned. Do not treat this file as a substitute for sitting the two 1440 states.

- [ ] Pass
- [ ] Fail — notes:

Signed: ________  Date: ________

### Gate 2 — adaptive on-day / off-day rail

| Check | Target | Builder |
|---|---|---|
| Empty days | 26–30px date + hairline (`28px`) | `tests/web/studio-lab3-adaptive-days.test.tsx` |
| Occupied + art | 88–104px (`96px`) lead thumb | same |
| Occupied, no art | Medium text row (`56px`) | same |
| Multiple events | Lead + count; overflow inspection | same; live rail showed +2 / +3 |
| Bounded artwork | Gallery items first; ≤8 `fetchGalleryPostDetail` | `resolveMissingLab3Artwork` |
| Today | Mint date; mint occupancy only when an event exists | `Lab3ScheduleDayRow`; today 29 highlighted |

**Human Gate 2:** unsigned.

- [ ] Pass
- [ ] Fail — notes:

Signed: ________  Date: ________

## Art baseline

- `node scripts/stage-pilot-collect-test-assets.mjs` — **ok** (Ava intro/supporter/studio + Milo/Quinn fixtures uploaded to R2).
- Representative `GET /api/v1/export/media/rcx_pilot_dev_ava/pilot_media_ava_intro/thumb?w=320` still returns **404 JSON**: `media_derivatives` table is missing. Pending hosted migrations `20260827210000_studio_gallery_snappy`, `20260828120000_gallery_published_at`, `20260828200000_command_grants_audit` are marked **HUMAN-MIGRATE** and were **not** applied.
- Cards show a designed **No preview** fallback (`data-gallery-thumb-fallback`). After the Linked Set mosaic path was included, **broken native `<img>` count was 0**.

## Isolation

| Check | Evidence |
|---|---|
| `/studio/lab3` exists; Lab 1 route untouched | `web/app/studio/lab3/` vs `web/app/studio/lab/` |
| Global AppNav hidden | `shouldShowStudioNav("/studio/lab3") === false` |
| Production Library has no CommandBox | `GalleryView` mounts CommandBox only when `floorspace === "lab3"` |
| Lab 2 collection sizes unchanged | Compact shelf is Lab 3-only; `CollectionStackCard` sizes not edited |
| Git-only | No Airtable ledger updates for this experiment |

## Verification commands

```bash
npx vitest run tests/web/studio-lab3-chassis.test.tsx tests/web/studio-lab3-rail.test.tsx tests/web/studio-lab3-adaptive-days.test.tsx tests/web/command-box.test.tsx tests/web/lab2-active-posts-chrome.test.tsx
npx tsc -p tsconfig.build.json --noEmit
```

**2026-08-29 language-first builder run:** 34 Vitest tests passed.

**2026-08-29 visual refinement builder run:** **40** Vitest tests passed. Root `tsc -p tsconfig.build.json --noEmit` clean. Lab 3 eslint on touched web files: clean.

`npm run dev:stack:restart` — API listening **8787** (`/api/v1/health` 200), Next.js **3000** (`/studio/lab3` 200).

**2026-08-29 command-hero teaching layer:** Verification suite **51** passed (`command-box` **25**, plus Lab 3 chassis/rail/adaptive + Lab 2 chrome). Root `tsc -p tsconfig.build.json --noEmit` clean. `next lint` on `CommandBox.tsx` + `Lab3CommandStarters.tsx`: clean. Ghost examples are aria-hidden and do not use `aria-live`. Starters are Organize / Schedule / Prepare drafts. Rotation is 7s with a 200ms crossfade; paused on focus, hover, `document.hidden`, off-screen, reduced motion, or disabled flags.

**2026-08-29 Studio Command instrument:** The chatbot-scale centered hero (`max-w-[68rem]`, **144–156px** console, **80px** top pad) is superseded. Verification suite **51** passed (`command-box` **25**, plus Lab 3 chassis/rail/adaptive + Lab 2 chrome). Root `tsc -p tsconfig.build.json --noEmit` clean. `next lint` on `CommandBox.tsx`, `Lab3CommandStarters.tsx`, `GalleryView.tsx`, `lab3-page-client.tsx`: clean. Resting instrument **2256×130** (row **84** + modes **44**, 16px radius) at pane **2304**; rail-open console **1944** (−312). Mobile **390**: console **350×130**, descriptor hidden, 24px pad, modes scroll. Local flags were **on** for Preview / Apply / Undo; committed Command Layer flags were not changed. Hosted HUMAN-MIGRATE migrations were not applied.

**2026-08-29 Studio Command optical pass:** Compact command strip vs the reference. Console **2256×115** (command row **32px**, modes **44px**), **24px** below identity. Example uses `--lab3-text` (still aria-hidden overlay, rotation/fill unchanged). Preview is mint-ringed **ArrowRight** aligned to the field. Organize uses `LayoutGrid`. `next lint` on `CommandBox.tsx` + `Lab3CommandStarters.tsx`: clean. `command-box` **25** + Lab 3 chassis/rail **16** passed.

**2026-08-30 instrument width cap:** Console `w-full max-w-[68rem]` left-aligned; wrapper gutters unchanged, no `mx-auto`. Fill stays `#101612`. Browser pane **2304**: console **1088×115** at `x=24`; toolbar **2304**. `command-box` **25** passed. `next lint` on `CommandBox.tsx`: clean.

`npm run dev:stack:restart` after the width cap — API **8787** `/api/v1/health` 200, Next.js **3000** `/studio/lab3` 200.

**2026-08-30 composition final pass:** Console centered (`mx-auto`) at `max-w-[68rem]`; fill `--lab3-instrument` **`#0F1210`**. Desktop pad **40px / 16px** (`sm:pt-10` / `sm:pb-4`) and `sm:min-h-[7.5rem]`. Native pane **2304**: instrument **1088×120** at `y=80` with equal **608** side margins; toolbar **2304×48** at `y=216`; **12px** to first card. Open rail: wrap **2090**, console recenters **501 / 501**, panel **312px**. 1440 override → **1728**; 1024 override → **1229** (centered **70 / 71**); 390: **350×115** at `y=60`. Verification suite **51** passed (`command-box` **25** + Lab 3 chassis/rail/adaptive + Lab 2 chrome). Root `tsc -p tsconfig.build.json --noEmit` clean. `next lint` on `CommandBox.tsx`: clean. `npm run dev:stack:restart` — API **8787** `/api/v1/health` 200, Next.js **3000** `/studio/lab3` 200. Hosted HUMAN-MIGRATE migrations were not applied. Human gates remain unsigned.

**2026-08-30 command type quieting:** Command/ghost type is `13px` / `sm:14px` in `--lab3-text-command` `#b8c2bc` (was `15/16px` `#d0ddd4`). Inactive modes use `--lab3-text-ghost`. `command-box` **25** passed. Human gates remain unsigned.

Human sign-off remains on the gates above.
