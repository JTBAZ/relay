# Relay browser extension

## Current local X handoff build — 2026-10-18

The built Chrome development extension is at `C:\Users\jorda\Documents\Codex\2026-10-11\c\work\relay\extension\dist\chrome-dev`, using API `http://localhost:8788` and web `http://localhost:3000`. Its stable ID is `bhnphlohdpinngabohfpogekcgppglgd`; local web recognition, API extension-origin allowlist and local consent configuration now match. The local configuration files are ignored/untracked; no secret value belongs in this document.

To try it in Chrome: open `chrome://extensions`, enable Developer mode, then reload an existing unpacked development copy or choose **Load unpacked** and select that directory. Open the Relay extension popup, choose **Connect**, and approve its normal Relay consent page (sign in if prompted). Refresh `http://localhost:3000/editor-bench` in Chrome, use Mock posting → Real Library, confirm an X event, and separately click **Open X with extension**. Review on X and publish manually. Loading/consent needs the user in Chrome; neither the installed extension nor a successful fill is claimed.

Known limitation: API preflight from `https://x.com` to the existing media-byte route returns 403, and the current injected X script fetches those bytes directly. [Chrome documents that content-script requests use the page origin](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests). Image autofill therefore remains blocked/unverified in this local setup; use the existing manual-upload fallback during the trial. A media-transport rewrite was not added to the build request. Frontend/browser testing remains deferred; no external publication occurred.

Rebuild this same artifact from the repository root in PowerShell:

```powershell
$env:RELAY_EXTENSION_DEV_API_PORT = "8788"
npm run build:chrome:dev --prefix extension
Remove-Item Env:RELAY_EXTENSION_DEV_API_PORT
```

The override is build-only, validated as a local port, and shared by background/popup and all injected bundles. Without it, the existing dev default is 8787; production stays on its hosted origin. [Build evidence](../outputs/editor-bench-extension-dev-build.json), [local alignment and limitation](../outputs/editor-bench-extension-local-alignment.json).


Vite + [@crxjs/vite-plugin](https://crxjs.dev/vite-plugin) workspace for the Relay Patreon connector. Phase 2 provides manifests, build targets, and loadable stubs; Phase 3+ add the service worker and UI.

## Prerequisites

- Node 20.19+ (see root `package.json` engines)

This package is **standalone** (the root `relay` repo does not use npm workspaces). Install from this directory:

```bash
cd extension
npm install
```

## Environment variables

| Variable     | Values            | Used by        |
|-------------|-------------------|----------------|
| `EXT_TARGET` | `chrome`, `firefox` | `vite.config.ts` |
| `EXT_ENV`    | `dev`, `prod`     | Chrome only; Firefox always uses the prod manifest |

`build.mjs` sets these automatically from npm script names.

## Build outputs

| Script                 | Output folder              |
|------------------------|----------------------------|
| `npm run build:chrome:dev`  | `dist/chrome-dev/`    |
| `npm run build:chrome:prod` | `dist/chrome-prod/`   |
| `npm run build:firefox:prod`| `dist/firefox-prod/`  |

- **Chrome dev** manifest includes `http://localhost:*/*` in `host_permissions` and `externally_connectable.matches` for local Next/Relay.
- **Chrome prod** and **Firefox prod** match [`docs/EXTENSION_BUILD_PLAN.md`](../docs/EXTENSION_BUILD_PLAN.md) §2.B (prod host list only — no `localhost`).

## Verification (Phase 2 gate)

From `extension/`:

```bash
npm install
npm run verify:phase2
```

- **`verify:p12`** — rebuilds **chrome-prod** and fails if any emitted file contains `localhost` (build plan **P-12**).
- **`verify:dev-localhost`** — rebuilds **chrome-dev** and asserts `manifest.json` includes `localhost` in `host_permissions` and `externally_connectable`.
- **`verify:phase2`** — runs both checks plus **`build:firefox:prod`**.

Operator: load **`dist/chrome-dev/`** in Chrome and confirm no service-worker errors ([`EXT-2V-phase2-verify-prompt.md`](../docs/Airtable%20Drops/Extension/EXT-2V-phase2-verify-prompt.md)).

## Pinned extension ID

Chrome **`key`** (public) is set in `manifests/manifest.chrome.dev.json` and `manifests/manifest.chrome.prod.json` so unpacked and packaged builds share a stable ID:

**`bhnphlohdpinngabohfpogekcgppglgd`**

Mirror that ID in:

- Web: `NEXT_PUBLIC_RELAY_EXTENSION_IDS`
- API: `RELAY_EXTENSION_ORIGINS=chrome-extension://bhnphlohdpinngabohfpogekcgppglgd`

The matching **private** PEM must **not** be committed (repo `.gitignore` covers `*.pem`). Store it in the operator secret store / OS keychain as `extension/.chrome-extension-private.pem` (local only) for Chrome Web Store signing later. Never paste the private key into Airtable or chat logs.

## Load unpacked (Chrome)

1. `npm run build:chrome:dev`
2. Open `chrome://extensions`, enable **Developer mode**
3. **Load unpacked** → select `extension/dist/chrome-dev/`

## Icons

Placeholder PNGs live in `icons/`. Replace with branded assets before store submission (Phase 6).

## Store zips (Phase 6 / EXT-6H)

After prod builds, create **`chrome.zip`** / **`firefox.zip`** in this folder (gitignored) — archive **contents** of each `dist/*-prod` tree (manifest at zip root), matching [`docs/EXTENSION_BUILD_PLAN.md`](../docs/EXTENSION_BUILD_PLAN.md) §6.C.

```bash
npm run build:chrome:prod && npm run pack:chrome
npm run build:firefox:prod && npm run pack:firefox
# or both zips after both dist folders exist:
npm run pack:store
```

- **Windows:** uses PowerShell `Compress-Archive`.
- **macOS/Linux:** uses `zip -r` (install if missing).

Upload those zips to Chrome Web Store, Edge Add-ons (Chrome package), and AMO. Listing copy: [`store/chrome/`](store/chrome/) and [`store/firefox/`](store/firefox/). Full operator checklist: [`docs/Airtable Drops/Extension/EXT-6H-build-sign-submit-prompt.md`](../docs/Airtable%20Drops/Extension/EXT-6H-build-sign-submit-prompt.md).

## Firefox note

`manifests/manifest.firefox.prod.json` uses MV3 `background.scripts` + `type: module` per the build plan. After `npm run build:firefox:prod`, emitted `dist/firefox-prod/manifest.json` rewrites `background.scripts` to the hashed bundle under `assets/` (e.g. `assets/background.ts-*.js`). No `web_accessible_resources` for v1. If a future CRXJS or Gecko version requires changes, track them in `EXT-2B` / `EXT-2V`.

## Storage API (Phase 3.A)

`src/lib/storage.ts` — typed `browser.storage.local` helpers:

| Key (`chrome.storage.local`) | Purpose |
|------------------------------|---------|
| `installation_id` | UUID for this install |
| `grant` | Post-exchange relay grant object (`token`, `token_id`, `expires_at`, `account_id`, `relay_creator_id`, `created_at`) |
| `last_sync_at`, `last_sync_hash`, `last_sync_status` | Last cookie sync metadata |
| `consent_last_error` | Last consent-exchange error message (optional) |

Use `import browser from "./lib/browser"` (polyfill) everywhere; do not use `chrome.*` in TS sources.

## npm audit / Rollup

`@crxjs/vite-plugin` depends on Rollup 2.x. Versions below **2.80.0** were flagged (GHSA-mw96-cpmx-2vgc, dev-time path traversal in the bundler). `package.json` uses **`overrides`**: CRXJS gets **`rollup@2.80.0`**, while **Vite** keeps **`rollup@4.60.2`** (also listed as a direct `devDependency` so the tree dedupes cleanly). **`npm audit`** should report **0** vulnerabilities after `npm install`.
