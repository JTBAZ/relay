#!/usr/bin/env node
/** CE02 paid evaluation entry point. Dry run is the default and never imports a provider. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { resolve, dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { config as loadEnv } from 'dotenv';
import { projectEvaluationState } from './gallery-editor-eval-state.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
loadEnv({ path: join(root, '.env'), quiet: true });
const args = process.argv.slice(2);
function option(name) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  if (index + 1 >= args.length || args[index + 1].startsWith('--')) throw new Error(`${name} requires a value`);
  return args[index + 1];
}
function fail(message) { throw new Error(message); }
if (args.includes('--help')) {
  console.log('Usage: node scripts/evaluate-gallery-editor.mjs --model MODEL --split development|heldout [--corpus FILE] [--family metadata|vision] [--max-output-tokens 4000] [--include-generated-messages] [--out FILE] [--images MAP.json] [--ledger FILE] [--dry-run|--live|--self-test]');
  process.exit(0);
}
const selfTest = args.includes('--self-test');
const architecture = option('--architecture') || 'legacy';
if (!['legacy', 'compiled'].includes(architecture)) fail('--architecture must be legacy or compiled.');
const model = option('--model') || (selfTest ? 'self-test' : undefined);
const split = option('--split') || (selfTest ? 'development' : undefined);
const family = option('--family');
const caseId = option('--case');
const caseIds = caseId?.split(',');
const corpusPath = resolve(option('--corpus') || join(root, 'tests/fixtures/gallery-editor-ce02.json'));
const corpusBytes = await readFile(corpusPath);
const fixture = JSON.parse(corpusBytes.toString('utf8'));
const out = option('--out');
const imagesPath = option('--images');
const includeGeneratedMessages = args.includes('--include-generated-messages');
const maxOutputTokensRaw = option('--max-output-tokens') ?? '4000';
if (!/^\d+$/.test(maxOutputTokensRaw)) fail('--max-output-tokens must be an integer from 256 to 16000.');
const maxOutputTokens = Number(maxOutputTokensRaw);
if (!Number.isSafeInteger(maxOutputTokens) || maxOutputTokens < 256 || maxOutputTokens > 16000) fail('--max-output-tokens must be an integer from 256 to 16000.');
const ledgerPath = option('--ledger') || join(process.env.RELAY_GALLERY_EDITOR_DATA_DIR ?? join(root, '.relay-data'), 'gallery-editor-budget.json');
const live = args.includes('--live');
if ([live, args.includes('--dry-run'), selfTest].filter(Boolean).length > 1) fail('Choose one of --live, --dry-run, and --self-test.');
if (!model?.trim()) fail('--model requires an explicit model identifier.');
if (!['development', 'heldout'].includes(split)) fail('--split must be development or heldout.');
if (family && !['metadata', 'vision'].includes(family)) fail('--family must be metadata or vision.');
if (!['ce02.v1', 'ce02.v2'].includes(fixture.schemaVersion)) fail('Unsupported CE02 schema.');

const cases = fixture.cases.filter(item => item.split === split);
if (caseIds && caseIds.some(id => !cases.some(item => item.id === id))) fail('--case must identify cases in the selected split.');
const requiredCounts = { development: 40, heldout: 20 };
if (cases.length !== requiredCounts[split]) fail('CE02 split size changed; review the fixture before running.');
const sha256 = value => createHash('sha256').update(value).digest('hex');
async function hashFile(path, required = false) {
  try { return sha256(await readFile(path)); } catch (error) { if (required || error?.code !== 'ENOENT') throw error; return null; }
}
const artifactPaths = {
  runner: fileURLToPath(import.meta.url),
  corpus: corpusPath,
  productionIntent: join(root, 'dist/src/gallery-editor/intent.js'),
  productionProvider: join(root, 'dist/src/gallery-editor/provider.js'),
};
const catalog = fixture.catalog;
const posts = new Map(catalog.posts.map(item => [item.id, item]));
const works = new Map(catalog.works.map(item => [item.id, item]));
const series = new Map(catalog.series.map(item => [item.id, item]));
const collections = new Map(catalog.collections.map(item => [item.id, item]));
const media = new Map(catalog.posts.flatMap(post => post.mediaIds.map((id, index) => [id, { id, postId: post.id, sortOrder: index }])));
const visualIds = new Map(catalog.visionFixtures.map(item => [item.id, item.mediaId]));

// A map is keyed by CE02 vision fixture ID. Paths are operator-supplied, local PNG/JPEG evidence.
let imageMap = {};
const imageHashes = {};
if (imagesPath) {
  imageMap = JSON.parse(await readFile(resolve(imagesPath), 'utf8'));
  if (!imageMap || Array.isArray(imageMap) || typeof imageMap !== 'object') fail('Image mapping must be a JSON object.');
  for (const [id, path] of Object.entries(imageMap)) {
    if (!visualIds.has(id) || typeof path !== 'string' || !path.trim()) fail(`Invalid image mapping entry: ${id}`);
  }
}
async function authorizedImage(id) {
  const mapped = imageMap[id];
  if (!mapped) return null;
  const path = realpathSync(resolve(dirname(resolve(imagesPath)), mapped));
  const extension = extname(path).toLowerCase();
  if (!['.png', '.jpg', '.jpeg'].includes(extension)) fail(`Image ${id} must be PNG or JPEG.`);
  const bytes = await readFile(path);
  if (bytes.length > 2_000_000) fail(`Image ${id} exceeds the 2 MB fixture limit.`);
  const png = extension === '.png' && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = extension !== '.png' && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9;
  if (!png && !jpeg) fail(`Image ${id} does not match its PNG/JPEG extension.`);
  imageHashes[id] = sha256(bytes);
  return `data:image/${png ? 'png' : 'jpeg'};base64,${bytes.toString('base64')}`;
}
const imageData = new Map();
for (const id of Object.keys(imageMap)) imageData.set(visualIds.get(id), await authorizedImage(id));

function page(items, args, signature) {
  const limit = Math.min(args.limit ?? 100, 100);
  let offset = 0;
  if (args.cursor !== undefined) {
    let cursor;
    try { cursor = JSON.parse(Buffer.from(args.cursor, 'base64url').toString('utf8')); } catch { fail('Invalid fixture cursor.'); }
    if (cursor.signature !== signature || !Number.isSafeInteger(cursor.offset) || cursor.offset < 0) fail('Cursor does not belong to this fixture read.');
    offset = cursor.offset;
  }
  const slice = items.slice(offset, offset + limit);
  const next = offset + slice.length;
  return { items: slice, total: items.length, complete: offset === 0 && next >= items.length, hasMore: next < items.length,
    nextCursor: next < items.length ? Buffer.from(JSON.stringify({ signature, offset: next })).toString('base64url') : null };
}
function resolvedPost(post) {
  const work = works.get(post.workId);
  const parentSeries = series.get(work?.seriesId);
  const naming = { mode: post.titleMode, effectiveTitle: post.title, sourceTitle: post.sourceTitle,
    ...(work ? { workId: work.id, workTitle: work.title, workTitleMode: work.titleMode } : {}),
    ...(parentSeries ? { seriesId: parentSeries.id, seriesTitle: parentSeries.title } : {}),
    exception: post.titleMode === 'custom' };
  return { postId: post.id, title: post.title, description: post.description, mediaIds: post.mediaIds, tags: post.tags, naming };
}
function makeAdapter(trace = { readToolNames: [], inspectedMediaIds: [] }) {
  let metadataRemaining = 100;
  let imagesRemaining = 24;
  const spendMetadata = count => { if (count > metadataRemaining) fail('Fixture metadata budget exhausted.'); metadataRemaining -= count; };
  const spendImages = count => { if (count > imagesRemaining) fail('Fixture image budget exhausted.'); imagesRemaining -= count; };
  return function adapter(name, args) {
  trace.readToolNames.push(name);
  if (name === 'searchLibraryPosts') {
    const q = String(args.query).toLowerCase().trim();
    const matchedPosts = catalog.posts.filter(post => {
      const work = works.get(post.workId), parentSeries = series.get(work?.seriesId);
      return !q || [post.id, post.title, post.sourceTitle, post.description, ...post.tags, work?.title, parentSeries?.title].filter(Boolean).some(value => String(value).toLowerCase().includes(q));
    }).sort((a, b) => a.id.localeCompare(b.id));
    const result = page(matchedPosts.map(resolvedPost), args, `search:${q}`);
    spendMetadata(result.items.length);
    const matches = result.items.flatMap(post => [...new Set([post.title, post.naming.sourceTitle, post.naming.workTitle, post.naming.seriesTitle].filter(value => value && (!q || value.toLowerCase().includes(q))))]
      .map(matchedTitle => ({ postId: post.postId, matchedTitle, provenance: 'current' })));
    return { data: { ...result, ambiguous: result.total > 1, historicalRelayTitlesAvailable: false, matches } };
  }
  if (name === 'resolveLibraryPosts') {
    const resolvedPosts = args.postIds.map(id => posts.get(id)).filter(Boolean).map(resolvedPost);
    spendMetadata(resolvedPosts.length);
    return { data: { resolvedPosts, missingPostIds: args.postIds.filter(id => !posts.has(id)) } };
  }
  if (name === 'expandLibraryFamily') {
    const work = args.kind === 'work' ? works.get(args.id) : args.kind === 'post' ? works.get(posts.get(args.id)?.workId) : undefined;
    const familySeries = args.kind === 'series' ? series.get(args.id) : series.get(work?.seriesId);
    const familyWorks = familySeries ? familySeries.workIds.map(id => works.get(id)).filter(Boolean) : work ? [work] : [];
    if (!familyWorks.length && args.kind !== 'post') fail('Fixture family target not found.');
    const familyPosts = familyWorks.flatMap(item => item.linkedPostIds.map(id => posts.get(id)).filter(Boolean)).sort((a, b) => a.id.localeCompare(b.id));
    const result = page(familyPosts.map(resolvedPost), args, `family:${args.kind}:${args.id}`);
    spendMetadata(result.items.length);
    return { data: { ...result, target: { kind: args.kind, id: args.id }, workIds: familyWorks.map(item => item.id), ...(familySeries ? { seriesId: familySeries.id } : {}) } };
  }
  if (name === 'readLibraryCollections') {
    if (args.collectionId) {
      const collection = collections.get(args.collectionId);
      if (!collection) fail('Fixture collection not found.');
      const result = page(collection.postIds.map(id => posts.get(id)).filter(Boolean).map(resolvedPost), args, `collection-posts:${args.collectionId}`);
      spendMetadata(result.items.length);
      return { data: result };
    }
    const result = page(catalog.collections.map(item => ({ id: item.id, title: item.title, description: null, themeTags: [], postIds: item.postIds, totalPosts: item.postIds.length, membershipComplete: true })), args, 'collections');
    spendMetadata(result.items.length);
    return { data: result };
  }
  if (name === 'readLibraryMedia') {
    const items = [...new Set(args.mediaIds)].map(id => media.get(id)).filter(Boolean).map(item => ({ mediaId: item.id, postIds: [item.postId], mimeType: imageData.has(item.id) ? (imageData.get(item.id).startsWith('data:image/png') ? 'image/png' : 'image/jpeg') : null,
      role: null, processingStatus: imageData.has(item.id) ? 'READY' : 'UNKNOWN', ...(imageData.has(item.id) ? { thumbnailPath: `fixture:${item.id}` } : { imageUnsupportedReason: 'owned_storage_unavailable' }) }));
    spendMetadata(items.length);
    return { data: { items, missingMediaIds: args.mediaIds.filter(id => !media.has(id)) } };
  }
  if (name === 'resolveLibraryImageReferences') {
    const matches = [...new Set(args.mediaIds)].map(id => media.get(id)).filter(Boolean);
    spendMetadata(matches.length);
    const inspected = matches.filter(item => imageData.has(item.id));
    spendImages(inspected.length);
    trace.inspectedMediaIds.push(...inspected.map(item => item.id));
    return { data: { inspectedMediaIds: inspected.map(item => item.id), unsupported: args.mediaIds.filter(id => !imageData.has(id)).map(id => ({ mediaId: id, reason: media.has(id) ? 'owned_storage_unavailable' : 'not_found' })) },
      images: inspected.map(item => ({ mediaId: item.id, url: imageData.get(item.id) })) };
  }
  fail(`Unsupported read tool: ${name}`);
  };
}

if (selfTest) {
  assert.ok(['ce02.v1', 'ce02.v2'].includes(fixture.schemaVersion));
  assert.equal(cases.length, requiredCounts[split]);
  assert.equal(sha256(corpusBytes).length, 64);
  assert.equal((await hashFile(artifactPaths.runner, true)).length, 64);
  if (fixture.schemaVersion === 'ce02.v1') assert.ok(catalog.visionFixtures.every(item => item.isGroundTruthForImageContent === false));
  assert.ok(cases.filter(item => item.family === 'vision').every(item => visualIds.has(item.expected.visionFixtureId)));
  const reads = makeAdapter();
  const firstPost = catalog.posts[0];
  const resolved = reads('resolveLibraryPosts', { postIds: [firstPost.id, 'absent'] }).data;
  assert.deepEqual(resolved.missingPostIds, ['absent']);
  assert.equal(resolved.resolvedPosts[0].naming.sourceTitle, firstPost.sourceTitle);
  const found = reads('searchLibraryPosts', { query: '', limit: 1 }).data;
  assert.equal(found.total, catalog.posts.length);
  assert.equal(found.complete, false);
  assert.equal(reads('searchLibraryPosts', { query: '', limit: 1, cursor: found.nextCursor }).data.complete, false);
  const firstCollection = catalog.collections[0];
  assert.equal(reads('readLibraryCollections', { collectionId: firstCollection.id, limit: 10 }).data.items[0].postId, firstCollection.postIds[0]);
  const firstSeries = catalog.series[0];
  assert.equal(reads('expandLibraryFamily', { kind: 'series', id: firstSeries.id, limit: 10 }).data.workIds.length, firstSeries.workIds.length);
  const firstMediaId = firstPost.mediaIds[0];
  const imageRead = reads('resolveLibraryImageReferences', { mediaIds: [firstMediaId] });
  assert.equal(imageRead.data.inspectedMediaIds.includes(firstMediaId), imageData.has(firstMediaId));
  const trace = { readToolNames: [], inspectedMediaIds: [] };
  const hadImage = imageData.get(firstMediaId);
  imageData.set(firstMediaId, 'data:image/png;base64,aGVsbG8=');
  makeAdapter(trace)('resolveLibraryImageReferences', { mediaIds: [firstMediaId] });
  assert.deepEqual(trace.readToolNames, ['resolveLibraryImageReferences']);
  assert.deepEqual(trace.inspectedMediaIds, [firstMediaId]);
  if (hadImage) imageData.set(firstMediaId, hadImage); else imageData.delete(firstMediaId);
  assert.ok(!JSON.stringify(resolved).includes('visual_fixture_symbolic'));
  console.log('CE10 fixture adapter self-test passed; no provider was loaded.');
  process.exit(0);
}

function normalized(action) {
  const copy = { ...action };
  delete copy.id;
  delete copy.source;
  if (copy.targetId) {
    const key = { rename_post: 'postId', inherit_post_title: 'postId', source_post_title: 'postId', set_description: 'postId', tags: 'postId', reorder_media: 'postId', rename_work: 'workId', unlink_series_work: 'workId', rename_series: 'seriesId', create_series: 'seriesId', link_series_work: 'seriesId', create_collection: 'collectionId', rename_collection: 'collectionId', collection_membership: 'collectionId', reorder_collection: 'collectionId', link_work_post: 'workId' }[copy.kind];
    if (!key) fail(`Unknown fixture action ${copy.kind}`);
    copy[key] = copy.targetId;
    delete copy.targetId;
  }
  return Object.fromEntries(Object.entries(copy).sort(([a], [b]) => a.localeCompare(b)));
}
function actionComparison(actual, expected) {
  const a = actual.map(normalized).map(JSON.stringify).sort();
  const e = expected.map(normalized).map(JSON.stringify).sort();
  return a.length === e.length && a.every((value, index) => value === e[index]);
}

let runtime;
let provider;
let attemptReservations = [];
const attemptAccounting = () => ({calls:attemptReservations.length,knownUsageUsd:attemptReservations.reduce((sum,row)=>sum+(row.actualUsd??0),0),conservativeUsd:attemptReservations.reduce((sum,row)=>sum+(row.actualUsd??row.reservedUsd),0),unresolvedReservations:attemptReservations.filter(row=>row.actualUsd===null).length});
if (live) {
  if (!process.env.OPENAI_API_KEY?.trim()) fail('Live evaluation requires OPENAI_API_KEY.');
  if (process.env.LIBRARY_EDITOR_MODEL_PRICING_VERIFIED !== '1') fail('Live evaluation requires LIBRARY_EDITOR_MODEL_PRICING_VERIFIED=1 after checking current rates.');
  let pricing;
  try { pricing = JSON.parse(process.env.LIBRARY_EDITOR_MODEL_PRICING_JSON ?? '{}')[model]; } catch { fail('LIBRARY_EDITOR_MODEL_PRICING_JSON is invalid.'); }
  if (!pricing || ![pricing.inputUsdPerMillion, pricing.outputUsdPerMillion].every(value => typeof value === 'number' && Number.isFinite(value) && value > 0)) fail('Live evaluation requires explicit positive pricing for the exact model.');
  runtime = await Promise.all([
    import('../dist/src/gallery-editor/intent.js'),
    import('../dist/src/gallery-editor/provider.js'),
    import('../dist/src/gallery-editor/budget.js'),
    import('../dist/src/gallery-editor/action-validation.js'),
    import('../dist/src/gallery-editor/types.js'),
  ]).catch(() => fail('Build the application first with npm run build.'));
  const durable = new runtime[2].FileProviderBudget(resolve(ledgerPath));
  const budget = {
    async reserve(input) { const id=await durable.reserve(input);attemptReservations.push({id,reservedUsd:input.amountUsd,actualUsd:null});return id; },
    async settle(id,actualUsd) { await durable.settle(id,actualUsd);const row=attemptReservations.find(row=>row.id===id);if(row)row.actualUsd=actualUsd; },
  };
  provider = runtime[1].createResponsesProvider({ apiKey: process.env.OPENAI_API_KEY, model, pricing, budget, phase: split, maxOutputTokens });
}

const records = [];
let stoppedReason;
for (const item of cases) {
  if (caseIds && !caseIds.includes(item.id)) {
    records.push({ caseId: item.id, family: item.family, status: 'excluded', reason: 'case_filtered' });
    continue;
  }
  if (family && (family === 'vision') !== (item.family === 'vision')) {
    records.push({ caseId: item.id, family: item.family, status: 'excluded', reason: 'family_filtered' });
    continue;
  }
  if (stoppedReason) {
    records.push({ caseId: item.id, family: item.family, status: 'excluded', reason: 'run_stopped_after_infrastructure_failure', infrastructureError: stoppedReason });
    continue;
  }
  const visual = item.family === 'vision';
  const mapped = visual && imageData.has(visualIds.get(item.expected.visionFixtureId));
  if (visual && !mapped) {
    records.push({ caseId: item.id, family: item.family, status: 'excluded', reason: 'real_image_evidence_unavailable', visualEvidence: 'unavailable' });
    continue;
  }
  if (!live) {
    records.push({ caseId: item.id, family: item.family, status: 'planned', visualEvidence: visual ? 'mapped_image' : 'not_applicable' });
    continue;
  }
  const began = performance.now();
  attemptReservations = [];
  const trace = { readToolNames: [], inspectedMediaIds: [] };
  try {
    const current = item.context.existingCart.map((action, index) => ({ ...normalized(action), id: `fixture-${index}` }));
    const actions = runtime[3].validateActions(current);
    const session = { id: `eval-${item.id}`, creatorId: 'evaluation-owner', revision: 1,
      context: { selectedPostIds: [...item.context.selectedPostIds], loadedPostIds: [...item.context.loadedPostIds], ...(item.context.activeCollectionId ? { activeCollectionId: item.context.activeCollectionId } : {}) },
      messages: structuredClone(item.turns.slice(0, -1)),
      cart: { revision: 1, actions, items: [], dependencies: {}, conflicts: [], notice: runtime[4].RENAME_NOTICE } };
    const readTools = makeAdapter(trace);
    const result = await runtime[0].runEditorIntent(session, item.turns.at(-1).text, provider, async (name, toolArgs) => readTools(name, toolArgs), {architecture});
    const visualEvidenceSatisfied = !visual || trace.inspectedMediaIds.includes(visualIds.get(item.expected.visionFixtureId));
    const actualState=await projectEvaluationState(catalog,result.actions);
    const expectedState=await projectEvaluationState(catalog,runtime[3].validateActions(item.expected.actions.map((action,index)=>({...normalized(action),id:`expected-${index}`}))));
    records.push({ caseId: item.id, family: item.family, status: 'completed', latencyMs: Math.round(performance.now() - began),
      visualEvidence: visual ? (visualEvidenceSatisfied ? 'inspected' : 'not_inspected') : 'not_applicable', visualEvidenceSatisfied,
      readToolNames: trace.readToolNames, inspectedMediaIds: [...new Set(trace.inspectedMediaIds)], imageInspectionCount: trace.inspectedMediaIds.length,
      usage: result.usage ?? null,
      attemptAccounting: attemptAccounting(),
      routing: result.routing ?? null,
      actionExactMatch: actionComparison(result.actions, item.expected.actions), expectedOutcome: item.expected.outcome,
      finalStateExactMatch: JSON.stringify(actualState)===JSON.stringify(expectedState),finalStateSha256:sha256(JSON.stringify(actualState)),expectedStateSha256:sha256(JSON.stringify(expectedState)),
      expectedTargetIds: item.expected.targetIds, expectedSemanticLabels: item.expected.semanticLabels,
      expectedActions: item.expected.actions, proposedDisposition: result.disposition ?? null,
      proposedMessageSha256: sha256(result.message), proposedMessageLength: result.message.length,
      ...(includeGeneratedMessages ? { proposedMessage: result.message } : {}),
      proposedActions: result.actions, review: visualEvidenceSatisfied ? 'pending_human_semantic_review' : 'vision_evidence_missing' });
  } catch (error) {
    records.push({ caseId: item.id, family: item.family, status: 'failed', latencyMs: Math.round(performance.now() - began), errorCode: error?.code || 'evaluation_error',
      attemptAccounting: attemptAccounting(),
      readToolNames: trace.readToolNames, inspectedMediaIds: [...new Set(trace.inspectedMediaIds)], imageInspectionCount: trace.inspectedMediaIds.length,
      review: 'pending_human_semantic_review' });
    // Unknown provider charges remain reserved. Stop instead of spending the remaining
    // phase budget on a repeated outage or invalid provider configuration.
    if (['provider_error', 'provider_usage_missing', 'provider_unpriced', 'provider_config', 'provider_disabled', 'provider_budget_overrun', 'BUDGET_EXHAUSTED', 'BUDGET_LOCKED', 'BUDGET_INVALID'].includes(error?.code)) stoppedReason = error.code;
  }
}
const completed = records.filter(row => row.status === 'completed');
const usage = completed.map(row => row.usage).filter(Boolean);
const artifacts = Object.fromEntries(await Promise.all(Object.entries(artifactPaths).map(async ([name, path]) => [name, { sha256: await hashFile(path, live && ['productionIntent', 'productionProvider'].includes(name)) }])));
const report = { schemaVersion: 'ce10.v1', architecture, generatedAt: new Date().toISOString(), mode: live ? 'live' : 'dry-run', model, split,
  familyFilter: family ?? null, caseFilter: caseId ?? null, includeGeneratedMessages, modelSettings: { model, maxOutputTokens, phase: split, imageDetail: 'low', store: false },
  provenance: { artifacts, mappedImageSha256: imageHashes },
  fixtureSchemaVersion: fixture.schemaVersion, counts: { total: cases.length, planned: records.filter(row => row.status === 'planned').length, completed: completed.length, failed: records.filter(row => row.status === 'failed').length, excluded: records.filter(row => row.status === 'excluded').length,
    visionInspected: completed.filter(row => row.family === 'vision' && row.visualEvidenceSatisfied).length,
    visionNotInspected: completed.filter(row => row.family === 'vision' && !row.visualEvidenceSatisfied).length },
  accounting: live ? { allAttemptKnownUsageUsd:records.reduce((n,row)=>n+(row.attemptAccounting?.knownUsageUsd??0),0),allAttemptConservativeUsd:records.reduce((n,row)=>n+(row.attemptAccounting?.conservativeUsd??0),0),unresolvedReservations:records.reduce((n,row)=>n+(row.attemptAccounting?.unresolvedReservations??0),0),completedCaseReportedCostUsd: usage.reduce((n, row) => n + (row.costUsd ?? 0), 0), completedCaseReportedCalls: usage.reduce((n, row) => n + (row.calls ?? 0), 0), casesWithoutReportedUsage: completed.length - usage.length, failedCasesMayHaveReservedCharges: records.some(row => row.status === 'failed'), authoritativeLedgerPath: resolve(ledgerPath) } : null,
  semanticAccuracy: null, semanticReview: 'Required before threshold claims; actionExactMatch is a mechanical comparison only.', records };
if (out) { await mkdir(dirname(resolve(out)), { recursive: true }); await writeFile(resolve(out), JSON.stringify(report, null, 2) + '\n'); console.log(resolve(out)); }
else console.log(JSON.stringify(report, null, 2));
