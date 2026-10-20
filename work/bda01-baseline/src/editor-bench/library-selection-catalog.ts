import { createHash } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { resolveLibraryPosts } from '../gallery-editor/context.js';
import { stripHtmlForSearch } from '../gallery/query.js';

export const REAL_LIBRARY_SUPPORTED_FIELDS = ['post_id','work_id','series_id','collection_id','tag','publish_state','title','description','created_date','published_date','media_type','media_role','processing_status'] as const;
export type RealLibraryPost = {
  postId: string; title: string; descriptionText: string; tags: string[];
  createdAt: string; publishedAt: string | null; publishState: string;
  workId: string | null; workTitle: string | null; seriesId: string | null; seriesTitle: string | null;
  collectionIds: string[]; collections: Array<{ id: string; title: string }>;
  media: Array<{ id: string; mimeType: string | null; role: string | null; processingStatus: string }>;
};
export type RealLibraryCatalog = { scope: 'real_library'; catalogRevision: string; complete: true; supportedFields: readonly string[]; timezone: 'Europe/London'; posts: RealLibraryPost[] };
export class RealLibraryCatalogError extends Error {
  constructor(public readonly code: 'catalog_too_large'|'catalog_incomplete', message: string) { super(message); }
}
const MAX_POSTS = 40, MAX_MEDIA = 80, MAX_BYTES = 48 * 1024;
function localDate(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

type SnapshotRow = { id: string; createdAt: Date; publishState: string; versions: Array<{ id: string; publishedAt: Date | null; mediaIds: string[] }> };
type ReadClient = PrismaClient | Prisma.TransactionClient;

/** Shared effective-metadata normalization for the bounded chat catalog and grounded connector. */
async function normalizeLibraryRows(prisma: ReadClient, creatorId: string, rows: SnapshotRow[], mediaLimit: number, rejectBadOwners = false): Promise<RealLibraryPost[]> {
  if (rows.length > 100) throw new RealLibraryCatalogError('catalog_too_large', 'Library normalization batches are limited to 100 posts.');
  const postIds = rows.map(row => row.id);
  const resolvedResult = await resolveLibraryPosts(prisma, creatorId, postIds);
  if (resolvedResult.missingPostIds.length || rows.some(row => row.versions.length !== 1)) throw new RealLibraryCatalogError('catalog_incomplete', 'A current Library post version is unavailable. Refresh the Library before selecting.');
  const resolved = new Map(resolvedResult.resolvedPosts.map(row => [row.postId, row]));
  const versionByPost = new Map(rows.map(row => [row.id, row.versions[0]!]));
  const mediaOr = rows.flatMap(row => { const ids = resolved.get(row.id)?.mediaIds ?? []; return ids.length ? [{ id: { in: ids }, OR: [{ primaryPostId: row.id }, { postIds: { has: row.id } }] }] : []; });
  const mediaRows = mediaOr.length ? await prisma.mediaAsset.findMany({
    where: { ...(rejectBadOwners ? {} : { creatorId }), upstreamStatus: 'active', OR: mediaOr }, take: mediaLimit + 1,
    select: { id: true, creatorId: true, primaryPostId: true, postIds: true, currentMimeType: true, currentRole: true, processingStatus: true }
  }) : [];
  if (mediaRows.length > mediaLimit) throw new RealLibraryCatalogError('catalog_too_large', 'The complete current Library media set exceeds the supported retrieval limit.');
  if (rejectBadOwners && mediaRows.some(row => row.creatorId !== creatorId)) throw new RealLibraryCatalogError('catalog_incomplete', 'A current media ownership relation is inconsistent. Refresh the Library before selecting.');
  const mediaById = new Map(mediaRows.map(row => [row.id, row]));
  const workRows = postIds.length ? await prisma.creativeWorkMember.findMany({ where: { ...(!rejectBadOwners ? { creatorId } : {}), postId: { in: postIds } }, select: { creatorId: true, postId: true, creativeWorkId: true, creativeWork: { select: { id: true, creatorId: true, title: true, titleMode: true, seriesMember: { select: { creatorId: true, partLabel: true, creativeSeries: { select: { id: true, creatorId: true, title: true } } } } } } } }) : [];
  if (rejectBadOwners && workRows.some(row => row.creatorId !== creatorId || row.creativeWork.creatorId !== creatorId || (row.creativeWork.seriesMember && (row.creativeWork.seriesMember.creatorId !== creatorId || row.creativeWork.seriesMember.creativeSeries.creatorId !== creatorId)))) throw new RealLibraryCatalogError('catalog_incomplete', 'A Library ownership relation is inconsistent. Refresh the Library before selecting.');
  const workByPost = new Map(workRows.filter(row => row.creativeWork.creatorId === creatorId).map(row => [row.postId, row]));
  const collectionRows = postIds.length ? await prisma.collectionPost.findMany({ where: { postId: { in: postIds }, ...(!rejectBadOwners ? { collection: { creatorId } } : {}) }, select: { postId: true, collectionId: true, collection: { select: { id: true, creatorId: true, title: true } } }, orderBy: [{ collectionId: 'asc' }] }) : [];
  if (rejectBadOwners && collectionRows.some(row => row.collection.creatorId !== creatorId)) throw new RealLibraryCatalogError('catalog_incomplete', 'A Library collection ownership relation is inconsistent. Refresh the Library before selecting.');
  const collectionsByPost = new Map<string, Array<{ id: string; title: string }>>();
  for (const row of collectionRows) if (row.collection.creatorId === creatorId) collectionsByPost.set(row.postId, [...(collectionsByPost.get(row.postId) ?? []), { id: row.collection.id, title: row.collection.title }]);
  return rows.map(row => {
    const item = resolved.get(row.id)!; const version = versionByPost.get(row.id)!; const work = workByPost.get(row.id);
    const series = work?.creativeWork.seriesMember?.creatorId === creatorId && work.creativeWork.seriesMember.creativeSeries.creatorId === creatorId ? work.creativeWork.seriesMember.creativeSeries : null;
    const collections = collectionsByPost.get(row.id) ?? [];
    const media = item.mediaIds.filter(id => { const value = mediaById.get(id); return !!value && (value.primaryPostId === row.id || value.postIds.includes(row.id)); }).map(id => { const value = mediaById.get(id)!; return { id, mimeType: value.currentMimeType, role: value.currentRole, processingStatus: String(value.processingStatus) }; });
    return {
      postId: row.id, title: item.title, descriptionText: stripHtmlForSearch(item.description ?? '').replace(/\s+/g, ' ').trim(), tags: [...item.tags].sort(),
      createdAt: localDate(row.createdAt), publishedAt: row.publishState === 'draft' || !version.publishedAt ? null : localDate(version.publishedAt), publishState: String(row.publishState),
      workId: item.naming.workId ?? work?.creativeWorkId ?? null, workTitle: item.naming.workTitle ?? work?.creativeWork.title ?? null,
      seriesId: item.naming.seriesId ?? series?.id ?? null, seriesTitle: item.naming.seriesTitle ?? series?.title ?? null,
      collectionIds: collections.map(collection => collection.id), collections, media
    };
  });
}

function enforceIndividualMetadataBounds(posts: RealLibraryPost[], maxLength: number): void {
  if (posts.some(post => post.postId.length > 200 || post.title.length > maxLength || post.descriptionText.length > maxLength || post.tags.some(tag => tag.length > maxLength) || (post.workId?.length ?? 0) > 200 || (post.workTitle?.length ?? 0) > maxLength || (post.seriesId?.length ?? 0) > 200 || (post.seriesTitle?.length ?? 0) > maxLength || post.collectionIds.some(id => id.length > 200) || post.collections.some(collection => collection.title.length > maxLength) || post.media.some(media => media.id.length > 200 || (media.mimeType?.length ?? 0) > 200 || (media.role?.length ?? 0) > 200 || media.processingStatus.length > 200))) throw new RealLibraryCatalogError('catalog_too_large', 'Some Library metadata exceeds the supported selection size. Narrow it in the Library before selecting.');
}

/** Loads one complete, bounded, authenticated creator snapshot; it never reads media bytes. */
export async function loadRealLibraryCatalog(prisma: PrismaClient, accountId: string, creatorId: string): Promise<RealLibraryCatalog> {
  const [rows] = await Promise.all([prisma.post.findMany({
    where: { creatorId, upstreamStatus: 'active' }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: MAX_POSTS + 1,
    select: { id: true, createdAt: true, publishState: true, versions: { orderBy: { versionSeq: 'desc' }, take: 1, select: { id: true, publishedAt: true, mediaIds: true } } }
  })]);
  if (rows.length > MAX_POSTS) throw new RealLibraryCatalogError('catalog_too_large', 'This Library has more than 40 active posts. Narrow it in the Library before selecting.');
  const posts = await normalizeLibraryRows(prisma, creatorId, rows as SnapshotRow[], MAX_MEDIA);
  if (posts.some(post => post.postId.length > 200 || post.title.length > 200 || post.descriptionText.length > 2000 || post.tags.some(tag => tag.length > 200) || (post.workId?.length ?? 0) > 200 || (post.workTitle?.length ?? 0) > 200 || (post.seriesId?.length ?? 0) > 200 || (post.seriesTitle?.length ?? 0) > 200 || post.collectionIds.some(id => id.length > 200) || post.collections.some(collection => collection.title.length > 200) || post.media.some(media => media.id.length > 200 || (media.mimeType?.length ?? 0) > 200 || (media.role?.length ?? 0) > 200 || media.processingStatus.length > 200))) throw new RealLibraryCatalogError('catalog_too_large', 'Some Library metadata exceeds the supported selection size. Narrow it in the Library before selecting.');
  const canonical = { accountId, creatorId, posts };
  const catalogRevision = createHash('sha256').update(JSON.stringify(canonical), 'utf8').digest('hex');
  const catalog: RealLibraryCatalog = { scope: 'real_library', catalogRevision, complete: true, supportedFields: REAL_LIBRARY_SUPPORTED_FIELDS, timezone: 'Europe/London', posts };
  if (Buffer.byteLength(JSON.stringify(catalog), 'utf8') > MAX_BYTES) throw new RealLibraryCatalogError('catalog_too_large', 'The complete Library metadata is larger than this selection view supports. Narrow it in the Library before selecting.');
  return catalog;
}

export type LargeRealLibrarySnapshot = { scope: 'real_library_retrieval'; catalogRevision: string; complete: true; supportedFields: readonly string[]; timezone: 'Europe/London'; posts: RealLibraryPost[] };
const LARGE_MAX_POSTS = 1024, LARGE_MAX_MEDIA = 4096, LARGE_MAX_BYTES = 16 * 1024 * 1024;

/** Loads the complete bounded real Library in one readonly repeatable-read snapshot. */
export async function loadLargeRealLibrarySnapshot(prisma: PrismaClient, accountId: string, creatorId: string, signal?: AbortSignal): Promise<LargeRealLibrarySnapshot> {
  return prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    if (signal?.aborted) throw new Error('grounded_selection_cancelled');
    const rows: SnapshotRow[] = [];
    let afterId: string | undefined;
    for (;;) {
      if (signal?.aborted) throw new Error('grounded_selection_cancelled');
      const take = Math.min(100, LARGE_MAX_POSTS + 1 - rows.length);
      const page = await tx.post.findMany({
        where: { creatorId, upstreamStatus: 'active', ...(afterId ? { id: { gt: afterId } } : {}) }, orderBy: { id: 'asc' }, take,
        select: { id: true, createdAt: true, publishState: true, versions: { orderBy: { versionSeq: 'desc' }, take: 1, select: { id: true, publishedAt: true, mediaIds: true } } }
      });
      if (!page.length) break;
      rows.push(...page as SnapshotRow[]);
      afterId = page[page.length - 1]!.id;
      if (rows.length > LARGE_MAX_POSTS) throw new RealLibraryCatalogError('catalog_too_large', 'The complete Library exceeds 1,024 active posts.');
      if (page.length < take) break;
    }
    const posts: RealLibraryPost[] = [];
    const distinctMedia = new Set<string>();
    const snapshotPrefixBytes = Buffer.byteLength(JSON.stringify({ accountId, creatorId, posts: [] }), 'utf8') - 2;
    let serializedPostsBytes = 0;
    for (let offset = 0; offset < rows.length; offset += 100) {
      if (signal?.aborted) throw new Error('grounded_selection_cancelled');
      const batch = rows.slice(offset, offset + 100);
      const normalized = await normalizeLibraryRows(tx, creatorId, batch, LARGE_MAX_MEDIA, true);
      for (const post of normalized) for (const media of post.media) distinctMedia.add(media.id);
      if (distinctMedia.size > LARGE_MAX_MEDIA) throw new RealLibraryCatalogError('catalog_too_large', 'The complete Library exceeds 4,096 active current media items.');
      for (const post of normalized) {
        enforceIndividualMetadataBounds([post], LARGE_MAX_BYTES);
        serializedPostsBytes += Buffer.byteLength(JSON.stringify(post), 'utf8') + (posts.length ? 1 : 0);
        if (snapshotPrefixBytes + serializedPostsBytes > LARGE_MAX_BYTES) throw new RealLibraryCatalogError('catalog_too_large', 'The complete normalized Library metadata exceeds 16 MiB.');
        posts.push(post);
      }
    }
    if (signal?.aborted) throw new Error('grounded_selection_cancelled');
    const canonical = { accountId, creatorId, posts };
    const catalogRevision = createHash('sha256').update(JSON.stringify(canonical), 'utf8').digest('hex');
    return { scope: 'real_library_retrieval', catalogRevision, complete: true, supportedFields: REAL_LIBRARY_SUPPORTED_FIELDS, timezone: 'Europe/London', posts };
  }, { isolationLevel: 'RepeatableRead', timeout: 30_000, maxWait: 5_000 });
}
