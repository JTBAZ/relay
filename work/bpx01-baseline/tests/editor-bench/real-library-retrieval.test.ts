import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { loadLargeRealLibrarySnapshot, loadRealLibraryCatalog } from '../../src/editor-bench/library-selection-catalog.js';
import { handleGroundedRealLibrarySelection, handleRealLibrarySelection, validateGroundedRealLibrarySelectionRequest, type GroundedSelectionResponse, type RetrievalRefinementState } from '../../src/editor-bench/real-library-selection.js';
import { GROUNDED_LIBRARY_SELECTION_PATH, mountGroundedLibrarySelectionBodyParser, registerGroundedLibrarySelectionRoute } from '../../src/editor-bench/real-library-selection-routes.js';
import { RelayAuthError } from '../../src/identity/relay-auth-error.js';

const accountId = 'account-test', creatorId = 'creator-test';
const postId = (n: number) => `post_${String(n).padStart(4, '0')}`;
const text = (field: string, value: string, requestQuote = value) => ({ field, value, requestQuote });
function makeDatabase(count: number, options: { mediaPerPost?: number; hugeDescription?: string; foreignOwner?: boolean } = {}, ownerId = creatorId) {
  const rows = Array.from({ length: count }, (_, i) => ({
    id: postId(i), createdAt: new Date('2026-10-18T11:00:00.000Z'), publishState: i === 1 ? 'draft' : 'published',
    versions: [{ id: `version_${i}`, publishedAt: i === 1 ? new Date('2026-10-18T12:00:00.000Z') : new Date('2026-10-17T12:00:00.000Z'),
      title: i === 0 || i === 1000 ? 'Duplicate title' : `Post ${i}`, description: i === 999 ? `${'x'.repeat(9000)}needle` : options.hugeDescription ?? `ordinary description ${i}`,
      mediaIds: Array.from({ length: options.mediaPerPost ?? 0 }, (_, m) => `media_${i}_${m}`), tagIds: i === 500 ? ['base_tag','old_tag'] : i === 500 || i === 999 || i === 1000 ? ['character'] : [] }]
  }));
  if (rows[500]) { rows[500]!.versions[0]!.description = '<p>needle middle</p>'; rows[500]!.versions[0]!.tagIds = ['base_tag','old_tag']; }
  if (rows[700]) rows[700]!.versions[0]!.description = '<p>old description</p>';
  if (rows[750]) rows[750]!.versions[0]!.description = '<p>blue fresh</p>';
  if (rows[999]) rows[999]!.versions[0]!.tagIds = ['removed','character'];
  if (rows[1000]) { rows[1000]!.versions[0]!.description = '<p>series member</p>'; rows[1000]!.versions[0]!.tagIds = ['character','keep']; }
  const mediaRows = rows.flatMap(row => row.versions[0]!.mediaIds.map(id => ({ id, creatorId: ownerId, primaryPostId: row.id, postIds: [], currentMimeType: 'image/png', currentRole: 'main', processingStatus: 'READY' })));
  const workRows = [
    { postId: postId(1000), creativeWorkId: 'work_late', creatorId: ownerId, creativeWork: { id: 'work_late', creatorId: ownerId, title: 'Late Work', titleMode: 'independent', seriesMember: { creatorId: ownerId, partLabel: '1', creativeSeries: { id: 'series_late', creatorId: ownerId, title: 'Late Series' } } } },
    { postId: postId(0), creativeWorkId: 'work_shared', creatorId: options.foreignOwner ? 'other-creator' : ownerId, creativeWork: { id: 'work_shared', creatorId: ownerId, title: 'Shared Work', titleMode: 'independent', seriesMember: { creatorId: ownerId, partLabel: '1', creativeSeries: { id: 'series_shared', creatorId: ownerId, title: 'Shared Series' } } } },
    { postId: postId(999), creativeWorkId: 'work_shared_2', creatorId: ownerId, creativeWork: { id: 'work_shared_2', creatorId: ownerId, title: 'Shared Work 2', titleMode: 'independent', seriesMember: { creatorId: ownerId, partLabel: '2', creativeSeries: { id: 'series_shared_2', creatorId: ownerId, title: 'Shared Series' } } } },
  ];
  let postQueries = 0;
  const post = { async findMany(args: any) {
    postQueries++;
    if (args.where?.upstreamStatus === 'active') return rows.filter(row => !args.where.id?.gt || row.id > args.where.id.gt).slice(0, args.take).map(({ id, createdAt, publishState, versions }) => ({ id, createdAt, publishState, versions: versions.map(v => ({ id: v.id, publishedAt: v.publishedAt, mediaIds: v.mediaIds })) }));
    const ids: string[] = args.where?.id?.in ?? rows.filter(row => row.id === args.where?.id).map(row => row.id);
    return ids.flatMap(id => { const row = rows.find(item => item.id === id); if (!row) return []; const v = row.versions[0]!;
      if (args.select?.presentation) return [{ id, versions: [{ title: v.title }], presentation: null, creativeWorkMember: workRows.find(work => work.postId === id) ?? null }];
      return [{ id, versions: [{ title: v.title, description: v.description, mediaIds: v.mediaIds, tagIds: v.tagIds }] }];
    });
  } };
  const tx: any = {
    post,
    mediaAsset: { async findMany(args: any) { const groups = args.where.OR ?? []; return mediaRows.filter(media => groups.some((group: any) => group.id.in.includes(media.id) && group.OR.some((relation: any) => relation.primaryPostId === media.primaryPostId || relation.postIds?.has && media.postIds.includes(relation.postIds.has)))).slice(0, args.take); } },
    creativeWorkMember: { async findMany(args: any) { return workRows.filter(work => args.where.postId.in.includes(work.postId)); } },
    collectionPost: { async findMany(args: any) { return options.foreignOwner && args.where.postId.in.includes(postId(0)) ? [{ postId: postId(0), collectionId: 'foreign_collection', collection: { id: 'foreign_collection', creatorId: 'other-creator', title: 'Foreign collection' } }] : []; } },
    postPresentation: { async findMany(args: any) { return args.where.postId.in.includes(postId(700)) ? [{ postId: postId(700), creatorId, relayDescription: '', relayTitle: null }] : []; } },
    postOverride: { async findMany(args: any) { return args.where.postId.in.includes(postId(500)) ? [{ postId: postId(500), removeTagIds: ['old_tag'], addTagIds: ['character'] }] : []; } },
    async $executeRawUnsafe(sql: string) { if (sql !== 'SET TRANSACTION READ ONLY') throw new Error('unexpected SQL'); return 0; }
  };
  const prisma: any = { ...tx, async $transaction(callback: (client: any) => unknown, options: any) { prisma.transactionOptions = options; return callback(tx); } };
  return { prisma, rows, mediaRows, get postQueries() { return postQueries; } };
}
const selection = (mode: 'replace'|'add'|'remove', requestQuote: string, selector: any) => ({ mode, requestQuote, selector });
function data(result: any) { return result.body as GroundedSelectionResponse; }

describe('large real Library grounded connector', () => {
  it('pages all 1,001 posts and matches late series, description, exclusion, removal, and later add against the full snapshot', async () => {
    const { prisma } = makeDatabase(1001);
    const snapshot = await loadLargeRealLibrarySnapshot(prisma, accountId, creatorId);
    expect(prisma.transactionOptions).toMatchObject({ isolationLevel: 'RepeatableRead', timeout: 30_000 });
    expect(snapshot.posts).toHaveLength(1001);
    expect(snapshot.posts.map(post => post.postId)).toEqual(Array.from({ length: 1001 }, (_, i) => postId(i)));
    expect(snapshot.posts[1]!.publishedAt).toBeNull();
    expect(snapshot.posts[700]!.descriptionText).toBe('');
    expect(snapshot.posts[500]!.tags).toEqual(['base_tag','character']);
    expect(snapshot.posts[999]!.descriptionText.endsWith('needle')).toBe(true);
    expect(snapshot.posts[1000]!.seriesTitle).toBe('Late Series');

    const latest = 'Select pieces with needle or in the Late Series, excluding removed.';
    const first = handleGroundedRealLibrarySelection(snapshot, { latestRequest: latest, state: null, selection: selection('replace', latest, { base: 'catalog', all: [], any: [text('description','needle'), text('series_id','series_late','Late Series')], none: [text('tag','removed')] }) });
    const authoritative = snapshot.posts.filter(post => (post.descriptionText.includes('needle') || post.seriesId === 'series_late') && !post.tags.some(tag => tag.toLowerCase() === 'removed')).map(post => post.postId);
    expect(authoritative).toEqual([postId(500), postId(1000)]);
    expect(data(first).result.matchedPostIds).toEqual(authoritative);
    expect(data(first).selection.postIds).toEqual(authoritative);
    expect(data(first).refinementState.excludedPostIds).toEqual([postId(999)]);

    const removeQuote = 'Remove character posts except keep';
    const removed = handleGroundedRealLibrarySelection(snapshot, { latestRequest: removeQuote, state: data(first).refinementState, selection: selection('remove', removeQuote, { base: 'catalog', all: [text('tag','character')], any: [], none: [text('tag','keep')] }) });
    expect(data(removed).selection.postIds).toEqual([postId(1000)]);
    expect(data(removed).refinementState.excludedPostIds).toEqual([postId(500),postId(999)]);

    const addQuote = 'Add published pieces with blue';
    const added = handleGroundedRealLibrarySelection(snapshot, { latestRequest: addQuote, state: data(removed).refinementState, selection: selection('add', addQuote, { base: 'catalog', all: [text('publish_state','published'),text('description','blue')], any: [], none: [] }) });
    expect(data(added).selection.postIds).toEqual([postId(750),postId(1000)]);
    expect(data(added).refinementState.excludedPostIds).toEqual([postId(500),postId(999)]);
  });

  it('rejects foreign, stale, ambiguous-name, and ungrounded selectors without changing IDs', async () => {
    const snapshot = await loadLargeRealLibrarySnapshot(makeDatabase(1001).prisma, accountId, creatorId);
    const prior: RetrievalRefinementState = { v: 2, scope: 'real_library_retrieval', catalogRevision: snapshot.catalogRevision, selectedPostIds: [postId(500)], excludedPostIds: [] };
    const stale = handleGroundedRealLibrarySelection({ ...snapshot, catalogRevision: 'new' }, { latestRequest: 'Select a title', selection: selection('replace','Select a title',{base:'catalog',all:[text('title','Post')],any:[],none:[]}), state: prior });
    expect(stale.status).toBe(409);
    const foreign = handleGroundedRealLibrarySelection(snapshot, { latestRequest: 'Select a title', selection: selection('replace','Select a title',{base:'catalog',all:[text('title','Post')],any:[],none:[]}), state: { ...prior, selectedPostIds: ['foreign'] } });
    expect(foreign.status).toBe(400);
    const duplicateTitle = handleGroundedRealLibrarySelection(snapshot, { latestRequest: 'Select Duplicate title', selection: selection('replace','Select Duplicate title',{base:'catalog',all:[text('post_id',postId(0),'Duplicate title')],any:[],none:[]}), state: null });
    expect(data(duplicateTitle)).toMatchObject({ status: 'clarification', selection: { postIds: [], changed: false } });
    const ungrounded = handleGroundedRealLibrarySelection(snapshot, { latestRequest: 'Select descriptions containing blue', selection: selection('replace','Select descriptions containing blue',{base:'catalog',all:[text('description','needle','blue')],any:[],none:[]}), state: null });
    expect(data(ungrounded)).toMatchObject({ status: 'clarification', selection: { postIds: [], changed: false } });
    const duplicateFamily = handleGroundedRealLibrarySelection(snapshot, { latestRequest: 'Select the Shared Series', selection: selection('replace','Select the Shared Series',{base:'catalog',all:[text('series_id','series_shared','Shared Series')],any:[],none:[]}), state: null });
    expect(data(duplicateFamily)).toMatchObject({ status: 'clarification', selection: { postIds: [], changed: false } });
    const literalIdQuote = 'select series_late';
    const literalId = handleGroundedRealLibrarySelection(snapshot, { latestRequest: literalIdQuote, selection: selection('replace',literalIdQuote,{base:'catalog',all:[text('series_id','series_late','series_late')],any:[],none:[]}), state: null });
    expect(data(literalId).selection.postIds).toEqual([postId(1000)]);
  });

  it('matches the bounded interpreter on the same <=40 metadata and hashes account scope', async () => {
    const { prisma } = makeDatabase(40);
    const small = await loadRealLibraryCatalog(prisma, accountId, creatorId);
    const large = await loadLargeRealLibrarySnapshot(prisma, accountId, creatorId);
    const quote = 'Select ordinary descriptions';
    const selector = { base: 'catalog', all: [text('description','ordinary')], any: [], none: [] };
    const provider = { async respond() { return { output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ result: { kind: 'selection', selection: selection('replace',quote,selector), intent: null } }) }] }] }; } } as any;
    const oldResult = await handleRealLibrarySelection(small, { kind: 'select', latestRequest: quote, state: null }, provider, new Date('2026-10-18T12:00:00Z'));
    const newResult = handleGroundedRealLibrarySelection(large, { latestRequest: quote, selection: selection('replace',quote,selector), state: null }, new Date('2026-10-18T12:00:00Z'));
    expect((oldResult.body as any).selection.postIds).toEqual(data(newResult).selection.postIds);
    const otherAccount = await loadLargeRealLibrarySnapshot(makeDatabase(40).prisma, 'different-account', creatorId);
    expect(otherAccount.catalogRevision).not.toBe(large.catalogRevision);
    const otherCreator = await loadLargeRealLibrarySnapshot(makeDatabase(40, {}, 'different-creator').prisma, accountId, 'different-creator');
    expect(otherCreator.catalogRevision).not.toBe(large.catalogRevision);
  });

  it('refuses whole over-limit snapshots and over-limit selector requests', async () => {
    await expect(loadLargeRealLibrarySnapshot(makeDatabase(1025).prisma, accountId, creatorId)).rejects.toMatchObject({ code: 'catalog_too_large' });
    await expect(loadLargeRealLibrarySnapshot(makeDatabase(1, { mediaPerPost: 4097 }).prisma, accountId, creatorId)).rejects.toMatchObject({ code: 'catalog_too_large' });
    await expect(loadLargeRealLibrarySnapshot(makeDatabase(1, { hugeDescription: 'x'.repeat(16 * 1024 * 1024 + 1) }).prisma, accountId, creatorId)).rejects.toMatchObject({ code: 'catalog_too_large' });
    await expect(loadLargeRealLibrarySnapshot(makeDatabase(1001, { foreignOwner: true }).prisma, accountId, creatorId)).rejects.toMatchObject({ code: 'catalog_incomplete' });
    const invalid = handleGroundedRealLibrarySelection({ scope: 'real_library_retrieval', catalogRevision: 'r', complete: true, supportedFields: [], timezone: 'Europe/London', posts: [] }, { latestRequest: 'x'.repeat(4001), selection: { mode: 'preserve', requestQuote: null, selector: null }, state: null });
    expect(invalid.status).toBe(400);
    const quote = 'a'.repeat(1800);
    const quoteOverflow = validateGroundedRealLibrarySelectionRequest({ latestRequest: quote, state: null, selection: selection('replace', quote, { base: 'catalog', all: Array.from({ length: 5 }, () => text('tag','a',quote)), any: [], none: [] }) });
    expect(quoteOverflow).toContain('8 KiB');
    const cancelled = makeDatabase(1);
    await expect(loadLargeRealLibrarySnapshot(cancelled.prisma, accountId, creatorId, AbortSignal.abort())).rejects.toThrow('grounded_selection_cancelled');
    expect(cancelled.postQueries).toBe(0);
  });

  it('authenticates read-only and enforces the dedicated 256 KiB parser before route work', async () => {
    const app = express(); mountGroundedLibrarySelectionBodyParser(app); app.use(express.json({ limit: '100kb' }));
    let loads = 0, authenticates = 0;
    registerGroundedLibrarySelectionRoute(app, { development: true, traceId: () => 'test-trace', authenticateCreator: async (_req, opts) => { authenticates++; expect(opts).toEqual({ readonlySession: true }); throw new RelayAuthError(403, 'not_creator', 'Creator access required.'); }, loadSnapshot: async () => { loads++; throw new Error('should not load'); } });
    const small = { latestRequest: 'x', selection: { mode: 'preserve', requestQuote: null, selector: null }, state: null };
    await request(app).post(GROUNDED_LIBRARY_SELECTION_PATH).send(small).expect(403);
    await request(app).post(GROUNDED_LIBRARY_SELECTION_PATH).set('Content-Type','application/json').send(JSON.stringify({ ...small, padding: 'x'.repeat(270_000) })).expect(413);
    expect(authenticates).toBe(1); expect(loads).toBe(0);
  });
});
