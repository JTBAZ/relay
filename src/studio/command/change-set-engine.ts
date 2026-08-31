/**
 * ChangeSet apply/undo against Gallery / Collection / Schedule services (RC-P2-T05, T08).
 * Apply requires RELAY_COMMAND_LAYER_ENABLED and RELAY_COMMAND_APPLY_ENABLED.
 * Does not publish, does not mark distribution attempts completed.
 */
import {
  CreatorScheduleEventType,
  type PrismaClient
} from "@prisma/client";
import { STUDIO_LAB2_LABEL, STUDIO_LAB2_CREATOR_ID } from "../lab2/corpus-spec.js";
import { DbCollectionsStore } from "../../gallery/collections-store-db.js";
import { DbGalleryOverridesStore } from "../../gallery/overrides-store-db.js";
import { DbSavedFiltersStore } from "../../gallery/saved-filters-store-db.js";
import {
  CommandContractError,
  getRelayCommandFeatureFlags,
  type CommandChangeSetEnvelope,
  type CommandChangeSetOp
} from "./contracts.js";
import {
  getPreviewRecord,
  previewChangeSet,
  putPreviewRecord,
  type ApplyChangeSetInput,
  type CommandUndoPayload
} from "./change-set-types.js";
import {
  loadCommandEngineUndo,
  loadDurablePreviewRecord,
  markCommandChangeSetUndone,
  persistCommandChangeSet,
  persistCommandEngineUndo
} from "./command-durable-store.js";
import { appendNativePostVersion } from "./native-revise.js";
import { routePostRevision } from "./write-router.js";
import {
  compileFinitePlan,
  lab2FixtureWeeklyDueDates,
  parseDueAtIso
} from "./finite-plan-compiler.js";

type CollectionSnapshot = {
  collection_id: string;
  existed: boolean;
  title: string;
  post_ids: string[];
};

type TagOverrideSnapshot = {
  post_id: string;
  existed: boolean;
  add_tag_ids: string[];
  remove_tag_ids: string[];
};

export type EngineUndoState = {
  change_set_id: string;
  creator_id: string;
  collections: CollectionSnapshot[];
  presentations: Array<{ post_id: string; relay_title: string | null; relay_description: string | null } | { post_id: string; missing: true }>;
  native_version_seqs: Array<{ post_id: string; version_seq: number }>;
  event_ids: string[];
  draft_ids: string[];
  tag_overrides: TagOverrideSnapshot[];
  saved_filter_ids: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseEngineUndoState(value: unknown): EngineUndoState | null {
  if (!isRecord(value)) return null;
  if (typeof value.change_set_id !== "string" || typeof value.creator_id !== "string") return null;
  return {
    change_set_id: value.change_set_id,
    creator_id: value.creator_id,
    collections: Array.isArray(value.collections) ? (value.collections as CollectionSnapshot[]) : [],
    presentations: Array.isArray(value.presentations)
      ? (value.presentations as EngineUndoState["presentations"])
      : [],
    native_version_seqs: Array.isArray(value.native_version_seqs)
      ? (value.native_version_seqs as EngineUndoState["native_version_seqs"])
      : [],
    event_ids: Array.isArray(value.event_ids) ? asStringArray(value.event_ids) : [],
    draft_ids: Array.isArray(value.draft_ids) ? asStringArray(value.draft_ids) : [],
    tag_overrides: Array.isArray(value.tag_overrides) ? (value.tag_overrides as TagOverrideSnapshot[]) : [],
    saved_filter_ids: Array.isArray(value.saved_filter_ids) ? asStringArray(value.saved_filter_ids) : []
  };
}

const undoStore = new Map<string, EngineUndoState>();

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}

function assertApplyFlags(env: NodeJS.ProcessEnv): void {
  const flags = getRelayCommandFeatureFlags(env);
  if (!flags.layer_enabled || !flags.apply_enabled) {
    throw new CommandContractError(
      "COMMAND_APPLY_DISABLED",
      "ChangeSet apply requires RELAY_COMMAND_LAYER_ENABLED and RELAY_COMMAND_APPLY_ENABLED.",
      [
        { field: "RELAY_COMMAND_LAYER_ENABLED", issue: flags.layer_enabled ? "on" : "off" },
        { field: "RELAY_COMMAND_APPLY_ENABLED", issue: flags.apply_enabled ? "on" : "off" }
      ]
    );
  }
}

function publicMediaIds(
  assets: Array<{ id: string; currentRole: string | null }>,
  isPublic: boolean
): string[] {
  if (isPublic) return assets.map((a) => a.id);
  return assets.filter((a) => a.currentRole === "cover").map((a) => a.id);
}

async function snapshotCollection(
  store: DbCollectionsStore,
  collectionId: string
): Promise<CollectionSnapshot> {
  const col = await store.getById(collectionId);
  if (!col) {
    return { collection_id: collectionId, existed: false, title: "", post_ids: [] };
  }
  return {
    collection_id: col.collection_id,
    existed: true,
    title: col.title,
    post_ids: [...col.post_ids]
  };
}

async function applyCollectionUpsert(
  prisma: PrismaClient,
  creatorId: string,
  op: CommandChangeSetOp,
  undo: EngineUndoState
): Promise<void> {
  const store = new DbCollectionsStore(prisma);
  const title = typeof op.payload.title === "string" ? op.payload.title.trim() : "";
  if (!title) {
    throw new CommandContractError("COMMAND_VALIDATION", "Collection title is required.", [
      { field: "title", issue: "required" }
    ]);
  }
  const collectionId =
    typeof op.payload.collection_id === "string" && op.payload.collection_id.trim()
      ? op.payload.collection_id.trim()
      : op.target_ids[0]?.trim() || "";
  const postIds = asStringArray(op.payload.post_ids);
  if (collectionId) {
    undo.collections.push(await snapshotCollection(store, collectionId));
  }
  const col = await store.create(creatorId, title, undefined, {
    collection_id: collectionId || undefined,
    theme_tag_ids: [STUDIO_LAB2_LABEL]
  });
  const ordered = asStringArray(op.payload.ordered_post_ids);
  await store.setPostOrder(col.collection_id, ordered.length > 0 ? ordered : postIds);
}

async function applyCollectionOrder(
  prisma: PrismaClient,
  creatorId: string,
  op: CommandChangeSetOp,
  undo: EngineUndoState
): Promise<void> {
  const store = new DbCollectionsStore(prisma);
  const collectionId =
    (typeof op.payload.collection_id === "string" ? op.payload.collection_id.trim() : "") ||
    op.target_ids[0]?.trim() ||
    "";
  if (!collectionId) {
    throw new CommandContractError("COMMAND_VALIDATION", "collection_id is required.", [
      { field: "collection_id", issue: "required" }
    ]);
  }
  const existing = await store.getById(collectionId);
  if (!existing || existing.creator_id !== creatorId) {
    throw new CommandContractError("COMMAND_NOT_FOUND", "Collection not found.", [
      { field: "collection_id", issue: collectionId }
    ]);
  }
  undo.collections.push(await snapshotCollection(store, collectionId));
  await store.setPostOrder(collectionId, asStringArray(op.payload.post_ids));
}

async function applyRevise(
  prisma: PrismaClient,
  creatorId: string,
  op: CommandChangeSetOp,
  undo: EngineUndoState
): Promise<void> {
  const postId = (typeof op.payload.post_id === "string" ? op.payload.post_id : op.target_ids[0] ?? "").trim();
  const sourceRaw = typeof op.payload.source === "string" ? op.payload.source : "";
  const source =
    sourceRaw === "RELAY" || sourceRaw === "PATREON" || sourceRaw === "SUBSCRIBESTAR" ? sourceRaw : null;
  if (!postId || !source) {
    throw new CommandContractError("COMMAND_VALIDATION", "revise requires post_id and source.", [
      { field: "post_id", issue: postId || "missing" }
    ]);
  }
  const fields = {
    title: typeof op.payload.title === "string" ? op.payload.title : undefined,
    description: typeof op.payload.description === "string" ? op.payload.description : undefined
  };
  const routed = routePostRevision({ post_id: postId, source, fields });
  const post = await prisma.post.findFirst({
    where: { id: postId, creatorId },
    select: { id: true, source: true }
  });
  if (!post) {
    throw new CommandContractError("COMMAND_NOT_FOUND", "Post not found.", [
      { field: "post_id", issue: postId }
    ]);
  }
  if (routed.layer === "presentation") {
    const existing = await prisma.postPresentation.findUnique({ where: { postId } });
    if (existing) {
      undo.presentations.push({
        post_id: postId,
        relay_title: existing.relayTitle,
        relay_description: existing.relayDescription
      });
    } else {
      undo.presentations.push({ post_id: postId, missing: true });
    }
    await prisma.postPresentation.upsert({
      where: { postId },
      create: {
        creatorId,
        postId,
        relayTitle: routed.patch.relay_title ?? null,
        relayDescription: routed.patch.relay_description ?? null
      },
      update: {
        ...(routed.patch.relay_title !== undefined ? { relayTitle: routed.patch.relay_title } : {}),
        ...(routed.patch.relay_description !== undefined
          ? { relayDescription: routed.patch.relay_description }
          : {})
      }
    });
    return;
  }
  if (routed.layer !== "native_version") {
    throw new CommandContractError("COMMAND_WRONG_WRITE_LAYER", "Revise cannot target a collection layer.", [
      { field: "layer", issue: routed.layer }
    ]);
  }
  const appended = await appendNativePostVersion(prisma, {
    creatorId,
    postId,
    title: routed.append.title,
    description: routed.append.description
  });
  undo.native_version_seqs.push({ post_id: postId, version_seq: appended.version_seq });
}

async function snapshotTagOverride(
  prisma: PrismaClient,
  creatorId: string,
  postId: string
): Promise<TagOverrideSnapshot> {
  const row = await prisma.postOverride.findUnique({
    where: { creatorId_postId_mediaId: { creatorId, postId, mediaId: "" } }
  });
  if (!row) {
    return { post_id: postId, existed: false, add_tag_ids: [], remove_tag_ids: [] };
  }
  return {
    post_id: postId,
    existed: true,
    add_tag_ids: [...row.addTagIds],
    remove_tag_ids: [...row.removeTagIds]
  };
}

async function applyTagDelta(
  prisma: PrismaClient,
  creatorId: string,
  op: CommandChangeSetOp,
  undo: EngineUndoState
): Promise<void> {
  const postIds = asStringArray(op.payload.post_ids).length > 0 ? asStringArray(op.payload.post_ids) : op.target_ids;
  const tagIds = asStringArray(op.payload.tag_ids);
  if (tagIds.length === 0) {
    throw new CommandContractError("COMMAND_VALIDATION", "tag_ids is required.", [
      { field: "tag_ids", issue: "empty" }
    ]);
  }
  const store = new DbGalleryOverridesStore(prisma);
  const add = op.capability === "add_post_tags" ? tagIds : [];
  const remove = op.capability === "remove_post_tags" ? tagIds : [];
  for (const postId of postIds) {
    const post = await prisma.post.findFirst({
      where: { id: postId, creatorId },
      select: { id: true }
    });
    if (!post) {
      throw new CommandContractError("COMMAND_NOT_FOUND", "Post not found.", [
        { field: "post_id", issue: postId }
      ]);
    }
    undo.tag_overrides.push(await snapshotTagOverride(prisma, creatorId, postId));
    await store.mergePostTagDelta(creatorId, postId, {
      add_tag_ids: add,
      remove_tag_ids: remove
    });
  }
}

async function applySavedFilter(
  prisma: PrismaClient,
  creatorId: string,
  op: CommandChangeSetOp,
  undo: EngineUndoState
): Promise<void> {
  const name = typeof op.payload.name === "string" ? op.payload.name.trim() : "";
  if (!name) {
    throw new CommandContractError("COMMAND_VALIDATION", "Saved filter name is required.", [
      { field: "name", issue: "required" }
    ]);
  }
  const query =
    op.payload.query && typeof op.payload.query === "object" && !Array.isArray(op.payload.query)
      ? (op.payload.query as {
          q?: string;
          tag_ids?: string[];
          tier_ids?: string[];
          media_type?: string;
          published_after?: string;
          published_before?: string;
        })
      : {};
  const store = new DbSavedFiltersStore(prisma);
  const created = await store.create(creatorId, name, query);
  undo.saved_filter_ids.push(created.filter_id);
}

function dueDatesFromPayload(
  payload: Record<string, unknown>,
  postIds: readonly string[],
  creatorId: string
): Date[] {
  const dueAts = Array.isArray(payload.due_ats)
    ? payload.due_ats.filter((item): item is string => typeof item === "string")
    : [];
  if (dueAts.length > 0) {
    return postIds.map((_, i) => new Date(parseDueAtIso(dueAts[i] ?? dueAts[0]!, "due_ats")));
  }
  const slots = Array.isArray(payload.slots) ? payload.slots : [];
  if (slots.length > 0) {
    const byPost = new Map<string, string>();
    for (const row of slots) {
      if (!row || typeof row !== "object") continue;
      const rec = row as Record<string, unknown>;
      if (typeof rec.post_id === "string" && typeof rec.due_at === "string") {
        byPost.set(rec.post_id, rec.due_at);
      }
    }
    if (byPost.size > 0) {
      return postIds.map((id) => {
        const due = byPost.get(id);
        if (!due) {
          throw new CommandContractError("COMMAND_VALIDATION", "Schedule slot is missing due_at.", [
            { field: "slots", issue: id }
          ]);
        }
        return new Date(parseDueAtIso(due));
      });
    }
  }
  const startLocal = typeof payload.start_local === "string" ? payload.start_local.trim() : "";
  const timeZone = typeof payload.time_zone === "string" ? payload.time_zone.trim() : "";
  if (startLocal && timeZone) {
    return compileFinitePlan({
      frozen_post_ids: postIds,
      skip_post_ids: asStringArray(payload.skipped_post_ids),
      exclude_post_ids: asStringArray(payload.exclude_post_ids),
      time_zone: timeZone,
      weekday: (payload.weekday as number | string | undefined) ?? 6,
      interval_days: typeof payload.interval_days === "number" ? payload.interval_days : 7,
      start_local: startLocal
    }).map((slot) => new Date(slot.due_at));
  }
  if (creatorId === STUDIO_LAB2_CREATOR_ID) {
    return lab2FixtureWeeklyDueDates(postIds.length);
  }
  throw new CommandContractError(
    "COMMAND_VALIDATION",
    "Schedule apply requires due_ats or a finite plan cadence.",
    [{ field: "due_ats", issue: "missing" }]
  );
}

async function applyScheduleAndDrafts(
  prisma: PrismaClient,
  creatorId: string,
  op: CommandChangeSetOp,
  undo: EngineUndoState,
  changeSetId: string
): Promise<void> {
  const destination =
    (typeof op.payload.destination === "string" ? op.payload.destination.trim() : "x") || "x";
  const postIds = asStringArray(op.payload.post_ids).length
    ? asStringArray(op.payload.post_ids)
    : op.target_ids;
  const dates = dueDatesFromPayload(op.payload, postIds, creatorId);
  for (const [i, postId] of postIds.entries()) {
    const post = await prisma.post.findFirst({
      where: { id: postId, creatorId },
      include: {
        versions: { orderBy: { versionSeq: "desc" }, take: 1 },
        mediaAssets: true
      }
    });
    if (!post) continue;
    const title = post.versions[0]?.title ?? postId;
    if (op.capability === "create_release_plan" || op.capability === "materialize_schedule") {
      const eventId = `sl2_evt_${changeSetId}_${postId}`;
      await prisma.creatorScheduleEvent.upsert({
        where: { id: eventId },
        create: {
          id: eventId,
          creatorId,
          eventType: CreatorScheduleEventType.schedule_post,
          destination,
          title,
          note: STUDIO_LAB2_LABEL,
          dueAt: dates[i] ?? dates[0]!,
          postId,
          remindMe: false,
          status: "pending"
        },
        update: {
          title,
          dueAt: dates[i] ?? dates[0]!,
          note: STUDIO_LAB2_LABEL
        }
      });
      undo.event_ids.push(eventId);
    }
    if (op.capability === "prepare_destination_drafts" || op.capability === "materialize_schedule") {
      const mediaIds = publicMediaIds(post.mediaAssets, post.isPublic);
      if (!post.isPublic && mediaIds.length === 0) {
        throw new CommandContractError(
          "COMMAND_GATED_MEDIA",
          "Gated originals cannot be used as destination draft media.",
          [{ field: "post_id", issue: postId }]
        );
      }
      const draftId = `sl2_draft_${changeSetId}_${postId}`;
      await prisma.autopostDraft.upsert({
        where: { id: draftId },
        create: {
          id: draftId,
          creatorId,
          status: "nudged",
          mediaIds,
          title,
          bodyText: post.versions[0]?.description ?? null,
          intent: "command_destination_draft",
          composerStep: "draft-post",
          workspace: {
            selected_destinations: [destination],
            source_post_id: postId,
            label: STUDIO_LAB2_LABEL
          }
        },
        update: {
          mediaIds,
          title,
          status: "nudged"
        }
      });
      undo.draft_ids.push(draftId);
    }
  }
}

export async function applyCommandChangeSet(
  prisma: PrismaClient,
  creatorId: string,
  input: ApplyChangeSetInput & { ops?: CommandChangeSetOp[] },
  env: NodeJS.ProcessEnv = process.env
): Promise<CommandChangeSetEnvelope> {
  assertApplyFlags(env);
  let record = getPreviewRecord(input.change_set_id);
  if (!record) {
    const durable = await loadDurablePreviewRecord(prisma, input.change_set_id, creatorId);
    if (durable) {
      putPreviewRecord(durable);
      record = durable;
    }
  }
  if (record?.envelope.status === "applied") {
    return record.envelope;
  }
  if (!record && input.ops) {
    previewChangeSet({
      change_set_id: input.change_set_id,
      idempotency_key: `apply:${input.change_set_id}`,
      instruction: "p2-apply",
      resolved_post_ids: input.resolved_post_ids,
      ops: input.ops
    });
    record = getPreviewRecord(input.change_set_id);
  }
  if (!record) {
    throw new CommandContractError("COMMAND_NOT_FOUND", "ChangeSet preview not found.", [
      { field: "change_set_id", issue: input.change_set_id }
    ]);
  }
  if (record.resolved_post_ids_snapshot.join("\0") !== input.resolved_post_ids.join("\0")) {
    throw new CommandContractError(
      "COMMAND_STALE_SELECTION",
      "resolved_post_ids no longer match the preview snapshot.",
      [{ field: "resolved_post_ids", issue: "stale" }]
    );
  }

  const undo: EngineUndoState = {
    change_set_id: input.change_set_id,
    creator_id: creatorId,
    collections: [],
    presentations: [],
    native_version_seqs: [],
    event_ids: [],
    draft_ids: [],
    tag_overrides: [],
    saved_filter_ids: []
  };

  for (const op of record.envelope.ops) {
    if (op.capability === "create_or_update_collection") {
      await applyCollectionUpsert(prisma, creatorId, op, undo);
    } else if (op.capability === "set_collection_order") {
      await applyCollectionOrder(prisma, creatorId, op, undo);
    } else if (op.capability === "revise_post") {
      await applyRevise(prisma, creatorId, op, undo);
    } else if (op.capability === "add_post_tags" || op.capability === "remove_post_tags") {
      await applyTagDelta(prisma, creatorId, op, undo);
    } else if (op.capability === "create_saved_filter") {
      await applySavedFilter(prisma, creatorId, op, undo);
    } else if (
      op.capability === "create_release_plan" ||
      op.capability === "materialize_schedule" ||
      op.capability === "prepare_destination_drafts"
    ) {
      await applyScheduleAndDrafts(prisma, creatorId, op, undo, input.change_set_id);
    }
  }

  undoStore.set(input.change_set_id, undo);
  const applied: CommandChangeSetEnvelope = {
    ...record.envelope,
    status: "applied",
    after_summary: `Applied ${record.envelope.ops.length} ops for ${creatorId}.`,
    updated_at: new Date().toISOString()
  };
  putPreviewRecord({
    envelope: applied,
    resolved_post_ids_snapshot: record.resolved_post_ids_snapshot,
    undo: record.undo
  });
  await persistCommandChangeSet(prisma, creatorId, applied);
  await persistCommandEngineUndo(prisma, undo);
  return applied;
}

export async function undoCommandChangeSet(
  prisma: PrismaClient,
  creatorId: string,
  changeSetId: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<CommandUndoPayload> {
  assertApplyFlags(env);
  let undo = undoStore.get(changeSetId);
  if (!undo || undo.creator_id !== creatorId) {
    undo = parseEngineUndoState(await loadCommandEngineUndo(prisma, changeSetId, creatorId)) ?? undefined;
    if (undo && undo.creator_id === creatorId) {
      undoStore.set(changeSetId, undo);
    }
  }
  if (!undo || undo.creator_id !== creatorId) {
    throw new CommandContractError("COMMAND_NOT_FOUND", "Undo payload not found.", [
      { field: "change_set_id", issue: changeSetId }
    ]);
  }
  const store = new DbCollectionsStore(prisma);
  for (const col of [...undo.collections].reverse()) {
    if (!col.existed) {
      await store.delete(col.collection_id);
    } else {
      await store.update(col.collection_id, { title: col.title });
      await store.setPostOrder(col.collection_id, col.post_ids);
    }
  }
  for (const pres of undo.presentations) {
    if ("missing" in pres && pres.missing) {
      await prisma.postPresentation.deleteMany({ where: { postId: pres.post_id, creatorId } });
    } else if ("relay_title" in pres) {
      await prisma.postPresentation.updateMany({
        where: { postId: pres.post_id, creatorId },
        data: { relayTitle: pres.relay_title, relayDescription: pres.relay_description }
      });
    }
  }
  for (const row of undo.native_version_seqs) {
    await prisma.postVersion.deleteMany({
      where: { postId: row.post_id, versionSeq: row.version_seq }
    });
  }
  if (undo.event_ids.length > 0) {
    await prisma.creatorScheduleEvent.deleteMany({
      where: { creatorId, id: { in: undo.event_ids } }
    });
  }
  if (undo.draft_ids.length > 0) {
    await prisma.autopostDraft.deleteMany({
      where: { creatorId, id: { in: undo.draft_ids } }
    });
  }
  for (const snap of [...undo.tag_overrides].reverse()) {
    if (!snap.existed) {
      await prisma.postOverride.deleteMany({
        where: { creatorId, postId: snap.post_id, mediaId: "" }
      });
    } else {
      await prisma.postOverride.update({
        where: { creatorId_postId_mediaId: { creatorId, postId: snap.post_id, mediaId: "" } },
        data: { addTagIds: snap.add_tag_ids, removeTagIds: snap.remove_tag_ids }
      });
    }
  }
  if (undo.saved_filter_ids.length > 0) {
    const filters = new DbSavedFiltersStore(prisma);
    for (const filterId of [...undo.saved_filter_ids].reverse()) {
      await filters.delete(creatorId, filterId);
    }
  }
  undoStore.delete(changeSetId);
  await markCommandChangeSetUndone(prisma, changeSetId, creatorId);
  return {
    change_set_id: changeSetId,
    before_snapshot_ref: `snap_${changeSetId}`,
    inverses: []
  };
}

export function clearCommandEngineUndoStore(): void {
  undoStore.clear();
}
