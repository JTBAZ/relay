/**
 * @fileoverview Assemble extension/API packages from approved distribution variants.
 */

import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { fingerprint } from "../gallery-editor/state.js";
import { crossPostMediaContentUrlPath, filenameForMedia, type CrossPostPackageMediaEntry } from "../extension/cross-post-media-entries.js";
import {
  buildDeviantArtCrossPostPackage,
  buildPatreonCrossPostPackage,
  buildRelayCrossPostPackage,
  buildXCrossPostPackage,
  type BuildDeviantArtCrossPostPackageResult,
  type BuildPatreonCrossPostPackageResult,
  type BuildXCrossPostPackageResult,
  type RelayCrossPostPackage
} from "../extension/cross-post-package.js";
import {
  buildMediaEntriesForPackage,
  parsePlanPreviewMediaId,
  parseVariantMediaBinding,
  resolveVariantMediaIds,
  VariantMediaBindingError
} from "./media-binding.js";
import {
  loadVariantForPackage,
  type DistributionAttemptWire,
  type DistributionVariantWire
} from "./post-distribution-service.js";
import type { DistributionDestination } from "./platform-destinations.js";

export type BuildFromAttemptResult =
  | { status: "not_found" }
  | { status: "forbidden" }
  | { status: "no_primary_creator" }
  | { status: "invalid_media_binding"; message: string }
  | { status: "ok"; destination: DistributionDestination; package: unknown; variant: DistributionVariantWire; managed_handoff_v1?: { attempt_id: string; post_id: string; destination: "x" | "deviantart"; variant_id: string; revision: number; task_id: string; scheduled_for: string; copy_hash: string; export_hash: string } };

export const MAX_CONVERSATION_HANDOFF_JPEG_BYTES = 1024 * 1024;
export type ConversationHandoffObjectReader = (storageKey: string, maxBytes: number) => Promise<Buffer>;

const X_IMAGE_MAX = 4;
const DEVIANTART_IMAGE_MAX = 1;

function limitMediaForDestination(
  media: CrossPostPackageMediaEntry[],
  destination: DistributionDestination
): CrossPostPackageMediaEntry[] {
  if (destination === "x") {
    return media.filter((m) => m.mime_type.toLowerCase().startsWith("image/")).slice(0, X_IMAGE_MAX);
  }
  if (destination === "deviantart") {
    return media.filter((m) => m.mime_type.toLowerCase().startsWith("image/")).slice(0, DEVIANTART_IMAGE_MAX);
  }
  return media;
}

async function applyVariantMediaToPackage(
  prisma: PrismaClient,
  creatorId: string,
  base: RelayCrossPostPackage,
  variant: DistributionVariantWire,
  assistantPlan: Record<string, unknown>
): Promise<RelayCrossPostPackage | { status: "invalid_media_binding"; message: string }> {
  const binding = parseVariantMediaBinding(variant.platform_fields, variant.destination);
  const canonicalMediaIds = base.media.map((row) => row.media_id);
  let resolvedIds: string[];
  try {
    resolvedIds = resolveVariantMediaIds({
      canonicalMediaIds,
      binding,
      planPreviewMediaId: parsePlanPreviewMediaId(assistantPlan)
    });
  } catch (err) {
    if (err instanceof VariantMediaBindingError) {
      return { status: "invalid_media_binding", message: err.message };
    }
    throw err;
  }

  if (binding.mediaVersion === "full" && resolvedIds.join(",") === canonicalMediaIds.join(",")) {
    return base;
  }

  const media = limitMediaForDestination(
    await buildMediaEntriesForPackage(prisma, creatorId, resolvedIds),
    variant.destination
  );
  return { ...base, media };
}

function applyVariantToPatreonPackage(
  base: Extract<BuildPatreonCrossPostPackageResult, { status: "ok" }>["package"],
  variant: DistributionVariantWire
) {
  return {
    ...base,
    title: variant.title?.trim() || base.title,
    body_text: variant.body_text?.trim() ?? base.body_text
  };
}

function applyVariantToXPackage(
  base: Extract<BuildXCrossPostPackageResult, { status: "ok" }>["package"],
  variant: DistributionVariantWire
) {
  return {
    ...base,
    post_text: variant.post_text?.trim() || base.post_text
  };
}

function applyVariantToDeviantArtPackage(
  base: Extract<BuildDeviantArtCrossPostPackageResult, { status: "ok" }>["package"],
  variant: DistributionVariantWire
) {
  return {
    ...base,
    title: variant.title?.trim() || base.title,
    body_text: variant.body_text?.trim() ?? base.body_text,
    tags: variant.tags.length > 0 ? variant.tags : base.tags
  };
}

async function finalizePackage<T extends RelayCrossPostPackage>(
  prisma: PrismaClient,
  creatorId: string,
  pkg: T,
  variant: DistributionVariantWire,
  assistantPlan: Record<string, unknown>
): Promise<T | { status: "invalid_media_binding"; message: string }> {
  const withMedia = await applyVariantMediaToPackage(prisma, creatorId, pkg, variant, assistantPlan);
  if ("status" in withMedia) {
    return withMedia;
  }
  return { ...pkg, media: withMedia.media };
}

const object = (value: unknown): Record<string, any> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};

async function buildManagedConversationHandoff(
  prisma: PrismaClient,
  creatorId: string,
  attemptId: string,
  attempt: DistributionAttemptWire,
  variant: DistributionVariantWire,
  groupKey: string | null,
  assistantPlan: Record<string, unknown>,
  readObject?: ConversationHandoffObjectReader
): Promise<BuildFromAttemptResult | null> {
  if (!groupKey?.startsWith("conversation-draft:")) return null;
  const destination = variant.destination;
  if (destination !== "x" && destination !== "deviantart") return { status: "not_found" };
  const state = object(assistantPlan.conversation_draft_v1);
  const entry = object(state.variants)[destination];
  const handoffs = Array.isArray(state.handoffReceipts) ? state.handoffReceipts : [];
  const receipt = handoffs.find((row: any) => row?.attemptId === attemptId);
  if (state.version !== 1 || !entry || entry.variantId !== variant.variant_id || !receipt || receipt.variantId !== variant.variant_id || receipt.planId !== variant.plan_id || receipt.destination !== variant.destination || receipt.sourcePostId !== variant.post_id || receipt.sourceVersionId !== state.sourceVersionId || receipt.previewMediaId !== state.previewMediaId || receipt.exportHash !== state.exportHash || receipt.revision !== entry.revision || attempt.attempt_id !== attemptId || attempt.variant_id !== variant.variant_id || attempt.post_id !== variant.post_id || attempt.destination !== variant.destination || !["started", "package_fetched", "tab_opened", "injected", "fill_failed", "fill_partial", "fill_succeeded"].includes(attempt.status) || !["handed_off", "fill_failed"].includes(variant.status) || !variant.approved_at) return { status: "not_found" };
  if (!readObject) return { status: "invalid_media_binding", message: "The confirmed Previewizer image is unavailable for handoff." };

  const post = await prisma.post.findFirst({ where: { id: receipt.sourcePostId, creatorId, upstreamStatus: "active", versions: { some: { id: receipt.sourceVersionId } } }, select: { id: true } });
  if (!post) return { status: "invalid_media_binding", message: "The pinned Library source version is no longer available." };

  const copy = destination === "x"
    ? { postText: variant.post_text ?? "" }
    : { title: variant.title ?? "", bodyText: variant.body_text ?? "", tags: variant.tags ?? [] };
  const latest = Array.isArray(entry.revisions) ? [...entry.revisions].reverse().find((row: any) => row?.revision === entry.revision) : null;
  if (fingerprint(copy) !== receipt.copyHash || !latest || fingerprint(latest.after) !== receipt.copyHash) return { status: "invalid_media_binding", message: "The destination copy changed after handoff confirmation." };

  const taskReceipt = (Array.isArray(state.scheduleReceipts) ? state.scheduleReceipts : []).find((row: any) => row?.variantId === variant.variant_id && row.taskId === receipt.taskId);
  const task = await prisma.postbotTask.findFirst({ where: { id: receipt.taskId, creatorId, postId: receipt.sourcePostId, planId: receipt.planId, variantId: variant.variant_id, destination: variant.destination, action: "post", status: "pending" }, select: { id: true, suggestedTime: true } });
  if (!taskReceipt || taskReceipt.scheduledFor !== receipt.scheduledFor || !task?.suggestedTime || task.suggestedTime.toISOString() !== receipt.scheduledFor || variant.scheduled_for !== receipt.scheduledFor) return { status: "invalid_media_binding", message: "The confirmed Rail cue changed after handoff confirmation." };

  const media = await prisma.mediaAsset.findFirst({ where: { id: receipt.previewMediaId, creatorId, primaryPostId: receipt.sourcePostId, upstreamStatus: "active", processingStatus: "READY", currentMimeType: "image/jpeg" }, select: { id: true, currentStorageKey: true, currentMimeType: true, versionsJson: true } });
  const provenance = Array.isArray(media?.versionsJson) ? object(media.versionsJson[0]) : {};
  if (!media?.currentStorageKey || media.currentStorageKey !== provenance.storage_key || provenance.sha256 !== receipt.exportHash || provenance.source_post_id !== receipt.sourcePostId || provenance.source_version_id !== receipt.sourceVersionId) return { status: "invalid_media_binding", message: "The confirmed Previewizer image changed after handoff confirmation." };
  let bytes: Buffer;
  try { bytes = await readObject(media.currentStorageKey, MAX_CONVERSATION_HANDOFF_JPEG_BYTES); }
  catch { return { status: "invalid_media_binding", message: "The confirmed Previewizer image is unavailable for handoff." }; }
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > MAX_CONVERSATION_HANDOFF_JPEG_BYTES || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff || createHash("sha256").update(bytes).digest("hex") !== receipt.exportHash) return { status: "invalid_media_binding", message: "The confirmed Previewizer image failed its integrity check." };

  const mediaEntry: CrossPostPackageMediaEntry = {
    media_id: media.id, filename: filenameForMedia(media.id, media.currentMimeType), mime_type: "image/jpeg",
    content_url: crossPostMediaContentUrlPath(creatorId, media.id), sha256: receipt.exportHash
  };
  const pkg = destination === "x"
    ? { relay_post_id: receipt.sourcePostId, title: copy.postText, body_text: "", post_text: copy.postText, media: [mediaEntry] }
    : { relay_post_id: receipt.sourcePostId, title: copy.title, body_text: copy.bodyText, tags: [...(copy.tags ?? [])], media: [mediaEntry] };
  return {
    status: "ok", destination, variant, package: pkg,
    managed_handoff_v1: { attempt_id: attemptId, post_id: receipt.sourcePostId, destination, variant_id: variant.variant_id, revision: receipt.revision, task_id: receipt.taskId, scheduled_for: receipt.scheduledFor, copy_hash: receipt.copyHash, export_hash: receipt.exportHash }
  };
}

export async function buildCrossPostPackageFromAttempt(
  prisma: PrismaClient,
  accountId: string,
  attemptId: string,
  readHandoffObject?: ConversationHandoffObjectReader
): Promise<BuildFromAttemptResult> {
  const account = await prisma.account.findUnique({
    where: { id: accountId.trim() },
    select: { primaryRelayCreatorId: true }
  });
  const creatorId = account?.primaryRelayCreatorId?.trim() ?? "";
  if (!creatorId) {
    return { status: "no_primary_creator" };
  }

  const loaded = await loadVariantForPackage(prisma, creatorId, attemptId);
  if (!loaded) {
    return { status: "not_found" };
  }

  const { variant, attempt, assistant_plan, plan_conversational_group_key } = loaded;
  const managed = await buildManagedConversationHandoff(prisma, creatorId, attemptId, attempt, variant, plan_conversational_group_key, assistant_plan, readHandoffObject);
  if (managed) return managed;
  const destination = variant.destination;
  const rhythmPlan=await prisma.postDistributionPlan.findFirst({where:{id:variant.plan_id,creatorId,rhythmActionId:{not:null}},select:{rhythmActionId:true}});
  if(rhythmPlan?.rhythmActionId){
    const {rhythmAction}=await import("../posting-rhythms/service.js");
    try{
      const action=await rhythmAction(prisma,creatorId,rhythmPlan.rhythmActionId);
      if(action.run.planId!==variant.plan_id || action.destination!==destination)return {status:"forbidden"};
      const mediaId=typeof assistant_plan.rhythm_media_id==="string"?assistant_plan.rhythm_media_id:"";
      const asset=await prisma.mediaAsset.findFirst({where:{id:mediaId,creatorId,upstreamStatus:"active",processingStatus:"READY"}});
      if(!asset || asset.currentUpstreamRevision!==assistant_plan.rhythm_output_revision)return {status:"invalid_media_binding",message:"The pinned image changed. Prepare this release again."};
      const media=await buildMediaEntriesForPackage(prisma,creatorId,[mediaId]);
      if(media.length!==1)return {status:"invalid_media_binding",message:"The selected image is unavailable."};
      return {status:"ok",destination,variant,package:{relay_post_id:attempt.post_id,title:variant.title??"",body_text:variant.body_text??"",post_text:variant.post_text??"",tags:variant.tags,media}};
    }catch{return {status:"invalid_media_binding",message:"This Rhythm release is no longer available for handoff."};}
  }
  const input = { postId: attempt.post_id, accountId: accountId.trim() };

  if (destination === "patreon") {
    const base = await buildPatreonCrossPostPackage(prisma, input);
    if (base.status !== "ok") return base;
    const pkg = await finalizePackage(
      prisma,
      creatorId,
      applyVariantToPatreonPackage(base.package, variant),
      variant,
      assistant_plan
    );
    if ("status" in pkg) return pkg;
    return { status: "ok", destination, package: pkg, variant };
  }
  if (destination === "x") {
    const base = await buildXCrossPostPackage(prisma, input);
    if (base.status !== "ok") return base;
    const pkg = await finalizePackage(
      prisma,
      creatorId,
      applyVariantToXPackage(base.package, variant),
      variant,
      assistant_plan
    );
    if ("status" in pkg) return pkg;
    return { status: "ok", destination, package: pkg, variant };
  }
  if (destination === "deviantart") {
    const base = await buildDeviantArtCrossPostPackage(prisma, input);
    if (base.status !== "ok") return base;
    const pkg = await finalizePackage(
      prisma,
      creatorId,
      applyVariantToDeviantArtPackage(base.package, variant),
      variant,
      assistant_plan
    );
    if ("status" in pkg) return pkg;
    return { status: "ok", destination, package: pkg, variant };
  }

  const base = await buildRelayCrossPostPackage(prisma, input);
  if (base.status !== "ok") return base;
  const pkg = await finalizePackage(
    prisma,
    creatorId,
    {
      ...base.package,
      post_text: variant.post_text?.trim() || base.package.body_text
    },
    variant,
    assistant_plan
  );
  if ("status" in pkg) return pkg;
  return {
    status: "ok",
    destination: "bluesky",
    package: pkg,
    variant
  };
}
