import { describe, expect, it } from 'vitest';
import { BENCH_IDS } from '../../src/editor-bench/fixtures.js';
import { POSTING_EXAMPLES, runPostingBench } from '../../src/editor-bench/routing.js';
import type { BenchRequest } from '../../src/editor-bench/curation.js';
import type { PlanningProvider, PlanningProviderInput, PlanningProviderResponse } from '../../src/conversational-planning/intent.js';

const source = POSTING_EXAMPLES[0];
function exampleRequest(): BenchRequest {
  return { mode: 'mock_posting', selectedPostIds: [...source.selectedPostIds], selectedMediaIds: [...source.selectedMediaIds], replay: { kind: 'example', exampleId: source.id } };
}
function edited(mutator: (intent: Record<string, any>) => void, latestRequest = source.latestRequest): BenchRequest {
  const intent = structuredClone(source.structuredIntent) as Record<string, any>;
  mutator(intent);
  return { mode: 'mock_posting', selectedPostIds: [...source.selectedPostIds], selectedMediaIds: [...source.selectedMediaIds], replay: { kind: 'edited', latestRequest, structuredIntent: intent } };
}
function provider(value: unknown): PlanningProvider & { seen: PlanningProviderInput[] } {
  const seen: PlanningProviderInput[] = [];
  const response: PlanningProviderResponse = { text: JSON.stringify(value), usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 }, finishReason: 'stop' };
  return { seen, async respond(input) { seen.push(input); return response; } };
}

describe('editor bench mock-posting core', () => {
  it('compiles a complete honest graph with independent destination handoffs and publication-relative follow-ups', async () => {
    const response = await runPostingBench(exampleRequest());
    expect(response.status, response.diagnostics.join(' ')).toBe('clarification');
    expect(response.provenance).toBe('example_replay');
    const result = response.result as any;
    expect(result.source).toMatchObject({ kind: 'existing_post', post_id: BENCH_IDS.posts[0], selected_media_ids: [BENCH_IDS.media[0]] });
    const steps = result.steps as any[];
    expect(steps.find(step => step.capability === 'prepare_preview').dependsOn).toContain(steps.find(step => step.capability === 'prepare_post_draft').id);
    for (const destination of ['patreon', 'x', 'deviantart']) expect(steps.some(step => step.capability === 'publish_handoff' && step.destination === destination)).toBe(true);
    expect(steps.find(step => step.capability === 'publish_handoff' && step.destination === 'x')).toMatchObject({ enabled: false, destinationReadiness: 'needs_credential' });
    expect(steps.find(step => step.capability === 'publish_handoff' && step.destination === 'deviantart')).toMatchObject({ enabled: false, destinationReadiness: 'needs_extension' });
    const reply = steps.find(step => step.capability === 'reply_block');
    expect(reply).toMatchObject({ enabled: false, time: { kind: 'after_publication_calendar_days', day_offset: 1 } });
    expect(reply.time.anchor_step_id).toBe(reply.dependsOn[0]);
    expect(result.note).toContain('No draft, preview, handoff, publication, or reminder has been executed');
  });

  it('turns a missing template and omitted engagement action into compiler clarification slots', async () => {
    const request = edited(intent => {
      intent.requests.filter((item: any) => item.kind === 'teaser').forEach((item: any) => { item.template_ref = { mode: 'none', value: null }; });
      const follow = intent.requests.find((item: any) => item.kind === 'followup');
      follow.social_action = null;
    });
    const response = await runPostingBench(request);
    expect(response.status, response.diagnostics.join(' ')).toBe('clarification');
    const result = response.result as any;
    expect(result.snapshot.clarifications.map((item: any) => item.reason)).toContain('missing_template');
    expect(result.snapshot.clarifications.map((item: any) => item.reason)).toContain('unknown_engagement_action');
    expect(result.steps.some((step: any) => step.capability === 'publish_handoff' && step.destination === 'x')).toBe(false);
  });

  it('rejects foreign selections and asks the compiler to resolve ambiguous source posts', async () => {
    const foreign = await runPostingBench({ mode: 'mock_posting', selectedPostIds: ['other_creator_post'], selectedMediaIds: [], replay: { kind: 'free_text', latestRequest: 'Prepare a draft.' } });
    expect(foreign.status).toBe('rejected');
    expect(foreign.diagnostics.join(' ')).toContain('foreign_selection');
    const ambiguous = await runPostingBench({ mode: 'mock_posting', selectedPostIds: [BENCH_IDS.posts[0], BENCH_IDS.posts[1]], selectedMediaIds: [...source.selectedMediaIds], replay: { kind: 'edited', latestRequest: source.latestRequest, structuredIntent: structuredClone(source.structuredIntent) } });
    expect(ambiguous.status).toBe('clarification');
    expect((ambiguous.result as any).slots[0].reason).toBe('ambiguous_source');
  });

  it('asks the creator to narrow oversized posting selections instead of truncating production context', async () => {
    const response = await runPostingBench({ mode: 'mock_posting', selectedPostIds: BENCH_IDS.posts.slice(0, 5), selectedMediaIds: BENCH_IDS.media.slice(0, 5), replay: { kind: 'edited', latestRequest: 'Prepare a draft.', structuredIntent: {} } });
    expect(response.status).toBe('clarification');
    expect(response.diagnostics.join(' ')).toContain('selection_context_limit');
    expect(response.message).toContain('Choose one source or narrow the selection');
  });

  it('validates metadata-only limitation through the actual interpreter and supports an injected provider', async () => {
    const model = provider({ base_revision: null, outcome: 'limitation', question: 'Visual analysis is unavailable.', requests: [] });
    const response = await runPostingBench({ mode: 'mock_posting', selectedPostIds: source.selectedPostIds, selectedMediaIds: source.selectedMediaIds, replay: { kind: 'free_text', latestRequest: 'Tell me what colors are in this image.' } }, { provider: model });
    expect(response.status).toBe('limitation');
    expect(response.provenance).toBe('model_interpretation');
    expect(response.result).toBeNull();
    expect(model.seen).toHaveLength(1);
    expect(model.seen[0].context.selected.media_ids).toEqual([BENCH_IDS.media[0]]);
  });
});
