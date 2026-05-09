# `web/public` — production static assets

**Policy (pilot P3-web-006):** Only files that the Next app (or `relay_audit` tracing) **references** belong here. Static design workshops / HTML previews live under [` docs/web-public-previews/`](../docs/web-public-previews/).

## Current files

| Asset | Role |
|-------|------|
| `apple-icon.png` | Apple touch icon (`/apple-icon.png`). |
| `icon.svg` | Favicon / icon (`/icon.svg`). |
| `icon-dark-32x32.png`, `icon-light-32x32.png` | Small icons where linked from metadata or PWA. |
| `patron-feed-preview.png` | Fixture / dev preview image — [`web/lib/relay-fixtures.ts`](../lib/relay-fixtures.ts), bundle JSON. |
| `placeholder.svg` | Default placeholder for patron feed UI and fixtures — many `@/lib` and relay components (querystring variants). |

**Removed in P3-web-006 (were ghost / unused by canonical code):** `placeholder.jpg`, `placeholder-logo.{png,svg}`, `placeholder-user.jpg`, and the three `*-preview.html` files (moved to `docs/web-public-previews/`).

Re-audit: `node scripts/relay-dependency-audit.mjs` from repo root.
