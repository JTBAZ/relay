import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { registerRealLibrarySelectionCatalogRoute } from '../../src/editor-bench/real-library-selection-routes.js';
import { RealLibraryCatalogError, loadRealLibraryCatalog, type RealLibraryCatalog } from '../../src/editor-bench/library-selection-catalog.js';
import { handleRealLibrarySelection, REAL_LIBRARY_MODEL_RESPONSE_SCHEMA, type RealRefinementState } from '../../src/editor-bench/real-library-selection.js';
import { resolveDatePredicate, type MetadataSelection } from '../../src/editor-bench/selector.js';
import { currentBenchRequestClock } from '../../src/editor-bench/routing.js';
import type { EditorProvider } from '../../src/gallery-editor/provider.js';
import { RelayAuthError } from '../../src/identity/relay-auth-error.js';

const catalog: RealLibraryCatalog = {
  scope: 'real_library', catalogRevision: 'rev-a', complete: true, supportedFields: ['post_id','work_id','series_id','collection_id','tag','publish_state','title','description','created_date','published_date','media_type','media_role','processing_status'], timezone: 'Europe/London',
  posts: [
    { postId: 'post_a', title: 'Aurora Study', descriptionText: 'blue dawn', tags: ['character'], createdAt: '2026-09-10', publishedAt: '2026-09-11', publishState: 'published', workId: 'work_a', workTitle: 'Aurora', seriesId: 'series_a', seriesTitle: 'Aurora series', collectionIds: ['collection_a'], collections: [{ id: 'collection_a', title: 'Character set' }], media: [{ id: 'media_a', mimeType: 'image/png', role: 'main', processingStatus: 'READY' }] },
    { postId: 'post_b', title: 'Tide Study', descriptionText: 'blue coast', tags: ['coast'], createdAt: '2026-10-02', publishedAt: null, publishState: 'draft', workId: 'work_b', workTitle: 'Tide', seriesId: null, seriesTitle: null, collectionIds: [], collections: [], media: [{ id: 'media_b', mimeType: 'image/jpeg', role: 'teaser', processingStatus: 'READY' }] },
    { postId: 'post_c', title: 'Sketch', descriptionText: 'rough', tags: ['teaser'], createdAt: '2026-09-30', publishedAt: '2026-10-01', publishState: 'published', workId: 'work_c', workTitle: 'Sketch', seriesId: null, seriesTitle: null, collectionIds: [], collections: [], media: [] },
  ]
};
const state = (selectedPostIds: string[] = [], excludedPostIds: string[] = []): RealRefinementState => ({ v: 1, scope: 'real_library', catalogRevision: catalog.catalogRevision, selectedPostIds, excludedPostIds });
const p = (field: string, value: string, requestQuote: string) => ({ field, value, requestQuote });
function model(value: unknown, check?: (schema: unknown) => void): EditorProvider {
  return { async respond(request) { check?.(request.responseSchema); return { output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }], usage: { calls: 1, inputTokens: 20, outputTokens: 10, costUsd: 0.0001 } }; } };
}
const result = (selection: MetadataSelection) => ({ result: { kind: 'selection', selection, intent: null } });
function fakePrisma(postCount: number, mediaCount: number, tags: string[] = [], presentation?: Record<string, unknown>) {
  const rows = Array.from({ length: postCount }, (_, i) => ({ id: `real_post_${String(i).padStart(2,'0')}`, createdAt: new Date(`2026-09-${String(10 + (i % 18)).padStart(2,'0')}T12:00:00Z`), publishState: 'published', versions: [{ id: `version_${i}`, publishedAt: new Date('2026-09-10T12:00:00Z'), mediaIds: Array.from({ length: mediaCount }, (_, m) => `media_${i}_${m}`) }] }));
  const prisma = {
    post: { async findMany(args: any) {
      if (args.where?.upstreamStatus) return rows;
      if (args.select?.presentation) return rows.map(row => ({ id: row.id, versions: [{ title: 'Original title' }], presentation: null, creativeWorkMember: null }));
      return rows.map(row => ({ id: row.id, versions: [{ title: 'Original title', description: '<p>Old&nbsp;description</p>', mediaIds: row.versions[0]!.mediaIds, tagIds: tags }] }));
    } },
    postPresentation: { async findMany() { return presentation ? [{ postId: rows[0]!.id, creatorId: 'creator', relayDescription: '', relayTitle: null, ...presentation }] : []; } },
    postOverride: { async findMany() { return [{ postId: rows[0]!.id, removeTagIds: ['old_tag'], addTagIds: ['new_tag'] }]; } },
    mediaAsset: { async findMany() { return Array.from({ length: mediaCount }, (_, i) => ({ id: `media_0_${i}`, primaryPostId: rows[0]!.id, postIds: [], currentMimeType: 'image/png', currentRole: 'main', processingStatus: 'READY' })); } },
    creativeWorkMember: { async findMany() { return []; } },
    collectionPost: { async findMany() { return []; } },
  };
  return { prisma: prisma as any, rows };
}

describe('real Library selection snapshot and refinement', () => {
  it('supports grounded dates, descriptions, relations, sticky exclusions, OR-add, and removal exceptions', async () => {
    const latest = 'Select character posts with blue descriptions, excluding teasers';
    const first = await handleRealLibrarySelection(catalog, { kind: 'select', latestRequest: latest, state: null }, model(result({ mode: 'replace', requestQuote: latest, selector: { base: 'catalog', all: [p('tag','character','character'), p('description','blue','blue')], any: [], none: [p('tag','teaser','teasers')] } })), new Date('2026-10-18T12:00:00Z'));
    expect(first.body).toMatchObject({ status: 'selected', selection: { postIds: ['post_a'] }, refinementState: { selectedPostIds: ['post_a'], excludedPostIds: ['post_c'] } });
    const addRequest = 'Also add series Aurora or descriptions containing coast';
    const union = await handleRealLibrarySelection(catalog, { kind: 'select', latestRequest: addRequest, state: (first.body as any).refinementState }, model(result({ mode: 'add', requestQuote: addRequest, selector: { base: 'catalog', all: [], any: [p('series_id','series_a','series Aurora'), p('description','coast','coast')], none: [] } })), new Date('2026-10-18T12:00:00Z'));
    expect(union.body).toMatchObject({ selection: { postIds: ['post_a','post_b'] }, refinementState: { selectedPostIds: ['post_a','post_b'], excludedPostIds: ['post_c'] } });
    const followup = 'Also add the full Aurora series and every piece whose description mentions blue.';
    const rejectedAdd = await handleRealLibrarySelection(catalog, { kind: 'select', latestRequest: followup, state: (union.body as any).refinementState }, model(result({ mode: 'add', requestQuote: followup, selector: { base: 'selection', all: [], any: [p('series_id','series_a','Aurora series'), p('description','blue','description mentions blue')], none: [] } })));
    expect(rejectedAdd.body).toMatchObject({ status: 'clarification', selection: { postIds: ['post_a','post_b'], changed: false }, refinementState: (union.body as any).refinementState });
    const addVariant = (REAL_LIBRARY_MODEL_RESPONSE_SCHEMA as any).properties.result.anyOf[0].properties.selection.anyOf.find((variant: any) => variant.properties.mode.enum[0] === 'add');
    expect(addVariant.properties.selector.properties.base.enum).toEqual(['catalog']);
    const removeRequest = 'Remove blue descriptions except character posts';
    const removed = await handleRealLibrarySelection(catalog, { kind: 'select', latestRequest: removeRequest, state: (union.body as any).refinementState }, model(result({ mode: 'remove', requestQuote: removeRequest, selector: { base: 'catalog', all: [p('description','blue','blue')], any: [], none: [p('tag','character','character')] } })), new Date('2026-10-18T12:00:00Z'));
    expect(removed.body).toMatchObject({ selection: { postIds: ['post_a'] }, refinementState: { selectedPostIds: ['post_a'], excludedPostIds: ['post_b','post_c'] } });

    const dateRequest = 'Select published posts from last month with blue descriptions';
    const dated = await handleRealLibrarySelection(catalog, { kind: 'select', latestRequest: dateRequest, state: null }, model(result({ mode: 'replace', requestQuote: dateRequest, selector: { base: 'catalog', all: [{ field: 'published_date', op: 'in_month', value: 'last_month', requestQuote: 'last month' }, p('publish_state','published','published'), p('description','blue','blue')], any: [], none: [] } })), new Date('2026-10-18T12:00:00Z'));
    expect(dated.body).toMatchObject({ selection: { postIds: ['post_a'] } });
    const narrow = await handleRealLibrarySelection(catalog, { kind: 'select', latestRequest: 'Keep selected descriptions containing no-match', state: (dated.body as any).refinementState }, model(result({ mode: 'replace', requestQuote: 'Keep selected descriptions containing no-match', selector: { base: 'selection', all: [p('description','no-match','no-match')], any: [], none: [] } })));
    expect(narrow.body).toMatchObject({ status: 'selected', selection: { postIds: [], changed: true }, refinementState: { selectedPostIds: [] } });
  });

  it('enforces state revisions, model-free reset/toggle, empty-date semantics, and strict object-root schema', async () => {
    let calls = 0;
    const checkSchema = (schema: unknown) => { calls++; expect(schema).toHaveProperty('type', 'object'); expect(schema).not.toHaveProperty('anyOf'); const addVariant = (schema as any).properties.result.anyOf[0].properties.selection.anyOf.find((variant: any) => variant.properties.mode.enum[0] === 'add'); expect(addVariant.properties.selector.properties.base.enum).toEqual(['catalog']); };
    const stale = await handleRealLibrarySelection(catalog, { kind: 'select', latestRequest: 'Select blue', state: { ...state(), catalogRevision: 'old' } }, model(result({ mode: 'replace', requestQuote: 'Select blue', selector: { base: 'catalog', all: [p('description','blue','blue')], any: [], none: [] } }), checkSchema));
    expect(stale.status).toBe(409); expect(calls).toBe(0);
    const reset = await handleRealLibrarySelection(catalog, { kind: 'reset', catalogRevision: 'rev-a' }, null);
    expect(reset.body).toMatchObject({ status: 'selected', selection: { postIds: [], changed: true } });
    const toggled = await handleRealLibrarySelection(catalog, { kind: 'toggle', catalogRevision: 'rev-a', postId: 'post_a', selected: true, state: state() }, null);
    expect(toggled.body).toMatchObject({ selection: { postIds: ['post_a'], changed: true }, refinementState: { selectedPostIds: ['post_a'] } });
    const date = resolveDatePredicate({ field: 'published_date', op: 'in_month', value: 'last_month', requestQuote: 'last month' }, currentBenchRequestClock(new Date('2026-10-18T12:00:00Z')));
    expect(date?.resolvedValue).toBe('2026-09');
  });

  it('refuses unsupported fields and provider failures without changing accepted IDs', async () => {
    const prior = state(['post_a'], ['post_c']);
    const unsupported = await handleRealLibrarySelection(catalog, { kind: 'select', latestRequest: 'Select sketch stage posts', state: prior }, model(result({ mode: 'replace', requestQuote: 'sketch stage posts', selector: { base: 'selection', all: [p('stage','sketch','sketch')], any: [], none: [] } })));
    expect(unsupported.body).toMatchObject({ status: 'clarification', selection: { postIds: ['post_a'], changed: false }, refinementState: prior });
    const failed = await handleRealLibrarySelection(catalog, { kind: 'select', latestRequest: 'Add coast posts', state: prior }, { async respond() { throw new Error('provider error'); } });
    expect(failed.body).toMatchObject({ status: 'clarification', selection: { postIds: ['post_a'], changed: false }, refinementState: prior });
    const aborted = await handleRealLibrarySelection(catalog, { kind: 'select', latestRequest: 'Add coast posts', state: prior }, model({}), new Date(), AbortSignal.abort());
    expect(aborted.status).toBe(499);
  });
});

describe('real Library catalog bounds and auth route', () => {
  it('refuses a 41st active post before resolving any metadata', async () => {
    let mediaQueries = 0;
    const prisma = {
      post: { async findMany() { return Array.from({ length: 41 }, (_, i) => ({ id: `post_${i}`, createdAt: new Date(), publishState: 'published', versions: [{ id: `v_${i}`, publishedAt: new Date(), mediaIds: [] }] })); } },
      mediaAsset: { async findMany() { mediaQueries += 1; return []; } },
    } as any;
    await expect(loadRealLibraryCatalog(prisma, 'account', 'creator')).rejects.toMatchObject({ code: 'catalog_too_large' });
    expect(mediaQueries).toBe(0);
  });

  it('uses cleared effective descriptions and tag deltas, and refuses media and serialized-catalog overflow', async () => {
    const single = fakePrisma(1, 0, ['old_tag','base_tag'], {});
    const loaded = await loadRealLibraryCatalog(single.prisma, 'account', 'creator');
    expect(loaded.posts[0]).toMatchObject({ descriptionText: '', tags: ['base_tag','new_tag'], media: [] });

    const tooMuchMedia = fakePrisma(1, 81, ['tag']);
    await expect(loadRealLibraryCatalog(tooMuchMedia.prisma, 'account', 'creator')).rejects.toMatchObject({ code: 'catalog_too_large' });

    const hugeTags = Array.from({ length: 40 }, (_, i) => `tag_${i}_${'x'.repeat(180)}`);
    const tooManyBytes = fakePrisma(40, 0, hugeTags);
    await expect(loadRealLibraryCatalog(tooManyBytes.prisma, 'account', 'creator')).rejects.toMatchObject({ code: 'catalog_too_large' });
  });

  it('preserves thrown readonly auth status and does not call the catalog loader', async () => {
    const app = express(); let loads = 0;
    registerRealLibrarySelectionCatalogRoute(app, { development: true, traceId: () => 'trace', authenticateCreator: async () => { throw new RelayAuthError(403, 'FORBIDDEN', 'Creator access required.'); }, loadCatalog: async () => { loads++; return catalog; } });
    const response = await request(app).get('/api/v1/editor-bench/library-selection/catalog');
    expect(response.status).toBe(403); expect(response.body.error.code).toBe('FORBIDDEN'); expect(loads).toBe(0);
  });
});
