# EXT-2A — Extension workspace + tooling

## Context

This row implements **Phase 2.A** of [`docs/EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md): create the **`extension/`** package with Vite + CRXJS, TypeScript, manifests for **chrome dev/prod** and **firefox prod**, build scripts, placeholders, and README. **No service-worker business logic** yet (Phase 3) — but manifests reference `src/background.ts` and `src/popup.html`, so add **minimal stubs** that load cleanly in Chrome (empty popup, no-op or bare `install` listener) so Phase 2 verification can load unpacked without errors.

## Preconditions

- [ ] `EXT-1V-phase1-verify-prompt.md` shipped green — web consent path exists for later E2E; Phase 2 can be built in parallel on a branch only if the team accepts orphan extension builds until 1V lands. **Recommended:** complete Phase 1 verify first.

## Tier 0 invariants (always apply)

1. **No JS reads `relay_session`.** It is `HttpOnly`. Web code never sees the token.
2. **No handler grants permission based on `relay_active_role`.** That cookie is a UI hint. Authz is derived from DB rows (`Account.primaryRelayCreatorId`, `TenantMembership`).
3. **No FK or RLS policy references `public_slug` or `relay_creator_id`.** Both can change shape under us; `Tenant.id` (UUID) is the only safe key.
4. **One Account, one Supabase user, one cookie.** A second simultaneous sign-in must invalidate the first server-side.
5. **All web calls go through `relayFetch`.** Raw `fetch("/api/...")` is forbidden after Stage 1.3 lands.
6. **All `/api/v1/*` routes use `requireAccount` / `requireAccountWithRole`** unless explicitly public with a `// PUBLIC: <reason>` comment.
7. **All redirects derived from user input pass through `resolvePostAuthPath`.**
8. **All mutations use POST/PUT/PATCH/DELETE.** GETs are side-effect-free.
9. **P-12:** production artifacts must **not** embed `localhost` in manifest outputs — dev manifest only (`EXT-2B` / verify will `rg localhost extension/dist/chrome-prod/`).

## Goal

`extension/` installs, builds for `chrome-dev`, `chrome-prod`, and `firefox-prod` targets via env-driven scripts, emits under `dist/<target>-<env>/`, and documents the dev workflow.

## Reference reading

1. [`docs/EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md) §2.A — Workspace + tooling (file list).
2. [`docs/EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md) §2.B — Production manifest (for manifest content — implement file copies in `EXT-2B` or duplicate minimal fields in dev manifests here per your split; **this row** owns file tree + vite + build.mjs).
3. [`AGENTS.md`](../../../AGENTS.md) — whether root `package.json` uses **workspaces** (plan: add `extension` to workspaces **if** repo uses them; otherwise standalone).

## Implementation steps

### Part A — Package skeleton

1. **New** `extension/package.json` — `devDependencies` per plan: `vite`, `@crxjs/vite-plugin`, `typescript`, `@types/chrome`, `@types/firefox-webext-browser`, `webextension-polyfill`, `prettier`. **No runtime dependencies** for v1 per plan.

2. **New** `extension/tsconfig.json` — `target: ES2022`, `module: ESNext`, `moduleResolution: bundler`, `strict: true`.

3. **New** `extension/vite.config.ts` — use `@crxjs/vite-plugin`. Read **`EXT_TARGET=chrome|firefox`** and **`EXT_ENV=dev|prod`**; emit to **`dist/<target>-<env>/`** (normalize naming to match npm scripts below and §2.C verify: e.g. `chrome-dev`, `chrome-prod`).

4. **New** `extension/manifests/manifest.chrome.prod.json` — minimal shell only if `EXT-2B` will paste full JSON; otherwise leave placeholder and complete in `EXT-2B`. **Minimum:** must include `manifest_version`, `name`, `version`, `icons` paths, `action`, `background.service_worker`, `permissions`, `host_permissions`, `externally_connectable` per §2.B after `EXT-2B` lands. **Coordinate:** either `EXT-2A` checks in full prod manifest from plan §2.B, or `EXT-2B` overwrites — pick one in Delta Out.

5. **New** `extension/manifests/manifest.chrome.dev.json` — same as prod plus **`http://localhost:*/*`** in `host_permissions` and in `externally_connectable.matches` per plan.

6. **New** `extension/manifests/manifest.firefox.prod.json` — `browser_specific_settings.gecko.id` email-style (e.g. `relay-extension@relayapp.me`); use **`background.scripts`** array instead of MV3 `service_worker` per plan.

7. **New** `extension/build.mjs` — copy selected manifest into `dist/<target>-<env>/manifest.json`, then invoke Vite. Wire npm scripts, e.g.:
   - `build:chrome:dev`, `build:chrome:prod`, `build:firefox:prod` (exact names in Delta Out).

8. **New** `extension/.gitignore` — `dist/`, `node_modules/`, `*.zip`, `web-ext-artifacts/`.

9. **New** `extension/icons/` — placeholder PNGs for **16**, **48**, **128** (simple colored squares acceptable until Phase 6 designer assets).

10. **New** `extension/README.md` — install, build, load unpacked, env vars `EXT_TARGET` / `EXT_ENV`.

### Part B — Minimal runtime stubs (loadable extension)

11. **New** `extension/src/background.ts` — minimal service worker / script entry: e.g. log install or empty export; **no cookie reads**, no network — Phase 3 will replace logic.

12. **New** `extension/src/popup.html` + **`extension/src/popup.ts`** (if required by bundler) — empty or “Relay” placeholder text so popup opens without error.

13. **Root `package.json`** — if workspaces array exists, add `"extension"`; else document in README that `cd extension && npm i` is standalone.

### Part C — Audit

14. **Workspaces check:**

    ```bash
    rg "\"workspaces\"" package.json
    ```

15. **Extension tree:**

    ```bash
    ls extension/
    ```

## Acceptance criteria

- [ ] `cd extension && npm i` succeeds.
- [ ] `npm run build:chrome:dev` (or equivalent defined in `extension/package.json`) produces output under `extension/dist/chrome-dev/` (or the path your scripts use — document in README) with **localhost** in dev manifest.
- [ ] `npm run build:chrome:prod` produces prod output path with **no** localhost (final enforcement in `EXT-2V`; if this row’s prod build still has localhost, fix before merging).
- [ ] `wc -c` / bundle size not applicable for empty stubs — no requirement until Phase 4.
- [ ] Tier 0 invariants satisfied (N/A for most; no secrets in repo).

## Out of scope

- Full production manifest JSON duplication policy if deferred to `EXT-2B` — must not leave `extension/` unloadable; manifests must validate.
- Consent handshake logic, storage, sync (`EXT-3*`).
- Real branded icons (**HUMAN ACTION REQUIRED** per plan §2.A — operator replaces before Phase 6).

## Handoff

Delta Out:

- Exact `dist/` path naming (`chrome-dev` vs `chrome_dev`).
- npm script names and env vars.
- Whether full §2.B JSON landed in `EXT-2A` or is waiting for `EXT-2B`.
- Firefox `gecko.id` value chosen.

Next claimable: `EXT-2B-production-manifest-prompt.md` (tighten prod manifest + notes), then `EXT-2V-phase2-verify-prompt.md`.
