import { config } from 'dotenv';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const summaryPath = join(root, 'outputs', 'editor-bench-smoke-summary.json');
if (!process.argv.includes('--run')) {
  process.stderr.write('Live smoke is opt-in. Review this script, build with npm run build, then run: node scripts/editor-bench-smoke.mjs --run\n');
  process.exit(2);
}
config({ path: join(root, '.env') });

const model = 'gpt-5.6-luna', effort = 'none', capUsd = 0.03, maxCalls = 8;
const pricing = { inputUsdPerMillion: 0.20, cachedInputUsdPerMillion: 0.02, outputUsdPerMillion: 1.20 };
const ledgerPath = join(root, '.relay-data', 'gallery-editor-budget.json');
const endpoint = 'https://api.openai.com/v1/responses';
const cases = [];
let reservations = [], allReservations = [], reservationAttempts = 0, reservedUsd = 0, networkCalls = 0, capHit = false, transportFailure = false, stopReason = null;
const attemptAccounting = (rows = reservations) => ({
  reservedUsd: Number(rows.reduce((sum, row) => sum + row.reservedUsd, 0).toFixed(8)), knownActualUsd: Number(rows.reduce((sum, row) => sum + (row.actualUsd ?? 0), 0).toFixed(8)),
  conservativeUsd: Number(rows.reduce((sum, row) => sum + (row.actualUsd ?? row.reservedUsd), 0).toFixed(8)),
  unknownChargesHeld: rows.filter(row => row.actualUsd === null).length,
});
const errorCode = value => typeof value?.code === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value.code) ? value.code : 'smoke_failure';
const diagnosticCode = response => {
  if (response?.status === 'proposal') return 'semantic_mismatch';
  const text = Array.isArray(response?.diagnostics) ? response.diagnostics[0] : '';
  const match = typeof text === 'string' ? text.match(/^([A-Za-z0-9_-]{1,64})/) : null;
  return match?.[1] ?? 'unexpected_result';
};
function walkImages(value) {
  if (!value || typeof value !== 'object') return false;
  if (value.type === 'input_image') return true;
  return Object.values(value).some(walkImages);
}
const summary = {
  candidate: model, reasoningEffort: effort, pricingUsdPerMillion: pricing, phase: 'development',
  reservationCapUsd: capUsd, ledgerPath, maxNetworkCalls: maxCalls, networkCalls: 0,
  actualCost: null, cases, counts: { passed: 0, failed: 0, skipped: 0 }, diagnosticCode: null,
};

try {
  if (!process.env.OPENAI_API_KEY?.trim()) throw Object.assign(new Error(), { code: 'missing_api_key' });
  const [budgetModule, providerModule, editorModule, planningModule, planningIntentModule, typesModule] = await Promise.all([
    import('../dist/src/gallery-editor/budget.js'), import('../dist/src/gallery-editor/provider.js'),
    import('../dist/src/editor-bench/curation.js'), import('../dist/src/editor-bench/routing.js'),
    import('../dist/src/conversational-planning/intent.js'), import('../dist/src/gallery-editor/types.js'),
  ]);
  await access(ledgerPath);
  const durable = new budgetModule.FileProviderBudget(ledgerPath);
  const budget = {
    async reserve(input) {
      reservationAttempts++;
      if (input.phase !== 'development' || input.model !== model) throw new typesModule.EditorError('BUDGET_INVALID', 'Smoke configuration refused.');
      if (reservedUsd + input.amountUsd > capUsd) { capHit = true; throw new typesModule.EditorError('BUDGET_EXHAUSTED', 'Smoke reservation cap reached.'); }
      const id = await durable.reserve(input);
      const row = { id, reservedUsd: input.amountUsd, actualUsd: null };
      reservations.push(row);
      allReservations.push(row);
      reservedUsd += input.amountUsd;
      return id;
    },
    async settle(id, actualUsd) { await durable.settle(id, actualUsd); const row = reservations.find(item => item.id === id); if (row) row.actualUsd = actualUsd; },
  };
  const boundedFetch = async (url, init) => {
    if (String(url) !== endpoint || init?.method !== 'POST') throw new typesModule.EditorError('provider_config', 'Smoke transport refused.');
    const body = JSON.parse(String(init.body ?? '{}'));
    if (body.model !== model || body.max_output_tokens !== 3000 || walkImages(body)) throw new typesModule.EditorError('provider_config', 'Smoke request invariant failed.');
    if (networkCalls >= maxCalls) { capHit = true; throw new typesModule.EditorError('BUDGET_EXHAUSTED', 'Smoke network-call cap reached.'); }
    body.reasoning = { effort };
    networkCalls++;
    try {
      const response = await globalThis.fetch(url, { ...init, body: JSON.stringify(body) });
      if (!response.ok) transportFailure = true;
      return response;
    } catch (error) { transportFailure = true; throw error; }
  };
  const liveProvider = providerModule.createResponsesProvider({ apiKey: process.env.OPENAI_API_KEY, model, pricing, budget, phase: 'development', maxOutputTokens: 3000, fetch: boundedFetch });
  const planProvider = planningIntentModule.createPlanningProvider({ modelId: model, pricing, budget, apiKey: process.env.OPENAI_API_KEY, phase: 'development', fetch: boundedFetch }, () => liveProvider);
  const fixture = await import('../dist/src/editor-bench/fixtures.js');
  const postId = fixture.BENCH_IDS.posts[0], mediaId = fixture.BENCH_IDS.media[0];
  const runCase = async (id, check) => {
    if (stopReason) { cases.push({ caseId: id, status: 'skipped', diagnosticCode: 'stopped_after_infrastructure_failure', latencyMs: 0, networkCalls: 0 }); return; }
    reservations = [];
    const callsBefore = networkCalls;
    const began = performance.now();
    let passed = false, code = 'unexpected_result', status = 'error';
    try { const result = await check(); status = result.status; passed = result.passed; code = result.code; }
    catch (error) { code = errorCode(error); }
    const latencyMs = Math.round(performance.now() - began);
    cases.push({ caseId: id, status: passed ? 'passed' : 'failed', benchStatus: status, diagnosticCode: code, latencyMs, networkCalls: networkCalls - callsBefore, ...attemptAccounting() });
    if (capHit) stopReason = 'reservation_or_network_cap';
    else if (transportFailure || status === 'unavailable') stopReason = 'provider_or_transport_unavailable';
    else if (reservations.some(row => row.actualUsd === null)) stopReason = 'unknown_charge_held';
  };
  await runCase('curation_rename_selected_post', async () => {
    const response = await editorModule.runCurationBench({ mode: 'curation', selectedPostIds: [postId], selectedMediaIds: [], replay: { kind: 'free_text', latestRequest: 'Rename the selected post to Dawn glow.' } }, { provider: liveProvider });
    const actions = response.result?.actions ?? [];
    const rename = actions.filter(action => action.kind === 'rename_post');
    const preserved = actions.some(action => action.id === 'bench_manual_description' && action.kind === 'set_description' && action.postId === fixture.BENCH_IDS.posts[2] && action.description === 'Manual note kept as-is.');
    const good = response.status === 'proposal' && actions.length === 2 && rename.length === 1 && rename[0].postId === postId && rename[0].title === 'Dawn glow' && preserved && response.result?.simulationOnly === true;
    return { status: response.status, passed: good, code: good ? 'none' : diagnosticCode(response) };
  });
  await runCase('curation_ambiguous_artwork_rename', async () => {
    const response = await editorModule.runCurationBench({ mode: 'curation', selectedPostIds: [postId], selectedMediaIds: [], replay: { kind: 'free_text', latestRequest: 'Rename the artwork Aurora study to Moonlit.' } }, { provider: liveProvider });
    const actions = response.result?.actions ?? [];
    const good = response.status === 'clarification' && !actions.some(action => action.kind.startsWith('rename_'));
    return { status: response.status, passed: good, code: good ? 'none' : diagnosticCode(response) };
  });
  await runCase('curation_image_only_limitation', async () => {
    const response = await editorModule.runCurationBench({ mode: 'curation', selectedPostIds: [postId], selectedMediaIds: [mediaId], replay: { kind: 'free_text', latestRequest: 'What colors are visible in this image?' } }, { provider: liveProvider });
    const good = response.status === 'limitation' && !response.result?.actions;
    return { status: response.status, passed: good, code: good ? 'none' : diagnosticCode(response) };
  });
  await runCase('mock_posting_patreon_creator_handoff', async () => {
    const response = await planningModule.runPostingBench({ mode: 'mock_posting', selectedPostIds: [postId], selectedMediaIds: [mediaId], replay: { kind: 'free_text', latestRequest: 'Prepare a Patreon creator handoff draft for the selected post titled Moonlight.' } }, { provider: planProvider });
    const result = response.result, draft = result?.steps?.find(step => step.capability === 'prepare_post_draft');
    const rawDraft = result?.snapshot?.steps?.find(step => step.capability === 'prepare_post_draft');
    const good = response.status === 'proposal' && draft?.title === 'Moonlight' && draft.destination === 'patreon' && rawDraft?.target_post_id === postId && rawDraft?.source_media_ids?.includes(mediaId) && result?.note?.includes('No draft');
    return { status: response.status, passed: good, code: good ? 'none' : diagnosticCode(response) };
  });
} catch (error) {
  stopReason = stopReason ?? errorCode(error);
  summary.diagnosticCode = stopReason;
} finally {
  summary.networkCalls = networkCalls;
  summary.reservationAttempts = reservationAttempts;
  summary.actualCost = attemptAccounting(allReservations);
  summary.counts = { passed: cases.filter(row => row.status === 'passed').length, failed: cases.filter(row => row.status === 'failed').length, skipped: cases.filter(row => row.status === 'skipped').length };
  if (stopReason && !summary.diagnosticCode) summary.diagnosticCode = stopReason;
  await mkdir(dirname(summaryPath), { recursive: true });
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  process.stdout.write(`Smoke summary written to outputs/editor-bench-smoke-summary.json (${summary.counts.passed} passed, ${summary.counts.failed} failed, ${summary.counts.skipped} skipped).\n`);
}
if (summary.counts.failed || summary.counts.skipped || summary.diagnosticCode) process.exitCode = 1;
