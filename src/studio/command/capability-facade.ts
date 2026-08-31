/**
 * Capability facade signatures (P1). Preview/search/sequence/write-router are wired;
 * collection/plan apply waits for P2. Does not wrap src/server.ts.
 */

import {
  CommandContractError,
  type CommandCapabilityName,
  type CommandSelectionQuery
} from "./contracts.js";
import {
  applyChangeSet,
  previewChangeSet,
  undoChangeSet,
  type ApplyChangeSetInput,
  type PreviewChangeSetInput
} from "./change-set-types.js";
import {
  searchLibrary,
  type CommandLibraryItem,
  type CommandSearchLibraryOptions,
  type CommandSearchLibraryResult
} from "./selection.js";
import { resolveNumberedSequence, type CommandSequenceInput } from "./sequence.js";
import {
  routeCollectionWrite,
  routePostRevision,
  type CommandCollectionWriteInput,
  type CommandPostRevisionInput
} from "./write-router.js";

function notImplemented(capability: CommandCapabilityName): never {
  throw new CommandContractError(
    "COMMAND_VALIDATION",
    "Capability is not implemented in Phase 1.",
    [{ field: "capability", issue: capability }]
  );
}

export const commandCapabilityFacade = {
  search_library(
    items: readonly CommandLibraryItem[],
    query: CommandSelectionQuery | unknown,
    options?: CommandSearchLibraryOptions
  ) {
    return searchLibrary(items, query, options);
  },
  resolve_numbered_sequence(items: readonly CommandSequenceInput[]) {
    return resolveNumberedSequence(items);
  },
  preview_collection: () => notImplemented("preview_collection"),
  create_or_update_collection: () => notImplemented("create_or_update_collection"),
  set_collection_order: () => notImplemented("set_collection_order"),
  add_post_tags: () => notImplemented("add_post_tags"),
  remove_post_tags: () => notImplemented("remove_post_tags"),
  create_saved_filter: () => notImplemented("create_saved_filter"),
  preview_post_revision(input: CommandPostRevisionInput) {
    return routePostRevision(input);
  },
  revise_post(input: CommandPostRevisionInput) {
    return routePostRevision(input);
  },
  preview_release_plan: () => notImplemented("preview_release_plan"),
  create_release_plan: () => notImplemented("create_release_plan"),
  materialize_schedule: () => notImplemented("materialize_schedule"),
  prepare_destination_drafts: () => notImplemented("prepare_destination_drafts"),
  preview_change_set(input: PreviewChangeSetInput) {
    return previewChangeSet(input);
  },
  apply_change_set(input: ApplyChangeSetInput, env?: NodeJS.ProcessEnv) {
    return applyChangeSet(input, env);
  },
  undo_change_set(changeSetId: string, env?: NodeJS.ProcessEnv) {
    return undoChangeSet(changeSetId, env);
  },
  route_collection_write(input: CommandCollectionWriteInput) {
    return routeCollectionWrite(input);
  }
};

export type CommandCapabilityFacade = typeof commandCapabilityFacade;
export type { CommandSearchLibraryOptions, CommandSearchLibraryResult };
