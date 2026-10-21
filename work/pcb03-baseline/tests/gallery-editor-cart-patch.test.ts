import { describe, expect, it } from 'vitest';
import { mergeCartPatch, type CartPatch } from '../src/gallery-editor/cart-patch.js';
import { type ChangeCart, type EditAction, RENAME_NOTICE } from '../src/gallery-editor/types.js';

const rename = (id = 'manual', postId = 'p1', title = 'My title'): EditAction => ({ id, kind: 'rename_post', postId, title });
const cart = (actions: EditAction[] = [rename()]): ChangeCart => ({ origin: 'manual', revision: 3, actions, items: [], dependencies: {}, conflicts: [], notice: RENAME_NOTICE });
const patch = (changes: CartPatch['changes']): CartPatch => ({ revision: 3, changes });
describe('revision-bound cart patches', () => {
  it('preserves unrelated manual edits and their order without mutating or aliasing the input', () => {
    const current = cart([rename(), rename('other', 'p2')]);
    const snapshot = structuredClone(current);
    const result = mergeCartPatch(current, patch([{ kind: 'add', action: { id: 'description', kind: 'set_description', postId: 'p1', description: 'New' } }]));
    expect(result.slice(0, 2)).toEqual(current.actions);
    result[0].id = 'mutated';
    expect(current).toEqual(snapshot);
  });
  it('revises in place and removes only explicitly referenced edits', () => {
    const current = cart([rename(), rename('other', 'p2'), rename('last', 'p3')]);
    expect(mergeCartPatch(current, patch([
      { kind: 'revise', actionId: 'manual', expected: rename(), explicit: true, action: rename('manual', 'p1', 'Revised') },
      { kind: 'remove', actionId: 'other', expected: rename('other', 'p2'), explicit: true },
    ]))).toEqual([rename('manual', 'p1', 'Revised'), rename('last', 'p3')]);
  });
  it('rejects stale revision even for an empty patch', () => {
    expect(() => mergeCartPatch(cart(), { revision: 2, changes: [] })).toThrow(/cart changed/i);
  });
  it.each(['remove', 'revise'] as const)('requires explicit and exact expected state for %s', kind => {
    const change = { kind, actionId: 'manual', expected: rename(), explicit: false, ...(kind === 'revise' ? { action: rename() } : {}) };
    expect(() => mergeCartPatch(cart(), patch([change as CartPatch['changes'][number]]))).toThrow(/explicit/);
    expect(() => mergeCartPatch(cart(), patch([{ ...change, explicit: true, expected: rename('manual', 'p1', 'Outdated') } as CartPatch['changes'][number]]))).toThrow(/no longer matches/);
  });
  it('rejects unknown references, ID replacement and target replacement', () => {
    for (const action of [rename('new'), rename('manual', 'p2')]) expect(() => mergeCartPatch(cart(), patch([{ kind: 'revise', actionId: 'manual', expected: rename(), explicit: true, action }]))).toThrow(/preserve/);
    expect(() => mergeCartPatch(cart(), patch([{ kind: 'remove', actionId: 'unknown', expected: rename(), explicit: true }]))).toThrow(/no longer matches/);
  });
  it('rejects new IDs that silently overwrite existing title modes or duplicate IDs', () => {
    for (const action of [rename(), rename('new'), { id: 'new', kind: 'source_post_title', postId: 'p1' } as EditAction]) expect(() => mergeCartPatch(cart(), patch([{ kind: 'add', action }]))).toThrow();
  });
  it('rejects duplicate changes and remove-plus-add replacement bypasses', () => {
    const remove = { kind: 'remove', actionId: 'manual', expected: rename(), explicit: true } as const;
    expect(() => mergeCartPatch(cart(), patch([remove, remove]))).toThrow(/once/);
    expect(() => mergeCartPatch(cart(), patch([remove, { kind: 'add', action: rename('new') }]))).toThrow(/conflicting/);
    expect(() => mergeCartPatch(cart([]), patch([{ kind: 'add', action: rename('a') }, { kind: 'add', action: rename('b') }]))).toThrow(/conflicting/);
  });
  it('keeps post and media tags separate but rejects contradictory writes to the same tag', () => {
    const tag: EditAction = { id: 'tag', kind: 'tags', postId: 'p1', add: ['blue'], remove: [] };
    expect(mergeCartPatch(cart([tag]), patch([{ kind: 'add', action: { ...tag, id: 'media', mediaId: 'm1' } }]))).toHaveLength(2);
    expect(() => mergeCartPatch(cart([tag]), patch([{ kind: 'add', action: { ...tag, id: 'remove', add: [], remove: ['blue'] } }]))).toThrow(/explicitly revised/);
  });
  it('normalizes optional nullable fields when checking expected state', () => {
    const tag: EditAction = { id: 'tag', kind: 'tags', postId: 'p1', add: ['blue'], remove: [] };
    expect(mergeCartPatch(cart([tag]), patch([{ kind: 'remove', actionId: 'tag', expected: { ...tag, mediaId: null } as unknown as EditAction, explicit: true }]))).toEqual([]);
  });
  it.each([null, {}, { revision: 3, changes: [], extra: true }, { revision: 3.1, changes: [] }, { revision: 3, changes: [null] }, { revision: 3, changes: [{ kind: 'add', action: rename(), explicit: true }] }, { revision: 3, changes: [{ kind: 'add', action: { ...rename(), surprise: true } }] }])('rejects malformed runtime input %#', value => {
    expect(() => mergeCartPatch(cart(), value as CartPatch)).toThrow();
  });
  it('bounds both patch size and resulting cart size', () => {
    const actions = Array.from({ length: 100 }, (_, i) => rename(`a${i}`, `p${i}`));
    expect(() => mergeCartPatch(cart(actions), patch([{ kind: 'add', action: rename('extra', 'extra') }]))).toThrow(/invalid/);
    expect(() => mergeCartPatch(cart([]), patch(Array.from({ length: 101 }, (_, i) => ({ kind: 'add', action: rename(`a${i}`, `p${i}`) }))))).toThrow(/invalid/);
  });
});
