import { runEditorIntent, type EditorReadTools, type IntentResult } from '../../src/gallery-editor/intent.js';
import type { EditorProvider } from '../../src/gallery-editor/provider.js';
import { validateActions } from '../../src/gallery-editor/action-validation.js';
import { EditorError, RENAME_NOTICE, type EditorMessage, type EditorSession } from '../../src/gallery-editor/types.js';

export interface CorpusCase {
  id: string;
  split: 'development' | 'heldout';
  family: string;
  turns: EditorMessage[];
  context: { selectedPostIds: string[]; activeCollectionId?: string; existingCart: Array<Record<string, unknown>>; [key: string]: unknown };
  expected: Record<string, unknown>;
}
export interface EditorCorpus { schemaVersion: string; catalog: Record<string, unknown>; cases: CorpusCase[] }
export interface EvaluationRecord { caseId: string; split: string; execution: 'completed' | 'failed'; result?: IntentResult; errorCode?: string; quality: 'unreviewed' }

/** Human-authored answers never reach the provider, read adapter, or conversation history. */
export async function evaluateEditorCorpus(
  corpus: EditorCorpus,
  split: 'development' | 'heldout',
  setup: (fixture: { id: string; family: string; catalog: Record<string, unknown>; context: CorpusCase['context']; split: CorpusCase['split'] }) => Promise<{ provider: EditorProvider; readTools: EditorReadTools }>,
): Promise<{ mode: 'execution-only'; semanticAccuracy: null; records: EvaluationRecord[] }> {
  if (corpus.schemaVersion !== 'ce02.v1') throw new Error('Unsupported editor corpus version.');
  const records: EvaluationRecord[] = [];
  for (const item of corpus.cases.filter(item => item.split === split)) {
    try {
      const lastTurn = item.turns.at(-1);
      if (!lastTurn || lastTurn.role !== 'user') throw new Error('Corpus case must end with a user turn.');
      const actions = validateActions(item.context.existingCart.map((raw, index) => {
        const { targetId, source: _source, ...action } = raw;
        // CE02 targetId is a fixture-facing reference. Normalize it to the native field
        // for that action kind before applying the same strict contract as production.
        const targetField: Record<string, string> = {
          rename_post: 'postId', inherit_post_title: 'postId', source_post_title: 'postId',
          set_description: 'postId', tags: 'postId', reorder_media: 'postId',
          rename_work: 'workId', unlink_series_work: 'workId',
          rename_series: 'seriesId', create_series: 'seriesId', link_series_work: 'seriesId',
          create_collection: 'collectionId', rename_collection: 'collectionId',
          collection_membership: 'collectionId', reorder_collection: 'collectionId',
          link_work_post: 'workId',
        };
        const field = targetField[String(action.kind)];
        if (!field || typeof targetId !== 'string') throw new Error('Invalid fixture cart target.');
        return { ...action, id: `fixture-${index}`, [field]: targetId };
      }));
      const session: EditorSession = {
        id: `eval-${item.id}`, creatorId: 'evaluation-owner', revision: 1,
        context: { selectedPostIds: [...item.context.selectedPostIds], ...(item.context.activeCollectionId ? { activeCollectionId: item.context.activeCollectionId } : {}) },
        messages: structuredClone(item.turns.slice(0, -1)),
        cart: { revision: 1, actions, items: [], dependencies: {}, conflicts: [], notice: RENAME_NOTICE },
      };
      const adapters = await setup(structuredClone({ id: item.id, family: item.family, catalog: corpus.catalog, context: item.context, split: item.split }));
      const result = await runEditorIntent(session, lastTurn.text, adapters.provider, adapters.readTools);
      records.push({ caseId: item.id, split, execution: 'completed', result, quality: 'unreviewed' });
    } catch (error) {
      records.push({ caseId: item.id, split, execution: 'failed', errorCode: error instanceof EditorError ? error.code : 'evaluation_setup_failed', quality: 'unreviewed' });
    }
  }
  return { mode: 'execution-only', semanticAccuracy: null, records };
}
