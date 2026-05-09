/**
 * @fileoverview Prisma-backed `AnalyticsStore` for Action Center metrics and recommendations.
 * @description Maps domain types to `AnalyticsSnapshotRow`, `RecommendationRecord`, `AnalyticsActionExecution`, and `AnalyticsOutcome` tables.
 * @see ./analytics-store.js
 * @see prisma/schema.prisma AnalyticsSnapshotRow, RecommendationRecord, AnalyticsActionExecution, AnalyticsOutcome
 */

import type { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import type { AnalyticsStore } from "./analytics-store.js";
import type {
  ActionExecution,
  AnalyticsSnapshot,
  AnalyticsStoreRoot,
  ExpectedImpact,
  RecommendationCard,
  RecommendationOutcome
} from "./types.js";

const SNAPSHOT_KIND_DEFAULT = "canonical_rollup";

function utcDayBounds(iso: string): { start: Date; end: Date } {
  const d = new Date(iso);
  const start = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0)
  );
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  end.setUTCMilliseconds(-1);
  return { start, end };
}

type SnapshotPayloadJson = {
  total_posts: number;
  total_media: number;
  active_tiers: number;
  posting_cadence_30d: number;
  top_tags: AnalyticsSnapshot["top_tags"];
  tier_content_counts: AnalyticsSnapshot["tier_content_counts"];
};

function snapshotToCreate(
  snap: AnalyticsSnapshot,
  kind: string = SNAPSHOT_KIND_DEFAULT
): Prisma.AnalyticsSnapshotRowCreateInput {
  const { start, end } = utcDayBounds(snap.generated_at);
  const payload: SnapshotPayloadJson = {
    total_posts: snap.total_posts,
    total_media: snap.total_media,
    active_tiers: snap.active_tiers,
    posting_cadence_30d: snap.posting_cadence_30d,
    top_tags: snap.top_tags,
    tier_content_counts: snap.tier_content_counts
  };
  return {
    snapshotId: snap.snapshot_id,
    creatorId: snap.creator_id,
    kind,
    periodStart: start,
    periodEnd: end,
    generatedAt: new Date(snap.generated_at),
    estimated: snap.estimated,
    label: snap.label ?? null,
    method: snap.method ?? null,
    payload: payload as Prisma.InputJsonValue
  };
}

function rowToSnapshot(row: {
  snapshotId: string;
  creatorId: string;
  kind: string;
  generatedAt: Date;
  estimated: boolean;
  label: string | null;
  method: string | null;
  payload: Prisma.JsonValue;
}): AnalyticsSnapshot {
  const p = row.payload as SnapshotPayloadJson;
  const out: AnalyticsSnapshot = {
    snapshot_id: row.snapshotId,
    creator_id: row.creatorId,
    generated_at: row.generatedAt.toISOString(),
    total_posts: p.total_posts,
    total_media: p.total_media,
    active_tiers: p.active_tiers,
    posting_cadence_30d: p.posting_cadence_30d,
    top_tags: p.top_tags,
    tier_content_counts: p.tier_content_counts,
    estimated: row.estimated
  };
  if (row.label) {
    out.label = row.label;
  }
  if (row.method) {
    out.method = row.method;
  }
  return out;
}

function rowToCard(row: {
  recommendationId: string;
  creatorId: string;
  tenantId: string | null;
  cardType: string;
  title: string;
  signal: string;
  diagnosis: string;
  recommendationBody: string;
  confidenceScore: number;
  expectedImpact: Prisma.JsonValue;
  reasonCodes: string[];
  evidenceRefs: string[];
  status: string;
  createdAt: Date;
  updatedAt: Date;
  notes: string | null;
  dismissReasonCode: string | null;
}): RecommendationCard {
  return {
    recommendation_id: row.recommendationId,
    creator_id: row.creatorId,
    card_type: row.cardType as RecommendationCard["card_type"],
    title: row.title,
    signal: row.signal,
    diagnosis: row.diagnosis,
    recommendation: row.recommendationBody,
    confidence_score: row.confidenceScore,
    expected_impact: row.expectedImpact as ExpectedImpact,
    reason_codes: row.reasonCodes,
    evidence_refs: row.evidenceRefs,
    status: row.status as RecommendationCard["status"],
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    ...(row.notes ? { notes: row.notes } : {}),
    ...(row.dismissReasonCode ? { dismiss_reason_code: row.dismissReasonCode } : {})
  };
}

function cardToUpsert(
  card: RecommendationCard
): Prisma.RecommendationRecordUpsertArgs {
  return {
    where: { recommendationId: card.recommendation_id },
    create: {
      recommendationId: card.recommendation_id,
      creatorId: card.creator_id,
      tenantId: card.creator_id,
      cardType: card.card_type,
      title: card.title,
      signal: card.signal,
      diagnosis: card.diagnosis,
      recommendationBody: card.recommendation,
      confidenceScore: card.confidence_score,
      expectedImpact: card.expected_impact as Prisma.InputJsonValue,
      reasonCodes: card.reason_codes,
      evidenceRefs: card.evidence_refs,
      status: card.status,
      createdAt: new Date(card.created_at),
      updatedAt: new Date(card.updated_at),
      notes: card.notes ?? null,
      dismissReasonCode: card.dismiss_reason_code ?? null
    },
    update: {
      creatorId: card.creator_id,
      tenantId: card.creator_id,
      cardType: card.card_type,
      title: card.title,
      signal: card.signal,
      diagnosis: card.diagnosis,
      recommendationBody: card.recommendation,
      confidenceScore: card.confidence_score,
      expectedImpact: card.expected_impact as Prisma.InputJsonValue,
      reasonCodes: card.reason_codes,
      evidenceRefs: card.evidence_refs,
      status: card.status,
      updatedAt: new Date(card.updated_at),
      notes: card.notes ?? null,
      dismissReasonCode: card.dismiss_reason_code ?? null
    }
  };
}

/**
 * @description Postgres-backed analytics / Action Center store; behavior matches `FileAnalyticsStore`.
 * @security-audit-required Reads and writes creator-scoped rows; callers must ensure Prisma/queries enforce tenant isolation where applicable.
 */
export class DbAnalyticsStore implements AnalyticsStore {
  /**
   * @description Creates a store that uses the shared Prisma client for analytics tables.
   * @param prisma Prisma client (`PrismaClient`).
   */
  public constructor(private readonly prisma: PrismaClient) {}

  /**
   * @description Loads full aggregate by scanning analytics-related tables ordered by timestamps.
   * @returns Root mirroring JSON file layout.
   * @async
   * @throws {Error} Prisma query errors (connection, RLS, timeout).
   */
  public async load(): Promise<AnalyticsStoreRoot> {
    const [snapshots, recs, actions, outcomes] = await Promise.all([
      this.prisma.analyticsSnapshotRow.findMany({ orderBy: { generatedAt: "asc" } }),
      this.prisma.recommendationRecord.findMany({ orderBy: { updatedAt: "asc" } }),
      this.prisma.analyticsActionExecution.findMany({ orderBy: { createdAt: "asc" } }),
      this.prisma.analyticsOutcome.findMany({ orderBy: { evaluatedAt: "asc" } })
    ]);
    const snapshotsByCreator: AnalyticsStoreRoot["snapshots"] = {};
    for (const row of snapshots) {
      if (!snapshotsByCreator[row.creatorId]) {
        snapshotsByCreator[row.creatorId] = [];
      }
      snapshotsByCreator[row.creatorId]!.push(rowToSnapshot(row));
    }
    const recommendations: AnalyticsStoreRoot["recommendations"] = {};
    for (const row of recs) {
      const c = rowToCard(row);
      if (!recommendations[c.creator_id]) {
        recommendations[c.creator_id] = [];
      }
      recommendations[c.creator_id]!.push(c);
    }
    const actionList: ActionExecution[] = actions.map((a) => ({
      action_job_id: a.actionJobId,
      recommendation_id: a.recommendationId,
      creator_id: a.creatorId,
      action_type: a.actionType,
      options: a.options as Record<string, unknown>,
      execution_status: a.executionStatus as ActionExecution["execution_status"],
      created_at: a.createdAt.toISOString()
    }));
    const outcomeList: RecommendationOutcome[] = outcomes.map((o) => ({
      recommendation_id: o.recommendationId,
      creator_id: o.creatorId,
      evaluated_at: o.evaluatedAt.toISOString(),
      metric: o.metric,
      predicted_delta: o.predictedDelta,
      actual_delta: o.actualDelta
    }));
    return {
      snapshots: snapshotsByCreator,
      recommendations,
      actions: actionList,
      outcomes: outcomeList
    };
  }

  /**
   * @description Transactionally replaces all analytics rows with the provided root (destructive full sync).
   * @param root Authoritative in-memory snapshot to persist.
   * @async
   * @throws {Error} Transaction failure, constraint violation, or DB connectivity errors.
   * @todo Consider incremental merge instead of global delete to reduce blast radius on large datasets.
   */
  public async save(root: AnalyticsStoreRoot): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.analyticsOutcome.deleteMany({});
      await tx.analyticsActionExecution.deleteMany({});
      await tx.recommendationRecord.deleteMany({});
      await tx.analyticsSnapshotRow.deleteMany({});
      for (const [, list] of Object.entries(root.snapshots)) {
        for (const snap of list) {
          await tx.analyticsSnapshotRow.create({
            data: snapshotToCreate(snap)
          });
        }
      }
      for (const [, list] of Object.entries(root.recommendations)) {
        for (const card of list) {
          await tx.recommendationRecord.create({
            data: cardToUpsert(card).create
          });
        }
      }
      for (const a of root.actions) {
        await tx.analyticsActionExecution.create({
          data: {
            actionJobId: a.action_job_id,
            recommendationId: a.recommendation_id,
            creatorId: a.creator_id,
            actionType: a.action_type,
            options: a.options as Prisma.InputJsonValue,
            executionStatus: a.execution_status,
            createdAt: new Date(a.created_at)
          }
        });
      }
      for (const o of root.outcomes) {
        await tx.analyticsOutcome.create({
          data: {
            recommendationId: o.recommendation_id,
            creatorId: o.creator_id,
            evaluatedAt: new Date(o.evaluated_at),
            metric: o.metric,
            predictedDelta: o.predicted_delta,
            actualDelta: o.actual_delta
          }
        });
      }
    });
  }

  /**
   * @description Inserts a single snapshot row.
   * @param snap Snapshot to persist.
   * @async
   * @throws {Error} On Prisma `create` failure.
   */
  public async appendSnapshot(snap: AnalyticsSnapshot): Promise<void> {
    await this.prisma.analyticsSnapshotRow.create({
      data: snapshotToCreate(snap)
    });
  }

  /**
   * @description Fetches the latest snapshot for a creator by `generatedAt` descending.
   * @param creatorId Creator key.
   * @returns Row mapped to `AnalyticsSnapshot` or `null`.
   * @async
   * @throws {Error} On Prisma query failure.
   */
  public async latestSnapshot(creatorId: string): Promise<AnalyticsSnapshot | null> {
    const row = await this.prisma.analyticsSnapshotRow.findFirst({
      where: { creatorId },
      orderBy: { generatedAt: "desc" }
    });
    return row ? rowToSnapshot(row) : null;
  }

  /**
   * @description Upserts each recommendation by `recommendationId`.
   * @param cards Cards to upsert.
   * @async
   * @throws {Error} On Prisma `upsert` failure.
   * @todo Batch upserts in a transaction for large card lists to improve atomicity and performance.
   */
  public async upsertRecommendations(cards: RecommendationCard[]): Promise<void> {
    for (const card of cards) {
      await this.prisma.recommendationRecord.upsert(cardToUpsert(card));
    }
  }

  /**
   * @description Queries open recommendations for a creator and applies in-memory filters and pagination.
   * @param creatorId Creator key.
   * @param filters Optional filters.
   * @returns Page of cards and next cursor.
   * @async
   * @throws {Error} On Prisma `findMany` failure.
   */
  public async listCards(
    creatorId: string,
    filters?: {
      impact_area?: string;
      confidence_min?: number;
      cursor?: string;
      limit?: number;
    }
  ): Promise<{ items: RecommendationCard[]; next_cursor: string | null }> {
    const rows = await this.prisma.recommendationRecord.findMany({
      where: { creatorId, status: "open" },
      orderBy: { confidenceScore: "desc" }
    });
    let items = rows.map((r) => rowToCard(r));
    if (filters?.impact_area) {
      items = items.filter(
        (c) => c.expected_impact.metric === filters.impact_area
      );
    }
    if (filters?.confidence_min != null) {
      items = items.filter((c) => c.confidence_score >= filters.confidence_min!);
    }
    items.sort((a, b) => b.confidence_score - a.confidence_score);
    const limit = Math.min(filters?.limit ?? 20, 100);
    let start = 0;
    if (filters?.cursor) {
      const idx = items.findIndex((c) => c.recommendation_id === filters.cursor);
      if (idx >= 0) {
        start = idx + 1;
      }
    }
    const slice = items.slice(start, start + limit);
    const last = slice[slice.length - 1];
    const next_cursor =
      slice.length === limit && last ? last.recommendation_id : null;
    return { items: slice, next_cursor };
  }

  /**
   * @description Loads a card matching both recommendation and creator id.
   * @param creatorId Creator key.
   * @param recommendationId Card id.
   * @returns Card or `null`.
   * @async
   * @throws {Error} On Prisma query failure.
   */
  public async getCard(
    creatorId: string,
    recommendationId: string
  ): Promise<RecommendationCard | null> {
    const row = await this.prisma.recommendationRecord.findFirst({
      where: { recommendationId, creatorId }
    });
    return row ? rowToCard(row) : null;
  }

  /**
   * @description Updates status and optional note fields when the row exists for the creator.
   * @param creatorId Creator key.
   * @param recommendationId Card id.
   * @param status New status.
   * @param extra Optional fields.
   * @returns Updated card or `null` if none matched.
   * @async
   * @throws {Error} On Prisma `update` failure (including if another process deleted the row between read and write).
   */
  public async updateCardStatus(
    creatorId: string,
    recommendationId: string,
    status: RecommendationCard["status"],
    extra?: Partial<Pick<RecommendationCard, "notes" | "dismiss_reason_code">>
  ): Promise<RecommendationCard | null> {
    const row = await this.prisma.recommendationRecord.findFirst({
      where: { recommendationId, creatorId }
    });
    if (!row) {
      return null;
    }
    const updated = await this.prisma.recommendationRecord.update({
      where: { recommendationId },
      data: {
        status,
        updatedAt: new Date(),
        ...(extra?.notes !== undefined ? { notes: extra.notes } : {}),
        ...(extra?.dismiss_reason_code !== undefined
          ? { dismissReasonCode: extra.dismiss_reason_code }
          : {})
      }
    });
    return rowToCard(updated);
  }

  /**
   * @description Inserts an action execution row.
   * @param action Execution record.
   * @async
   * @throws {Error} On Prisma `create` failure.
   */
  public async appendAction(action: ActionExecution): Promise<void> {
    await this.prisma.analyticsActionExecution.create({
      data: {
        actionJobId: action.action_job_id,
        recommendationId: action.recommendation_id,
        creatorId: action.creator_id,
        actionType: action.action_type,
        options: action.options as Prisma.InputJsonValue,
        executionStatus: action.execution_status,
        createdAt: new Date(action.created_at)
      }
    });
  }

  /**
   * @description Inserts an outcome evaluation row.
   * @param outcome Outcome record.
   * @async
   * @throws {Error} On Prisma `create` failure.
   */
  public async appendOutcome(outcome: RecommendationOutcome): Promise<void> {
    await this.prisma.analyticsOutcome.create({
      data: {
        recommendationId: outcome.recommendation_id,
        creatorId: outcome.creator_id,
        evaluatedAt: new Date(outcome.evaluated_at),
        metric: outcome.metric,
        predictedDelta: outcome.predicted_delta,
        actualDelta: outcome.actual_delta
      }
    });
  }
}
