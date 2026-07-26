# Composer 2.5 Fresh Agent Prompt — Extension Cross-Post Bridge

Paste this into a fresh Composer 2.5 agent when assigning Relay extension cross-post work.

---

You are working in the Relay repo. Your job is to understand the codebase just enough to execute the Relay browser extension cross-post build plan cleanly, in small safe work items.

## Mission

Expand the existing Relay browser extension from a Patreon session-token connector into a two-purpose bridge:

1. Continue managing the creator's Patreon session token for media sync.
2. Add user-triggered cross-posting from a Relay post into Patreon's post editor.

The v1 cross-post flow is:

1. Creator clicks **Publish to Patreon** in Relay web.
2. Relay web sends only `relay_post_id` to the official Relay extension.
3. Extension uses its stored Relay extension bearer token to fetch an owner-authorized package from Relay API.
4. Extension opens Patreon's post editor.
5. Extension fills title/body, attempts image attach, then stops.
6. Creator reviews and manually clicks Publish in Patreon.

The extension must never click Patreon's final publish button.

## Required First Reads

Read these in order before coding:

1. `docs/EXTENSION_CROSS_POST_BUILD_PLAN.md`
2. `docs/Airtable Drops/Extension Cross-Post/00-README.md`
3. `docs/EXTENSION_BUILD_PLAN.md` sections 0, 3, and 4 only
4. The specific prompt for your assigned high-risk item if one exists:
   - `docs/Airtable Drops/Extension Cross-Post/XPOST-03-backend-package-query-prompt.md`
   - `docs/Airtable Drops/Extension Cross-Post/XPOST-04-backend-package-route-prompt.md`
   - `docs/Airtable Drops/Extension Cross-Post/XPOST-07-content-script-build-wiring-prompt.md`
   - `docs/Airtable Drops/Extension Cross-Post/XPOST-09-background-tab-injection-prompt.md`
   - `docs/Airtable Drops/Extension Cross-Post/XPOST-10-content-script-title-body-fill-prompt.md`
   - `docs/Airtable Drops/Extension Cross-Post/XPOST-11-content-script-image-best-effort-prompt.md`

If your assigned item does not have a bespoke prompt, use the master work item table in `docs/EXTENSION_CROSS_POST_BUILD_PLAN.md`.

## Codebase Orientation

After the required reads, inspect only the files relevant to your item. Start with these anchors:

- Extension background/messages/storage:
  - `extension/src/background.ts`
  - `extension/src/lib/messages.ts`
  - `extension/src/lib/storage.ts`
  - `extension/src/lib/browser.ts`
  - `extension/src/lib/sync-now.ts`
- Extension build/manifests:
  - `extension/package.json`
  - `extension/vite.config.ts`
  - `extension/build.mjs`
  - `extension/manifests/manifest.chrome.prod.json`
  - `extension/manifests/manifest.chrome.dev.json`
  - `extension/manifests/manifest.firefox.prod.json`
- Relay API/backend:
  - `src/server.ts`
  - `src/identity/identity-service.ts`
  - `src/identity/identity-store-db.ts`
  - `prisma/schema.prisma`
- Relay web:
  - `web/app/components/shell/CreatorRelayPostComposer.tsx`
  - `web/lib/relay-api.ts`
  - `web/lib/relay-extension-ids.ts`
  - `web/app/extension/authorize/AuthorizeClient.tsx`

Do not broad-refactor. Follow existing patterns and local helper APIs.

## Non-Negotiable Boundaries

- Relay web sends only `relay_post_id`; never send title/body/media URLs directly from web to extension.
- Backend packages post data after extension bearer-token ownership checks.
- Text fill is the hard v1 requirement; image upload is best-effort.
- Extension never clicks Publish, Submit, Schedule, Paywall, or any irreversible Patreon control.
- Do not log or display:
  - Patreon `session_id`
  - `cookie.value`
  - Relay extension bearer token
  - `relay_session`
- Do not read `relay_session` in JS. It is HttpOnly by design.
- Do not rely on `relay_active_role` for authorization.
- Keep Chrome production output free of localhost references.
- Do not add `<all_urls>`, `tabs`, or `activeTab` unless the current work item proves it is unavoidable and you explain why.

## Execution Strategy

Work in dependency order from `docs/EXTENSION_CROSS_POST_BUILD_PLAN.md`.

Recommended vertical slice:

1. Backend package endpoint.
2. Extension fetch + tab injection.
3. Text-only Patreon editor fill.
4. Relay web button.
5. Best-effort image upload.

For optimal quality, complete one small item at a time:

1. State the item you are claiming.
2. Confirm preconditions.
3. Read the listed references.
4. Inspect the minimum necessary source files.
5. Implement only that item.
6. Run the item-specific checks.
7. Leave a short handoff: files changed, contracts introduced, tests run, residual risks.

If preconditions are missing, stop and report the blocker instead of guessing.

## Work Item Map

Use these as the atomic build units:

1. `manifest-scripting`
2. `cross-post-types`
3. `backend-package-query`
4. `backend-package-route`
5. `backend-package-tests`
6. `storage-pending-cross-post`
7. `content-script-build-wiring`
8. `background-cross-post-fetch`
9. `background-tab-injection`
10. `content-script-title-body-fill`
11. `content-script-image-best-effort`
12. `web-extension-id-messaging`
13. `web-cross-post-button`
14. `store-copy-permissions`
15. `docs-phase-8`
16. `e2e-manual-checklist`

Do not collapse multiple risky items together unless explicitly asked. In particular, keep these separate:

- Backend query vs route
- Build wiring vs tab injection
- Text fill vs image upload
- Web messaging helper vs UI button

## Expected Contracts

The externally-connectable message should be shaped around a post id:

```ts
type ExternalCrossPostMessage = {
  type: "RELAY_CROSS_POST";
  relay_post_id: string;
};
```

The backend package should resemble:

```ts
type PatreonCrossPostPackage = {
  relay_post_id: string;
  title: string;
  body_text: string;
  body_html?: string;
  media: Array<{
    media_id: string;
    filename: string;
    mime_type: string;
    content_url: string;
  }>;
};
```

The package endpoint should be:

```text
GET /api/v1/extension/cross-post/patreon/:post_id
Authorization: Bearer <relay_extension_token>
```

## Testing Guidance

Use the narrowest relevant verification for the item, then broaden at vertical-slice gates.

Common commands:

```bash
npm run test
npm run build
npm run build --prefix web
cd extension && npm run build:chrome:dev
cd extension && npm run build:chrome:prod
cd extension && npm run build:firefox:prod
cd extension && npm run verify:p12
```

Manual Patreon editor checks require a real/staging browser session. If no Patreon session is available, implement the code and document the unrun manual checks clearly.

## Review Checklist Before Handoff

Before finishing, verify:

- The claimed item is complete and not mixed with unrelated refactors.
- New routes use existing envelope/auth conventions.
- Extension code uses `extension/src/lib/browser.ts` / `webextension-polyfill`.
- No secret values are logged or rendered.
- Chrome prod build does not include localhost.
- The creator remains in control and must manually publish.
- Tests/builds listed in the prompt were run, or inability to run them is stated.

Now ask the user which work item to claim first, unless they already specified one.

