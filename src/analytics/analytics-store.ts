/**
 * @fileoverview File-backed analytics store (`analytics.json`) implementing the shared `AnalyticsStore` contract.
 * @description Uses Node `fs` for JSON persistence; suitable for local/dev parity with `DbAnalyticsStore`.
 * @see ./analytics-store-db.js
 * @see prisma/schema.prisma AnalyticsSnapshotRow, RecommendationRecord, AnalyticsActionExecution, AnalyticsOutcome
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type {
  ActionExecution,
  AnalyticsSnapshot,
  AnalyticsStoreRoot,
  RecommendationCard,
  RecommendationOutcome
} from "./types.js";

function emptyRoot(): AnalyticsStoreRoot {
  return { snapshots: {}, recommendations: {}, actions: [], outcomes: [] };
}

/**
 * @description File (`analytics.json`) or Postgres (`DbAnalyticsStore`) — same contract for snapshots, cards, actions, and outcomes.
 * @security-audit-required All methods are keyed by `creator_id`; callers must enforce authz so one creator cannot read or mutate another's data.
 */
export interface AnalyticsStore {
  /**
   * @description Loads the full analytics document from the backing store.
   * @returns Root aggregate of snapshots, recommendations, actions, and outcomes.
   * @async
   * @throws {Error} When JSON on disk is invalid or unreadable (file store); Postgres errors propagate from `DbAnalyticsStore`.
   */
  load(): Promise<AnalyticsStoreRoot>;
  /**
   * @description Replaces the persisted aggregate with the given root (full snapshot of state).
   * @param root In-memory mirror to persist.
   * @async
   * @throws {Error} On write or DB transaction failure.
   */
  save(root: AnalyticsStoreRoot): Promise<void>;
  /**
   * @description Appends one snapshot row for trend/history.
   * @param snap Canonical snapshot envelope.
   * @async
   * @throws {Error} On write or DB insert failure.
   */
  appendSnapshot(snap: AnalyticsSnapshot): Promise<void>;
  /**
   * @description Returns the most recently generated snapshot for a creator, if any.
   * @param creatorId Owning creator key.
   * @returns Latest snapshot or `null`.
   * @async
   * @throws {Error} On read/query failure.
   */
  latestSnapshot(creatorId: string): Promise<AnalyticsSnapshot | null>;
  /**
   * @description Inserts or updates recommendation cards by id.
   * @param cards Cards to upsert.
   * @async
   * @throws {Error} On write/query failure.
   */
  upsertRecommendations(cards: RecommendationCard[]): Promise<void>;
  /**
   * @description Lists open recommendations for a creator with optional filters and cursor pagination.
   * @param creatorId Owning creator key.
   * @param filters Optional impact filter, minimum confidence, cursor, and page size (capped).
   * @returns Page of items and next cursor.
   * @async
   * @throws {Error} On read/query failure.
   */
  listCards(
    creatorId: string,
    filters?: {
      impact_area?: string;
      confidence_min?: number;
      cursor?: string;
      limit?: number;
    }
  ): Promise<{ items: RecommendationCard[]; next_cursor: string | null }>;
  /**
   * @description Fetches a single recommendation by id for a creator.
   * @param creatorId Owning creator key.
   * @param recommendationId Stable card id.
   * @returns Card or `null` if missing.
   * @async
   * @throws {Error} On read/query failure.
   */
  getCard(creatorId: string, recommendationId: string): Promise<RecommendationCard | null>;
  /**
   * @description Updates card status and optional notes / dismiss reason.
   * @param creatorId Owning creator key.
   * @param recommendationId Card id.
   * @param status New lifecycle status.
   * @param extra Optional notes or dismiss code.
   * @returns Updated card or `null` if not found.
   * @async
   * @throws {Error} On write/query failure.
   */
  updateCardStatus(
    creatorId: string,
    recommendationId: string,
    status: RecommendationCard["status"],
    extra?: Partial<Pick<RecommendationCard, "notes" | "dismiss_reason_code">>
  ): Promise<RecommendationCard | null>;
  /**
   * @description Records an action execution row.
   * @param action Execution envelope.
   * @async
   * @throws {Error} On write failure.
   */
  appendAction(action: ActionExecution): Promise<void>;
  /**
   * @description Records an outcome evaluation row.
   * @param outcome Outcome envelope.
   * @async
   * @throws {Error} On write failure.
   */
  appendOutcome(outcome: RecommendationOutcome): Promise<void>;
}

/**
 * @description JSON file implementation of `AnalyticsStore` using `readFile` / `writeFile`.
 * @security-audit-required Persists creator-scoped data on the local filesystem; callers must restrict path and host access.
 */
export class FileAnalyticsStore implements AnalyticsStore {
  private readonly filePath: string;

  /**
   * @description Constructs a store bound to a single JSON file path.
   * @param filePath Absolute or relative path to `analytics.json` (or equivalent).
   */
  public constructor(filePath: string) {
    this.filePath = filePath;
  }

  /**
   * @description Reads and parses the JSON file, or returns an empty root if missing or invalid.
   * @returns Parsed root or empty aggregate.
   * @async
   * @throws {Error} When the file exists but cannot be read (permissions, I/O); parse errors are swallowed and yield empty root.
   * @todo Consider surfacing JSON parse errors to operators instead of silently returning an empty root.
   */
  public async load(): Promise<AnalyticsStoreRoot> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      return JSON.parse(raw) as AnalyticsStoreRoot;
    } catch {
      return emptyRoot();
    }
  }

  /**
   * @description Writes the full root to disk, creating parent directories as needed.
   * @param root Aggregate to persist.
   * @async
   * @throws {Error} On `mkdir` or `writeFile` failure (disk full, permissions).
   */
  public async save(root: AnalyticsStoreRoot): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(root, null, 2), "utf8");
  }

  /**
   * @description Loads, appends a snapshot for `snap.creator_id`, and saves.
   * @param snap Snapshot to append.
   * @async
   * @throws {Error} On read/write failure.
   */
  public async appendSnapshot(snap: AnalyticsSnapshot): Promise<void> {
    const root = await this.load();
    if (!root.snapshots[snap.creator_id]) {
      root.snapshots[snap.creator_id] = [];
    }
    root.snapshots[snap.creator_id].push(snap);
    await this.save(root);
  }

  /**
   * @description Returns the last snapshot in the ordered list for the creator.
   * @param creatorId Creator key.
   * @returns Latest snapshot or `null`.
   * @async
   * @throws {Error} On read failure.
   */
  public async latestSnapshot(creatorId: string): Promise<AnalyticsSnapshot | null> {
    const root = await this.load();
    const list = root.snapshots[creatorId];
    if (!list || list.length === 0) return null;
    return list[list.length - 1];
  }

  /**
   * @description Merges each card into the in-file index by creator and recommendation id.
   * @param cards Cards to upsert.
   * @async
   * @throws {Error} On read/write failure.
   */
  public async upsertRecommendations(cards: RecommendationCard[]): Promise<void> {
    const root = await this.load();
    for (const card of cards) {
      if (!root.recommendations[card.creator_id]) {
        root.recommendations[card.creator_id] = [];
      }
      const list = root.recommendations[card.creator_id];
      const idx = list.findIndex((r) => r.recommendation_id === card.recommendation_id);
      if (idx >= 0) {
        list[idx] = card;
      } else {
        list.push(card);
      }
    }
    await this.save(root);
  }

  /**
   * @description Filters open cards, applies filters, sorts by confidence, and paginates in memory.
   * @param creatorId Creator key.
   * @param filters Optional filters and cursor.
   * @returns Page and next cursor token.
   * @async
   * @throws {Error} On read failure.
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
    const root = await this.load();
    let items = (root.recommendations[creatorId] ?? []).filter(
      (c) => c.status === "open"
    );
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
      if (idx >= 0) start = idx + 1;
    }
    const slice = items.slice(start, start + limit);
    const last = slice[slice.length - 1];
    const next_cursor =
      slice.length === limit && last ? last.recommendation_id : null;
    return { items: slice, next_cursor };
  }

  /**
   * @description Looks up a card by creator and recommendation id.
   * @param creatorId Creator key.
   * @param recommendationId Card id.
   * @returns Card or `null`.
   * @async
   * @throws {Error} On read failure.
   */
  public async getCard(
    creatorId: string,
    recommendationId: string
  ): Promise<RecommendationCard | null> {
    const root = await this.load();
    return (
      (root.recommendations[creatorId] ?? []).find(
        (c) => c.recommendation_id === recommendationId
      ) ?? null
    );
  }

  /**
   * @description Updates status and optional fields then persists.
   * @param creatorId Creator key.
   * @param recommendationId Card id.
   * @param status New status.
   * @param extra Optional notes or dismiss reason.
   * @returns Updated card or `null`.
   * @async
   * @throws {Error} On read/write failure.
   */
  public async updateCardStatus(
    creatorId: string,
    recommendationId: string,
    status: RecommendationCard["status"],
    extra?: Partial<Pick<RecommendationCard, "notes" | "dismiss_reason_code">>
  ): Promise<RecommendationCard | null> {
    const root = await this.load();
    const list = root.recommendations[creatorId];
    if (!list) return null;
    const card = list.find((c) => c.recommendation_id === recommendationId);
    if (!card) return null;
    card.status = status;
    card.updated_at = new Date().toISOString();
    if (extra?.notes !== undefined) card.notes = extra.notes;
    if (extra?.dismiss_reason_code !== undefined) card.dismiss_reason_code = extra.dismiss_reason_code;
    await this.save(root);
    return card;
  }

  /**
   * @description Appends an action execution to the flat `actions` array.
   * @param action Execution record.
   * @async
   * @throws {Error} On read/write failure.
   */
  public async appendAction(action: ActionExecution): Promise<void> {
    const root = await this.load();
    root.actions.push(action);
    await this.save(root);
  }

  /**
   * @description Appends an outcome row to the flat `outcomes` array.
   * @param outcome Outcome record.
   * @async
   * @throws {Error} On read/write failure.
   */
  public async appendOutcome(outcome: RecommendationOutcome): Promise<void> {
    const root = await this.load();
    root.outcomes.push(outcome);
    await this.save(root);
  }
}
