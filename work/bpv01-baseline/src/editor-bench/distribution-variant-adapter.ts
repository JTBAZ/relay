import { createHash } from 'node:crypto';
import { buildDistributionPlanCreateData, buildDistributionVariantCreateData } from '../distribution/distribution-row-builders.js';
import { formatPlatformVariant, type FormattedPlatformVariant } from '../distribution/platform-formatters.js';
import { PLATFORM_DESTINATION_META } from '../distribution/platform-destinations.js';
import type { ScheduleReviewPayload } from './schedule-review.js';
import { createBenchFixture, createBenchMediaDescriptors, createBenchPostCards } from './fixtures.js';

export type BenchVariantSource = {
  revision: number;
  postId: string;
  title: string;
  description: string | null;
  tagLabels: string[];
  mediaIds: string[];
  media: Array<{ id: string; filename: string; mimeType: string; role: string; orientation: string | null; processingStatus: string; label: string }>;
};
export type BenchVariantBinding = { postId: string; mediaIds: string[]; versionKey: string; fingerprint: string };
export type BenchVariantDraft = FormattedPlatformVariant;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
export function sha256(value: unknown): string { return createHash('sha256').update(canonical(value)).digest('hex'); }

/** Rebuild the effective server-owned fixture version and selected ordered media. */
export function loadBenchVariantSource(postId: string, selectedMediaIds: string[], fixture: ReturnType<typeof createBenchFixture> = createBenchFixture()): BenchVariantSource | null {
  const state = fixture.state;
  const card = createBenchPostCards(fixture).find(row => row.postId === postId);
  const version = state.tables.versions.find(row => row.postId === postId);
  const presentation = state.tables.presentations.find(row => row.postId === postId);
  if (!card || !version || !presentation || !fixture.state.scope.posts.includes(postId)) return null;
  const versionMediaIds = [...version.mediaIds as string[]];
  const requestedOrder = Array.isArray(presentation.mediaOrder) ? [...presentation.mediaOrder as string[]] : [];
  const orderedIds = [...requestedOrder.filter(id => versionMediaIds.includes(id)), ...versionMediaIds.filter(id => !requestedOrder.includes(id))];
  const fullMembership = [...version.mediaIds as string[]];
  if (new Set(orderedIds).size !== orderedIds.length || new Set(fullMembership).size !== fullMembership.length ||
      orderedIds.length !== fullMembership.length || orderedIds.some(id => !fullMembership.includes(id))) return null;
  const allMedia = createBenchMediaDescriptors(fixture);
  const byId = new Map(allMedia.filter(row => row.postId === postId).map(row => [row.id, row]));
  const media = selectedMediaIds.map(id => byId.get(id));
  if (!selectedMediaIds.length || selectedMediaIds.length > 3 || new Set(selectedMediaIds).size !== selectedMediaIds.length ||
      selectedMediaIds.some(id => !orderedIds.includes(id)) || media.some(row => !row || row.mimeType !== 'image/jpeg' && row.mimeType !== 'image/png' && row.mimeType !== 'image/avif' || row.processingStatus !== 'ready')) return null;
  const tagDelta = state.tables.overrides.find(row => row.postId === postId && row.mediaId === '');
  const removedTags = Array.isArray(tagDelta?.removeTagIds) ? tagDelta.removeTagIds as string[] : [];
  const addedTags = Array.isArray(tagDelta?.addTagIds) ? tagDelta.addTagIds as string[] : [];
  const tagLabels = [...new Set([...(version.tagIds as string[]).filter(tag => !removedTags.includes(tag)), ...addedTags])];
  const source: BenchVariantSource = {
    revision: fixture.revision, postId, title: card.title, description: card.description,
    tagLabels, mediaIds: orderedIds,
    media: media.map(row => ({ id: row!.id, filename: row!.filename, mimeType: row!.mimeType, role: row!.role, orientation: row!.orientation, processingStatus: row!.processingStatus, label: row!.label })),
  };
  return source;
}
export function bindBenchVariantSource(source: BenchVariantSource): BenchVariantBinding {
  return { postId: source.postId, mediaIds: source.media.map(row => row.id), versionKey: `bench_source_v1:${source.revision}:${source.postId}`, fingerprint: sha256(source) };
}
export function exactBenchVariant(source: BenchVariantSource, destination: 'x' | 'deviantart', title: string): { baseline: FormattedPlatformVariant; approved: FormattedPlatformVariant; diff: Record<string, { before: unknown; after: unknown }> } | null {
  const baseline = formatPlatformVariant(destination, { title: source.title, bodyText: source.description ?? '', tagLabels: source.tagLabels });
  const approved: FormattedPlatformVariant = structuredClone(baseline);
  if (destination === 'x') approved.postText = title;
  else approved.title = title;
  const meta = PLATFORM_DESTINATION_META[destination];
  if (source.media.length > meta.mediaLimit) return null;
  if (destination === 'x' && (title.length > (meta.characterLimit ?? 280) || !title.trim())) return null;
  if (destination === 'deviantart' && (title.length > 200 || !title.trim())) return null;
  const fields = ['title', 'bodyText', 'postText', 'tags', 'platformFields'] as const;
  const diff: Record<string, { before: unknown; after: unknown }> = {};
  for (const field of fields) if (canonical(baseline[field]) !== canonical(approved[field])) diff[field] = { before: baseline[field], after: approved[field] };
  return { baseline, approved, diff };
}

/** Shared V3 review compiler used by both the legacy schedule route and conversation posting. */
export function reviewBenchVariantV3(source: BenchVariantSource, destination: 'x' | 'deviantart', title: string) {
  const variant = exactBenchVariant(source, destination, title);
  if (!variant) return null;
  const binding = bindBenchVariantSource(source);
  const variantHash = sha256(variant.approved);
  return { source, variant, binding, variantHash };
}

export type BenchVariantRows = { plan: Record<string, any>; variant: Record<string, any>; event: Record<string, any> };
export type BenchVariantCommit = (identity: string, facts: Record<string, unknown>, create: () => BenchVariantRows) => Promise<{ rows: BenchVariantRows; reused: boolean }>;
type SavedEditReceipt = { facts: Record<string, unknown>; rows: BenchVariantRows; revision: number };
type SavedVariant = { facts: Record<string, unknown>; creationRows: BenchVariantRows; currentRows: BenchVariantRows; edits: Map<string, SavedEditReceipt> };
export type BenchVariantEditClaims = {
  creatorId: string; variantId: string; eventId: string; planId: string; field: 'postText' | 'title'; destination: 'x' | 'deviantart';
  expectedRevision: number; oldTextHash: string; newText: string; sourceVersionKey: string; sourceFingerprint: string;
};
export type BenchVariantEditReceipt = { rows: BenchVariantRows; revision: number; reused: boolean };

/** Per-router ephemeral storage; read/write boundaries always return independent copies. */
export function createBenchDistributionVariantAdapter(options: { beforeCommit?: () => void | Promise<void> } = {}) {
  const saved = new Map<string, SavedVariant>();
  const clone = <T>(value: T): T => structuredClone(value);
  const commit: BenchVariantCommit = async (identity, facts, create) => {
    const checkExisting = () => {
      const existing = saved.get(identity);
      if (!existing) return null;
      if (canonical(existing.facts) !== canonical(facts)) throw Object.assign(new Error('Saved mock records conflict with this review identity.'), { code: 'CONFLICT' });
      return { rows: clone(existing.creationRows), reused: true as const };
    };
    const first = checkExisting();
    if (first) return first;
    await options.beforeCommit?.();
    const afterHook = checkExisting();
    if (afterHook) return afterHook;
    const rows = clone(create());
    saved.set(identity, { facts: clone(facts), creationRows: clone(rows), currentRows: clone(rows), edits: new Map() });
    return { rows: clone(rows), reused: false };
  };
  const readVariant = (creatorId: string, variantId: string) => {
    for (const [identity, entry] of saved) {
      if (entry.currentRows.variant.id === variantId && entry.currentRows.variant.creatorId === creatorId) {
        return { identity, creationRows: clone(entry.creationRows), currentRows: clone(entry.currentRows) };
      }
    }
    return null;
  };
  const listEditableVariants = (creatorId: string) => [...saved.values()].map(entry => entry.currentRows).filter(rows => {
    const { plan, variant, event } = rows;
    const destination = variant.destination;
    const field = destination === 'x' ? 'postText' : destination === 'deviantart' ? 'title' : null;
    const source = variant.advice?.bench_source_v1?.source;
    const revision = currentRevisionOf(variant);
    const text = field ? variant[field] : null;
    return !!field && variant.creatorId === creatorId && plan.creatorId === creatorId && plan.id === variant.planId &&
      variant.status === 'draft' && event.status === 'pending' && event.destination === destination &&
      event.linkage?.plan_id === plan.id && event.linkage?.variant_id === variant.id && event.title === text &&
      event.id === variant.advice?.bench_source_v1?.event_link?.event_id && typeof text === 'string' &&
      typeof source?.version_key === 'string' && typeof source?.fingerprint === 'string' && Number.isSafeInteger(revision) && revision >= 0;
  }).map(clone);
  const confirmEdit = async (identity: string, editIdentity: string, facts: Record<string, unknown>, claims: BenchVariantEditClaims, confirmedAt: string): Promise<BenchVariantEditReceipt> => {
    const entry = saved.get(identity);
    const eligible = (rows: BenchVariantRows | undefined) => {
      if (!rows) return false;
      const { plan, variant, event } = rows;
      const provenance = variant.advice?.bench_source_v1;
      const source = provenance?.source;
      return variant.creatorId === claims.creatorId && variant.id === claims.variantId && variant.planId === claims.planId &&
        plan.id === claims.planId && plan.creatorId === claims.creatorId && variant.status === 'draft' &&
        event.id === claims.eventId && event.status === 'pending' && event.destination === claims.destination &&
        event.linkage?.plan_id === plan.id && event.linkage?.variant_id === variant.id && event.title === currentText(variant, claims.field) &&
        variant.destination === claims.destination && source?.version_key === claims.sourceVersionKey && source?.fingerprint === claims.sourceFingerprint;
    };
    if (!entry) throw Object.assign(new Error('Mock draft not found.'), { code: 'NOT_FOUND' });
    if (!eligible(entry.currentRows)) throw Object.assign(new Error('Mock draft or linked cue changed.'), { code: 'CONFLICT' });
    const savedEdit = entry.edits.get(editIdentity);
    if (savedEdit) {
      if (canonical(savedEdit.facts) !== canonical(facts)) throw Object.assign(new Error('Saved edit receipt conflicts with this review identity.'), { code: 'CONFLICT' });
      return { rows: clone(savedEdit.rows), revision: savedEdit.revision, reused: true };
    }
    await options.beforeCommit?.();
    const latest = saved.get(identity);
    if (!latest) throw Object.assign(new Error('Mock draft not found.'), { code: 'NOT_FOUND' });
    if (!eligible(latest.currentRows)) throw Object.assign(new Error('Mock draft or linked cue changed.'), { code: 'CONFLICT' });
    const replay = latest.edits.get(editIdentity);
    if (replay) {
      if (canonical(replay.facts) !== canonical(facts)) throw Object.assign(new Error('Saved edit receipt conflicts with this review identity.'), { code: 'CONFLICT' });
      return { rows: clone(replay.rows), revision: replay.revision, reused: true };
    }
    const rows = latest.currentRows;
    const currentRevision = currentRevisionOf(rows.variant);
    const before = currentText(rows.variant, claims.field);
    if (currentRevision !== claims.expectedRevision || !before || sha256(before) !== claims.oldTextHash || rows.event.title !== before) {
      throw Object.assign(new Error('This edit review is stale. Review the current draft again.'), { code: 'STALE', currentRevision });
    }
    const next = clone(rows);
    next.variant[claims.field] = claims.newText;
    next.variant.updatedAt = confirmedAt;
    next.event.title = claims.newText;
    next.event.updated_at = confirmedAt;
    const revisionState = next.variant.advice.bench_variant_revisions_v1;
    const revision = currentRevision + 1;
    revisionState.currentRevision = revision;
    revisionState.revisions.push({ revision, field: claims.field, before, after: claims.newText,
      sourceVersionKey: claims.sourceVersionKey, sourceFingerprint: claims.sourceFingerprint, confirmedAt, editIdentity });
    latest.currentRows = clone(next);
    latest.edits.set(editIdentity, { facts: clone(facts), rows: clone(next), revision });
    return { rows: clone(next), revision, reused: false };
  };
  return { commit, readVariant, listEditableVariants, confirmEdit, snapshot: () => [...saved.values()].map(row => clone(row.currentRows)), size: () => saved.size };
}

function currentText(variant: Record<string, any>, field: BenchVariantEditClaims['field']): string | null {
  const value = variant[field];
  return typeof value === 'string' ? value : null;
}
function currentRevisionOf(variant: Record<string, any>): number {
  return variant.advice?.bench_variant_revisions_v1?.currentRevision ?? -1;
}

export function buildBenchVariantRows(input: {
  creatorId: string; identity: string; payload: ScheduleReviewPayload; source: BenchVariantSource;
  binding: BenchVariantBinding; approved: FormattedPlatformVariant; diff: Record<string, { before: unknown; after: unknown }>;
  variantHash: string; now?: Date;
}): BenchVariantRows {
  const { creatorId, identity, payload, source, binding, approved, diff, variantHash } = input;
  const now = (input.now ?? new Date()).toISOString();
  const planId = `bench_plan_${identity}`;
  const variantId = `bench_variant_${identity}`;
  const eventId = `bench_event_${identity}`;
  const provenance = {
    kind: 'bench_source_v1', source: { version_key: binding.versionKey, fingerprint: binding.fingerprint,
      revision: source.revision, post_id: source.postId, title: source.title, description: source.description,
      tag_labels: [...source.tagLabels], ordered_media_ids: [...source.mediaIds], selected_media: cloneSelected(source.media) },
    approved_initial_variant: { hash: variantHash, fields: structuredClone(approved), media_ids: [...binding.mediaIds] },
    field_diffs: structuredClone(diff), event_link: { event_id: eventId, post_id: null },
  };
  const planData = buildDistributionPlanCreateData({ creatorId, postId: source.postId, status: 'active', assistantMode: 'none', assistantContext: {}, assistantPlan: { bench_source_v1: provenance } });
  const variantData = buildDistributionVariantCreateData({ planId, postId: source.postId, creatorId, variant: approved, status: 'draft', assistantEnabled: false,
    advice: { ...approved.advice, bench_source_v1: provenance,
      bench_variant_revisions_v1: { currentRevision: 0, revisions: [{ revision: 0, field: payload.destination === 'x' ? 'postText' : 'title',
        value: payload.title, sourceVersionKey: binding.versionKey, sourceFingerprint: binding.fingerprint, confirmedAt: now }] } } });
  return {
    plan: { id: planId, ...planData, createdAt: now, updatedAt: now },
    variant: { id: variantId, ...variantData, locale: null, scheduledFor: payload.due_at, remindMe: false, reminderSentAt: null, createdAt: now, updatedAt: now, attempts: [], postbotTasks: [] },
    event: { id: eventId, source: 'manual_event', event_type: 'make_post', action: 'post', destination: payload.destination,
      title: payload.title, note: payload.note, due_at: payload.due_at, post_id: null, media_ids: [], external_url: null,
      remind_me: false, status: 'pending', created_at: now, updated_at: now,
      linkage: { plan_id: planId, variant_id: variantId } },
  };
}
function cloneSelected(media: BenchVariantSource['media']) { return media.map(row => ({ ...row })); }

/** Shared V3 commit path; callers must perform their own authorization/CAS checks first. */
export async function commitBenchVariantV3(
  adapter: ReturnType<typeof createBenchDistributionVariantAdapter>,
  creatorId: string,
  payload: ScheduleReviewPayload,
  reviewed: NonNullable<ReturnType<typeof reviewBenchVariantV3>>,
) {
  const identity = sha256({ namespace: 'bench-distribution-variant-v3', creatorId, payload, source: reviewed.binding, variantHash: reviewed.variantHash });
  const facts = { creatorId, payload, source: reviewed.binding, variantHash: reviewed.variantHash };
  const saved = await adapter.commit(identity, facts, () => buildBenchVariantRows({
    creatorId, identity, payload, source: reviewed.source, binding: reviewed.binding,
    approved: reviewed.variant.approved, diff: reviewed.variant.diff, variantHash: reviewed.variantHash,
  }));
  return { ...saved, identity };
}
