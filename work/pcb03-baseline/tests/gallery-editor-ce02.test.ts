import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateActions } from '../src/gallery-editor/action-validation.js';

type FixtureAction = { kind: string; targetId: string; add?: string[]; remove?: string[]; [key: string]: unknown };
type CE02Case = {
  id: string;
  split: 'development' | 'heldout';
  family: string;
  turns: Array<{ role: 'user' | 'assistant'; text: string }>;
  context: { selectedPostIds: string[]; activeCollectionId?: string; loadedPostIds: string[]; nextPagePostIds: string[]; existingCart: FixtureAction[] };
  expected: { outcome: 'actions' | 'answer' | 'blocked' | 'clarification'; actions: FixtureAction[]; targetIds: string[]; semanticLabels: string[]; question?: string; reason?: string; [key: string]: unknown };
};
type CE02Corpus = {
  schemaVersion: string;
  catalog: {
    posts: Array<{ id: string; title: string; workId: string; mediaIds: string[]; tags: string[] }>;
    works: Array<{ id: string; title: string; linkedPostIds: string[]; seriesId: string | null }>;
    series: Array<{ id: string; title: string; workIds: string[] }>;
    collections: Array<{ id: string; title: string; postIds: string[] }>;
    externalSystems: Array<{ id: string; system: string; title: string; mutableByEditor: boolean }>;
    pagination: { loadedPostIds: string[]; nextPagePostIds: string[]; totalPostCount: number };
    visionFixtures: Array<{ id: string; mediaId: string; imageRef: string; observation: string; isGroundTruthForImageContent: boolean }>;
  };
  cases: CE02Case[];
};

const corpus = JSON.parse(readFileSync(new URL('./fixtures/gallery-editor-ce02.json', import.meta.url), 'utf8')) as CE02Corpus;
const entities = [...corpus.catalog.posts, ...corpus.catalog.works, ...corpus.catalog.series, ...corpus.catalog.collections, ...corpus.catalog.externalSystems];
const entityIds = new Set(entities.map(({ id }) => id));
const mediaIds = new Set(corpus.catalog.posts.flatMap(({ mediaIds }) => mediaIds));
const validOutcomes = new Set(['actions', 'answer', 'blocked', 'clarification']);

function nativeAction(action: FixtureAction, index: number) {
  const { targetId, ...rest } = action;
  const fields: Record<string, string> = {
    rename_post: 'postId', inherit_post_title: 'postId', source_post_title: 'postId', set_description: 'postId', tags: 'postId', reorder_media: 'postId',
    rename_work: 'workId', unlink_series_work: 'workId', rename_series: 'seriesId', create_series: 'seriesId', link_series_work: 'seriesId',
    create_collection: 'collectionId', rename_collection: 'collectionId', collection_membership: 'collectionId', reorder_collection: 'collectionId', link_work_post: 'workId',
  };
  const field = fields[String(action.kind)];
  if (!field || typeof targetId !== 'string') throw new Error('Unknown CE02 action target.');
  return { ...rest, id: `expected-${index}`, [field]: targetId };
}

describe('CE02 conversational Library editor corpus', () => {
  it('contains the requested fixed development and heldout partitions', () => {
    expect(corpus.schemaVersion).toBe('ce02.v1');
    expect(corpus.cases).toHaveLength(60);
    expect(corpus.cases.filter((item) => item.split === 'development')).toHaveLength(40);
    expect(corpus.cases.filter((item) => item.split === 'heldout')).toHaveLength(20);
    expect(new Set(corpus.cases.map((item) => item.id)).size).toBe(60);
  });

  it('validates case shape, outcomes, and catalog references without interpreting language', () => {
    for (const item of corpus.cases) {
      expect(item.turns.length, item.id).toBeGreaterThan(0);
      expect(item.turns.every((turn) => ['user', 'assistant'].includes(turn.role) && typeof turn.text === 'string'), item.id).toBe(true);
      expect(validOutcomes.has(item.expected.outcome), item.id).toBe(true);
      expect(Array.isArray(item.expected.actions), item.id).toBe(true);
      expect(Array.isArray(item.expected.targetIds), item.id).toBe(true);
      expect(Array.isArray(item.expected.semanticLabels), item.id).toBe(true);
      if (item.expected.outcome === 'clarification') expect(item.expected.question, item.id).toBeTruthy();
      if (item.expected.outcome === 'blocked') expect(item.expected.reason, item.id).toBeTruthy();
      for (const targetId of item.expected.targetIds) expect(entityIds.has(targetId) || targetId === 's-field-new', `${item.id}: ${targetId}`).toBe(true);
      const checkedActions = validateActions(item.expected.actions.map((action, index) => nativeAction(action, index)));
      expect(checkedActions).toHaveLength(item.expected.actions.length);
      const expectedNative = item.expected.actions.map((action, index) => nativeAction(action, index));
      const expectedTargets = new Set(item.expected.targetIds);
      for (const action of expectedNative) {
        for (const key of ['postId', 'workId', 'seriesId', 'collectionId']) {
          if (typeof action[key] === 'string') {
            expect(entityIds.has(action[key]) || action[key] === 's-field-new', `${item.id}: ${String(action[key])}`).toBe(true);
            expect(expectedTargets.has(action[key]), `${item.id}: missing action reference ${String(action[key])}`).toBe(true);
          }
        }
        for (const key of ['postIds', 'mediaIds']) {
          if (Array.isArray(action[key])) for (const id of action[key]) {
            expect(key === 'postIds' ? entityIds.has(id) : mediaIds.has(id), `${item.id}: ${String(id)}`).toBe(true);
            if (key === 'postIds') expect(expectedTargets.has(id), `${item.id}: missing action reference ${String(id)}`).toBe(true);
          }
        }
        if (typeof action.mediaId === 'string') expect(mediaIds.has(action.mediaId), `${item.id}: ${action.mediaId}`).toBe(true);
      }
      for (const action of item.expected.actions) {
        expect(typeof action.kind, item.id).toBe('string');
        expect(typeof action.targetId, item.id).toBe('string');
        expect(entityIds.has(action.targetId) || action.targetId === 's-field-new', `${item.id}: ${action.targetId}`).toBe(true);
      }
      const currentActions = item.context.existingCart.map((raw, index) => nativeAction(raw, index));
      expect(validateActions(currentActions)).toHaveLength(item.context.existingCart.length);
      if (item.expected.outcome === 'actions') {
        for (const prior of item.context.existingCart) {
          const retained = item.expected.actions.find((action) => action.kind === prior.kind && action.targetId === prior.targetId);
          expect(retained, `${item.id}: retained ${prior.targetId}`).toBeTruthy();
          if (!retained) throw new Error(`${item.id}: missing retained action.`);
          if (prior.kind === 'tags') {
            expect(retained.add).toEqual(expect.arrayContaining(prior.add ?? []));
            expect(retained.remove).toEqual(expect.arrayContaining(prior.remove ?? []));
          } else {
            for (const [key, value] of Object.entries(prior)) if (key !== 'targetId' && key !== 'kind') expect(retained[key]).toEqual(value);
          }
        }
      }
    }
  });

  it('preserves catalog link structure and all required evaluation dimensions', () => {
    expect(corpus.catalog.works.find(({ id }) => id === 'w-full-1')!.linkedPostIds).toEqual(['p-full-1', 'p-teaser-1']);
    expect(corpus.catalog.series.find(({ id }) => id === 's-field')!.workIds).toEqual(['w-part-a', 'w-part-b']);
    expect(corpus.catalog.posts.find(({ id }) => id === 'p-custom')!.title).toBe('Blue hour on the inlet');
    expect(corpus.catalog.pagination.nextPagePostIds.length).toBeGreaterThan(0);
    expect(corpus.catalog.externalSystems.find(({ id }) => id === 'patreon-post-77')!.mutableByEditor).toBe(false);
    const required = ['metadata_paraphrase', 'iterative_add_remove', 'manual_cart_preservation', 'rename_scope', 'ambiguous_scope', 'external_patron', 'injection', 'vision', 'pagination', 'title_exception', 'metadata_visual_boundary', 'series_link'];
    const families = new Set(corpus.cases.map((item) => item.family));
    for (const family of required) expect(families.has(family), family).toBe(true);
    for (const fixture of corpus.catalog.visionFixtures) {
      expect(fixture.observation).toBeTruthy();
      expect(fixture.isGroundTruthForImageContent).toBe(false);
    }
    expect(corpus.cases.filter((item) => item.family === 'vision').every((item) => item.expected.visionFixtureId)).toBe(true);
  });
});
