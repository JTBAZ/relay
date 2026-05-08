/**
 * @fileoverview Re-export shim: stable deep import path for the unattended incremental Patreon autosync worker.
 * @description Implements `runIncrementalAutosyncOnce` (alias `runIncrementalAutosyncCycle`) and `startIncrementalAutosyncWorker` in `./incremental-sync-worker.js`.
 * @see {@link ../jsdoc-core-entities.ts}
 * @see prisma/schema.prisma Sync touches posts, tiers, memberships — indirect via `./incremental-sync-worker.js`
 */
export * from "./incremental-sync-worker.js";
