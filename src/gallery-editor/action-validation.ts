import { EditorError, type EditAction } from './types.js';

type Schema = { type?: string | string[]; properties?: Record<string, Schema>; required?: string[]; additionalProperties?: boolean; items?: Schema; anyOf?: Schema[]; enum?: unknown[]; minLength?: number; maxLength?: number; maxItems?: number; minimum?: number; maximum?: number };
const text = (maxLength: number): Schema => ({ type: 'string', maxLength });
const id: Schema = { type: 'string', minLength: 1, maxLength: 200 };
const title: Schema = { type: 'string', minLength: 1, maxLength: 500 };
const ids: Schema = { type: 'array', items: id, maxItems: 500 };
const tags: Schema = { type: 'array', items: { type: 'string', minLength: 1, maxLength: 100 }, maxItems: 100 };
const nullable = (schema: Schema): Schema => ({ anyOf: [schema, { type: 'null' }] });
export function objectSchema(properties: Record<string, Schema>): Schema {
  return { type: 'object', properties, required: Object.keys(properties), additionalProperties: false };
}
const sortOrder: Schema = { type: 'integer', minimum: 0, maximum: 1000000 };
const postMode: Schema = { type: 'string', enum: ['source', 'inherit_work', 'custom'] };
const variants: Record<EditAction['kind'], Record<string, Schema>> = {
  rename_post: { postId: id, title },
  inherit_post_title: { postId: id },
  source_post_title: { postId: id },
  rename_work: { workId: id, title },
  rename_series: { seriesId: id, title },
  set_description: { postId: id, description: nullable(text(20000)) },
  tags: { postId: id, mediaId: nullable(id), add: tags, remove: tags },
  create_collection: { collectionId: id, title },
  rename_collection: { collectionId: id, title },
  collection_membership: { collectionId: id, postIds: ids, operation: { type: 'string', enum: ['add', 'remove'] } },
  reorder_collection: { collectionId: id, postIds: ids },
  reorder_media: { postId: id, mediaIds: ids },
  create_series: { seriesId: id, title },
  link_series_work: { seriesId: id, workId: id, partLabel: title, titleMode: { type: 'string', enum: ['independent', 'inherit_series'] }, sortOrder },
  unlink_series_work: { workId: id, title },
  link_work_post: { workId: id, postId: id, titleMode: postMode, customTitle: nullable(title), memberLabel: nullable(text(500)), sortOrder },
};
export const ACTION_SCHEMA: Schema = { anyOf: Object.entries(variants).map(([kind, properties]) => objectSchema({ id, kind: { type: 'string', enum: [kind] }, ...properties })) };
export const PROPOSAL_SCHEMA = objectSchema({ message: { type: 'string', minLength: 1, maxLength: 20000 }, disposition: {type:'string',enum:['proposal','clarification','limitation']}, actions: { type: 'array', items: ACTION_SCHEMA, maxItems: 100 } });

/** The same schema governs model output and runtime checking; no permissive coercions. */
export function matchesSchema(value: unknown, schema: Schema): boolean {
  if (schema.anyOf) return schema.anyOf.some(candidate => matchesSchema(value, candidate));
  if (schema.enum && !schema.enum.includes(value)) return false;
  if (schema.type === 'null') return value === null;
  if (schema.type === 'string') return typeof value === 'string' && value.length >= (schema.minLength ?? 0) && value.length <= (schema.maxLength ?? Infinity);
  if (schema.type === 'integer') return typeof value === 'number' && Number.isSafeInteger(value) && value >= (schema.minimum ?? -Infinity) && value <= (schema.maximum ?? Infinity);
  if (schema.type === 'boolean') return typeof value === 'boolean';
  if (schema.type === 'array') return Array.isArray(value) && value.length <= (schema.maxItems ?? Infinity) && value.every(item => matchesSchema(item, schema.items!));
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const obj = value as Record<string, unknown>;
    return (schema.required ?? []).every(key => Object.hasOwn(obj, key)) && Object.keys(obj).every(key => Object.hasOwn(schema.properties!, key) && matchesSchema(obj[key], schema.properties![key]));
  }
  return false;
}

/** Accepts native optional fields as well as nullable strict-schema model fields. */
export function validateActions(value: unknown): EditAction[] {
  if (!Array.isArray(value) || value.length > 100) throw new EditorError('invalid_actions', 'The proposed edit list is invalid.');
  const actionIds = new Set<string>();
  return value.map(raw => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new EditorError('invalid_actions', 'The proposed edit is invalid.');
    const action = { ...raw } as Record<string, unknown>;
    if (action.kind === 'tags' && !Object.hasOwn(action, 'mediaId')) action.mediaId = null;
    if (action.kind === 'link_work_post') for (const key of ['customTitle', 'memberLabel']) if (!Object.hasOwn(action, key)) action[key] = null;
    if (!matchesSchema(action, ACTION_SCHEMA) || typeof action.id !== 'string' || !action.id.trim() || actionIds.has(action.id)) throw new EditorError('invalid_actions', 'The proposed edit contains invalid or duplicate fields.');
    for (const key of ['title', 'partLabel', 'postId', 'workId', 'seriesId', 'collectionId', 'mediaId']) if (typeof action[key] === 'string' && !(action[key] as string).trim()) throw new EditorError('invalid_actions', 'Edit identifiers and titles must not be blank.');
    for (const key of ['postIds', 'mediaIds', 'add', 'remove']) if (Array.isArray(action[key]) && (new Set(action[key]).size !== action[key].length || action[key].some((item: string) => !item.trim()))) throw new EditorError('invalid_actions', 'Edit lists must contain distinct nonblank values.');
    if (action.kind === 'tags' && (action.add as string[]).some(tag => (action.remove as string[]).includes(tag))) throw new EditorError('invalid_actions', 'A tag cannot be added and removed in the same edit.');
    if (action.kind === 'link_work_post' && ((action.titleMode === 'custom' && (typeof action.customTitle !== 'string' || !action.customTitle.trim())) || (action.titleMode !== 'custom' && action.customTitle !== null))) throw new EditorError('invalid_actions', 'Custom title and title mode disagree.');
    actionIds.add(action.id);
    for (const key of ['mediaId', 'customTitle', 'memberLabel']) if (action[key] === null) delete action[key];
    return structuredClone(action) as EditAction;
  });
}

export function validateProposal(value: unknown): { message: string; actions: EditAction[]; disposition?: 'proposal'|'clarification'|'limitation' } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new EditorError('invalid_proposal', 'The editor returned an invalid proposal.');
  const obj = value as Record<string, unknown>;
  if (Object.keys(obj).some(key => !['message', 'actions','disposition'].includes(key)) || typeof obj.message !== 'string' || !obj.message.trim() || obj.message.length > 20000 || (obj.disposition!==undefined&&!['proposal','clarification','limitation'].includes(String(obj.disposition)))) throw new EditorError('invalid_proposal', 'The editor returned an invalid proposal.');
  return { message: obj.message, actions: validateActions(obj.actions),...(obj.disposition?{disposition:obj.disposition as 'proposal'|'clarification'|'limitation'}:{}) };
}
