/**
 * Write-layer router (RC-P1-T05).
 * Imported posts → presentation overlay. Relay-native → append PostVersion intent.
 * Collection ops never touch versions. "Change title everywhere" is out of POC.
 *
 * @see docs/studio/relay-command-mcp-build-plans/PRODUCT-CONTRACT.md write-layer ownership
 */

import {
  CommandContractError,
  type CommandDestinationKey,
  type CommandPostSource,
  type CommandWriteLayer
} from "./contracts.js";

export type CommandRevisionFields = {
  title?: string;
  description?: string;
};

export type CommandPostRevisionInput = {
  post_id: string;
  source: CommandPostSource;
  fields: CommandRevisionFields;
  /** Caller-forced layer; must match source routing or COMMAND_WRONG_WRITE_LAYER. */
  requested_layer?: CommandWriteLayer;
  /** Forbidden in P1–P4. Changing title on every surface requires an explicit destination list — still out of POC. */
  everywhere?: boolean;
  destinations?: CommandDestinationKey[];
};

export type CommandRoutedPresentationWrite = {
  layer: "presentation";
  post_id: string;
  patch: { relay_title?: string; relay_description?: string };
};

export type CommandRoutedNativeWrite = {
  layer: "native_version";
  post_id: string;
  append: CommandRevisionFields;
};

export type CommandRoutedCollectionWrite = {
  layer: "collection";
  collection_id: string | null;
  title?: string;
  post_ids: string[];
  ordered_post_ids?: string[];
};

export type CommandRoutedWrite =
  | CommandRoutedPresentationWrite
  | CommandRoutedNativeWrite
  | CommandRoutedCollectionWrite;

function hasRevisionFields(fields: CommandRevisionFields): boolean {
  return Boolean(fields.title !== undefined || fields.description !== undefined);
}

function defaultLayerForSource(source: CommandPostSource): "presentation" | "native_version" {
  if (source === "RELAY") return "native_version";
  return "presentation";
}

/**
 * Route a post title/description revise. Never chooses a table for mixed
 * "everywhere" intents — those fail closed.
 */
export function routePostRevision(input: CommandPostRevisionInput): CommandRoutedWrite {
  if (!input.post_id.trim()) {
    throw new CommandContractError("COMMAND_VALIDATION", "post_id is required.", [
      { field: "post_id", issue: "opaque_id" }
    ]);
  }
  if (!hasRevisionFields(input.fields)) {
    throw new CommandContractError("COMMAND_VALIDATION", "Revision fields are required.", [
      { field: "fields", issue: "title_or_description" }
    ]);
  }
  if (input.everywhere) {
    throw new CommandContractError(
      "COMMAND_VALIDATION",
      "Changing a title everywhere is out of POC. Revise the Relay gallery layer or name destinations explicitly in a later program.",
      [{ field: "everywhere", issue: "out_of_poc" }]
    );
  }
  if (input.destinations && input.destinations.length > 0) {
    throw new CommandContractError(
      "COMMAND_VALIDATION",
      "Destination-list title edits are out of POC. Use prepare_destination_drafts or a gallery-layer revise.",
      [{ field: "destinations", issue: "out_of_poc" }]
    );
  }

  const routed = defaultLayerForSource(input.source);
  if (input.requested_layer && input.requested_layer !== routed) {
    throw new CommandContractError(
      "COMMAND_WRONG_WRITE_LAYER",
      "Requested write layer does not match post source.",
      [
        { field: "requested_layer", issue: input.requested_layer },
        { field: "source", issue: input.source }
      ]
    );
  }

  if (routed === "presentation") {
    const patch: CommandRoutedPresentationWrite["patch"] = {};
    if (input.fields.title !== undefined) patch.relay_title = input.fields.title;
    if (input.fields.description !== undefined) patch.relay_description = input.fields.description;
    return { layer: "presentation", post_id: input.post_id.trim(), patch };
  }

  return {
    layer: "native_version",
    post_id: input.post_id.trim(),
    append: { ...input.fields }
  };
}

export type CommandCollectionWriteInput = {
  collection_id?: string | null;
  title?: string;
  post_ids: string[];
  ordered_post_ids?: string[];
};

/** Collection membership/order never appends PostVersion or patches presentation. */
export function routeCollectionWrite(input: CommandCollectionWriteInput): CommandRoutedCollectionWrite {
  if (!Array.isArray(input.post_ids)) {
    throw new CommandContractError("COMMAND_VALIDATION", "post_ids is required.", [
      { field: "post_ids", issue: "array_required" }
    ]);
  }
  return {
    layer: "collection",
    collection_id: input.collection_id?.trim() ? input.collection_id.trim() : null,
    title: input.title,
    post_ids: [...input.post_ids],
    ordered_post_ids: input.ordered_post_ids ? [...input.ordered_post_ids] : undefined
  };
}
