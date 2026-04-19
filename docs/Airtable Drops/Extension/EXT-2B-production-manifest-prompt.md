# EXT-2B — Production manifest (Chrome) + manifest parity

## Context

This row implements **Phase 2.B** of [`docs/EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md): lock the **Chrome production manifest** to the exact JSON prescribed (MV3, minimal permissions, `externally_connectable` for `https://relayapp.me/*`). Ensure **dev** manifest adds localhost only in dev builds; ensure **Firefox** prod manifest aligns with Phase 2.A file. **P-12:** **`localhost` must not appear** in `extension/dist/chrome-prod/` after build.

## Preconditions

- [ ] `EXT-2A-workspace-tooling-prompt.md` shipped — `extension/` builds, manifests directory exists, Vite + `build.mjs` wired.

## Tier 0 invariants (always apply)

1. **No JS reads `relay_session`.** It is `HttpOnly`. Web code never sees the token.
2. **No handler grants permission based on `relay_active_role`.** That cookie is a UI hint. Authz is derived from DB rows (`Account.primaryRelayCreatorId`, `TenantMembership`).
3. **No FK or RLS policy references `public_slug` or `relay_creator_id`.** Both can change shape under us; `Tenant.id` (UUID) is the only safe key.
4. **One Account, one Supabase user, one cookie.** A second simultaneous sign-in must invalidate the first server-side.
5. **All web calls go through `relayFetch`.** Raw `fetch("/api/...")` is forbidden after Stage 1.3 lands.
6. **All `/api/v1/*` routes use `requireAccount` / `requireAccountWithRole`** unless explicitly public with a `// PUBLIC: <reason>` comment.
7. **All redirects derived from user input pass through `resolvePostAuthPath`.**
8. **All mutations use POST/PUT/PATCH/DELETE.** GETs are side-effect-free.
9. **Reviewer posture:** **No** `<all_urls>`, **`tabs`**, or **`activeTab`** in manifest ([`EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md) §2.B notes).

## Goal

`manifest.chrome.prod.json` matches the plan’s canonical JSON; prod build output validates in Chrome; dev build retains localhost; Firefox prod manifest uses `background.scripts` + `gecko.id`.

## Reference reading

1. [`docs/EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md) §2.B — Production manifest (Chrome) including JSON block and notes.
2. **Handoff** from `EXT-2A-workspace-tooling-prompt.md` — manifest paths and build commands.
3. Phase 6.C in plan — optional top-level **`"key"`** field for pinned extension ID (human adds signing key public field); **do not** block Phase 2 on this — document placeholder comment in manifest README if needed.

## Implementation steps

### Part A — Chrome prod manifest (verbatim)

1. **Set** `extension/manifests/manifest.chrome.prod.json` to the following object (copy field-for-field from plan §2.B; file must be **valid JSON** — no comments):

```json
{
  "manifest_version": 3,
  "name": "Relay — Patreon connector",
  "version": "0.1.0",
  "description": "Securely connect your Patreon account to Relay so Relay can back up your own posts and media.",
  "icons": {
    "16": "icons/16.png",
    "48": "icons/48.png",
    "128": "icons/128.png"
  },
  "action": {
    "default_title": "Relay",
    "default_popup": "src/popup.html",
    "default_icon": {
      "16": "icons/16.png",
      "48": "icons/48.png",
      "128": "icons/128.png"
    }
  },
  "background": {
    "service_worker": "src/background.ts",
    "type": "module"
  },
  "permissions": ["cookies", "alarms", "storage"],
  "host_permissions": [
    "https://www.patreon.com/*",
    "https://relayapp.me/*"
  ],
  "externally_connectable": {
    "matches": ["https://relayapp.me/*"]
  }
}
```

### Part B — Chrome dev + Firefox

2. **`manifest.chrome.dev.json`** — start from prod; add **`http://localhost:*/*`** to `host_permissions` and to **`externally_connectable.matches`** (array includes both `https://relayapp.me/*` and localhost pattern per plan §2.A).

3. **`manifest.firefox.prod.json`** — ensure **`browser_specific_settings.gecko.id`** (email-style); **`background.scripts`** entry for the built background bundle per `EXT-2A` Vite output (adjust paths to match Firefox expectations after build — document).

### Part C — Build verification

4. Run prod build and **fail** if localhost leaks:

   ```bash
   npm run build:chrome:prod
   rg localhost extension/dist/chrome-prod/
   ```

   Expect **zero** matches in prod output.

5. Run dev build and **confirm** localhost present:

   ```bash
   npm run build:chrome:dev
   rg localhost extension/dist/chrome-dev/
   ```

   Expect **at least one** match (host_permissions or externally_connectable).

## Acceptance criteria

- [ ] Chrome prod manifest JSON matches plan §2.B field-for-field (version/name/permissions/host_permissions/externally_connectable).
- [ ] `rg localhost extension/dist/chrome-prod/` returns **zero** lines after prod build.
- [ ] Dev build output includes localhost allowances.
- [ ] `cd extension && npm i` still succeeds; builds complete without errors.
- [ ] Tier 0 invariants N/A except manifest permission discipline — satisfied.

## Out of scope

- Phase 3 worker logic.
- **`key` field** for pinned ID — operator / Phase 6.C ([`EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md)); optional follow-up commit.
- Store listing copy (`EXT-6B`).

## Handoff

Delta Out:

- Confirm Firefox manifest path to built `background` script after Vite emit.
- Any CRXJS quirk requiring `web_accessible_resources` (should be **none** for v1 per plan).
- Screenshot or note that Chrome “Load unpacked” accepts `dist/chrome-dev`.

Next claimable: `EXT-2V-phase2-verify-prompt.md`.
