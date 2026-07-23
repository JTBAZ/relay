# Escape Hatch EH-035 — Visitor visual system (evidence)

**Slice:** EH-035  
**Status:** Accepted locally (preview-only)  
**Branch context:** `crosspost-rework`  
**productionSafe:** `false` (unchanged)

## What shipped

Cold-gallery renovation of the generated Escape Hatch visitor kit:

- **Tokens:** Dark/light/warm schemes retargeted away from warm-ink/terracotta/cream defaults. Default accent `#4a7fc4`. Synced in `theme-vars.css`, `template/lib/theme.ts`, and `src/fill-template.ts` `themeCssVars`.
- **Type:** Default `editorial` = Outfit + Source Sans 3. `studio` = Space Grotesk + DM Sans. `signal` = Newsreader + Source Sans. Fraunces / Instrument Serif removed from defaults.
- **Chrome:** Sticky visitor top bar (creator name + Account). Soft-gate / membership honesty + persona switch demoted to operator strip. Hatch Console / Style dials only in demoted footer operator cluster.
- **Gallery:** Media mosaic (featured span); access line + title under media; less card chrome.
- **Post:** Media first, then title/meta; paywall overlays remain honest (no `/api/media` while locked).
- **Account / login:** Wrapped in `PatronChrome` (not `ConsoleNav`).
- **Docs:** `OPERATIONS.md`, `OWNERSHIP.md`, batting order EH-035, status/`manifest` → EH-035 → next EH-040.

## Commands

| Command | Result |
|---------|--------|
| `npm run typecheck --prefix packages/escape-hatch` | exit 0 |
| `npm run escape-hatch:test` | **15 files / 276 tests**, exit **0** (clean-dir build uses async spawn so Vitest birpc no longer times out at 60s) |
| `npm run fixture` | Elena Adler kit regenerated under `.out/elena-adler` |
| `npm run status --prefix packages/escape-hatch` | Slice **EH-035**, next **EH-040**, `productionSafe: false` |

## Security / honesty (unchanged)

- Locked UI still skips `/api/media` for premium bytes.
- Soft persona only when provider `none`.
- No `productionSafe` flip; `public_legacy` residual remains.
- Identity / entitlements / private media delivery paths not weakened.

## Browser check

Regenerate + open `http://localhost:3001/preview` after `npm install && npm run dev` in `.out/elena-adler`. Expect:

- Sticky name bar + Account (not large hero stack)
- Soft-gate strip demoted
- Cobalt accent / sans display
- Mosaic gallery; locked tiles with compact CTA
- `/account` and `/login` share visitor chrome (no Hatch Console tabs)

## Residuals → next

- Milestone 3 live Path A/B signed-in/staff browser personas
- **EH-040** Creator-owned Patreon OAuth
- Billing / deploy still open
