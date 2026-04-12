# Delta Out — T-011 (Artist Library + Designer UI completion)

## 1. Delta

- **Library top bar (`LibraryTopBar.tsx`):** Bridge copy under the title (pattern-library “SoT vs stage”): Library controls what visitors/subscribers see. **Sync pill:** `role="status"`, `aria-label`, `title` tooltips per state (synced / syncing / issue). Removed hardcoded **revenue** placeholder (`revenueLabel="1235"` from `GalleryView`) — top bar now uses default em dash for revenue until wired.
- **Patreon menu (`PatreonSyncMenu.tsx`):** Opening paragraph explains Patreon → Library vs Designer; **`aria-expanded`**, **`aria-controls`**, panel **`id`** for the dropdown; OAuth status line no longer calls `oauthLine()` twice per render.
- **Library main (`GalleryView.tsx`):** **List fetch errors** use `--lib-destructive` tokens + `role="alert"` + title “Could not load library”. **Empty states:** truly empty library vs empty after filters/collection — dashed panel for first-run onboarding copy; bordered panel when filters hide everything.
- **Designer (`DesignerView.tsx`):** Loading state uses Relay CSS variables + copy that preview follows Library visibility rules; **layout load error** banner uses consistent destructive styling, `role="alert"`, and a line about editing offline when API is down.

## 2. Risks / blockers

- **Off Script** was set in Airtable for overlapping human/ledger UI work — confirm Production Ledger if any parallel UI units conflict.

## 3. Next step hint

Continue **T-012** per Sort Order (`Next Task`).

### Manual spot-check (operator)

1. `/` — title + subtitle, sync pill, Patreon menu (keyboard: button opens dialog, bridge copy visible).
2. Empty dev library — onboarding empty panel; apply filters until zero rows — filter empty panel.
3. `/designer` — loading copy; optionally stop API to see layout error banner.

---

## Airtable **Runs** log (paste)

| Field | Suggested value |
|-------|------------------|
| **Outcome** | `success` |
| **Output Summary** | T-011: Library/Designer UX — sync pill a11y, Patreon menu copy+aria, empty/error states, revenue placeholder removed. |
| **CLI Exit Code** | `0` |
