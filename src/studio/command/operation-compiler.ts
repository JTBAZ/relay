/**
 * Stock operation compiler (RC-P8-T01).
 * Frozen snapshot + named intent → ChangeSet ops. Write layer from write-router, never the model.
 */
import { randomUUID } from "node:crypto";
import {
  CommandContractError,
  type CommandChangeSetOp,
  type CommandPostSource,
  type CommandWriteLayer
} from "./contracts.js";
import { routeCollectionWrite, routePostRevision } from "./write-router.js";

export const COMMAND_STOCK_OPERATION_KINDS = [
  "create_or_update_collection",
  "set_collection_order",
  "revise_post",
  "add_post_tags",
  "remove_post_tags",
  "create_saved_filter"
] as const;
export type CommandStockOperationKind = (typeof COMMAND_STOCK_OPERATION_KINDS)[number];

export const COMMAND_COMPILER_FORBIDDEN_KINDS = [
  "publish_external",
  "delete_posts",
  "set_visibility",
  "set_tier_access",
  "activate_automation"
] as const;
export type CommandCompilerForbiddenKind = (typeof COMMAND_COMPILER_FORBIDDEN_KINDS)[number];

export const ORGANIZE_APPLY_SCHEDULE_BLOCKED =
  "Schedule apply waits for the plan workbench.";

export type CommandCompilerPostSource = {
  post_id: string;
  source: CommandPostSource;
};

export type CompileStockOperationInput = {
  kind: string;
  frozen_post_ids: readonly string[];
  frozen_revision: string;
  expected_revision: string;
  posts?: readonly CommandCompilerPostSource[];
  collection_id?: string | null;
  collection_title?: string;
  tag_ids?: readonly string[];
  title?: string;
  description?: string;
  everywhere?: boolean;
  requested_layer?: CommandWriteLayer;
  filter_name?: string;
  filter_query?: {
    q?: string;
    tag_ids?: string[];
    tier_ids?: string[];
    media_type?: string;
    published_after?: string;
    published_before?: string;
  };
};

export type CompileStockOperationResult = {
  ops: CommandChangeSetOp[];
  resolved_post_ids: string[];
  write_layer: CommandWriteLayer | null;
};

function uniqueOrdered(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ids) {
    const id = raw.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function isStockKind(value: string): value is CommandStockOperationKind {
  return (COMMAND_STOCK_OPERATION_KINDS as readonly string[]).includes(value);
}

function isForbiddenKind(value: string): value is CommandCompilerForbiddenKind {
  return (COMMAND_COMPILER_FORBIDDEN_KINDS as readonly string[]).includes(value);
}

function isScheduleKind(value: string): boolean {
  return (
    value === "create_release_plan" ||
    value === "materialize_schedule" ||
    value === "prepare_destination_drafts"
  );
}

function collectionIdFromTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48);
  return `col_${slug || "collection"}`;
}

function assertFrozenRevision(input: CompileStockOperationInput): string[] {
  const frozen = uniqueOrdered(input.frozen_post_ids);
  if (frozen.length === 0) {
    throw new CommandContractError("COMMAND_VALIDATION", "Frozen selection is empty.", [
      { field: "frozen_post_ids", issue: "empty" }
    ]);
  }
  const expected = input.expected_revision.trim();
  const frozenRev = input.frozen_revision.trim();
  if (!expected || !frozenRev || expected !== frozenRev) {
    throw new CommandContractError(
      "COMMAND_STALE_SELECTION",
      "Selection revision no longer matches the frozen snapshot.",
      [{ field: "expected_revision", issue: "stale" }]
    );
  }
  return frozen;
}

function assertIdsInFrozen(frozen: readonly string[], candidate: readonly string[], field: string): void {
  const allowed = new Set(frozen);
  for (const id of candidate) {
    if (!allowed.has(id)) {
      throw new CommandContractError(
        "COMMAND_VALIDATION",
        "Operation targets a post that is not in the frozen selection.",
        [{ field, issue: id }]
      );
    }
  }
}

function op(
  capability: CommandStockOperationKind,
  target_ids: string[],
  payload: Record<string, unknown>
): CommandChangeSetOp {
  return {
    op_id: `op_${capability}_${randomUUID().slice(0, 8)}`,
    capability,
    risk_class: "execute_undo",
    target_ids,
    payload
  };
}

export function collectionMetaFromOps(
  ops: ReadonlyArray<{ capability?: string; payload?: Record<string, unknown>; target_ids?: string[] }>
): { collection_id: string | null; collection_title: string } {
  const row = ops.find((item) => item.capability === "create_or_update_collection");
  const payload = row?.payload ?? {};
  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  const fromPayload =
    typeof payload.collection_id === "string" && payload.collection_id.trim()
      ? payload.collection_id.trim()
      : "";
  const fromTarget = row?.target_ids?.[0]?.trim() ?? "";
  return {
    collection_id: fromPayload || fromTarget || null,
    collection_title: title
  };
}

/**
 * Map a named stock intent onto frozen IDs. Rejects publish/delete/visibility/automation.
 */
export function compileStockOperation(input: CompileStockOperationInput): CompileStockOperationResult {
  const kind = input.kind.trim();
  if (isForbiddenKind(kind)) {
    throw new CommandContractError(
      "COMMAND_FORBIDDEN",
      "Capability is not allowed in this program.",
      [{ field: "kind", issue: kind }]
    );
  }
  if (isScheduleKind(kind)) {
    throw new CommandContractError("COMMAND_VALIDATION", ORGANIZE_APPLY_SCHEDULE_BLOCKED, [
      { field: "kind", issue: kind }
    ]);
  }
  if (!isStockKind(kind)) {
    throw new CommandContractError("COMMAND_VALIDATION", "Unknown stock operation.", [
      { field: "kind", issue: kind || "empty" }
    ]);
  }

  const frozen = assertFrozenRevision(input);
  if (input.posts && input.posts.length > 0) {
    assertIdsInFrozen(
      frozen,
      input.posts.map((row) => row.post_id.trim()),
      "posts"
    );
  }

  if (kind === "create_or_update_collection") {
    const title = (input.collection_title ?? "").trim();
    if (!title) {
      throw new CommandContractError("COMMAND_VALIDATION", "Collection title is required.", [
        { field: "collection_title", issue: "required" }
      ]);
    }
    const routed = routeCollectionWrite({
      collection_id: input.collection_id,
      title,
      post_ids: frozen,
      ordered_post_ids: frozen
    });
    const collectionId = routed.collection_id ?? collectionIdFromTitle(title);
    return {
      ops: [
        op("create_or_update_collection", [collectionId], {
          collection_id: collectionId,
          title: routed.title ?? title,
          post_ids: routed.post_ids,
          ordered_post_ids: routed.ordered_post_ids ?? routed.post_ids
        })
      ],
      resolved_post_ids: frozen,
      write_layer: "collection"
    };
  }

  if (kind === "set_collection_order") {
    const collectionId = (input.collection_id ?? "").trim();
    if (!collectionId) {
      throw new CommandContractError("COMMAND_VALIDATION", "collection_id is required.", [
        { field: "collection_id", issue: "required" }
      ]);
    }
    const routed = routeCollectionWrite({
      collection_id: collectionId,
      post_ids: frozen,
      ordered_post_ids: frozen
    });
    return {
      ops: [
        op("set_collection_order", [collectionId], {
          collection_id: collectionId,
          post_ids: routed.ordered_post_ids ?? routed.post_ids
        })
      ],
      resolved_post_ids: frozen,
      write_layer: "collection"
    };
  }

  if (kind === "revise_post") {
    const sources = new Map(
      (input.posts ?? []).map((row) => [row.post_id.trim(), row.source] as const)
    );
    const ops: CommandChangeSetOp[] = [];
    const layers = new Set<CommandWriteLayer>();
    for (const postId of frozen) {
      const source = sources.get(postId);
      if (!source) {
        throw new CommandContractError(
          "COMMAND_VALIDATION",
          "Revise requires post source for each frozen id.",
          [{ field: "posts", issue: postId }]
        );
      }
      const routed = routePostRevision({
        post_id: postId,
        source,
        fields: { title: input.title, description: input.description },
        requested_layer: input.requested_layer,
        everywhere: input.everywhere
      });
      if (routed.layer !== "presentation" && routed.layer !== "native_version") {
        throw new CommandContractError(
          "COMMAND_WRONG_WRITE_LAYER",
          "Revise cannot target a collection layer.",
          [{ field: "layer", issue: routed.layer }]
        );
      }
      layers.add(routed.layer);
      ops.push(
        op("revise_post", [postId], {
          post_id: postId,
          source,
          title: input.title,
          description: input.description
        })
      );
    }
    return {
      ops,
      resolved_post_ids: frozen,
      write_layer: layers.size === 1 ? [...layers][0]! : null
    };
  }

  if (kind === "add_post_tags" || kind === "remove_post_tags") {
    const tagIds = uniqueOrdered(input.tag_ids ?? []);
    if (tagIds.length === 0) {
      throw new CommandContractError("COMMAND_VALIDATION", "tag_ids is required.", [
        { field: "tag_ids", issue: "empty" }
      ]);
    }
    assertIdsInFrozen(frozen, frozen, "frozen_post_ids");
    return {
      ops: [
        op(kind, frozen, {
          post_ids: frozen,
          tag_ids: tagIds
        })
      ],
      resolved_post_ids: frozen,
      write_layer: null
    };
  }

  const name = (input.filter_name ?? "").trim();
  if (!name) {
    throw new CommandContractError("COMMAND_VALIDATION", "Saved filter name is required.", [
      { field: "filter_name", issue: "required" }
    ]);
  }
  return {
    ops: [
      op("create_saved_filter", frozen, {
        name,
        query: input.filter_query ?? {},
        post_ids: frozen
      })
    ],
    resolved_post_ids: frozen,
    write_layer: null
  };
}
