# relay-profile-tsx

Standalone **Vite + React** mock of the curator public-profile layout (collections, patrons row, favorites, header chrome). Lives in this monorepo for a single GitHub remote; deploy and CI stay separate from the canonical Next.js [`web/`](../web/) app unless you deliberately merge flows.

## Commands

Run from repo root:

```bash
npm run dev:profile-ui
```

Or from this directory:

```bash
npm install
npm run dev
```

## Relation to production

Treat this package as UI exploration or a future embed/export surface. Canonical product UX and telemetry work continue in `web/` and `src/` (API). When platform metrics/dashboard work lands, decide whether this app stays standalone or merges into Next.js.
