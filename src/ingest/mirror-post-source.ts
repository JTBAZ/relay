/**
 * How mirrored (non-Relay-native) ingest rows partition in Postgres (`Post.source` / `MediaAsset.ingestOrigin`).
 * @description SubscribeStar batches use stable `substar_*` prefixed ids — see docs/integrations/subscribestar-ingest-mapping.md.
 */

export type MirrorSnapshotSource = "PATREON" | "SUBSCRIBESTAR";

/** Derive mirrored provider from ingest post id prefixes (canonical across mappers). */
export function mirrorSnapshotSourceForIngestPostId(postId: string): MirrorSnapshotSource {
  return postId.trim().startsWith("substar_post_") ? "SUBSCRIBESTAR" : "PATREON";
}
