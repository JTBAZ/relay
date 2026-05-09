/**
 * @fileoverview Orchestrates snapshot generation, recommendation scoring, and Action Center mutations with event publishing.
 * @description Combines `CanonicalStore`, `AnalyticsStore`, and `RelayEventBus` for Workstream E flows.
 * @see ./analytics-store.js
 * @see ../ingest/canonical-store.js
 * @see ../events/event-bus.js
 */

import { randomUUID } from "node:crypto";
import type { RelayEventBus } from "../events/event-bus.js";
import type { CanonicalStore } from "../ingest/canonical-store.js";
import type { AnalyticsStore } from "./analytics-store.js";
import { scoreRecommendations, type EngineConfig } from "./recommendation-engine.js";
import { generateSnapshot } from "./snapshot-generator.js";
import type {
  ActionExecution,
  MetricsSummary,
  RecommendationCard
} from "./types.js";

/**
 * @description Application service for generating analytics snapshots and managing recommendation lifecycle + events.
 * @security-audit-required All entrypoints are `creatorId`-scoped; callers must verify the authenticated creator matches `creatorId`.
 */
export class ActionCenterService {
  private readonly analyticsStore: AnalyticsStore;
  private readonly canonicalStore: CanonicalStore;
  private readonly eventBus: RelayEventBus;
  private readonly engineConfig: EngineConfig;

  /**
   * @description Constructs the service with configurable scoring thresholds.
   * @param analyticsStore Persistent analytics adapter.
   * @param canonicalStore Source canonical Patreon-sourced snapshot.
   * @param eventBus Outbound domain events.
   * @param engineConfig Optional confidence threshold for `scoreRecommendations`.
   */
  public constructor(
    analyticsStore: AnalyticsStore,
    canonicalStore: CanonicalStore,
    eventBus: RelayEventBus,
    engineConfig?: EngineConfig
  ) {
    this.analyticsStore = analyticsStore;
    this.canonicalStore = canonicalStore;
    this.eventBus = eventBus;
    this.engineConfig = engineConfig ?? { confidence_threshold: 0.5 };
  }

  /**
   * @description Builds a snapshot from canonical data, persists it, scores recommendations, and emits `recommendation_shown` events.
   * @param creatorId Target creator.
   * @param traceId Correlation id for telemetry.
   * @returns New snapshot id and created card count.
   * @async
   * @throws {Error} Canonical load, DB/file store, or event bus failures propagate.
   */
  public async generateAndStore(creatorId: string, traceId: string): Promise<{
    snapshot_id: string;
    recommendations_created: number;
  }> {
    const canonical = await this.canonicalStore.load();
    const snapshot = generateSnapshot(creatorId, canonical);
    await this.analyticsStore.appendSnapshot(snapshot);

    const cards = scoreRecommendations(
      creatorId,
      snapshot,
      canonical,
      this.engineConfig
    );
    if (cards.length > 0) {
      await this.analyticsStore.upsertRecommendations(cards);
      for (const card of cards) {
        this.eventBus.publish(
          "recommendation_shown",
          creatorId,
          traceId,
          {
            primary_id: card.recommendation_id,
            recommendation_id: card.recommendation_id,
            creator_id: creatorId,
            card_type: card.card_type,
            confidence_score: card.confidence_score,
            expected_metric: card.expected_impact.metric,
            shown_at: card.created_at
          },
          { producer: "recommendation-service" }
        );
      }
    }

    return {
      snapshot_id: snapshot.snapshot_id,
      recommendations_created: cards.length
    };
  }

  /**
   * @description Delegates to `analyticsStore.listCards`.
   * @param creatorId Creator scope.
   * @param filters Optional pagination and filters.
   * @returns Page envelope.
   * @async
   * @throws {Error} Store failures propagate.
   */
  public async listCards(
    creatorId: string,
    filters?: {
      impact_area?: string;
      confidence_min?: number;
      cursor?: string;
      limit?: number;
    }
  ): Promise<{
    items: RecommendationCard[];
    next_cursor: string | null;
  }> {
    return this.analyticsStore.listCards(creatorId, filters);
  }

  /**
   * @description Marks a recommendation accepted and publishes `recommendation_accepted`.
   * @param creatorId Creator scope.
   * @param recommendationId Target card.
   * @param notes Optional operator notes.
   * @param traceId Correlation id.
   * @returns Updated card or `null`.
   * @async
   * @throws {Error} On store or bus failure.
   */
  public async accept(
    creatorId: string,
    recommendationId: string,
    notes: string | undefined,
    traceId: string
  ): Promise<RecommendationCard | null> {
    const card = await this.analyticsStore.updateCardStatus(
      creatorId,
      recommendationId,
      "accepted",
      { notes }
    );
    if (card) {
      this.eventBus.publish(
        "recommendation_accepted",
        creatorId,
        traceId,
        {
          primary_id: card.recommendation_id,
          recommendation_id: card.recommendation_id,
          creator_id: creatorId,
          accepted_at: card.updated_at,
          action_type: "pending"
        },
        { producer: "action-center-api" }
      );
    }
    return card;
  }

  /**
   * @description Marks executed, appends a queued action row, and emits `recommendation_executed`.
   * @param creatorId Creator scope.
   * @param recommendationId Target card.
   * @param actionType Action classifier.
   * @param options Opaque options bag.
   * @param traceId Correlation id.
   * @returns Created `ActionExecution` or `null` if card missing.
   * @async
   * @throws {Error} On store persistence failure.
   */
  public async execute(
    creatorId: string,
    recommendationId: string,
    actionType: string,
    options: Record<string, unknown>,
    traceId: string
  ): Promise<ActionExecution | null> {
    const card = await this.analyticsStore.getCard(creatorId, recommendationId);
    if (!card) return null;
    await this.analyticsStore.updateCardStatus(
      creatorId,
      recommendationId,
      "executed"
    );
    const action: ActionExecution = {
      action_job_id: `job_${randomUUID()}`,
      recommendation_id: recommendationId,
      creator_id: creatorId,
      action_type: actionType,
      options,
      execution_status: "queued",
      created_at: new Date().toISOString()
    };
    await this.analyticsStore.appendAction(action);
    this.eventBus.publish(
      "recommendation_executed",
      creatorId,
      traceId,
      {
        primary_id: recommendationId,
        recommendation_id: recommendationId,
        creator_id: creatorId,
        action_job_id: action.action_job_id,
        executed_at: action.created_at,
        execution_status: action.execution_status
      },
      { producer: "action-execution-service" }
    );
    return action;
  }

  /**
   * @description Dismisses with a reason code and returns the updated row.
   * @param creatorId Creator scope.
   * @param recommendationId Target card.
   * @param reasonCode Dismiss taxonomy code.
   * @param traceId Currently unused (reserved); correlation for future event emission.
   * @returns Updated card or `null`.
   * @async
   * @throws {Error} On store failure.
   * @todo Emit a `recommendation_dismissed` domain event (mirroring accept/execute) instead of no-op `void traceId`.
   */
  public async dismiss(
    creatorId: string,
    recommendationId: string,
    reasonCode: string,
    traceId: string
  ): Promise<RecommendationCard | null> {
    const card = await this.analyticsStore.updateCardStatus(
      creatorId,
      recommendationId,
      "dismissed",
      { dismiss_reason_code: reasonCode }
    );
    if (card) {
      void traceId;
    }
    return card;
  }

  /**
   * @description Returns explainability payload for a recommendation if present.
   * @param creatorId Creator scope.
   * @param recommendationId Card id.
   * @returns Structured reasons and evidence or `null`.
   * @async
   * @throws {Error} On store read failure.
   */
  public async explain(
    creatorId: string,
    recommendationId: string
  ): Promise<{
    recommendation_id: string;
    reason_codes: string[];
    evidence_refs: string[];
    confidence_score: number;
  } | null> {
    const card = await this.analyticsStore.getCard(creatorId, recommendationId);
    if (!card) return null;
    return {
      recommendation_id: card.recommendation_id,
      reason_codes: card.reason_codes,
      evidence_refs: card.evidence_refs,
      confidence_score: card.confidence_score
    };
  }

  /**
   * @description Builds an ephemeral snapshot and counts open recommendations for dashboard summaries.
   * @param creatorId Creator scope.
   * @returns `MetricsSummary` aggregate.
   * @async
   * @throws {Error} On canonical load or store list failure.
   */
  public async metricsSummary(creatorId: string): Promise<MetricsSummary> {
    const canonical = await this.canonicalStore.load();
    const snapshot = generateSnapshot(creatorId, canonical);
    const { items } = await this.analyticsStore.listCards(creatorId, {
      limit: 100
    });
    return {
      creator_id: creatorId,
      total_posts: snapshot.total_posts,
      total_media: snapshot.total_media,
      active_tiers: snapshot.active_tiers,
      posting_cadence_30d: snapshot.posting_cadence_30d,
      top_tags: snapshot.top_tags,
      open_recommendation_count: items.length,
      estimated: snapshot.estimated
    };
  }
}
