/** Creator-scoped, read-only Library retrieval. Callers authorize creatorId before using this module. */
import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { mergePostPresentation } from "../gallery/effective-presentation.js";
import { buildGridThumbnailImage } from "../export/grid-thumbnail.js";
import { EditorError, type NamingProvenance, type ResolvedPost } from "./types.js";
import { loadPostNaming } from "./naming.js";

export type LibraryReadClient = PrismaClient | Prisma.TransactionClient;
export const LIBRARY_METADATA_LIMIT = 100;
export const LIBRARY_IMAGE_LIMIT = 24;

/** Reuse one budget for every tool call in a model turn. Exhaustion never silently truncates. */
export class LibraryReadBudget {
  metadataRemaining = LIBRARY_METADATA_LIMIT;
  imagesRemaining = LIBRARY_IMAGE_LIMIT;
  metadata(count: number): void {
    if (count > this.metadataRemaining) throw new EditorError("context_limit", "This turn's Library metadata limit has been reached.");
    this.metadataRemaining -= count;
  }
  images(count: number): void {
    if (count > this.imagesRemaining) throw new EditorError("image_limit", "This turn supports at most 24 image references.");
    this.imagesRemaining -= count;
  }
}

export interface LibraryPage<T> {
  items: T[];
  total: number;
  /** True only when this response contains the entire result, including earlier pages. */
  complete: boolean;
  hasMore: boolean;
  nextCursor: string | null;
}
export interface LibraryPageOptions { cursor?: string; limit?: number; budget?: LibraryReadBudget }
export interface LibraryTitleMatch { postId: string; matchedTitle: string; provenance: "current" | "historical" }
export interface LibrarySearchResult extends LibraryPage<ResolvedPost> {
  matches: LibraryTitleMatch[];
  ambiguous: boolean;
  historicalRelayTitlesAvailable: boolean;
}
export interface LibraryHistoryReader {
  /** Implemented by the journal integration; it must enforce creatorId and return unique owned IDs. */
  search(creatorId: string, query: string): Promise<LibraryTitleMatch[]>;
}
export interface LibraryReadOptions extends LibraryPageOptions {
  history?: LibraryHistoryReader;
  /** Canonical naming resolver, shared with gallery presentation and the preview executor. */
  resolveNaming?: (db: LibraryReadClient, creatorId: string, postIds: string[]) => Promise<Record<string, NamingProvenance>>;
}

// The bounded structural shape keeps these reads usable while Prisma's new naming schema is generated.
type Row = Record<string, unknown>;
type Delegate = { findMany(args: unknown): Promise<Row[]>; count(args: unknown): Promise<number> };
type ReadDb = { post: Delegate; postPresentation: Delegate; postOverride: Delegate; mediaAsset: Delegate;
  creativeWork: Delegate; creativeWorkMember: Delegate; creativeSeries: Delegate; creativeSeriesMember: Delegate;
  libraryCollection: Delegate; collectionPost: Delegate;
  $queryRawUnsafe<T>(query: string, ...values: unknown[]): Promise<T> };
function readDb(db: LibraryReadClient): ReadDb { return db as unknown as ReadDb; }
function str(value: unknown): string { return typeof value === "string" ? value : ""; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []; }
function rows(value: unknown): Row[] { return Array.isArray(value) ? value as Row[] : []; }
function scope(creatorId: string): void {
  if (!creatorId?.trim()) throw new EditorError("creator_required", "An authenticated creator scope is required.", 401);
}
function ids(values: string[], max = LIBRARY_METADATA_LIMIT): string[] {
  if (!Array.isArray(values) || values.some((v) => typeof v !== "string" || !v.trim() || v.length > 300)) {
    throw new EditorError("invalid_ids", "Supply valid Library IDs.");
  }
  const unique = [...new Set(values)];
  if (unique.length > max) throw new EditorError("context_limit", `Request at most ${max} Library IDs at a time.`);
  return unique;
}
function pageInput(creatorId: string, key: unknown, options: LibraryPageOptions): { offset: number; limit: number; signature: string } {
  scope(creatorId);
  const signature = createHash("sha256").update(JSON.stringify([creatorId, key])).digest("hex");
  const limit = options.limit ?? Math.min(LIBRARY_METADATA_LIMIT, options.budget?.metadataRemaining ?? LIBRARY_METADATA_LIMIT);
  if (!Number.isInteger(limit) || limit < 1 || limit > LIBRARY_METADATA_LIMIT) throw new EditorError("invalid_limit", "Library page size must be between 1 and 100.");
  let offset = 0;
  if (options.cursor) {
    try {
      if (options.cursor.length > 512) throw new Error();
      const parsed = JSON.parse(Buffer.from(options.cursor, "base64url").toString()) as { signature: string; offset: number };
      if (parsed.signature !== signature || !Number.isSafeInteger(parsed.offset) || parsed.offset < 0) throw new Error();
      offset = parsed.offset;
    } catch { throw new EditorError("invalid_cursor", "This page cursor does not belong to this creator and query."); }
  }
  return { offset, limit, signature };
}
function page<T>(items: T[], total: number, input: ReturnType<typeof pageInput>): LibraryPage<T> {
  const end = input.offset + items.length;
  return { items, total, complete: input.offset === 0 && end >= total, hasMore: end < total,
    nextCursor: end < total ? Buffer.from(JSON.stringify({ signature: input.signature, offset: end })).toString("base64url") : null };
}
function tagDelta(base: string[], delta?: Row): string[] {
  const removed = new Set(strings(delta?.removeTagIds));
  return [...new Set([...base.filter((t) => !removed.has(t)), ...strings(delta?.addTagIds)])];
}

/** Resolves only owned posts and latest canonical versions; missing/cross-creator IDs are explicit. */
export async function resolveLibraryPosts(db: LibraryReadClient, creatorId: string, requestedIds: string[], options: LibraryReadOptions = {}): Promise<{ resolvedPosts: ResolvedPost[]; missingPostIds: string[] }> {
  scope(creatorId);
  const postIds = ids(requestedIds);
  if (!postIds.length) return { resolvedPosts: [], missingPostIds: [] };
  const client = readDb(db);
  const owned = await client.post.findMany({ where: { creatorId, id: { in: postIds } }, orderBy: { id: "asc" },
    select: { id: true, versions: { orderBy: { versionSeq: "desc" }, take: 1, select: { title: true, description: true, mediaIds: true, tagIds: true } } } });
  const ownedIds = owned.map((p) => str(p.id));
  const [presentations, overrides, naming] = await Promise.all([
    client.postPresentation.findMany({ where: { creatorId, postId: { in: ownedIds } } }),
    client.postOverride.findMany({ where: { creatorId, postId: { in: ownedIds }, mediaId: "" } }),
    (options.resolveNaming ?? loadPostNaming)(db, creatorId, ownedIds)
  ]);
  const presentationMap = new Map(presentations.map((p) => [str(p.postId), p]));
  const overrideMap = new Map(overrides.map((p) => [str(p.postId), p]));
  const resolvedPosts = owned.map((p): ResolvedPost => {
    const latest = rows(p.versions)[0];
    const sourceTitle = str(latest?.title);
    const overlay = presentationMap.get(str(p.id));
    const merged = mergePostPresentation({ title: sourceTitle, description: latest?.description == null ? undefined : str(latest.description), media_ids: strings(latest?.mediaIds) },
      overlay ? { relay_title: overlay.relayTitle == null ? null : str(overlay.relayTitle), relay_description: overlay.relayDescription == null ? null : str(overlay.relayDescription), media_order: strings(overlay.mediaOrder) } : undefined);
    const provenance = naming[str(p.id)] ?? { mode: merged.title === sourceTitle ? "source" : "custom", effectiveTitle: merged.title, sourceTitle, exception: merged.title !== sourceTitle };
    return { postId: str(p.id), title: provenance.effectiveTitle, description: merged.description ?? null,
      mediaIds: merged.media_ids_ordered, tags: tagDelta(strings(latest?.tagIds), overrideMap.get(str(p.id))), naming: provenance };
  });
  options.budget?.metadata(resolvedPosts.length);
  const resolved = new Map(resolvedPosts.map((p) => [p.postId, p]));
  return { resolvedPosts: postIds.flatMap((id) => resolved.has(id) ? [resolved.get(id)!] : []), missingPostIds: postIds.filter((id) => !resolved.has(id)) };
}

/** Searches titles (including history), current effective tags, and current effective descriptions,
 * independent of the UI's loaded page. Removed/obsolete tags and cleared descriptions do not match.
 */
export async function searchLibraryPosts(db: LibraryReadClient, creatorId: string, query: string, options: LibraryReadOptions = {}): Promise<LibrarySearchResult> {
  if (typeof query !== "string") throw new EditorError("invalid_query", "Supply a Library search string.");
  const text = query.trim();
  if (text.length > 300) throw new EditorError("invalid_query", "Use a Library search of at most 300 characters.");
  const input = pageInput(creatorId, ["posts", text], options);
  const client = readDb(db);
  const history = text && options.history ? await options.history.search(creatorId, text) : [];
  // Prisma cannot express concatenated inherited names as a relation contains filter.
  const derived = text ? await client.$queryRawUnsafe<{postId:string}[]>(`SELECT cwm.post_id AS "postId" FROM creative_work_members cwm JOIN creative_works cw ON cw.id = cwm.creative_work_id AND cw.creator_id = cwm.creator_id JOIN creative_series_members sm ON sm.creative_work_id = cw.id AND sm.creator_id = cw.creator_id JOIN creative_series cs ON cs.id = sm.creative_series_id AND cs.creator_id = sm.creator_id WHERE cw.creator_id = $1 AND ((cs.title || ' — ' || sm.part_label) ILIKE $2 OR sm.part_label ILIKE $2) ORDER BY cwm.post_id LIMIT 10001`,creatorId,`%${text.replace(/[\\%_]/g,"\\$&")}%`) : [];
  if(derived.length>10000)throw new EditorError("search_limit","Narrow the series-title search to retrieve complete results.");
  // Prisma cannot filter only the latest related version's array after applying scoped tag deltas.
  // Every value is a bound parameter. Additions win over source removals, matching effectiveTags.
  const metadata = text ? await client.$queryRawUnsafe<{ postId: string }[]>(`
    SELECT p.id AS "postId" FROM posts p
    LEFT JOIN LATERAL (
      SELECT pv.description, pv.tag_ids FROM post_versions pv
      WHERE pv.post_id = p.id ORDER BY pv.version_seq DESC LIMIT 1
    ) latest ON TRUE
    LEFT JOIN post_presentations pp ON pp.post_id = p.id AND pp.creator_id = p.creator_id
    LEFT JOIN post_overrides po ON po.post_id = p.id AND po.creator_id = p.creator_id AND po.media_id = ''
    WHERE p.creator_id = $1 AND (
      COALESCE(pp.relay_description, latest.description, '') ILIKE $2
      OR EXISTS (SELECT 1 FROM unnest(COALESCE(latest.tag_ids, ARRAY[]::text[])) AS source_tag(tag)
        WHERE source_tag.tag ILIKE $2 AND NOT source_tag.tag = ANY(COALESCE(po.remove_tag_ids, ARRAY[]::text[])))
      OR EXISTS (SELECT 1 FROM unnest(COALESCE(po.add_tag_ids, ARRAY[]::text[])) AS added_tag(tag)
        WHERE added_tag.tag ILIKE $2)
    ) ORDER BY p.id LIMIT 10001`, creatorId, `%${text.replace(/[\\%_]/g, "\\$&")}%`) : [];
  if (metadata.length > 10000) throw new EditorError("search_limit", "Narrow the tag or description search to retrieve complete results.");
  const contains = { contains: text, mode: "insensitive" };
  const where = { creatorId, ...(text ? { OR: [
    { id: contains }, { versions: { some: { title: contains } } },
    { presentation: { is: { creatorId, relayTitle: contains } } },
    { creativeWorkMember: { is: { creatorId, creativeWork: { is: { creatorId, title: contains } } } } },
    { creativeWorkMember: { is: { creatorId, creativeWork: { is: { creatorId, seriesMember: { is: { creatorId, creativeSeries: { is: { creatorId, title: contains } } } } } } } } },
    ...(history.length ? [{ id: { in: history.map((m) => m.postId) } }] : [])
    ,...(derived.length ? [{ id: { in: derived.map(m=>m.postId) } }] : [])
    ,...(metadata.length ? [{ id: { in: metadata.map(m=>m.postId) } }] : [])
  ] } : {}) };
  const [total, found] = await Promise.all([
    client.post.count({ where }),
    client.post.findMany({ where, orderBy: { id: "asc" }, skip: input.offset, take: input.limit,
      select: { id: true, versions: { where: text ? { title: contains } : {}, select: { title: true }, take: 20, orderBy: { versionSeq: "desc" } } } })
  ]);
  const result = await resolveLibraryPosts(db, creatorId, found.map((p) => str(p.id)), options);
  const matches = result.resolvedPosts.flatMap((p): LibraryTitleMatch[] => {
    const match = (title: string) => !text || title.toLocaleLowerCase().includes(text.toLocaleLowerCase());
    const titles = new Set(rows(found.find((f) => f.id === p.postId)?.versions).map((v) => str(v.title)));
    const current = [p.title, p.naming.sourceTitle, p.naming.workTitle ?? "", p.naming.seriesTitle ?? ""].filter((title) => title && match(title));
    return [...new Set(current)].map((title): LibraryTitleMatch => ({ postId: p.postId, matchedTitle: title, provenance: "current" }))
      .concat([...titles].filter((title) => !current.includes(title)).map((title) => ({ postId: p.postId, matchedTitle: title, provenance: "historical" as const })))
      .concat(history.filter((m) => m.postId === p.postId));
  });
  return { ...page(result.resolvedPosts, total, input), matches, ambiguous: total > 1, historicalRelayTitlesAvailable: Boolean(options.history) };
}

export interface LibraryFamilyResult extends LibraryPage<ResolvedPost> { target: { kind: "post" | "work" | "series"; id: string }; workIds: string[]; seriesId?: string }
/** Exact relational family expansion: never infer siblings from title similarity. */
export async function expandLibraryFamily(db: LibraryReadClient, creatorId: string, target: LibraryFamilyResult["target"], options: LibraryReadOptions = {}): Promise<LibraryFamilyResult> {
  const input = pageInput(creatorId, ["family", target], options);
  ids([target.id]);
  const client = readDb(db);
  let workIds: string[] = [];
  let seriesId: string | undefined;
  if (target.kind === "post") {
    const selected = await client.post.findMany({ where: { id: target.id, creatorId }, select: { id: true } });
    if (!selected.length) throw new EditorError("not_found", "Library post was not found.", 404);
    const members = await client.creativeWorkMember.findMany({ where: { creatorId, postId: target.id, post: { is: { creatorId } }, creativeWork: { is: { creatorId } } }, select: { creativeWorkId: true } });
    workIds = members.map((m) => str(m.creativeWorkId));
  } else if (target.kind === "work") {
    const works = await client.creativeWork.findMany({ where: { id: target.id, creatorId }, select: { id: true } });
    if (!works.length) throw new EditorError("not_found", "Library work was not found.", 404);
    workIds = works.map((w) => str(w.id));
  } else if (target.kind === "series") {
    const series = await client.creativeSeries.findMany({ where: { id: target.id, creatorId }, select: { id: true } });
    if (!series.length) throw new EditorError("not_found", "Library series was not found.", 404);
    seriesId = target.id;
  } else throw new EditorError("invalid_target", "Choose a post, work, or series.");
  // Selecting a post/work expands its containing series when present, preserving every exception.
  if (!seriesId && workIds.length) {
    const links = await client.creativeSeriesMember.findMany({ where: { creatorId, creativeWorkId: { in: workIds }, creativeWork: { is: { creatorId } }, creativeSeries: { is: { creatorId } } }, select: { creativeSeriesId: true } });
    seriesId = links[0] ? str(links[0].creativeSeriesId) : undefined;
  }
  const workWhere = seriesId ? { creatorId, creativeWork: { is: { creatorId } }, creativeSeries: { is: { id: seriesId, creatorId } } } : undefined;
  // Query posts through memberships rather than collecting unbounded IDs in application memory.
  const where = { creatorId, ...(seriesId ? { creativeWorkMember: { is: { creatorId, creativeWork: { is: { creatorId, seriesMember: { is: workWhere } } } } } }
    : workIds.length ? { creativeWorkMember: { is: { creatorId, creativeWorkId: { in: workIds }, creativeWork: { is: { creatorId } } } } } : { id: target.id }) };
  const [total, posts] = await Promise.all([client.post.count({ where }), client.post.findMany({ where, select: { id: true }, orderBy: { id: "asc" }, skip: input.offset, take: input.limit })]);
  const result = await resolveLibraryPosts(db, creatorId, posts.map((p) => str(p.id)), options);
  return { ...page(result.resolvedPosts, total, input), target, workIds, ...(seriesId ? { seriesId } : {}) };
}

export interface LibraryCollectionContext { id: string; title: string; description: string | null; themeTags: string[]; postIds: string[]; totalPosts: number; membershipComplete: boolean }
export async function readLibraryCollections(db: LibraryReadClient, creatorId: string, options: LibraryPageOptions & { collectionId?: string } = {}): Promise<LibraryPage<LibraryCollectionContext>> {
  const input = pageInput(creatorId, ["collections", options.collectionId ?? null], options);
  const client = readDb(db);
  const where = { creatorId, ...(options.collectionId ? { id: options.collectionId } : {}) };
  const [total, collections] = await Promise.all([client.libraryCollection.count({ where }), client.libraryCollection.findMany({ where, orderBy: [{ sortOrder: "asc" }, { id: "asc" }], skip: input.offset, take: input.limit,
    select: { id: true, title: true, description: true, themeTagIds: true, _count: { select: { posts: true } }, posts: { orderBy: { sortIndex: "asc" }, take: Math.max(1, Math.floor(LIBRARY_METADATA_LIMIT / input.limit)), select: { postId: true } } } })]);
  const candidateIds = [...new Set(collections.flatMap((c) => rows(c.posts).map((p) => str(p.postId))))];
  // CollectionPost has no creator key/post FK, so recheck canonical ownership before exposing links.
  const owned = candidateIds.length ? await client.post.findMany({ where: { creatorId, id: { in: candidateIds } }, select: { id: true } }) : [];
  const ownedIds = new Set(owned.map((p) => str(p.id)));
  const items = collections.map((c): LibraryCollectionContext => {
    const count = Number((c._count as Row | undefined)?.posts ?? 0);
    const postIds = rows(c.posts).map((p) => str(p.postId)).filter((id) => ownedIds.has(id));
    return { id: str(c.id), title: str(c.title), description: c.description == null ? null : str(c.description), themeTags: strings(c.themeTagIds), postIds, totalPosts: count, membershipComplete: count === postIds.length };
  });
  options.budget?.metadata(items.length);
  return page(items, total, input);
}

/** Collection membership is paged independently; the SQL join excludes stale/cross-creator links.
 * Prisma's CollectionPost has no Post relation, so a parameterized join is required for exact totals.
 */
export async function readLibraryCollectionPosts(db: LibraryReadClient, creatorId: string, collectionId: string, options: LibraryReadOptions = {}): Promise<LibraryPage<ResolvedPost>> {
  ids([collectionId]);
  const input = pageInput(creatorId, ["collection-posts", collectionId], options);
  const client = readDb(db);
  const owned = await client.libraryCollection.findMany({ where: { id: collectionId, creatorId }, select: { id: true } });
  if (!owned.length) throw new EditorError("not_found", "Library collection was not found.", 404);
  const join = `FROM collection_posts cp JOIN posts p ON p.id = cp.post_id JOIN library_collections c ON c.id = cp.collection_id WHERE cp.collection_id = $1 AND p.creator_id = $2 AND c.creator_id = $2`;
  const [counts, members] = await Promise.all([
    client.$queryRawUnsafe<{ total: bigint }[]>(`SELECT COUNT(*) AS total ${join}`, collectionId, creatorId),
    client.$queryRawUnsafe<{ postId: string }[]>(`SELECT p.id AS "postId" ${join} ORDER BY cp.sort_index ASC, p.id ASC LIMIT $3 OFFSET $4`, collectionId, creatorId, input.limit, input.offset)
  ]);
  const resolved = await resolveLibraryPosts(db, creatorId, members.map((m) => m.postId), options);
  return page(resolved.resolvedPosts, Number(counts[0]?.total ?? 0), input);
}

export interface LibraryMediaContext { mediaId: string; postIds: string[]; mimeType: string | null; role: string | null; processingStatus: string; thumbnailPath?: string; imageUnsupportedReason?: string }
function safeOwnedStorageKey(creatorId: string, mediaId: string, value: unknown): string | null {
  if (!/^[A-Za-z0-9_-]+$/.test(creatorId) || !/^[A-Za-z0-9_-]+$/.test(mediaId)) return null;
  const key = str(value);
  return key === `relay/tenants/${creatorId}/media/${mediaId}/asset` || key === `media/${mediaId}/asset` ? key : null;
}
export async function readLibraryMedia(db: LibraryReadClient, creatorId: string, requestedIds: string[], options: { budget?: LibraryReadBudget } = {}): Promise<{ items: LibraryMediaContext[]; missingMediaIds: string[] }> {
  scope(creatorId);
  const mediaIds = ids(requestedIds);
  const client = readDb(db);
  const media = mediaIds.length ? await client.mediaAsset.findMany({ where: { creatorId, id: { in: mediaIds } }, select: { id: true, postIds: true, primaryPostId: true, currentMimeType: true, currentRole: true, currentStorageKey: true, processingStatus: true } }) : [];
  const postCandidates = [...new Set(media.flatMap((m) => [...strings(m.postIds), ...(m.primaryPostId ? [str(m.primaryPostId)] : [])]))];
  const ownedPosts = postCandidates.length ? await client.post.findMany({ where: { creatorId, id: { in: postCandidates } }, select: { id: true } }) : [];
  const ownedIds = new Set(ownedPosts.map((p) => str(p.id)));
  const items = media.map((m): LibraryMediaContext => {
    const isImage = /^image\/(jpeg|png|webp|gif|avif)$/i.test(str(m.currentMimeType));
    const key = safeOwnedStorageKey(creatorId, str(m.id), m.currentStorageKey);
    const ready = m.processingStatus === "READY";
    return { mediaId: str(m.id), postIds: [...new Set([...strings(m.postIds), ...(m.primaryPostId ? [str(m.primaryPostId)] : [])])].filter((id) => ownedIds.has(id)), mimeType: m.currentMimeType == null ? null : str(m.currentMimeType), role: m.currentRole == null ? null : str(m.currentRole), processingStatus: str(m.processingStatus),
      ...(isImage && key && ready ? { thumbnailPath: `/api/v1/export/media/${encodeURIComponent(creatorId)}/${encodeURIComponent(str(m.id))}/thumb` }
        : { imageUnsupportedReason: !isImage ? "unsupported_image_type" : !ready ? "media_not_ready" : "owned_storage_unavailable" }) };
  });
  options.budget?.metadata(items.length);
  const found = new Set(items.map((m) => m.mediaId));
  return { items, missingMediaIds: mediaIds.filter((id) => !found.has(id)) };
}

export interface LibraryImageReference { mediaId: string; thumbnailPath: string }
export async function resolveLibraryImageReferences(db: LibraryReadClient, creatorId: string, mediaIds: string[], options: { budget?: LibraryReadBudget } = {}): Promise<{ images: LibraryImageReference[]; unsupported: { mediaId: string; reason: string }[] }> {
  const requested = ids(mediaIds, LIBRARY_IMAGE_LIMIT);
  const result = await readLibraryMedia(db, creatorId, requested, options);
  const images = result.items.flatMap((m) => m.thumbnailPath ? [{ mediaId: m.mediaId, thumbnailPath: m.thumbnailPath }] : []);
  options.budget?.images(images.length);
  return { images, unsupported: [...result.items.filter((m) => !m.thumbnailPath).map((m) => ({ mediaId: m.mediaId, reason: m.imageUnsupportedReason! })), ...result.missingMediaIds.map((mediaId) => ({ mediaId, reason: "not_found" }))] };
}

/** Server-only byte reader receives only validated creator-owned storage keys, never external URLs. */
export async function retrieveLibraryThumbnails(db: LibraryReadClient, creatorId: string, mediaIds: string[], readOwnedStorage: (input: { creatorId: string; mediaId: string; storageKey: string; maxBytes: number }) => Promise<Buffer>, options: { budget?: LibraryReadBudget } = {}): Promise<{ images: { mediaId: string; mimeType: "image/webp"; bytes: Buffer }[]; unsupported: { mediaId: string; reason: string }[] }> {
  const references = await resolveLibraryImageReferences(db, creatorId, mediaIds, options);
  const images: { mediaId: string; mimeType: "image/webp"; bytes: Buffer }[] = [];
  const unsupported = [...references.unsupported];
  // Recheck the key immediately before storage reads, including creator scope in every lookup.
  for (const reference of references.images) {
    const found = await readDb(db).mediaAsset.findMany({ where: { creatorId, id: reference.mediaId }, select: { currentStorageKey: true, currentMimeType: true } });
    const key = safeOwnedStorageKey(creatorId, reference.mediaId, found[0]?.currentStorageKey);
    if (!key) { unsupported.push({ mediaId: reference.mediaId, reason: "owned_storage_unavailable" }); continue; }
    try {
      const bytes = await readOwnedStorage({ creatorId, mediaId: reference.mediaId, storageKey: key, maxBytes: 40 * 1024 * 1024 });
      const thumbnail = await buildGridThumbnailImage(bytes, str(found[0]?.currentMimeType));
      if (thumbnail) images.push({ mediaId: reference.mediaId, mimeType: "image/webp", bytes: thumbnail });
      else unsupported.push({ mediaId: reference.mediaId, reason: "unsupported_image_bytes" });
    } catch { unsupported.push({ mediaId: reference.mediaId, reason: "storage_read_failed" }); }
  }
  return { images, unsupported };
}
