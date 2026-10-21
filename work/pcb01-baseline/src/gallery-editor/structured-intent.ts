import { randomUUID } from 'node:crypto';
import { matchesSchema, objectSchema, validateActions } from './action-validation.js';
import { EditorError, type EditAction, type EditorSession } from './types.js';
import { mergeCartPatch, type CartPatch } from './cart-patch.js';
import type { IntentEvidence } from './intent-evidence.js';

type Schema = ReturnType<typeof objectSchema>;
const text = (maxLength = 500): Schema => ({ type: 'string', maxLength });
const id: Schema = { type: 'string', minLength: 1, maxLength: 200 };
const list = (items: Schema, maxItems = 100): Schema => ({ type: 'array', items, maxItems });
const choice = (...values: string[]): Schema => ({ type: 'string', enum: values });
const nullable = (value: Schema): Schema => ({ anyOf: [value, { type: 'null' }] });
export type IntentScope = 'post' | 'work' | 'series' | 'collection' | 'media' | 'unresolved';
const scope = choice('post', 'work', 'series', 'collection', 'media', 'unresolved');
const reference = objectSchema({ source: choice('ids', 'selection', 'new'), ids: list(id) });
const common = {
  scope, target: reference, excludeIds: list(id), unresolved: list(text()),
  scopeBasis: choice('explicit', 'conversation', 'ambiguous'), requestQuote: text(2000),
  change: choice('add', 'revise'), actionId: nullable(id),
};
const shapes = {
  rename: { value: text() },
  description: { value: nullable(text(20000)) },
  tags: { add: list(text(100)), remove: list(text(100)), observationMediaIds: list(id, 24) },
  title_mode: { mode: choice('source', 'inherit_work') },
  create: { value: text(), reference: id },
  membership: { postIds: list(id), mode: choice('add', 'remove') },
  reorder: { orderedIds: list(id, 500) },
  link_work: { workId: id, titleMode: choice('source', 'inherit_work', 'custom'), customTitle: nullable(text()), memberLabel: nullable(text()), sortOrder: { type: 'integer', minimum: 0, maximum: 1000000 } },
  link_series: { seriesId: id, titleMode: choice('independent', 'inherit_series'), partLabel: text(), sortOrder: { type: 'integer', minimum: 0, maximum: 1000000 } },
  unlink_series: { value: text() },
  remove_cart: {},
} satisfies Record<string, Record<string, Schema>>;
function structuredIntentSchema(metadataOnly: boolean): Schema {
  const operationShapes = metadataOnly
    ? Object.entries(shapes).map(([operation, fields]) => objectSchema({ operation: choice(operation), ...common,
      ...fields,
      ...(operation === 'tags' ? { observationMediaIds: list(id, 0) } : {}),
    }))
    : Object.entries(shapes).map(([operation, fields]) => objectSchema({ operation: choice(operation), ...common, ...fields }));
  return objectSchema({
  revision: { type: 'integer', minimum: 0 },
  outcome: choice('proposal', 'clarification', 'limitation', 'no_change'),
  question: nullable(text(1000)),
  unresolved: list(text()),
  observations: list(objectSchema({ mediaId: id, attributes: list(objectSchema({ kind: choice('color', 'shape', 'composition', 'visible_text'), value: text(100) }), 30) }), metadataOnly ? 0 : 24),
  operations: list({ anyOf: operationShapes }, 50),
  });
}
export const STRUCTURED_INTENT_SCHEMA = structuredIntentSchema(false);
/** Compiled metadata-only interpretation cannot return visual observations or citations. */
export const COMPILED_STRUCTURED_INTENT_SCHEMA = structuredIntentSchema(true);
type Common = { scope: IntentScope; target: { source: 'ids'|'selection'|'new'; ids: string[] }; excludeIds: string[]; unresolved: string[]; scopeBasis: 'explicit'|'conversation'|'ambiguous'; requestQuote: string; change: 'add'|'revise'; actionId: string|null };
type Fields =
  | { operation: 'rename'|'unlink_series'; value: string }
  | { operation: 'description'; value: string|null }
  | { operation: 'tags'; add: string[]; remove: string[]; observationMediaIds: string[] }
  | { operation: 'title_mode'; mode: 'source'|'inherit_work' }
  | { operation: 'create'; value: string; reference: string }
  | { operation: 'membership'; postIds: string[]; mode: 'add'|'remove' }
  | { operation: 'reorder'; orderedIds: string[] }
  | { operation: 'link_work'; workId: string; titleMode: 'source'|'inherit_work'|'custom'; customTitle: string|null; memberLabel: string|null; sortOrder: number }
  | { operation: 'link_series'; seriesId: string; titleMode: 'independent'|'inherit_series'; partLabel: string; sortOrder: number }
  | { operation: 'remove_cart' };
export type IntentOperation = Common & Fields;
export interface StructuredIntent {
  revision: number; outcome: 'proposal'|'clarification'|'limitation'|'no_change'; question: string|null; unresolved: string[];
  observations: Array<{mediaId:string;attributes:Array<{kind:'color'|'shape'|'composition'|'visible_text';value:string}>}>;
  operations: IntentOperation[];
}
export interface CompiledIntent { actions: EditAction[]; patch: CartPatch; disposition: StructuredIntent['outcome']; message: string }
function invalid(message: string): never { throw new EditorError('intent_contract', message, 422); }
function same(a: unknown, b: unknown): boolean {
  const canonical = (v: unknown): unknown => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => [k,canonical(v)])) : v;
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}
/** No natural-language keyword parsing. This validates interpreted structure against owned evidence.
 * Quote grounding is necessary traceability, not proof of correct language interpretation. */
export function compileIntent(raw: unknown, session: EditorSession, request: string, evidence: IntentEvidence, options: { metadataOnly?: boolean } = {}): CompiledIntent {
  if (!matchesSchema(raw, STRUCTURED_INTENT_SCHEMA)) invalid('Return the structured intent contract.');
  const intent = raw as StructuredIntent;
  if (intent.revision !== session.cart.revision) throw new EditorError('STALE_CART', 'The cart changed. Reload before continuing.', 409);
  const patch: CartPatch = { revision: intent.revision, changes: [] };
  const preserve = (disposition: StructuredIntent['outcome'], message: string): CompiledIntent => ({actions: structuredClone(session.cart.actions), patch: {revision:intent.revision,changes:[]}, disposition, message});
  if (options.metadataOnly && (intent.observations.length > 0 || intent.operations.some(op => op.operation === 'tags' && op.observationMediaIds.length > 0))) {
    return preserve('limitation', 'This interpretation mode uses Library metadata only. It cannot assess colors, shapes, composition, or visible text, so no visual change was proposed. The cart is unchanged.');
  }
  if (intent.outcome !== 'proposal') {
    if (intent.operations.length) invalid('Non-proposal outcomes cannot change the cart.');
    return preserve(intent.outcome, intent.outcome === 'clarification'
      ? 'Nothing changed. What should change, and should it apply to a post, a whole work, or a series? Please include any missing name or target.'
      : intent.outcome === 'limitation' ? options.metadataOnly
        ? 'This request could not be completed from Library metadata. Compiled interpretation cannot assess colors, shapes, composition, or visible text. The cart is unchanged.'
        : 'This request cannot be completed with the available Library edits or evidence. The cart is unchanged. External platforms are unchanged.'
        : 'The cart is unchanged. Nothing has been applied.');
  }
  if (intent.unresolved.length || intent.operations.some(op => op.unresolved.length || op.scope === 'unresolved' || op.scopeBasis === 'ambiguous')) {
    return preserve('clarification', 'Nothing changed. Please specify the missing targets, values, or whether the change applies to posts, works, or a series.');
  }
  for (const observation of intent.observations) if (!evidence.inspected(observation.mediaId)) invalid('Visual observations require actual authorized image inspection.');
  // A single family-rename instruction cannot also authorize a custom post exception.
  // Separate explicit exception instructions still compile as independent operations.
  for (const op of intent.operations) if (op.operation==='rename'&&op.scope==='post'&&intent.operations.some(other=>other.operation==='rename'&&(other.scope==='work'||other.scope==='series')&&other.requestQuote===op.requestQuote)) invalid('A family rename must not invent post-specific title overrides. A post exception requires its own explicit request.');
  const created = new Map<string, {id:string;scope:IntentScope}>();
  for(const action of session.cart.actions){
    if(action.kind==='create_collection')created.set(action.collectionId,{id:action.collectionId,scope:'collection'});
    if(action.kind==='create_series')created.set(action.seriesId,{id:action.seriesId,scope:'series'});
  }
  const resolve = (kind: IntentScope, target: string): string => {
    const local = created.get(target);
    if (local?.scope === kind) return local.id;
    if (kind === 'unresolved' || !evidence.hasTarget(kind, target)) invalid('Resolve each target through authorized Library evidence.');
    return target;
  };
  for (const op of intent.operations) {
    if (!op.requestQuote.trim() || !request.includes(op.requestQuote)) invalid('Each change needs a verbatim supporting span from the latest request.');
    if (op.operation === 'remove_cart') {
      const old = session.cart.actions.find(a => a.id === op.actionId);
      if (!old || op.change !== 'revise') invalid('Identify the current action to remove.');
      patch.changes.push({kind:'remove', actionId:old.id, expected:old, explicit:true});
      continue;
    }
    if (op.change === 'add' && op.actionId !== null || op.change === 'revise' && !op.actionId) invalid('Only explicit revisions name a current cart action.');
    let targets = op.target.source === 'selection'
      ? op.scope === 'post' ? session.context.selectedPostIds : op.scope === 'media' ? session.context.selectedMediaIds ?? [] : invalid('Selection identifies posts/media; resolve work/series IDs from evidence without guessing scope.')
      : op.target.ids;
    if (new Set(targets).size !== targets.length || new Set(op.excludeIds).size !== op.excludeIds.length) invalid('Targets and exclusions must be distinct.');
    if (op.target.source === 'selection' && op.target.ids.length) invalid('Selection references cannot also supply IDs.');
    if (op.operation !== 'create' && op.target.source === 'new') invalid('Only creation can use a new target.');
    if ((op.scope === 'work' || op.scope === 'series') && op.excludeIds.length) return preserve('clarification', 'Nothing changed. Excluding family members requires an explicit naming choice for those members; specify the intended exceptions.');
    targets = targets.filter(id => !op.excludeIds.includes(id));
    const proposed: EditAction[] = [];
    if (op.operation === 'create') {
      if (op.target.source !== 'new' || targets.length || op.change !== 'add' || !['collection','series'].includes(op.scope) || created.has(op.reference)) invalid('Creation needs a unique local reference and collection or series scope.');
      const entityId = randomUUID();
      created.set(op.reference, {id:entityId,scope:op.scope});
      proposed.push(op.scope === 'collection' ? {id:randomUUID(),kind:'create_collection',collectionId:entityId,title:op.value} : {id:randomUUID(),kind:'create_series',seriesId:entityId,title:op.value});
    } else {
      if (!targets.length) return preserve('clarification', 'Nothing changed. Select or identify the intended targets.');
      for (const candidate of targets) {
        const target = resolve(op.scope,candidate), id = op.change === 'revise' ? op.actionId! : randomUUID();
        if ((op.scope === 'work' || op.scope === 'series') && !created.has(candidate) && !evidence.familyComplete(op.scope,target)) throw new EditorError('intent_evidence', 'Read the complete family before a family change.', 422);
        switch (op.operation) {
          case 'rename':
            if (op.scope === 'post') proposed.push({id,kind:'rename_post',postId:target,title:op.value});
            else if (op.scope === 'work') proposed.push({id,kind:'rename_work',workId:target,title:op.value});
            else if (op.scope === 'series') proposed.push({id,kind:'rename_series',seriesId:target,title:op.value});
            else if (op.scope === 'collection') proposed.push({id,kind:'rename_collection',collectionId:target,title:op.value});
            else invalid('Rename requires post, work, series, or collection scope.');
            break;
          case 'description':
            if (op.scope !== 'post') invalid('Descriptions target posts.');
            proposed.push({id,kind:'set_description',postId:target,description:op.value}); break;
          case 'tags': {
            if (!['post','media'].includes(op.scope)) invalid('Tags target posts or media.');
            for (const mediaId of op.observationMediaIds) {
              if (!evidence.inspected(mediaId) || !intent.observations.some(o=>o.mediaId===mediaId)) invalid('Visual tags require recorded inspection and observations.');
              if (op.scope === 'media' ? target !== mediaId : !evidence.mediaPostIds(mediaId).includes(target)) invalid('Visual observations must belong to the mutation target.');
            }
            const owners = op.scope === 'media' ? evidence.mediaPostIds(target) : [target];
            if (owners.length !== 1) invalid('Media tags require an unambiguous containing post.');
            proposed.push({id,kind:'tags',postId:owners[0],...(op.scope==='media'?{mediaId:target}:{}),add:op.add,remove:op.remove}); break;
          }
          case 'title_mode':
            if (op.scope !== 'post') invalid('Post naming mode requires post scope.');
            proposed.push({id,kind:op.mode==='source'?'source_post_title':'inherit_post_title',postId:target}); break;
          case 'membership':
            if (op.scope !== 'collection') invalid('Collection membership requires collection scope.');
            proposed.push({id,kind:'collection_membership',collectionId:target,postIds:op.postIds.filter(p=>!op.excludeIds.includes(p)).map(p=>resolve('post',p)),operation:op.mode}); break;
          case 'reorder':
            if (op.scope === 'collection') {
              if (!evidence.collectionComplete(target)) throw new EditorError('intent_evidence','Read complete collection membership before reordering.',422);
              if (!same([...op.orderedIds].sort(), [...evidence.collectionPostIds(target)].sort())) invalid('Reorder must preserve complete collection membership.');
              proposed.push({id,kind:'reorder_collection',collectionId:target,postIds:op.orderedIds});
            } else if (op.scope === 'post') {
              for (const mediaId of op.orderedIds) if (!evidence.mediaPostIds(mediaId).includes(target)) invalid('Media order must belong to the selected post.');
              proposed.push({id,kind:'reorder_media',postId:target,mediaIds:op.orderedIds});
            } else invalid('Reordering requires collection or post scope.');
            break;
          case 'link_work':
            if (op.scope !== 'post') invalid('Work membership targets posts.');
            proposed.push({id,kind:'link_work_post',postId:target,workId:resolve('work',op.workId),titleMode:op.titleMode,...(op.customTitle!==null?{customTitle:op.customTitle}:{}),...(op.memberLabel!==null?{memberLabel:op.memberLabel}:{}),sortOrder:op.sortOrder}); break;
          case 'link_series':
            if (op.scope !== 'work') invalid('Series membership targets works.');
            proposed.push({id,kind:'link_series_work',workId:target,seriesId:resolve('series',op.seriesId),titleMode:op.titleMode,partLabel:op.partLabel,sortOrder:op.sortOrder}); break;
          case 'unlink_series':
            if (op.scope !== 'work') invalid('Series unlink targets a work with an explicit independent name.');
            proposed.push({id,kind:'unlink_series_work',workId:target,title:op.value}); break;
        }
      }
    }
    const actions = validateActions(proposed);
    if (op.change === 'revise') {
      const old = session.cart.actions.find(a=>a.id===op.actionId);
      if (!old || actions.length!==1) invalid('A revision must identify exactly one existing cart action.');
      patch.changes.push({kind:'revise',actionId:old.id,expected:old,action:actions[0],explicit:true});
    } else for (const action of actions) {
      // Identical repeated requests are idempotent without replacing the original ID.
      if (!session.cart.actions.some(old=>same({...old,id:''},{...action,id:''}))) patch.changes.push({kind:'add',action});
    }
  }
  const actions = mergeCartPatch(session.cart,patch);
  return {actions,patch,disposition:patch.changes.length?'proposal':'no_change',message:patch.changes.length?'Review the proposed changes. Nothing has been applied.':'The requested changes are already in the cart. Nothing has been applied.'};
}
