import { randomUUID } from "node:crypto";
import type { InMemoryEventBus } from "../events/event-bus.js";
import type { FileCanonicalStore } from "../ingest/canonical-store.js";
import { FileAnalyticsStore } from "./analytics-store.js";
import { scoreRecommendations, type EngineConfig } from "./recommendation-engine.js";
import { generateSnapshot } from "./snapshot-generator.js";
import type {
  ActionExecution,
  MetricsSummary,
  RecommendationCard
} from "./types.js";

export class ActionCenterService {
  private readonly analyticsStore: FileAnalyticsStore;
  private readonly canonicalStore: FileCanonicalStore;
  private readonly eventBus: InMemoryEventBus;
  private readonly engineConfig: EngineConfig;

  public constructor(
    analyticsStore: FileAnalyticsStore,
    canonicalStore: FileCanonicalStore,
    eventBus: InMemoryEventBus,
    engineConfig?: EngineConfig
  ) {
    this.analyticsStore = analyticsStore;
    this.canonicalStore = canonicalStore;
    this.eventBus = eventBus;
    this.engineConfig = engineConfig ?? { confidence_threshold: 0.5 };
  }

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
