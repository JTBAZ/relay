import { matchesSchema, objectSchema } from '../gallery-editor/action-validation.js';
import { BENCH_IDS, createBenchFixture, createBenchMediaDescriptors, createBenchPostCards } from './fixtures.js';
import type { BenchRequestClock } from './routing.js';

export const SELECTOR_FIELDS = ['post_id', 'work_id', 'series_id', 'collection_id', 'tag', 'stage', 'publish_state', 'title', 'description', 'media_type', 'media_role', 'media_label', 'filename', 'orientation', 'processing_status'] as const;
export type SelectorField = typeof SELECTOR_FIELDS[number];
export type MetadataPredicate = { field: SelectorField; value: string; requestQuote: string };
export type DatePredicate = { field: 'created_date' | 'published_date'; value: string; requestQuote: string; op: 'on' | 'before' | 'after' | 'on_or_before' | 'on_or_after' | 'in_month' };
export type SelectorPredicate = MetadataPredicate | DatePredicate;
export type MetadataSelector = { base: 'catalog'|'selection'|'empty'; all: SelectorPredicate[]; any: SelectorPredicate[]; none: SelectorPredicate[] };
export type SelectionMode = 'preserve'|'replace'|'add'|'remove';
export type MetadataSelection = { mode: SelectionMode; requestQuote: string|null; selector: MetadataSelector|null };

const predicateSchema = objectSchema({
  field: { type: 'string', enum: SELECTOR_FIELDS as unknown as string[] },
  value: { type: 'string', minLength: 1, maxLength: 200 },
  requestQuote: { type: 'string', minLength: 1, maxLength: 2000 },
});
const datePredicateSchema = objectSchema({
  field: { type: 'string', enum: ['created_date', 'published_date'] },
  value: { type: 'string', minLength: 1, maxLength: 200 },
  requestQuote: { type: 'string', minLength: 1, maxLength: 2000 },
  op: { type: 'string', enum: ['on', 'before', 'after', 'on_or_before', 'on_or_after', 'in_month'] },
});
const selectorPredicateSchema = { anyOf: [predicateSchema, datePredicateSchema] };
export const METADATA_SELECTOR_SCHEMA = objectSchema({
  base: { type: 'string', enum: ['catalog', 'selection', 'empty'] },
  all: { type: 'array', items: selectorPredicateSchema, maxItems: 16 },
  any: { type: 'array', items: selectorPredicateSchema, maxItems: 16 },
  none: { type: 'array', items: selectorPredicateSchema, maxItems: 16 },
});
export const METADATA_SELECTION_SCHEMA = objectSchema({
  mode: { type: 'string', enum: ['preserve', 'replace', 'add', 'remove'] },
  requestQuote: { anyOf: [{ type: 'string', minLength: 1, maxLength: 2000 }, { type: 'null' }] },
  selector: { anyOf: [METADATA_SELECTOR_SCHEMA, { type: 'null' }] },
});

export type SelectorResolution =
  | { ok: true; matchedPostIds: string[] }
  | { ok: false; reason: 'invalid'|'unknown'; message: string };

function ownedPostFamilies(authorizedPostIds: string[]) {
  const { fixture } = catalogue();
  const allPostsForWork = (workId: string) => fixture.state.tables.workMembers.filter(row => row.creativeWorkId === workId).map(row => String(row.postId));
  const allPostsForSeries = (seriesId: string) => {
    const workIdsInSeries = fixture.state.tables.seriesMembers.filter(row => row.creativeSeriesId === seriesId).map(row => String(row.creativeWorkId));
    return fixture.state.tables.workMembers.filter(row => workIdsInSeries.includes(String(row.creativeWorkId))).map(row => String(row.postId));
  };
  return { fixture, allPostsForWork, allPostsForSeries, allowed: new Set(authorizedPostIds) };
}

/** Prevent compiled intent fields from widening a selector to unselected posts or media. */
export function validateIntentTargets(mode: 'curation'|'mock_posting', intent: unknown, authorizedPostIds: string[]): string | null {
  if (!intent || typeof intent !== 'object' || Array.isArray(intent)) return 'The edit intent is not a structured object.';
  const data = ownedPostFamilies(authorizedPostIds);
  const allowedMedia = new Set(createBenchMediaDescriptors(data.fixture).filter(asset => data.allowed.has(asset.postId)).map(asset => asset.id));
  const ids = (value: unknown) => Array.isArray(value) && value.every(id => typeof id === 'string');
  const allIncluded = (members: string[]) => members.every(id => data.allowed.has(id));
  if (mode === 'mock_posting') {
    const requests = (intent as Record<string, unknown>).requests;
    if (!Array.isArray(requests)) return null;
    for (const request of requests as Array<Record<string, unknown>>) {
      const source = request.source_ref as Record<string, unknown> | null;
      if (source?.mode === 'post_id' && (typeof source.id !== 'string' || !data.allowed.has(source.id))) return 'A posting source is outside the resolved selector. Narrow or clarify the source before making a plan.';
      if (source?.mode === 'media_id' && (typeof source.id !== 'string' || !allowedMedia.has(source.id))) return 'A posting media source is outside the resolved selector. Narrow or clarify the source before making a plan.';
    }
    return null;
  }
  const operations = (intent as Record<string, unknown>).operations;
  if (!Array.isArray(operations)) return null;
  const manualActions = data.fixture.manualActions as Array<Record<string, unknown>>;
  const actionTargets = (action: Record<string, unknown>): string[] => {
    const targets = new Set<string>();
    if (typeof action.postId === 'string') targets.add(action.postId);
    if (Array.isArray(action.postIds)) for (const id of action.postIds) if (typeof id === 'string') targets.add(id);
    if (Array.isArray(action.mediaIds)) for (const id of action.mediaIds) {
      const asset = data.fixture.posts.flatMap(post => post.mediaIds.map(mediaId => ({ postId: post.postId, mediaId }))).find(row => row.mediaId === id);
      if (asset) targets.add(asset.postId); else targets.add(`foreign:${String(id)}`);
    }
    if (typeof action.workId === 'string') for (const id of data.allPostsForWork(action.workId)) targets.add(id);
    if (typeof action.collectionId === 'string') {
      const collection = data.fixture.state.tables.collections.find(row => String(row.id) === action.collectionId);
      if (!collection) targets.add(`foreign:${action.collectionId}`);
      else for (const member of data.fixture.state.tables.collectionPosts.filter(row => row.collectionId === action.collectionId)) targets.add(String(member.postId));
    }
    return [...targets];
  };
  for (const operation of operations as Array<Record<string, unknown>>) {
    const scope = operation.scope;
    const target = operation.target as Record<string, unknown> | null;
    const targetIds = target && ids(target.ids) ? target.ids as string[] : [];
    if (scope === 'post' && target?.source === 'ids' && !allIncluded(targetIds)) return 'A post edit targets an item outside the resolved selector. Nothing changed; narrow or clarify the target.';
    if (scope === 'media' && target?.source === 'ids' && targetIds.some(id => !allowedMedia.has(id))) return 'A media edit targets an item outside the resolved selector. Nothing changed; narrow or clarify the target.';
    if (operation.operation === 'remove_cart' || operation.change === 'revise') {
      const old = manualActions.find(action => action.id === operation.actionId);
      if (!old) return 'A cart revision or removal must name an existing staged action. Nothing changed.';
      if (!allIncluded(actionTargets(old))) return 'The staged action being revised or removed affects posts outside the resolved selector. Nothing changed.';
    }
    if (operation.operation === 'reorder') {
      const ordered = Array.isArray(operation.orderedIds) ? operation.orderedIds : [];
      if (scope === 'post' && ordered.some(id => typeof id !== 'string' || !allowedMedia.has(id))) return 'A media reorder includes an asset outside the resolved selector.';
      if (scope === 'collection' && ordered.some(id => typeof id !== 'string' || !data.allowed.has(id))) return 'A collection reorder includes a post outside the resolved selector.';
    }
    if (scope === 'work' && target?.source !== 'new') {
      const workIds = target?.source === 'ids' ? targetIds : [...new Set(authorizedPostIds.map(postId => String(data.fixture.state.tables.workMembers.find(row => row.postId === postId)?.creativeWorkId ?? '')))].filter(Boolean);
      for (const workId of workIds) {
        if (!(BENCH_IDS.works as readonly string[]).includes(workId) || !allIncluded(data.allPostsForWork(workId))) return 'A work edit would include posts outside the resolved selector. Nothing changed; include the whole work or narrow the request.';
      }
    }
    if (scope === 'series' && target?.source !== 'new') {
      const seriesIds = target?.source === 'ids' ? targetIds : [...new Set(authorizedPostIds.flatMap(postId => data.fixture.state.tables.seriesMembers.filter(member => data.fixture.state.tables.workMembers.some(workMember => workMember.postId === postId && workMember.creativeWorkId === member.creativeWorkId)).map(member => String(member.creativeSeriesId))))];
      for (const seriesId of seriesIds) {
        if (!(BENCH_IDS.series as readonly string[]).includes(seriesId) || !allIncluded(data.allPostsForSeries(seriesId))) return 'A series edit would include posts outside the resolved selector. Nothing changed; include the whole series or narrow the request.';
      }
    }
    if (ids(operation.postIds) && !(operation.postIds as string[]).every(id => data.allowed.has(id))) return 'A membership edit targets a post outside the resolved selector. Nothing changed.';
    if (ids(operation.observationMediaIds) && (operation.observationMediaIds as string[]).some(id => !allowedMedia.has(id))) return 'A media observation is outside the resolved selector.';
    if (operation.operation === 'link_work' && typeof operation.postId === 'string' && !data.allowed.has(operation.postId)) return 'A work link targets a post outside the resolved selector.';
    if (operation.operation === 'link_series' && typeof operation.workId === 'string' && !allIncluded(data.allPostsForWork(operation.workId))) return 'A series link uses a work outside the resolved selector.';
  }
  return null;
}

const fold = (value: string) => value.toLocaleLowerCase('en-GB');
const includes = (actual: string, query: string) => fold(actual).includes(fold(query));
// The fixture uses both labels for completed work; treat them as one selector-stage value.
const canonicalStage = (value: string) => ['finished', 'final'].includes(fold(value)) ? 'completed' : fold(value);

function catalogue() {
  const fixture = createBenchFixture();
  const cards = createBenchPostCards(fixture);
  const assets = createBenchMediaDescriptors(fixture);
  const seriesPosts = new Map<string, string[]>();
  for (const member of fixture.state.tables.seriesMembers) {
    const seriesId = String(member.creativeSeriesId);
    const ids = fixture.state.tables.workMembers.filter(row => row.creativeWorkId === member.creativeWorkId).map(row => String(row.postId));
    seriesPosts.set(seriesId, [...(seriesPosts.get(seriesId) ?? []), ...ids]);
  }
  return { fixture, cards, assets, seriesPosts };
}

function validValue(field: SelectorField, value: string, data: ReturnType<typeof catalogue>): boolean {
  const allPostIds = data.cards.map(card => card.postId);
  const allWorkIds = data.fixture.state.tables.works.map(row => String(row.id));
  const allSeriesIds = data.fixture.state.tables.series.map(row => String(row.id));
  const allCollections = data.fixture.state.tables.collections.map(row => String(row.id));
  const values = (items: string[]) => items.some(item => fold(item) === fold(value));
  switch (field) {
    case 'post_id': return values(allPostIds);
    case 'work_id': return values(allWorkIds);
    case 'series_id': return values(allSeriesIds);
    case 'collection_id': return values(allCollections);
    case 'tag': return values([...new Set(data.cards.flatMap(card => card.tags))]);
    case 'stage': return values([...new Set(data.cards.map(card => card.stage))]) || ['finished', 'final'].includes(fold(value));
    case 'publish_state': return values([...new Set(data.cards.map(card => card.publishState))]);
    case 'title': return data.cards.some(card => includes(card.title, value));
    case 'description': return true;
    case 'media_type': return values([...new Set(data.assets.map(asset => asset.mimeType))]) || ['image', 'video'].includes(fold(value));
    case 'media_role': return values([...new Set(data.assets.map(asset => asset.role))]);
    case 'media_label': return data.assets.some(asset => includes(asset.label, value));
    case 'filename': return data.assets.some(asset => includes(asset.filename, value));
    case 'orientation': return values([...new Set(data.assets.flatMap(asset => asset.orientation ? [asset.orientation] : []))]);
    case 'processing_status': return values([...new Set(data.assets.map(asset => asset.processingStatus))]);
  }
}

export type ResolvedDatePredicate = DatePredicate & { resolvedValue: string };
type ResolvedSelectorPredicate = MetadataPredicate | ResolvedDatePredicate;
function matchesPredicate(postId: string, predicate: ResolvedSelectorPredicate, data: ReturnType<typeof catalogue>): boolean {
  const card = data.cards.find(item => item.postId === postId)!;
  const assets = data.assets.filter(asset => asset.postId === postId);
  const equal = (actual: string | null | undefined) => actual != null && fold(actual) === fold(predicate.value);
  const hasText = (actual: string | null | undefined) => actual != null && includes(actual, predicate.value);
  if (predicate.field === 'created_date' || predicate.field === 'published_date') {
    const actual = predicate.field === 'created_date' ? card.createdDateLocal : card.publishedDateLocal;
    if (!actual) return false;
    if (predicate.op === 'in_month') return actual.startsWith(predicate.resolvedValue);
    switch (predicate.op) {
      case 'on': return actual === predicate.resolvedValue;
      case 'before': return actual < predicate.resolvedValue;
      case 'after': return actual > predicate.resolvedValue;
      case 'on_or_before': return actual <= predicate.resolvedValue;
      case 'on_or_after': return actual >= predicate.resolvedValue;
    }
  }
  switch (predicate.field) {
    case 'post_id': return equal(postId);
    case 'work_id': return equal(fixtureWorkId(data.fixture, postId));
    case 'series_id': return data.seriesPosts.get(predicate.value)?.includes(postId) ?? [...data.seriesPosts].some(([id, ids]) => equal(id) && ids.includes(postId));
    case 'collection_id': return card.collectionIds.some(equal);
    case 'tag': return card.tags.some(equal);
    case 'stage': return canonicalStage(card.stage) === canonicalStage(predicate.value);
    case 'publish_state': return equal(card.publishState);
    case 'title': return hasText(card.title);
    case 'description': return hasText(card.description);
    case 'media_type': return assets.some(asset => equal(asset.mimeType) || (fold(predicate.value) === 'image' && asset.mimeType.startsWith('image/')) || (fold(predicate.value) === 'video' && asset.mimeType.startsWith('video/')));
    case 'media_role': return assets.some(asset => equal(asset.role));
    case 'media_label': return assets.some(asset => hasText(asset.label));
    case 'filename': return assets.some(asset => hasText(asset.filename));
    case 'orientation': return assets.some(asset => equal(asset.orientation));
    case 'processing_status': return assets.some(asset => equal(asset.processingStatus));
  }
}
function fixtureWorkId(fixture: ReturnType<typeof createBenchFixture>, postId: string): string | null {
  const workId = fixture.state.tables.workMembers.find(row => row.postId === postId)?.creativeWorkId;
  return typeof workId === 'string' ? workId : null;
}

const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const monthPattern = /^(\d{4})-(\d{2})$/;
const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
function validDay(value: string): boolean {
  const match = datePattern.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year!, month! - 1, day!);
  date.setUTCHours(0, 0, 0, 0);
  return year! > 0 && date.getUTCFullYear() === year && date.getUTCMonth() === month! - 1 && date.getUTCDate() === day;
}
function validMonth(value: string): boolean {
  const match = monthPattern.exec(value);
  return !!match && Number(match[1]) > 0 && Number(match[2]) >= 1 && Number(match[2]) <= 12;
}
function shiftDay(value: string, days: number): string {
  const [year, month, day] = value.split('-').map(Number);
  const result = new Date(0);
  result.setUTCFullYear(year!, month! - 1, day! + days);
  result.setUTCHours(0, 0, 0, 0);
  return `${result.getUTCFullYear().toString().padStart(4,'0')}-${String(result.getUTCMonth()+1).padStart(2,'0')}-${String(result.getUTCDate()).padStart(2,'0')}`;
}
function shiftMonth(value: string, months: number): string {
  const [year, month] = value.split('-').map(Number);
  const result = new Date(0);
  result.setUTCFullYear(year!, month! - 1 + months, 1);
  result.setUTCHours(0, 0, 0, 0);
  return `${result.getUTCFullYear().toString().padStart(4,'0')}-${String(result.getUTCMonth()+1).padStart(2,'0')}`;
}
function hasToken(haystack: string, token: string): boolean {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^A-Za-z0-9-])${escaped}(?=$|[^A-Za-z0-9-])`, 'i').test(haystack);
}
function hasRelativeQuote(quote: string, phrase: string): boolean {
  return hasToken(quote.replaceAll('_', ' '), phrase);
}
function monthQuote(quote: string, value: string): boolean {
  if (hasToken(quote, value)) return true;
  const [year, month] = value.split('-').map(Number);
  return hasToken(quote, `${monthNames[month! - 1]} ${year}`);
}
export function resolveDatePredicate(term: DatePredicate, requestClock: BenchRequestClock): ResolvedDatePredicate | null {
  if (requestClock.timezone !== 'Europe/London' || !validDay(requestClock.localDate) || !Number.isFinite(Date.parse(requestClock.receivedAtUtc))) return null;
  let resolvedValue: string;
  if (term.op === 'on' && (term.value === 'today' || term.value === 'yesterday')) {
    const phrase = term.value;
    if (!hasRelativeQuote(term.requestQuote, phrase)) return null;
    resolvedValue = phrase === 'today' ? requestClock.localDate : shiftDay(requestClock.localDate, -1);
  } else if (term.op === 'in_month' && (term.value === 'this_month' || term.value === 'last_month')) {
    const phrase = term.value.replace('_', ' ');
    if (!hasRelativeQuote(term.requestQuote, phrase)) return null;
    const currentMonth = requestClock.localDate.slice(0, 7);
    resolvedValue = term.value === 'this_month' ? currentMonth : shiftMonth(currentMonth, -1);
  } else if (term.op === 'in_month') {
    if (!validMonth(term.value) || !monthQuote(term.requestQuote, term.value)) return null;
    resolvedValue = term.value;
  } else {
    if (!validDay(term.value) || !hasToken(term.requestQuote, term.value)) return null;
    resolvedValue = term.value;
  }
  return { ...term, resolvedValue };
}
function isDatePredicate(term: SelectorPredicate): term is DatePredicate {
  return term.field === 'created_date' || term.field === 'published_date';
}

/** Resolve the model's strict selector only against the bounded, server-owned fixture catalogue. */
export function resolveMetadataSelector(value: unknown, request: string, selectedPostIds: string[], requestClock: BenchRequestClock): SelectorResolution {
  if (!matchesSchema(value, METADATA_SELECTOR_SCHEMA)) return { ok: false, reason: 'invalid', message: 'The metadata selector did not match the required contract.' };
  const selector = value as MetadataSelector;
  const terms = [...selector.all, ...selector.any, ...selector.none];
  if (terms.length > 32) return { ok: false, reason: 'invalid', message: 'A selector may contain at most 32 metadata criteria in total, with at most 16 in each predicate group.' };
  if (selector.base === 'empty' && terms.length > 0) return { ok: false, reason: 'invalid', message: 'An empty selection base cannot include metadata filters.' };
  if (requestClock.timezone !== 'Europe/London' || !validDay(requestClock.localDate) || !Number.isFinite(Date.parse(requestClock.receivedAtUtc))) return { ok: false, reason: 'invalid', message: 'The trusted Europe/London request clock is invalid.' };
  const resolvedTerms = new Map<SelectorPredicate, ResolvedSelectorPredicate>();
  const data = catalogue();
  for (const term of terms) {
    if (!term.value.trim()) return { ok: false, reason: 'invalid', message: `The ${term.field.replaceAll('_', ' ')} criterion has a blank metadata value.` };
    if (!term.requestQuote.trim()) return { ok: false, reason: 'invalid', message: `The ${term.field.replaceAll('_', ' ')} criterion has a blank request quote.` };
    if (!request.includes(term.requestQuote)) return { ok: false, reason: 'invalid', message: `The ${term.field.replaceAll('_', ' ')} criterion quote is ungrounded: it is not an exact literal substring of the latest request.` };
    if (isDatePredicate(term)) {
      const resolved = resolveDatePredicate(term, requestClock);
      if (!resolved) return { ok: false, reason: 'invalid', message: `The ${term.field.replaceAll('_', ' ')} criterion has an unsupported or ungrounded date. Clarify its exact date, month, or supported relative period.` };
      resolvedTerms.set(term, resolved);
    } else {
      if (term.field === 'description' && !includes(term.requestQuote, term.value)) return { ok: false, reason: 'invalid', message: 'The description criterion must appear literally in its request quote.' };
      if (!validValue(term.field, term.value, data)) return { ok: false, reason: 'unknown', message: `I could not match ${term.field.replaceAll('_', ' ')} “${term.value}” in the fixture metadata. Please clarify the target.` };
      resolvedTerms.set(term, term);
    }
  }
  for (const term of terms) {
    if (isDatePredicate(term)) continue;
    if (term.field === 'post_id') {
      const post = data.cards.find(card => fold(card.postId) === fold(term.value));
      const nameIsUnique = post && data.cards.filter(card => fold(card.title) === fold(post.title)).length === 1;
      if (!post || !nameIsUnique || !includes(term.requestQuote, post.title)) return { ok: false, reason: 'unknown', message: 'A post ID selector must be grounded by that post’s unique visible name. Please clarify the post.' };
    }
  }
  const base = selector.base === 'catalog' ? [...BENCH_IDS.posts] : selector.base === 'selection' ? [...selectedPostIds] : [];
  const result = base.filter(postId => {
    const match = (term: SelectorPredicate) => {
      const resolved = resolvedTerms.get(term);
      return !!resolved && matchesPredicate(postId, resolved, data);
    };
    return selector.all.every(term => match(term)) &&
      (!selector.any.length || selector.any.some(term => match(term))) &&
      selector.none.every(term => !match(term));
  });
  return { ok: true, matchedPostIds: BENCH_IDS.posts.filter(postId => result.includes(postId)) };
}
