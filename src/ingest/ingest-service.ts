/**
 * @fileoverview Orchestrates enriched ingest batches against a `CanonicalStore` + event bus.
 * @description Single entry for `runBatch` with health metric recording.
 * @see ./apply-batch.js
 * @see ./canonical-store.js
 */

import type { PostSyncCheckpoint } from "../patreon/post-sync-progress.js";
import { randomUUID } from "node:crypto";
import { InMemoryEventBus, type RelayEventBus } from "../events/event-bus.js";
import { applySyncBatchToSnapshot } from "./apply-batch.js";
import { enrichBatch } from "./auto-enrich.js";
import type { CanonicalStore } from "./canonical-store.js";
import { recordIngestBatchResult } from "./ingest-health-metrics.js";
import type { ApplyBatchResult, SyncBatchInput } from "./types.js";
import type { ReplayResolution } from "./replay-compatibility.js";
import { preparePatreonPostRefresh, finishPatreonPostRefresh, campaignBindingKey, patreonPostState, patreonPostStates, recordAccessVerification, type PatreonPostRefresh } from "../patreon/post-refresh-state.js";
import { resolveCurrentPatreonRevisions } from "../patreon/current-snapshot-revisions.js";

export class IngestService {
  private readonly store: CanonicalStore;
  private readonly eventBus: RelayEventBus;

  public constructor(store: CanonicalStore, eventBus: RelayEventBus) {
    this.store = store;
    this.eventBus = eventBus;
  }

  public get supportsSharedPatreonPostRefresh(): boolean {
    return this.store.supportsAtomicCreatorMutations === true;
  }

  public async getPatreonSnapshot(creatorId: string) { return this.store.loadForCreator(creatorId); }

  public async getPatreonPostStates(creatorId: string): Promise<Record<string, string>> {
    return patreonPostStates(await this.store.loadForCreator(creatorId), creatorId);
  }

  public async getPatreonPostState(creatorId: string, postId: string): Promise<string> {
    return patreonPostState(await this.store.loadForCreator(creatorId), creatorId, postId);
  }

  /**
   * @description Applies one sync batch with optional stable `jobId`.
   * @param {import("./types.js").SyncBatchInput} batch
   * @param {string} traceId
   * @param {string} [jobId]
   * @param {ReplayResolution[]} [resolutions] Operator-only exact identity decisions.
   * @param options.currentPatreonSnapshot Resolve fresh provider observations under the creator lock; leave off for stored batch replay.
   * @returns {Promise<import("./types.js").ApplyBatchResult>}
   * @async
   */
  public async runBatch(
    batch: SyncBatchInput,
    traceId: string,
    jobId?: string,
    resolutions: ReplayResolution[] = [],
    options: { suppressPublicationEvents?: boolean; currentPatreonSnapshot?: boolean; patreonPostRefresh?: PatreonPostRefresh; expectedPatreonPostStates?: Record<string, string>; postCheckpoint?: PostSyncCheckpoint; preservePatreonMedia?: boolean; verifiedPatreonCampaign?: string; verifiedPatreonPostIds?: string[]; acceptedPatreonStates?: Record<string, string>; postScanPage?: { passId: string; cursor: string; ordinal: number; discardPassId?: string; terminal: boolean } } = {}
  ): Promise<ApplyBatchResult> {
    const id = jobId ?? `job_${randomUUID()}`;
    const creatorId = batch.creator_id;
    const { batch: enriched, notes } = enrichBatch(batch);
    const pendingEvents = new InMemoryEventBus();
    let result!: ApplyBatchResult;
    let acceptedState: string | undefined;
    let acceptedStates: Record<string, string> = {};
    await this.store.mutateForCreator(creatorId, (snapshot) => {
      const page = options.postScanPage;
      const pagePrefix = (pass: string) => `patreon_post_page:v1:${JSON.stringify([creatorId, pass])}:`;
      if (page) {
        const prefix = pagePrefix(page.passId) + page.cursor + ":";
        const key = prefix + page.ordinal;
        if (Object.keys(snapshot.ingest_idempotency).some((old) => old.startsWith(prefix) && old !== key)) throw new Error("Repeated Patreon page cursor; collection remains partial.");
        snapshot.ingest_idempotency[key] = { first_seen_at: new Date().toISOString() };
        if (page.terminal || page.discardPassId) for (const old of Object.keys(snapshot.ingest_idempotency)) {
          if ((page.terminal && old.startsWith(pagePrefix(page.passId))) || (page.discardPassId && old.startsWith(pagePrefix(page.discardPassId)))) delete snapshot.ingest_idempotency[old];
        }
      }
      const guarded = options.patreonPostRefresh || options.expectedPatreonPostStates;
      const postIds = guarded ? preparePatreonPostRefresh(snapshot, enriched, options.patreonPostRefresh, options.expectedPatreonPostStates, options.preservePatreonMedia) : [];
      if (options.currentPatreonSnapshot) resolveCurrentPatreonRevisions(snapshot, enriched);
      result = applySyncBatchToSnapshot(snapshot, enriched, id, traceId, pendingEvents, resolutions);
      finishPatreonPostRefresh(snapshot, creatorId, postIds);
      if (options.verifiedPatreonCampaign) for (const postId of postIds) {
        if (options.verifiedPatreonPostIds && !options.verifiedPatreonPostIds.includes(postId)) continue;
        const row = snapshot.posts[creatorId]?.[postId];
        if (row) row.campaign_id = options.verifiedPatreonCampaign;
        snapshot.ingest_idempotency[campaignBindingKey(creatorId, postId, options.verifiedPatreonCampaign)] = { first_seen_at: new Date().toISOString() };
      }
      if (options.verifiedPatreonCampaign) recordAccessVerification(snapshot, creatorId, postIds.filter((id) => !options.verifiedPatreonPostIds || options.verifiedPatreonPostIds.includes(id)), options.patreonPostRefresh?.accessSource ?? "catchup");
      acceptedStates = Object.fromEntries(postIds.map((postId) => [postId, patreonPostState(snapshot, creatorId, postId)]));
      if (options.patreonPostRefresh) acceptedState = patreonPostState(snapshot, creatorId, options.patreonPostRefresh.postId);
    }, options.postCheckpoint);
    if (options.acceptedPatreonStates) Object.assign(options.acceptedPatreonStates, acceptedStates);
    if (options.postCheckpoint) { options.postCheckpoint.lease.version++; options.postCheckpoint.lease.progress = structuredClone(options.postCheckpoint.progress); }
    if (options.patreonPostRefresh && acceptedState) options.patreonPostRefresh.state = acceptedState;
    // shortcut: a process crash after commit can lose these events; durable delivery needs an atomic outbox.
    for (const event of pendingEvents.getAll()) {
      if (options.suppressPublicationEvents && event.event_name === "post_published") { result.events_emitted--; continue; }
      this.eventBus.publish(event.event_name, event.tenant_id, event.trace_id,
        event.payload as { primary_id: string }, { producer: event.producer });
    }
    if (notes.length > 0) {
      result = { ...result, ingest_notes: notes };
    }
    recordIngestBatchResult(result);
    return result;
  }
}
