import { createHash } from "node:crypto";
import type { IngestService } from "../ingest/ingest-service.js";
import type { ApplyBatchResult, IngestCampaign, IngestPost, IngestTier, SyncBatchInput } from "../ingest/types.js";
import type { SyncWatermarkStoreAPI } from "../ingest/sync-watermark-store.js";
import { asDataArray, fetchPostsPage, postsPageUrl, type PatreonFetchOptions } from "./patreon-resource-api.js";
import { buildSyncBatchFromParts, mapPatreonPostToIngest } from "./map-patreon-to-ingest.js";
import { patreonPostStates } from "./post-refresh-state.js";
import { PatreonRequestError } from "./oauth-request.js";
import { emptyPostSyncProgress, type PostSyncCheckpoint, type PostScanLane } from "./post-sync-progress.js";
import type { PatreonScrapeResult } from "./patreon-sync-service.js";

/** Cursor progress describes completed observations; provider ordering is deliberately not assumed. */
export async function resumePostSync(args: {
  creatorId: string; campaignId: string; campaign: IngestCampaign; tiers: IngestTier[]; traceId: string;
  fetchOpts: PatreonFetchOptions; ingest: IngestService; watermarks: SyncWatermarkStoreAPI; maxPages: number;
  hasCookie: boolean; forceAccess?: boolean; refresh: (postId: string, reconciliation: boolean) => Promise<void>;
  exportMedia?: (mediaId: string) => Promise<unknown>;
}): Promise<PatreonScrapeResult> {
  const { creatorId, campaignId, ingest, watermarks } = args;
  const store = watermarks.postProgress;
  if (!store) throw new Error("Resumable Patreon sync requires a progress store.");
  if (store.shared !== ingest.supportsSharedPatreonPostRefresh) throw new Error("Resumable Patreon sync requires matching shared canonical and watermark stores.");
  const lease = await store.claim(creatorId, campaignId);
  if (!lease) throw new Error("Patreon post sync is already running; retry later.");
  if (args.forceAccess && lease.progress.catchup.status === "complete") lease.progress.catchup.due = 0;
  let lost = false;
  const heartbeat = setInterval(() => { void store.heartbeat(lease).catch(() => { lost = true; }); }, 15_000);
  const warnings: string[] = [], posts: IngestPost[] = [];
  let pages = 0, metadataPages = 0;
  const result: ApplyBatchResult = { job_id: args.traceId, idempotent_skips: 0, campaigns_upserted: 0, tiers_upserted: 0, posts_written: 0, media_upserted: 0, tombstones_applied: 0, events_emitted: 0 };
  const save = async (batch: SyncBatchInput, command: PostSyncCheckpoint, expected: Record<string, string>, page?: { passId: string; cursor: string; ordinal: number; discardPassId?: string; terminal: boolean }, verified: string[] = []) => {
    if (lost) throw new Error("Patreon post progress lease lost.");
    const accepted: Record<string, string> = {};
    const applied = await ingest.runBatch(batch, args.traceId, undefined, [], { currentPatreonSnapshot: true,
      expectedPatreonPostStates: expected, preservePatreonMedia: true, acceptedPatreonStates: accepted,
      ...(verified.length ? { verifiedPatreonCampaign: args.campaign.campaign_id, verifiedPatreonPostIds: verified } : {}), postScanPage: page,
      ...(store.shared ? { postCheckpoint: command } : {}) });
    if (!store.shared) { if (command.watermark) await watermarks.set(creatorId, campaignId, command.watermark); await store.checkpoint(command); }
    for (const key of ["idempotent_skips", "campaigns_upserted", "tiers_upserted", "posts_written", "media_upserted", "tombstones_applied", "events_emitted"] as const) result[key] += applied[key];
    return accepted;
  };
  try {
    for (let budget = 0; budget < args.maxPages; budget++) {
      const progress = structuredClone(lease.progress), now = Date.now();
      const order = ["archive", "archive", "catchup", "reconcile"] as const;
      let lane: "archive" | "catchup" | "reconcile" | undefined;
      for (let i = 0; i < order.length; i++) {
        const candidate = order[(progress.turn + i) % order.length]!;
        if (candidate === "archive" ? progress.archive.status !== "complete" : candidate === "catchup" ? progress.catchup.due <= now : progress.reconcile.due <= now && store.shared) {
          lane = candidate; progress.turn += i + 1; break;
        }
      }
      if (!lane) break;
      if (lane === "reconcile") {
        const snapshot = await ingest.getPatreonSnapshot(creatorId);
        const ids = Object.values(snapshot.posts[creatorId] ?? {}).filter((p) => p.source !== "RELAY" && p.source !== "SUBSCRIBESTAR" && p.campaign_id === args.campaign.campaign_id && (!progress.reconcile.after || p.post_id > progress.reconcile.after)).map((p) => p.post_id).sort();
        const postId = ids[0];
        if (postId) {
          try { await args.refresh(postId.replace(/^patreon_post_/, ""), true); }
          catch { warnings.push(`Reconciliation remains unverified for ${postId}; it will be retried on the next walk.`); }
          progress.reconcile.after = postId;
        }
        else { progress.reconcile.after = null; progress.reconcile.due = now + 6 * 60 * 60_000; }
        await save({ creator_id: creatorId }, { lease, progress }, {}, undefined);
        continue;
      }
      try {
      const scan = progress[lane as PostScanLane];
      if (scan.status === "complete") Object.assign(scan, emptyPostSyncProgress().catchup);
      const snapshot = await ingest.getPatreonSnapshot(creatorId);
      const expected = patreonPostStates(snapshot, creatorId);
      let doc, discardPassId: string | undefined;
      try { doc = await fetchPostsPage(args.fetchOpts, campaignId, scan.next); }
      catch (error) {
        if (!scan.next || !(error instanceof PatreonRequestError) || ![400, 404, 410, 422].includes(error.status ?? 0)) throw error;
        // Only a successful control request can establish that the saved continuation needs restarting.
        doc = await fetchPostsPage(args.fetchOpts, campaignId, null);
        discardPassId = scan.passId; Object.assign(scan, emptyPostSyncProgress().catchup);
        warnings.push("Patreon continuation was rejected; resumed bounded collection from the first page.");
      }
      const resources = asDataArray(doc.data);
      if (resources.some((r) => r.type !== "post")) throw new Error("Unexpected Patreon post page resource.");
      const verifiedIds: string[] = [];
      for (const resource of resources) {
        const relationship = resource.relationships?.campaign?.data;
        const bound = relationship && !Array.isArray(relationship) && relationship.type === "campaign" && relationship.id === campaignId;
        if (relationship && !bound) throw new Error("Patreon page campaign mismatch.");
        const existing = snapshot.posts[creatorId]?.[`patreon_post_${resource.id}`];
        if (existing?.campaign_id && existing.campaign_id !== args.campaign.campaign_id && !bound) throw new Error("Legacy Patreon campaign binding requires an authoritative relationship; coverage remains unverified.");
        if (bound) verifiedIds.push(`patreon_post_${resource.id}`);
      }
      const incoming = resources.map(mapPatreonPostToIngest);
      for (const container of [doc.links, doc.meta, doc.meta?.pagination, doc.meta?.pagination?.cursors]) if (container !== undefined && container !== null && (typeof container !== "object" || Array.isArray(container))) throw new Error("Invalid Patreon page continuation; coverage remains unverified.");
      const linked: unknown = doc.links?.next, cursorNext: unknown = doc.meta?.pagination?.cursors?.next;
      for (const value of [linked, cursorNext]) if (value !== undefined && value !== null && (typeof value !== "string" || !value.trim() || value.length > 8192)) throw new Error("Invalid Patreon page continuation; coverage remains unverified.");
      const next = typeof linked === "string" ? linked : typeof cursorNext === "string" ? postsPageUrl(campaignId) + `&page%5Bcursor%5D=${encodeURIComponent(cursorNext)}` : null;
      if (next) postsPageUrl(campaignId, next);
      if (!incoming.length && scan.pages === 0 && Object.values(snapshot.posts[creatorId] ?? {}).some((p) => p.source !== "RELAY" && p.campaign_id === args.campaign.campaign_id && p.upstream_status === "active")) throw new Error("Unexpected empty Patreon archive; coverage remains unverified.");
      const cursor = createHash("sha256").update(scan.next ?? "first").digest("hex");
      if (next && (next === scan.next || scan.seen.includes(next))) throw new Error("Repeated Patreon page cursor; coverage remains partial.");
      scan.seen = [...scan.seen, scan.next ?? "first"].slice(-2);
      for (const post of incoming) if (!scan.candidate || post.published_at > scan.candidate) scan.candidate = post.published_at;
      scan.next = next; scan.pages++; scan.status = next ? "partial" : "complete";
      if (!next) { scan.due = now + 15 * 60_000; scan.verifiedAt = new Date().toISOString(); }
      const oldWatermark = await watermarks.get(creatorId, campaignId);
      const watermark = !next && scan.candidate ? (!oldWatermark || scan.candidate > oldWatermark ? scan.candidate : oldWatermark) : undefined;
      const batch = buildSyncBatchFromParts(creatorId, args.campaign, args.tiers, incoming);
      const accepted = await save(structuredClone(batch), { lease, progress, watermark }, expected, { passId: scan.passId, cursor, ordinal: scan.pages, discardPassId, terminal: !next }, verifiedIds);
      pages++; metadataPages++; posts.push(...incoming);
      for (const post of incoming) {
        if (args.hasCookie && store.shared) {
          try { await args.refresh(post.post_id.replace(/^patreon_post_/, ""), false); }
          catch { warnings.push(`Media enrichment pending for ${post.post_id}.`); }
        } else if (post.media.length) {
          await ingest.runBatch(buildSyncBatchFromParts(creatorId, args.campaign, args.tiers, [post]), args.traceId, undefined, [], { currentPatreonSnapshot: true, expectedPatreonPostStates: accepted });
          for (const media of post.media) if (media.upstream_url && args.exportMedia) {
            try { await args.exportMedia(media.media_id); } catch { warnings.push(`Media export pending for ${media.media_id}.`); }
          }
        }
      }
      } catch (error) {
        // Failed lanes retain their continuation but still yield the next persisted turn.
        if (!lost) await store.checkpoint({ lease, progress: { ...structuredClone(lease.progress), turn: progress.turn } });
        throw error;
      }
    }
    return { creator_id: creatorId, patreon_campaign_id: campaignId, batch: buildSyncBatchFromParts(creatorId, args.campaign, args.tiers, posts), pages_fetched: pages,
      posts_fetched: posts.length, media_source: args.hasCookie && store.shared ? "cookie" : "oauth", warnings, apply_result: result,
      post_coverage: { archive: lease.progress.archive.status, catchup: lease.progress.catchup.status },
      tier_access_summary: { media_source: args.hasCookie && store.shared ? "cookie" : "oauth", oauth_list_pass: metadataPages > 0, oauth_list_posts_updated: posts.length, oauth_list_pages_fetched: metadataPages, per_post_oauth_targets: 0, per_post_filled_tiers: 0, per_post_filled_body: 0 } };
  } finally { clearInterval(heartbeat); await store.release(lease); }
}
