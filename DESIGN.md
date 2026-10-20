---
name: Relay Posting Rhythm prototype
description: Implemented design system for the standalone Posting Recipe studio sheet only.
colors:
  bg: "#0e141d"
  surface: "#17212e"
  subtle: "#121c28"
  input: "#101925"
  border: "#354354"
  border-hi: "#637e9b"
  fg: "#e8edf4"
  muted: "#adbaca"
  green: "#83d9a8"
  green-ink: "#102a1c"
  mint: "#a5e6bf"
  blue: "#9bc7ff"
  amber: "#f2c887"
  red: "#ffb5b0"
typography:
  headline:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "28px"
    fontWeight: 650
    lineHeight: 1.3
    letterSpacing: "-.025em"
  title:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "18px"
    fontWeight: 650
    lineHeight: 1.4
  section:
    fontSize: "15px"
    fontWeight: 600
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontSize: "13px"
    fontWeight: 550
rounded:
  control: "9px"
  radius: "14px"
  tray: "12px"
  release: "13px"
  chip: "8px"
spacing:
  inline: "8px"
  row: "10px"
  sequence: "12px"
  stack: "16px"
  fields: "18px"
  route: "23px"
  builder: "25px"
components:
  button-primary:
    backgroundColor: "{colors.green}"
    textColor: "{colors.green-ink}"
    rounded: "{rounded.control}"
    padding: "8px 13px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.fg}"
    rounded: "{rounded.control}"
    padding: "8px 13px"
  button-subtle:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.control}"
    padding: "8px 13px"
  input:
    backgroundColor: "{colors.input}"
    textColor: "{colors.fg}"
    rounded: "{rounded.control}"
    padding: "9px 11px"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.fg}"
    rounded: "{rounded.radius}"
    padding: "22px 24px"
  chip:
    backgroundColor: "{colors.subtle}"
    textColor: "{colors.fg}"
    rounded: "{rounded.chip}"
    padding: "6px 10px"
  release:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.fg}"
    rounded: "{rounded.release}"
---

# Design System: Relay Posting Recipe prototype

## Overview

Rhythm is the user-facing name for the complete trigger, filter and release configuration. Use Posting Rhythms for the stable workspace title, and Rhythms, New rhythm, Preview rhythm and Save rhythm for the corresponding actions. Existing recipe identifiers are compatibility details.

**Creative North Star: "Studio sheet"**

This document records the finished local Posting Recipe prototype at [recipe-editor.html](docs/studio/posting-recipe-build-plans/demo/recipe-editor.html). Its token authority is limited to that artifact and its future extensions. It does not redefine `web/`, other Relay surfaces, or production components. The implementation is a standalone HTML demo with fictional accounts, browser-local storage and a publication simulator.

The studio sheet uses a navy shell, bounded blue-gray work surfaces and compact forms. A numbered line holds the release sequence together. Editable destination account chips lead each release; a separate Details control opens timing, treatment and description. Native system text and restrained color keep account context readable.

Evidence: the artifact's inline stylesheet, `renderRoutes`, `descriptionSection`, `scheduleControls`, `renderProgress`, recipe-hub and focus handlers; [PRODUCT.md](PRODUCT.md); the approved [surface brief](.impeccable/surfaces/posting-recipes.md) and [studio-sheet sketch](.impeccable/mocks/decision/studio-sheet.html). The artifact is authoritative where sketch values differ. Current routing review screenshots are in `.impeccable/review/routing/`: `desktop.png`, `user-1321.png`, `user-885.png`, `mobile.png`, `mobile-full.png`, `collapsed-1321.png` and `hub-1321.png`. Those files are screenshots of the HTML, not raster UI assets used by it.

**Key Characteristics:**

- A single broad workspace with an inline release sequence.
- Rounded controls, native form affordances and visible keyboard focus.
- Contextual detail that preserves the surrounding sequence.
- A persistent save entry with explicit review authority.

## Colors

The primary action is pale green; blue marks focus and contextual controls. Dark neutral layers carry most of the interface. Frontmatter keys preserve the artifact's CSS custom-property names.

### Primary

- **Action green** (`green`) and **green ink** (`green-ink`): primary save and confirmation buttons.
- **Soft mint** (`mint`): positive status, selected notification content and acknowledgments.

### Secondary

- **Selection blue** (`blue`): keyboard outlines, caret, timing options and contextual settings.

### Tertiary

- **Attention amber** (`amber`): blocked or nonmatching sample states.
- **Error rose** (`red`): validation messages and invalid field borders.

### Neutral

- **Navy shell** (`bg`): page ground and unselected release markers.
- **Blue-gray surface** (`surface`): source, release and final-choice panels.
- **Inset navy** (`subtle`): trays and filter chips.
- **Field navy** (`input`): input, select and destination interiors.
- **Quiet rule** (`border`) and **hover rule** (`border-hi`): panel separation and control hover.
- **Readable white** (`fg`) and **supporting gray** (`muted`): primary content and contextual explanation.

Component-specific selection fills and hover colors remain in sidecar snippets. Generated tonal ramps in the sidecar are panel previews, not additional implemented tokens.

**The State Pairing Rule.** Pair color with text or control state: errors have messages, destination choices use `aria-pressed`, and release editing uses `aria-expanded`.

## Typography

The artifact uses the operating system UI sans stack in the frontmatter. There is no downloaded font or separate display face. No display-font rule is established for other Relay surfaces.

- Page heading: headline role; changes to (25px) at widths up to (650px).
- Section heading: title role.
- Description heading and trigger phrase: section role.
- Destination chips and Details: (13px); chip platform labels use weight (550), handles (400), and Details (500). There is no separate release title or Editing badge.
- Form text and copy: body role. Description notes cap at (65ch); sample and handoff copy cap at (70ch).
- Labels, collapsed context and supporting text: (13px); labels use the label weight.

Buttons use weight (550) and line-height (1.4). Copy previews retain whitespace and use line-height (1.65). Release numbers and day counts use tabular numerals. General mobile inputs and textareas use (16px); the schedule selector and description-mode selector explicitly remain (14px).

## Layout

The main container is centered at a maximum width of (1176px), with desktop padding (28px 28px 24px). The header and persistent bottom bar align their gutters with a (1120px) content measure. The header has a minimum height of (64px). Body bottom padding reserves (100px) plus the bottom safe-area inset for the fixed action bar; the bar's desktop bottom padding is (15px) plus that inset. Document scroll padding is (20px) above and (130px) plus the bottom safe-area inset below.

The source strip has two columns separated by a vertical rule. The release sequence has a (39px) left gutter, a one-pixel connector and (27px) circular number markers. Release cards are separated by the sequence spacing token. Destination chips stay in each release header, followed by Details and an optional remove action. They use 14px names, 21px logos and 46px minimum height; handles remain 13px. Treatment controls sit beside their toggles with a 14px gap, reduced to 12px on mobile. Checkboxes show a solid filled square when checked, without a tick; native input semantics and visible focus remain. Header padding is (16px 18px). Each open desktop editor divides timing and treatment into two equal columns, with a separate Description region below. That region starts with a (145px) heading column. These later stylesheet rules override the earlier three-column declaration. Repeated field groups use the frontmatter spacing values; these are observed steps, not a universal mathematical scale.

- Up to (1000px): timing and treatment retain two equal columns; Teaser and Coach remain vertically arranged within treatment. Final choices and recipe save options also use two columns. At the reviewed (885px) width, the source strip and vertical sequence remain intact.
- Up to (650px): main padding becomes (23px 16px); source, route, description, save and test fields stack. The filter divider becomes horizontal. The sequence gutter shrinks to (31px), number markers to (23px), and release bodies use (16px 13px) padding. Release headers use (13px 12px) padding, chips use (8px) padding and their handles wrap onto a separate line. Details keeps its accessible name while its visible word hides. Collapsed context stacks beneath the account chips. Description helper text disappears. Page tools wrap. Body bottom padding becomes (119px) plus the bottom safe-area inset; bar bottom padding becomes (12px) plus that inset. The bar retains the save action while its duplicate test action hides.
- From (1100px): saved-description mode places its mode selector beside the draft controls; preview remains underneath. This compression is limited to the saved, non-editing state.

The sample simulator uses a fixed-layout table on wider screens. On mobile it becomes labeled two-column rows with full-width release and action cells. Long summaries and copy wrap anywhere. Popover widths are bounded by viewport calculations. The reviewed narrow viewport is (390px).

## Elevation & Depth

Panels use one-pixel rules and tonal layering without resting shadows. The fixed action bar sits at `z-index:3`; local popovers use `4`; the undo/status toast uses `5`.

- **Local popover shadow** (`0 12px 26px #0006`): timing and demo-context menus.
- **Toast shadow** (`0 8px 24px #0006`): transient status and undo feedback.

**The Local Depth Rule.** Keep sequence and editor surfaces flat; reserve shadows for elements floating over the workspace.

## Shapes

Panels, releases, trays and controls use the frontmatter's separate radii. Chips and status badges share the chip radius. One-pixel borders carry structure; circular status dots and release numbers provide sequence cues. Interface icons are inline stroked SVG, normally (17px), with rounded caps and joins and stroke width (1.7). Platform marks are filled (18px) SVG: Patreon reuses the auth-hub mark; X and DeviantArt use the Simple Icons paths recorded in `platformPaths`. They replace generic platform dots in account controls. The source selector reserves (42px) left padding for its mark.

Ordinary buttons and form controls have a minimum height of (40px). Compact filter chips use (34px), some contextual controls use (36px), and toast actions use (32px). Native checkboxes are (17px) inside labeled rows with a (40px) minimum height. These are the artifact's actual target sizes, not a claim that every control is (40px).

## Components

### Buttons and fields

Primary buttons carry green fill with dark ink. Ghost buttons retain a border on transparent ground; subtle settings buttons remove the resting border. Generic hover uses a lighter blue-gray background and stronger border. Active buttons move down (1px); disabled controls use opacity (.5) and a not-allowed cursor. Field hover strengthens the border; invalid fields use the error color. Textareas resize vertically and start at (105px) minimum height.

Keyboard focus uses a (2px) blue outline offset by (3px) across buttons, fields, summaries, links and programmatic focus targets. A focus-revealed skip link targets the focusable main editor. Buttons and summaries use `touch-action:manipulation`. Visible labels, legends and accessible names identify account, release and description context. Inline validation uses status regions. Hidden sections use `hidden`, with the stylesheet enforcing removal from layout.

### Header and persistent actions

The header carries Relay, the Posting recipes location and Draft/Saved status. Name and enrollment edits reset the badge to Draft; hydration reflects whether a saved configuration was loaded. It contains no implemented navigation menu. The browser theme color matches the shell. The fixed bottom bar summarizes release count and review requirements, then exposes save. Opening save reveals final choices inline and moves focus to their heading. Closing returns focus to the save entry. This is a sheet flow without a popup wizard.

### Release accordion

Each release is an article with a numbered marker. Platform-logo and handle chips are always visible and editable, including when details are collapsed. Destination choices use `aria-pressed` and a screen-reader legend. A right-side Details button controls the editor using `aria-expanded` and `aria-controls`; at most one editor opens, and clicking its button can close it. There is no repeated destination legend, preview/original title or Editing badge above the chips. Collapsed context contains timing, treatment and a generic description mode, without a saved draft or recipe name. Separate remove controls have release-specific accessible names. Adding a release opens it and focuses Details. Removing a release can be reversed through the toast's Undo action.

### Recipes hub

Recipes in the top tools opens an inline panel above the source strip. It offers the single last-saved browser-local recipe, two full-flow editable templates (Art release rhythm and Share the original), and New recipe. It is not a multi-recipe persistence library. Rows use (13px 15px) padding, a bold (14px) name and supporting (13px) text. Opening focuses Close; Close or Escape restores the Recipes opener. Loading a saved recipe or template, or starting new, closes the panel and supports Undo.

### Treatment and description

Teaser has an independent checkbox and a disclosure labeled with the selected preview type. It opens direct radio choices in an anchored menu to the right of its trigger, without changing the release height. At widths up to 1000px, the menu opens below the trigger within the viewport. Escape and outside clicks dismiss it; Escape returns focus to the trigger. Selecting a choice updates the disclosure label. Coach has an independent checkbox and a disclosure labeled Engagement. Its drawer restores Help me with and optional notes. These controls are disabled while their treatment is off. Clicking the same disclosure closes it. There is no separate Done step or repeated treatment summary.

Description mode chooses original, edited original or a reusable Draft. Editing original is disabled until uploaded context exists. Saved descriptions expose a selector, Edit draft, New draft and a disclosure preview. Fields and previews match selected destination accounts. Draft edits remain isolated until saved; Cancel returns to the existing choice.

### Future flow and publication authority

The default demo context is upcoming artwork, behind Demo context. The primary path prepares reusable future behavior: source and AND filters, release sequence, then save choices. The uploaded example is secondary. Final choices show timezone, review authority and notifications; Default and Always on live in recipe options. One-time plan confirmation has a separate tray.

**The Authority Rule.** Saving, enrollment and sample handoff never imply publication. The final authority remains Review each post; the simulator advances dependent releases only after matching destination publication confirmation. Local demo copy must stay visible wherever outcomes could be mistaken for live delivery.

### Motion and focus continuity

The reveal animation moves (4px) upward while fading from opacity (.7) to (1). Standard reveals use (200ms), new releases (220ms), and timing popovers (160ms), with `cubic-bezier(.16,1,.3,1)`. Button/field transitions use (160ms), release borders (180ms), and chevron rotation (200ms). Reduced motion removes animations and transitions and makes scrolling immediate. Focused headings, result status and relevant fields are scrolled into view; closing test/handoff detail restores a useful trigger, and handoff transitions focus the next required field.

## Do's and Don'ts

### Do:

- Do extend these tokens within the standalone Posting Recipe prototype's scope.
- Do preserve account names, handles, timing references and review authority in compact summaries.
- Do keep treatment enablement separate from settings inspection.
- Do retain visible focus, inline validation and reduced-motion behavior in new prototype states.
- Do derive future token changes from implemented, reviewed code.

### Don't:

- Don't apply this prototype's tokens retroactively to other Relay surfaces.
- Don't present local storage, fictional connections or simulated receipts as production delivery.
- Don't grant publication authority through Default, Always on, saving or settings inspection.
- Don't turn the studio-sheet composition into a mandatory layout for unrelated product surfaces.
- Don't treat generated sidecar tonal ramps as an implemented palette expansion.

### Rhythm preview

Preview rhythm sits beside Save rhythm in the persistent action bar. A native dialog shows mock artwork, trigger filters, matching/skipped branches, destination logos, treatment and description choices, and publication dependencies. Dependent releases nest beneath their reference release. A collapsed Sample execution disclosure retains the local simulator. Escape and Close restore focus to Preview rhythm. The modal fits desktop and mobile widths, respects reduced motion and contains scrolling. Unconnected Instagram, Bluesky and Tumblr logos are gray beside connected account tags. Selecting one opens a platform-specific connection dialog. Connect simulates a demo account, Done closes it, and Escape or Cancel returns focus to the opening icon. Instagram support is explicitly planned; this mock does not change connected accounts or eligible destinations.

### Relay app integration — 2026-10-19

The approved Posting Rhythms surface is implemented at `/studio/rhythms`, inside the existing authenticated Studio shell. Its tokens and motion are scoped under `.posting-rhythms`; other Relay surfaces keep their existing design. The app retains destination-first numbered releases, compact timing, Modify toggles, anchored preview selection, Draft controls and Preview/Save actions. Saved configurations and release history use the server; the preview remains a mock-art inspection. Connection dialogs distinguish creator-confirmed extension handles from unavailable platforms. The prototype's simulated connection and publication controls do not grant real publishing authority. See `docs/studio/posting-recipe-build-plans/INTEGRATION.md` for implemented capabilities and verification.
