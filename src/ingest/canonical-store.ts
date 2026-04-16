import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export type CampaignRow = {
  campaign_id: string;
  creator_id: string;
  name: string;
  upstream_updated_at: string;
  version_seq: number;
};

export type TierRow = {
  tier_id: string;
  creator_id: string;
  campaign_id?: string;
  title: string;
  /** Pledge floor in cents when known (Patreon tiers). */
  amount_cents?: number;
  upstream_updated_at: string;
  version_seq: number;
};

export type PostVersionRow = {
  version_seq: number;
  upstream_revision: string;
  title: string;
  description?: string;
  published_at: string;
  tag_ids: string[];
  tier_ids: string[];
  media_ids: string[];
  ingested_at: string;
};

export type PostRow = {
  post_id: string;
  creator_id: string;
  current: PostVersionRow;
  versions: PostVersionRow[];
  upstream_status: "active" | "deleted";
};

export type MediaVersionRow = {
  version_seq: number;
  upstream_revision: string;
  mime_type?: string;
  upstream_url?: string;
  /** Materialized blob key: export-relative path or future R2 object key (MIG-31). */
  storage_key?: string;
  role?: string;
  ingested_at: string;
};

export type MediaRow = {
  media_id: string;
  creator_id: string;
  post_ids: string[];
  upstream_status: "active" | "deleted";
  current: MediaVersionRow;
  versions: MediaVersionRow[];
};

export type CanonicalSnapshot = {
  ingest_idempotency: Record<string, { first_seen_at: string }>;
  campaigns: Record<string, Record<string, CampaignRow>>;
  tiers: Record<string, Record<string, TierRow>>;
  posts: Record<string, Record<string, PostRow>>;
  media: Record<string, Record<string, MediaRow>>;
};

function emptySnapshot(): CanonicalSnapshot {
  return {
    ingest_idempotency: {},
    campaigns: {},
    tiers: {},
    posts: {},
    media: {}
  };
}

/** Implemented by `FileCanonicalStore` and `DbCanonicalStore` (`canonical-store-db.ts`). */
export interface CanonicalStore {
  load(): Promise<CanonicalSnapshot>;
  save(snapshot: CanonicalSnapshot): Promise<void>;
  mutate(
    fn: (snapshot: CanonicalSnapshot) => void | Promise<void>
  ): Promise<void>;
  /**
   * Load only the rows belonging to `creatorId`. Returns a snapshot with only
   * that creator's campaigns, tiers, posts, media, and idempotency keys.
   * Falls back to global `load()` for stores that don't support scoping.
   */
  loadForCreator(creatorId: string): Promise<CanonicalSnapshot>;
  /**
   * Creator-scoped save: only deletes + re-inserts rows for the given
   * `creatorId`, leaving other creators' data intact.
   * Falls back to global `save()` for stores that don't support scoping.
   */
  saveForCreator(creatorId: string, snapshot: CanonicalSnapshot): Promise<void>;
  /**
   * Creator-scoped mutate: loads only this creator's data, applies the
   * mutation, then saves only this creator's slice back to the store.
   */
  mutateForCreator(
    creatorId: string,
    fn: (snapshot: CanonicalSnapshot) => void | Promise<void>
  ): Promise<void>;
}

export class FileCanonicalStore implements CanonicalStore {
  private readonly filePath: string;

  public constructor(filePath: string) {
    this.filePath = filePath;
  }

  public async load(): Promise<CanonicalSnapshot> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      return JSON.parse(raw) as CanonicalSnapshot;
    } catch {
      return emptySnapshot();
    }
  }

  public async save(snapshot: CanonicalSnapshot): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(snapshot, null, 2), "utf8");
  }

  public async mutate(
    fn: (snapshot: CanonicalSnapshot) => void | Promise<void>
  ): Promise<void> {
    const snapshot = await this.load();
    await fn(snapshot);
    await this.save(snapshot);
  }

  public async loadForCreator(_creatorId: string): Promise<CanonicalSnapshot> {
    return this.load();
  }

  public async saveForCreator(_creatorId: string, snapshot: CanonicalSnapshot): Promise<void> {
    return this.save(snapshot);
  }

  public async mutateForCreator(
    _creatorId: string,
    fn: (snapshot: CanonicalSnapshot) => void | Promise<void>
  ): Promise<void> {
    return this.mutate(fn);
  }
}
