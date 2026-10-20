# Routing refinement review

2026-10-19. Scope: changes after `recipe-editor-before-routing.html` and `recipe-editor-before-routing.test.mjs` in this directory, plus matching product/design documentation. Other working-tree files, especially AGENTS.md and editor-bench work, are excluded.

## Layout and copy

The user's annotations identify two interruptions in reading order: duplicate destination prompts and an automatic release title between the prompt and the destination tags. The revision uses one prompt, persistent account tags, then optional Details. Whole-recipe selection stays above the trigger. The existing palette and motion remain. The compact two-column details region groups timing separately from treatment; Description retains its own region. Mobile stacks those controls and keeps logos/handles readable. Collapsed timing and treatment describe the row without exposing a recipe or draft name as its title.

## Ponytail Review

Read the changed render, source-logo update, hub handlers, storage validation/loading, reset/example/Undo callers, focus helpers and tests. Expected load remains a local demo with 16 routes and 32 description drafts. No new dependency, persistence schema or production caller was introduced. SVG paths are static; account labels and saved names remain escaped or assigned through textContent.

The saved loader revalidates storage before loading, cancels pending working-draft writes and clears the superseded working copy. Templates keep their edits separate from the saved slot. Loading is reversible through the existing configuration snapshot. New tests cover destination-first DOM, valid logos, collapsed account editing, complete template selection and saved reload/Undo. All 14 tests passed. No additional material code finding in this scope.

## Web Design Guidelines

Fetched the current Vercel Web Interface Guidelines on 2026-10-19. New controls use native buttons, accessible names, existing visible focus and explicit expanded/controlled states. Destination group legends remain available to assistive technology. SVGs are decorative beside visible platform names. Hub Escape/close returns focus to Recipes; live browser check passed. Loading changes configuration only, with Undo. Existing inline validation, reduced motion, skip link and footer clearance remain.

Layout detector before and after reported only the existing filter-block false positive: desktop left divider has 28px inset; mobile top divider has 16px inset and no left border. No new layout warning appeared. Rendered at 1440×900, the user's 1321×854, 885×572 and 390×845; open/collapsed/hub states inspected. Full mobile captures omit the scrollbar and can wrap tags differently from viewport captures. Right edges remain complete; only native screenshot padding was cropped.

The demo intentionally retains its single saved-recipe slot; production multi-recipe persistence is not implemented by this change. No live publishing, emails, Previewizer export or model calls were checked.
