# VS6 Build Plan — Previewizer Approval and Distribution Handoff

## Outcome

Resume a prepared automation draft into Previewizer with its saved template snapshot, then create and hand off canonical distribution artifacts only after the creator exports and explicitly approves.

## Scope

In: initial Previewizer config; approval-context API/adapter; source media session; upload; plan/variant creation after export; existing handoff reuse; run/event completion/cancel/expiry synchronization.

Out: Automations modal management UI, server-side image rendering, autonomous publish.

## Dependencies and permitted parallel work

Depends on VS5 exit. B14 → B15 → B16 is serial because all three touch approval contracts and shared frontend distribution state.

## Required reading

1. VS5 approval deep-link/run metadata Delta Out
2. `web/lib/previewizer-session.ts`
3. `web/app/components/previewizer/previewizer-client.tsx`
4. `web/lib/previewizer-template-config.ts`
5. `web/app/components/distribution/PreviewizerOverlay.tsx`
6. `web/app/components/distribution/TransformerNodePage.tsx`
7. `web/app/components/distribution/DistributionHandoffPanel.tsx`
8. `web/lib/relay-native-staging-upload.ts`
9. `web/lib/relay-extension-messaging.ts`
10. `src/distribution/post-distribution-service.ts`
11. `docs/qa/PREVIEWIZER_AUTOPOST_WIRING.md`

## Previewizer preload contract

- Add an optional validated initial template config to the Previewizer session/props.
- Apply it once after source image/session initialization.
- Reuse `hydratePreviewTemplateConfig`.
- Preserve current selection/crop for the source image; templates still do not persist crop.
- Later edits to the creator's template do not change the run snapshot.
- Missing initial config leaves all existing callers unchanged.
- Do not auto-open or auto-export outside an explicit approval deep link.

## Approval-context contract

The server returns creator-scoped context:

- automation/run/draft/source post IDs;
- source media ID and safe export URL/path inputs;
- destination list;
- validated template snapshot;
- expiry/status/version;
- existing plan/attempt receipt if already progressed.

The client adapter:

1. resolves the prepared draft and approval context;
2. opens existing `PreviewizerOverlay`;
3. uploads exported blob with the existing staging adapter;
4. calls existing `createPostDistributionPlan` with:
   - source post;
   - configured destinations;
   - preview routing;
   - real `preview_media_id`;
   - source draft/correlation;
5. renders/reuses existing destination approval and handoff controls.

Preview export alone is not completion.

## Completion contract

- Existing approve/start-handoff/extension or Bluesky paths remain authoritative.
- Mark run/event completed only after the frozen completion receipt (normally successful handoff start or direct Bluesky completion) is durably correlated.
- Extension offline leaves the work resumable and does not claim success.
- Cancel closes Previewizer without destroying draft/run.
- Expiry detected while open blocks new approval and refreshes state.
- Duplicate export/approve/complete requests reuse existing plan/receipt.

## Files

Create:

- `web/app/components/automations/AutomationApprovalOverlay.tsx` or equivalent thin adapter
- `tests/web/automation-previewizer.test.tsx`
- `tests/automations/automation-approval.test.ts`

Edit:

- `web/lib/previewizer-session.ts`
- `web/app/components/previewizer/previewizer-client.tsx`
- `web/app/components/distribution/PreviewizerOverlay.tsx`
- automation service/routes and dedicated web client for approval context/receipt
- shared distribution components only through extracted reusable helpers

Do not:

- duplicate `TransformerNodePage` wholesale
- create a second upload or cross-post implementation
- auto-send on Previewizer complete

## Todo work items

### AUT-VS6-T01 — Add optional saved-template preload

1. Extend session/props with optional validated initial config.
2. Apply once without changing crop or ordinary callers.
3. Handle missing/deleted/invalid snapshot with stable repair state.
4. Add hydration, selection, destination-link, and backward-compatibility tests.

Acceptance: AU-08 passes and current Previewizer wiring tests remain unchanged for callers without initial config.

### AUT-VS6-T02 — Build approval adapter and post-export plan creation

1. Add creator-scoped approval-context read API.
2. Build the thin adapter around `PreviewizerOverlay`.
3. Reuse staging upload and `createPostDistributionPlan`.
4. Reuse existing destination approval/handoff UI.
5. Add ordering tests proving plan creation cannot precede a valid preview media ID.

Acceptance: exported media produces one valid plan/variant graph and still requires explicit send.

### AUT-VS6-T03 — Synchronize completion and recovery

1. Add idempotent completion/cancel endpoints or receipts using frozen VS0 contract.
2. Correlate plan/attempt and mark the attention event done only at the approved completion point.
3. Handle offline extension, failed upload, expired context, duplicate callback, and resume.
4. Preserve existing Bluesky and extension semantics.

Acceptance: AU-09/AU-10 pass without false completion or duplicate plans/attempts.

## Safe batches

- **B14:** AUT-VS6-T01 only.
- **B15:** AUT-VS6-T02 only.
- **B16:** AUT-VS6-T03 only.

## Verification

```bash
npx vitest run tests/web/automation-previewizer.test.tsx tests/automations/automation-approval.test.ts
npx vitest run web/lib/previewizer-template-config.test.ts
npm run typecheck
npm run build
npm run lint --prefix web
npm run build --prefix web
```

## Exit gate

Saved template snapshot preloads safely; preview upload precedes plan creation; existing approval/handoff remains explicit; completion/recovery is idempotent; ordinary Previewizer and distribution flows regress cleanly.

## Human stop conditions

Stop if implementation requires server-side rendering, a new external publisher, changing extension permissions, or marking completion before an existing durable handoff receipt.

## Delta Out

B14 names B15, B15 names B16, and B16 names B17 after the full approval exit gate.
