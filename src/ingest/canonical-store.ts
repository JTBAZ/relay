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

export class FileCanonicalStore {
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
}
