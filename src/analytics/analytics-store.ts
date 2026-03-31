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

export class FileAnalyticsStore {
  private readonly filePath: string;

  public constructor(filePath: string) {
    this.filePath = filePath;
  }

  public async load(): Promise<AnalyticsStoreRoot> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      return JSON.parse(raw) as AnalyticsStoreRoot;
    } catch {
      return emptyRoot();
    }
  }

  public async save(root: AnalyticsStoreRoot): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(root, null, 2), "utf8");
  }

  public async appendSnapshot(snap: AnalyticsSnapshot): Promise<void> {
    const root = await this.load();
    if (!root.snapshots[snap.creator_id]) {
      root.snapshots[snap.creator_id] = [];
    }
    root.snapshots[snap.creator_id].push(snap);
    await this.save(root);
  }

  public async latestSnapshot(creatorId: string): Promise<AnalyticsSnapshot | null> {
    const root = await this.load();
    const list = root.snapshots[creatorId];
    if (!list || list.length === 0) return null;
    return list[list.length - 1];
  }

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

  public async appendAction(action: ActionExecution): Promise<void> {
    const root = await this.load();
    root.actions.push(action);
    await this.save(root);
  }

  public async appendOutcome(outcome: RecommendationOutcome): Promise<void> {
    const root = await this.load();
    root.outcomes.push(outcome);
    await this.save(root);
  }
}
