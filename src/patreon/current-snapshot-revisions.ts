import type { CanonicalSnapshot } from "../ingest/canonical-store.js";
import type { SyncBatchInput } from "../ingest/types.js";

/** Only for a newly fetched authoritative snapshot, under the canonical creator lock. */
export function resolveCurrentPatreonRevisions(snapshot: CanonicalSnapshot, batch: SyncBatchInput): void {
  const revision = (incoming: string, row: { current: { upstream_revision: string }; versions: Array<{ version_seq: number }>; upstream_status?: string } | undefined, sameAccess = true): string => {
    if (!incoming.startsWith("patreon") || !incoming.includes(":sha256:")) return incoming;
    const base = incoming.replace(/:snapshot:\d+$/, "");
    if (sameAccess && row?.upstream_status !== "deleted" && row?.current.upstream_revision.replace(/:snapshot:\d+$/, "") === base) return row.current.upstream_revision;
    return `${base}:snapshot:${Math.max(0, ...(row?.versions.map((v) => v.version_seq) ?? [])) + 1}`;
  };
  for (const post of batch.posts ?? []) {
    const current = snapshot.posts[batch.creator_id]?.[post.post_id];
    const tiers = (ids: string[]) => JSON.stringify([...new Set(ids)].sort());
    post.upstream_revision = revision(post.upstream_revision, current, !current || tiers(post.tier_ids) === tiers(current.current.tier_ids));
    for (const media of post.media) media.upstream_revision = revision(media.upstream_revision, snapshot.media[batch.creator_id]?.[media.media_id]);
  }
}
