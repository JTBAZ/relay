# CP-02 — Opt-in editor baseline evidence

Ticket / status: CP-02 / ready for architect review (baseline evidence collected).

Owned files changed (and why any approved seam was touched): no source or test repairs were needed. Added this evidence record only. Existing dirty and untracked changes were preserved.

Behavior demonstrated, including one negative case: the focused suite covers compiled intent, cart patch merging, factual previews, intent evidence, legacy interpretation and the web editor panel. The PostgreSQL suite's named merge test preserves manual provenance, rejects a stale cart revision, and verifies apply/undo behavior; all integration cases passed.

Focused tests/build/browser evidence (command + result; skipped prerequisites):

- `npx vitest run tests/gallery-editor-compiled-intent.test.ts tests/gallery-editor-cart-patch.test.ts tests/gallery-editor-factual-copy.test.ts tests/gallery-editor-intent-evidence.test.ts tests/gallery-editor-intent.test.ts tests/gallery-editor-postgres.integration.test.ts tests/web/gallery-editor-panel.test.tsx` — 6 files passed, 94 tests passed; the PostgreSQL file was skipped (26 tests) because its deliberate opt-in variable was not set.
- Re-ran `tests/gallery-editor-postgres.integration.test.ts` by quietly loading `.env`, checking that `DATABASE_URL` resolved to `localhost`/`127.0.0.1` and database `relay_dev`, then setting `GALLERY_EDITOR_TEST_DATABASE_URL` for this process only — 1 file and all 26 tests passed. The fixtures use randomized creator partitions and the suite's own cleanup; no reseed was run. PostgreSQL emitted one `pg` deprecation warning about a query already executing.
- `npm run build` — passed, including Prisma client generation and backend TypeScript build.
- `npm run typecheck` — failed with 83 TypeScript diagnostics across existing extension, web and test areas. Examples include missing `webextension-polyfill` / `__EXT_ENV__`, NodeNext import-extension errors, and test mock/type mismatches. Gallery editor diagnostics are confined to `tests/gallery-editor-context.test.ts` and `tests/gallery-editor-preview.test.ts`; neither is a CP-02-owned file. The CP-02 focused tests and build pass, and no typecheck diagnostic names a CP-02-owned test file or `LibraryEditorPanel`.

Existing authority and idempotency/creator-scope evidence: the integration test exercises `GalleryEditorService` against PostgreSQL, including per-creator fixture setup/cleanup and stale revision rejection. All 26 cases passed.

Risks or unresolved product questions: repository-wide `npm run typecheck` remains red for the unrelated diagnostics listed above. No unrelated files were modified to mask those baseline issues. No browser session was launched; the web panel's 10 automated tests passed.

Architect review decision and date: pending parent architect review, 2026-10-14.

Next unblocked ticket: CP-03, after parent acceptance of this baseline evidence.
