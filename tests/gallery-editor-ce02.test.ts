import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const corpus = JSON.parse(readFileSync(new URL('./fixtures/gallery-editor-ce02.json', import.meta.url), 'utf8'));
const entities = [...corpus.catalog.posts, ...corpus.catalog.works, ...corpus.catalog.series, ...corpus.catalog.collections, ...corpus.catalog.externalSystems];
const entityIds = new Set(entities.map(({ id }) => id));
const validOutcomes = new Set(['actions', 'answer', 'blocked', 'clarification']);

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
      for (const action of item.expected.actions) {
        expect(typeof action.kind, item.id).toBe('string');
        expect(typeof action.targetId, item.id).toBe('string');
        expect(entityIds.has(action.targetId) || action.targetId === 's-field-new', `${item.id}: ${action.targetId}`).toBe(true);
      }
    }
  });

  it('preserves catalog link structure and all required evaluation dimensions', () => {
    expect(corpus.catalog.works.find(({ id }) => id === 'w-full-1').linkedPostIds).toEqual(['p-full-1', 'p-teaser-1']);
    expect(corpus.catalog.series.find(({ id }) => id === 's-field').workIds).toEqual(['w-part-a', 'w-part-b']);
    expect(corpus.catalog.posts.find(({ id }) => id === 'p-custom').title).toBe('Blue hour on the inlet');
    expect(corpus.catalog.pagination.nextPagePostIds.length).toBeGreaterThan(0);
    expect(corpus.catalog.externalSystems.find(({ id }) => id === 'patreon-post-77').mutableByEditor).toBe(false);
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
