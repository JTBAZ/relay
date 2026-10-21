import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { evaluateEditorCorpus, type EditorCorpus } from './helpers/gallery-editor-evaluation.js';

const corpus = JSON.parse(readFileSync(new URL('./fixtures/gallery-editor-ce02.json', import.meta.url), 'utf8')) as EditorCorpus;

describe('CE02 execution harness (not a semantic evaluator)', () => {
  it('consumes both fixed partitions without feeding expected labels to the provider', async () => {
    const prompts: string[] = [];
    const setup = vi.fn(async (fixture: unknown) => {
      expect(fixture).not.toHaveProperty('expected');
      return {
        provider: { respond: async (request: { input: Array<Record<string, unknown>> }) => {
          prompts.push(JSON.stringify(request.input));
          return { output: [{ type: 'message', content: [{ type: 'output_text', text: '{"message":"Mock execution only","actions":[]}' }] }] };
        } },
        readTools: async () => ({ data: {} }),
      };
    });
    const development = await evaluateEditorCorpus(corpus, 'development', setup);
    const heldout = await evaluateEditorCorpus(corpus, 'heldout', setup);
    expect(development.records).toHaveLength(40);
    expect(heldout.records).toHaveLength(20);
    expect(development.semanticAccuracy).toBeNull();
    expect(heldout.records.every(record => record.quality === 'unreviewed')).toBe(true);
    expect([...development.records, ...heldout.records].every(record => record.execution === 'completed')).toBe(true);
    expect(prompts.every(prompt => !prompt.includes('semanticLabels'))).toBe(true);
    expect(setup).toHaveBeenCalledTimes(60);
  });
});
