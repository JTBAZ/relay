import type { MetadataSelection, MetadataSelector } from './selector.js';

export type SelectionResolver = (selector: MetadataSelector) => { ok: true; matchedPostIds: string[] } | { ok: false };
export type RefinementResult = { selectedPostIds: string[]; excludedPostIds: string[]; newlyMatchedPostIds: string[]; operation: string };

/** Shared deterministic add/remove/narrow/exclusion semantics over a supplied canonical ID order. */
export function applySelectionRefinement(input: {
  selection: MetadataSelection; currentPostIds: string[]; excludedPostIds: string[]; catalogPostIds: string[];
  hasPriorState: boolean; resolve: SelectionResolver;
}): RefinementResult | null {
  const { selection, currentPostIds, catalogPostIds } = input;
  if (input.hasPriorState && selection.mode === 'replace' && selection.selector?.base !== 'selection') return null;
  if (selection.mode === 'add' && selection.selector && selection.selector.none.length > 0 && selection.selector.all.length + selection.selector.any.length === 0) return null;
  if (selection.mode === 'remove' && selection.selector && selection.selector.all.length + selection.selector.any.length === 0) return null;
  const current = [...currentPostIds];
  const excluded = new Set(input.excludedPostIds);
  let candidate = current;
  let newlyMatched: string[] = [];
  if (selection.mode === 'remove') {
    if (!selection.selector) return null;
    const full = input.resolve({ ...selection.selector, base: 'catalog' });
    if (!full.ok) return null;
    newlyMatched = full.matchedPostIds;
    for (const id of newlyMatched) excluded.add(id);
    candidate = current.filter(id => !newlyMatched.includes(id));
  } else {
    const resolved = selection.selector ? input.resolve(selection.selector) : null;
    if (selection.mode !== 'preserve' && (!resolved || !resolved.ok)) return null;
    const targets = resolved?.ok ? resolved.matchedPostIds : current;
    if (selection.mode === 'replace') { candidate = targets; newlyMatched = targets; }
    else if (selection.mode === 'add') { candidate = [...new Set([...current, ...targets])]; newlyMatched = targets.filter(id => !current.includes(id)); }
    else candidate = current;
    if (selection.selector?.none.length) for (const predicate of selection.selector.none) {
      const result = input.resolve({ base: 'catalog', all: [], any: [predicate], none: [] });
      if (!result.ok) return null;
      for (const id of result.matchedPostIds) excluded.add(id);
    }
  }
  const order = (ids: string[]) => catalogPostIds.filter(id => ids.includes(id));
  const excludedIds = order([...excluded]);
  return { selectedPostIds: order(candidate.filter(id => !excluded.has(id))), excludedPostIds: excludedIds, newlyMatchedPostIds: order(newlyMatched), operation: selection.mode };
}
