import { isDeepStrictEqual } from 'node:util';
import { validateActions } from './action-validation.js';
import { EditorError, type ChangeCart, type EditAction } from './types.js';

export type CartChange =
  | { kind: 'add'; action: EditAction }
  | { kind: 'remove'; actionId: string; expected: EditAction; explicit: boolean }
  | { kind: 'revise'; actionId: string; expected: EditAction; action: EditAction; explicit: boolean };
export interface CartPatch { revision: number; changes: CartChange[] }

function invalid(message: string): never { throw new EditorError('invalid_cart_patch', message); }
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function exact(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
// Field-level write claims: unrelated edits on the same post remain composable.
// JSON tuples avoid collisions when identifiers themselves contain separators.
function writes(action: EditAction): string[] {
  const key = (...parts: string[]) => JSON.stringify(parts);
  switch (action.kind) {
    case 'rename_post': case 'inherit_post_title': case 'source_post_title': return [key('post', action.postId, 'title')];
    case 'rename_work': return [key('work', action.workId, 'title')];
    case 'rename_series': case 'create_series': return [key('series', action.seriesId, 'title')];
    case 'set_description': return [key('post', action.postId, 'description')];
    case 'tags': return [...action.add, ...action.remove].map(tag => action.mediaId ? key('media', action.mediaId, 'tag', tag) : key('post', action.postId, 'tag', tag));
    case 'create_collection': case 'rename_collection': return [key('collection', action.collectionId, 'title')];
    case 'collection_membership': return action.postIds.map(id => key('collection', action.collectionId, 'member', id));
    case 'reorder_collection': return [key('collection', action.collectionId, 'order')];
    case 'reorder_media': return [key('post', action.postId, 'media_order')];
    case 'link_series_work': case 'unlink_series_work': return [key('work', action.workId, 'series'), key('work', action.workId, 'title')];
    case 'link_work_post': return [key('post', action.postId, 'work'), key('post', action.postId, 'title')];
  }
}
function target(action: EditAction): string {
  if ('postId' in action) return JSON.stringify(['post', action.postId, 'mediaId' in action ? action.mediaId ?? null : null]);
  if ('workId' in action) return JSON.stringify(['work', action.workId]);
  if ('collectionId' in action) return JSON.stringify(['collection', action.collectionId]);
  return JSON.stringify(['series', action.seriesId]);
}
function operationFamily(action: EditAction): string {
  return ['rename_post', 'inherit_post_title', 'source_post_title'].includes(action.kind) ? 'post_title' : action.kind;
}

/** Pure, bounded merge. The caller must still authorize, preview and CAS the revision at persistence. */
export function mergeCartPatch(cart: ChangeCart, patch: CartPatch): EditAction[] {
  if (!record(patch) || !exact(patch, ['revision', 'changes']) || !Number.isSafeInteger(patch.revision) || patch.revision < 0 || !Array.isArray(patch.changes) || patch.changes.length > 100) invalid('The cart patch is invalid.');
  if (patch.revision !== cart.revision) throw new EditorError('stale_revision', 'The cart changed. Review the latest cart before revising it.', 409);
  const original = validateActions(cart.actions);
  const byId = new Map(original.map(action => [action.id, action]));
  const touched = new Set<string>();
  const claimed = new Set<string>();
  const removed = new Set<string>();
  const revised = new Map<string, EditAction>();
  const added: EditAction[] = [];
  for (const change of patch.changes) {
    if (!record(change)) invalid('The cart change is invalid.');
    const kind = change.kind;
    if (!['add', 'remove', 'revise'].includes(kind)) invalid('Unknown cart change.');
    const keys = kind === 'add' ? ['kind', 'action'] : kind === 'remove' ? ['kind', 'actionId', 'expected', 'explicit'] : ['kind', 'actionId', 'expected', 'action', 'explicit'];
    if (!exact(change, keys)) invalid('The cart change contains invalid fields.');
    let previous: EditAction | undefined;
    let action: EditAction | undefined;
    if (change.kind !== 'add') {
      if (change.explicit !== true || typeof change.actionId !== 'string') invalid('Removing or revising an edit requires an explicit reference.');
      previous = byId.get(change.actionId);
      const expected = validateActions([change.expected])[0];
      if (!previous || !isDeepStrictEqual(previous, expected)) throw new EditorError('cart_patch_conflict', 'The referenced edit no longer matches the current cart.', 409);
    }
    if (change.kind !== 'remove') action = validateActions([change.action])[0];
    const id = previous?.id ?? action!.id;
    if (touched.has(id)) invalid('An edit may only be changed once per patch.');
    touched.add(id);
    if (change.kind === 'add' && byId.has(id)) invalid('A new edit cannot overwrite an existing action ID.');
    if (previous && action && (action.id !== previous.id || target(action) !== target(previous) || operationFamily(action) !== operationFamily(previous))) invalid('A revision must preserve the action ID, target and operation family.');
    const claims = new Set([...(previous ? writes(previous) : []), ...(action ? writes(action) : [])]);
    for (const claim of claims) {
      if (claimed.has(claim)) invalid('The patch contains conflicting changes to the same target field.');
      claimed.add(claim);
    }
    if (action) for (const existing of original) {
      if (existing.id !== previous?.id && writes(existing).some(claim => writes(action!).includes(claim))) invalid('An existing edit must be explicitly revised before its target field can be changed.');
    }
    if (change.kind === 'remove') removed.add(id);
    else if (change.kind === 'revise') revised.set(id, action!);
    else added.push(action!);
  }
  return validateActions([...original.filter(action => !removed.has(action.id)).map(action => revised.get(action.id) ?? action), ...added]);
}
