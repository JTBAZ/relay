import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateActions } from '../src/gallery-editor/action-validation.js';

type FixtureAction = { kind: string; targetId: string; [key: string]: unknown };
type FixtureCase = {
  id: string;
  split: 'development' | 'heldout';
  family: string;
  turns: Array<{ role: 'user' | 'assistant'; text: string }>;
  context: { selectedPostIds: string[]; selectedMediaIds?: string[]; loadedPostIds: string[]; existingCart: FixtureAction[] };
  expected: {
    outcome: 'actions' | 'answer' | 'blocked' | 'clarification';
    actions: FixtureAction[];
    targetIds: string[];
    semanticLabels: string[];
    visionFixtureId?: string;
    visualEvidenceStatus?: string;
    visualFacts?: string[];
    [key: string]: unknown;
  };
};
type Corpus = {
  schemaVersion: string;
  catalog: {
    posts: Array<{ id: string; title: string; titleMode: 'source' | 'inherit_work' | 'custom'; mediaIds: string[] }>;
    works: Array<{ id: string; title: string; linkedPostIds: string[] }>;
    series: Array<{ id: string; workIds: string[] }>;
    collections: Array<{ id: string; postIds: string[] }>;
    externalSystems: Array<{ id: string; mutableByEditor: boolean }>;
    visionFixtures: Array<{ id: string; mediaId: string; imageRef: string }>;
  };
  cases: FixtureCase[];
};

const corpus = JSON.parse(readFileSync(new URL('./fixtures/gallery-editor-ce02-v2.json', import.meta.url), 'utf8')) as Corpus;
const legacyCases = (JSON.parse(readFileSync(new URL('./fixtures/gallery-editor-ce02.json', import.meta.url), 'utf8')) as { cases: FixtureCase[] }).cases;
const localImageMap = new URL('./fixtures/gallery-editor-visual/images.json', import.meta.url);
const fallbackImageMap = new URL('../../relay/tests/fixtures/gallery-editor-visual/images.json', import.meta.url);
const imageMap = JSON.parse(readFileSync(existsSync(localImageMap) ? localImageMap : fallbackImageMap, 'utf8')) as Record<string, string>;
const entities = [...corpus.catalog.posts, ...corpus.catalog.works, ...corpus.catalog.series, ...corpus.catalog.collections, ...corpus.catalog.externalSystems];
const entityIds = new Set(entities.map(({ id }) => id));
const mediaIds = new Set(corpus.catalog.posts.flatMap(({ mediaIds }) => mediaIds));

function nativeAction(action: FixtureAction, index: number) {
  const { targetId, ...rest } = action;
  const fieldByKind: Record<string, string> = {
    rename_post: 'postId', inherit_post_title: 'postId', source_post_title: 'postId', set_description: 'postId', tags: 'postId', reorder_media: 'postId',
    rename_work: 'workId', unlink_series_work: 'workId', rename_series: 'seriesId', create_series: 'seriesId', link_series_work: 'seriesId',
    create_collection: 'collectionId', rename_collection: 'collectionId', collection_membership: 'collectionId', reorder_collection: 'collectionId', link_work_post: 'workId',
  };
  const field = fieldByKind[action.kind];
  if (!field) throw new Error(`Unknown CE02 v2 action kind: ${action.kind}`);
  return { ...rest, id: `expected-${index}`, [field]: targetId };
}

describe('CE02 v2 corpus contract', () => {
  it('has fixed, disjoint development and heldout partitions', () => {
    expect(corpus.schemaVersion).toBe('ce02.v2');
    expect(corpus.cases).toHaveLength(60);
    expect(corpus.cases.filter(item => item.split === 'development')).toHaveLength(40);
    expect(corpus.cases.filter(item => item.split === 'heldout')).toHaveLength(20);
    expect(new Set(corpus.cases.map(item => item.id)).size).toBe(60);
    expect(corpus.cases.filter(item => item.split === 'development').map(item => item.id)).toEqual(Array.from({ length: 40 }, (_, index) => `v2-dev${String(index + 1).padStart(3, '0')}`));
    expect(corpus.cases.filter(item => item.split === 'heldout').map(item => item.id)).toEqual(Array.from({ length: 20 }, (_, index) => `v2-held${String(index + 1).padStart(3, '0')}`));
    for (let index = 0; index < 35; index += 1) {
      const preserved = structuredClone(legacyCases[index]);
      preserved.id = `v2-dev${String(index + 1).padStart(3, '0')}`;
      preserved.split = 'development';
      expect(corpus.cases[index], `metadata case ${index + 1} changed`).toEqual(preserved);
    }
  });

  it('uses supported action shapes, real catalog references, and preserves complete existing carts', () => {
    for (const item of corpus.cases) {
      expect(item.turns.length, item.id).toBeGreaterThan(0);
      expect(item.turns.every(turn => ['user', 'assistant'].includes(turn.role) && turn.text.trim().length > 0), item.id).toBe(true);
      expect(item.context.selectedPostIds.every(id => entityIds.has(id)), item.id).toBe(true);
      expect((item.context.selectedMediaIds ?? []).every(id => mediaIds.has(id)), item.id).toBe(true);
      expect(item.context.loadedPostIds.every(id => corpus.catalog.posts.some(post => post.id === id)), item.id).toBe(true);
      expect(item.expected.targetIds.every(id => entityIds.has(id)), item.id).toBe(true);

      const nativeExpected = item.expected.actions.map(nativeAction);
      expect(validateActions(nativeExpected), item.id).toHaveLength(item.expected.actions.length);
      for (const action of item.expected.actions) {
        expect(entityIds.has(action.targetId), `${item.id}: ${action.targetId}`).toBe(true);
        expect(item.expected.targetIds, `${item.id}: targetIds omits ${action.targetId}`).toContain(action.targetId);
        for (const key of ['postIds', 'mediaIds']) {
          const refs = action[key];
          if (Array.isArray(refs)) for (const ref of refs) expect(key === 'postIds' ? corpus.catalog.posts.some(post => post.id === ref) : mediaIds.has(String(ref)), `${item.id}: ${String(ref)}`).toBe(true);
        }
        if (typeof action.workId === 'string') expect(entityIds.has(action.workId), item.id).toBe(true);
        if (typeof action.mediaId === 'string') expect(mediaIds.has(action.mediaId), `${item.id}: ${action.mediaId}`).toBe(true);
      }
      expect(validateActions(item.context.existingCart.map(nativeAction)), item.id).toHaveLength(item.context.existingCart.length);
      if (item.expected.outcome === 'actions') {
        for (const prior of item.context.existingCart) {
          const retained = item.expected.actions.find(action => action.kind === prior.kind && action.targetId === prior.targetId);
          expect(retained, `${item.id}: dropped existing ${prior.kind} on ${prior.targetId}`).toBeTruthy();
          if (retained) {
            if (prior.kind === 'tags') {
              expect(retained.add, `${item.id}: lost existing added tags`).toEqual(expect.arrayContaining((prior.add as string[] | undefined) ?? []));
              expect(retained.remove, `${item.id}: lost existing removed tags`).toEqual(expect.arrayContaining((prior.remove as string[] | undefined) ?? []));
            } else {
              for (const [key, value] of Object.entries(prior)) if (key !== 'kind' && key !== 'targetId') expect(retained[key], `${item.id}: changed existing ${key}`).toEqual(value);
            }
          }
        }
      }
      if (item.expected.outcome === 'clarification' || item.expected.outcome === 'blocked' || item.expected.outcome === 'answer') expect(item.expected.actions, item.id).toEqual([]);
    }
  });

  it('keeps the linked catalog, limits vision truth to expected labels, and points to actual 256px PNGs', () => {
    expect(corpus.catalog.works.find(work => work.id === 'w-full-1')?.linkedPostIds).toEqual(['p-full-1', 'p-teaser-1']);
    expect(corpus.catalog.series.find(series => series.id === 's-field')?.workIds).toEqual(['w-part-a', 'w-part-b']);
    expect(corpus.catalog.posts.find(post => post.id === 'p-teaser-1')?.titleMode).toBe('source');
    expect(corpus.catalog.posts.find(post => post.id === 'p-teaser-2')?.titleMode).toBe('source');
    const customPost = corpus.catalog.posts.find(post => post.id === 'p-custom');
    expect(customPost?.title).toBe('Blue hour on the inlet');
    expect(customPost?.titleMode).toBe('custom');
    expect(corpus.catalog.externalSystems.find(system => system.id === 'patreon-post-77')?.mutableByEditor).toBe(false);
    expect(corpus.catalog.visionFixtures).toHaveLength(2);
    for (const fixture of corpus.catalog.visionFixtures) {
      expect(mediaIds.has(fixture.mediaId)).toBe(true);
      expect(fixture.imageRef).not.toContain('synthetic://');
      expect(fixture.imageRef.endsWith(`/${imageMap[fixture.id]}`)).toBe(true);
      const localImage = new URL(`./fixtures/${fixture.imageRef}`, import.meta.url);
      const canonicalImage = new URL(`../../relay/tests/fixtures/gallery-editor-visual/${imageMap[fixture.id]}`, import.meta.url);
      const image = readFileSync(existsSync(localImage) ? localImage : canonicalImage);
      expect(image.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      expect(image.readUInt32BE(16)).toBe(256);
      expect(image.readUInt32BE(20)).toBe(256);
      expect(image[24]).toBe(8);
      expect(image[25]).toBe(2);
    }
    expect(corpus.catalog.visionFixtures.every(fixture => !('observation' in fixture))).toBe(true);
    const vision = corpus.cases.filter(item => item.family === 'vision');
    expect(vision).toHaveLength(10);
    expect(vision.every(item => item.expected.visionFixtureId && item.expected.visualEvidenceStatus === 'pixel_fixture' && item.expected.visualFacts?.length), 'vision cases need hidden image truth labels').toBe(true);
    expect(vision.every(item => !/red square|orange bar|dominant blue|dominant green/i.test(item.turns.map(turn => turn.text).join(' '))), 'visual prompts must not leak the answer').toBe(true);
    expect(vision.filter(item => item.split === 'development')).toHaveLength(5);
    expect(vision.filter(item => item.split === 'heldout')).toHaveLength(5);
    expect(vision.filter(item => item.expected.visionFixtureId === 'v-cover-1').every(item => item.expected.visualFacts?.join('|') === 'dominant_blue|red_square_top_left')).toBe(true);
    expect(vision.filter(item => item.expected.visionFixtureId === 'v-cover-2').every(item => item.expected.visualFacts?.join('|') === 'dominant_green|orange_horizontal_bar_center')).toBe(true);
  });
});
