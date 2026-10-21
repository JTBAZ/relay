import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const root = resolve(import.meta.dirname, '..');
const read = file => readFileSync(resolve(root, file), 'utf8');
const json = file => JSON.parse(read(file));
const testsPath = 'work/pcb03-root-tests-2026-10-20T22-25-44-748Z.json';
const pgPrefix = 'work/pcb03-postgres-2026-10-20T22-23-18-096Z';
const scopePath = 'work/pcb03-review-2026-10-20T22-25-29-195Z.json';
const tests = json(testsPath), pg = json(`${pgPrefix}.json`), scope = json(scopePath);
assert.equal(tests.numPassedTests, 92); assert.equal(tests.numFailedTests, 0);
assert.equal(json('work/pcb03-luna-build-04.exit.json').exit_code, 0);
assert.equal(json('work/pcb03-luna-focused-02.exit.json').exit_code, 0);
assert.equal(pg.migrations.exitCode, 0); assert.equal(pg.tests.exitCode, 0); assert.equal(pg.cleanup.kind, 'dropped');
assert.match(read(`${pgPrefix}-tests.log`), /Tests\s+3 passed/);
assert.equal(scope.whitespace, '');
const audit = json('work/pcb03-audit-latest.json');
assert.equal(audit.ledger.unchanged, true); assert.deepEqual(audit.changedPriorReports, []); assert.deepEqual(audit.changedConfiguration, []);
assert(!audit.changedBaselineSource.includes('prisma/schema.prisma'));
const evidencePath = 'outputs/editor-bench-durable-preview-export-proof-pcb03.json';
const report = {
  ticket: 'PCB-03', status: 'accepted_backend_connector_with_recorded_verification_limits', date: '2026-10-21',
  planner: 'existing Sol High product connection plan', builder: 'gpt-6-luna/high', reviewer: 'root; scoped Ponytail Review',
  branch: 'codex/local-build-2026-10-19', head: '91a72d2f1ea18a7b1326305e6dd4b1d224fbcbd1', committed: false,
  behavior: [
    'One server-selected owned source post and explicitly chosen source image are bound to an owned Previewizer template and staged JPEG. Review changes only durable Conversation state; confirmation is separate.',
    'Review pins source PostVersion/media fingerprint, parsed owned template config/revision/hash, staged upload identity and exact decoded JPEG hash/size. Changed facts require a new review.',
    'Confirmation copies the exact validated bytes to a new server-only deterministic storage key, creates an owned MediaAsset with provenance, and appends a durable receipt atomically with Conversation revision.',
    'Original source rows and PostVersion.mediaIds remain unchanged. Selected IDs, exclusions, prior edit history, recent messages and unrelated cart work are preserved.',
    'Concurrent confirmations return the same receipt and produce one sealed object. Exact successful retry reads the prior receipt without rebasing newer state.',
    'Confirmed exports remain readable after service reconstruction, deselection and explicit refresh. Pending review resumes with its template snapshot and staged image URL.'
  ],
  api: {
    base: '/api/v1/editor-bench/real-library-conversation', developmentOnly: true,
    upload: 'Existing Relay staging upload, omitting post_id; never finalize the JPEG into the source PostVersion.',
    review: 'POST /session/:sessionId/preview/review {expectedRevision, sourcePostId, sourceMediaId, templateId, stagedMediaId}',
    confirm: 'POST /session/:sessionId/preview/confirm {reviewId, expectedRevision}; no model call',
    resume: 'GET /session/:sessionId exposes data.previewReview while catalog is current',
    receipts: 'GET /session/:sessionId/previews exposes data.previewExports independently of current catalog revision',
    bytes: 'URLs use the existing /api/v1/export/media/:creatorId/:mediaId/content route and its existing media-access policy; no new byte-delivery route.',
    mutationGuards: ['authenticated creator/account and owned session', 'editor feature flag and creator allowlist', 'ready DB stores', 'existing tenant mutation and Studio sync writable guards', 'server-owned unique selection', 'current source/template/upload and expected revision'],
    limits: { selectedPosts: 1, exportsPerReview: 1, jpegMaxBytes: 1048576, jpegMaxPixels: 16000000, pendingReviewMinutes: 15 },
    persistence: 'Existing GalleryEditorSession.context, MediaAsset and CreatorPreviewTemplate records; no new table or migration.'
  },
  verification: {
    rootBackend: { passed: 92, failed: 0, files: 8, evidence: testsPath },
    lunaBackend: { passed: 21, failed: 0, evidence: 'work/pcb03-luna-focused-02.log' },
    backendBuild: { exitCode: 0, evidence: 'work/pcb03-luna-build-04.exit.json' },
    postgres: { passed: 3, failed: 0, files: 2, evidence: `${pgPrefix}.json`,
      fixture: 'Fresh nonce-owned local disposable PostgreSQL database with canonical migrations, synthetic source/template/upload records and an injected create-only object store; no actual account or cloud bucket.',
      checked: ['corrupt JPEG rejection', 'missing/foreign/oversized upload rejection', 'changed source/template/JPEG rejection', 'pending review read-back', 'concurrent confirmation exact receipt and one object write', 'new owned MediaAsset provenance', 'original source media list unchanged', 'service reconstruction and exact bytes', 'receipt persistence across explicit refresh', 'PCB-02 durable source-edit regression'],
      cleanup: 'owned disposable database dropped',
      warning: 'pg emitted its concurrent client.query deprecation warning; current checks passed. No database-client upgrade or unrelated query refactor was made.' },
    review: { scope: scopePath, files: scope.files, whitespace: 'clean',
      assumedLoad: 'Several hundred owned posts, existing bounded catalog, concurrent requests across API workers; one export per confirmation with bounded JPEG bytes.',
      connectedCode: ['GalleryEditorService revise/read and serializable retry helper', 'Gallery editor context input parser and trusted Conversation boundary', 'owned Library snapshot/media associations', 'Previewizer template parser/service', 'Relay staging presign/commit and native upload finalizer', 'existing export content ownership/access and native MediaAsset reads', 'server development registration and mutation guards', 'R2 conditional-put SDK command'],
      resolved: ['Never attach an export by rewriting the original source PostVersion.', 'Seal exact reviewed bytes in a new server-only key rather than trusting a reusable staging presigned URL.', 'Use atomic conditional object create across workers and compare-and-set session revision in a short serializable transaction.', 'Preserve the winning receipt on concurrent retry and retain it across refresh.', 'Use canonical JSON fingerprints across PostgreSQL JSONB read-back.'],
      remainingTaskFindings: [], verdict: 'Backend slice accepted within recorded gates' }
  },
  failuresAndLimits: [
    { issue: 'First backend build failed on scoped TypeScript issues; subsequent build passed. Earlier logs are preserved.', evidence: 'work/pcb03-luna-build-01.log' },
    { issue: 'Expanded PostgreSQL fixture initially expected pendingPreviewReview instead of public previewReview, and used a flat selection path. Fixture assertions were corrected; product behavior was unchanged.', evidence: 'work/pcb03-postgres-2026-10-20T22-21-41-129Z.json' },
    { issue: 'The server validates JPEG bytes and records the chosen owned template configuration. It does not prove that the rendered pixels were produced from that template. Client Previewizer rendering/mount acceptance remains deferred.' },
    { issue: 'Actual R2 was not called. The injected object store proves application behavior; the SDK test checks create-only request and 412 handling.', protocolSource: 'https://developers.cloudflare.com/r2/api/s3/extensions/' },
    { issue: 'A successful sealed-object write followed by a failed/stale DB transaction may leave one unreferenced deterministic object for that review. Retry reuses it safely; no deletion-on-failure or new cleanup service was introduced.' },
    { issue: 'No frontend mount/test/build/lint/typecheck/render, installed-extension execution, paid semantic evaluation, actual-account write, production migration, deployment, env change or API restart. The mock demo remains unchanged; publishing stays manual.' },
    { issue: 'The full backend suite is not claimed green. The previously recorded generic PostgreSQL competing-session error-code assertion and three distribution-package fixture failures are outside this ticket and were not rerun or fixed.' },
    { issue: 'PCB-04 through PCB-06 remain planned and are not dispatched. Durable destination variants, Rail cues and manual extension packages are separate connections.' }
  ],
  preservedFailureArtifacts: readdirSync(resolve(root, 'work')).filter(name => /^pcb03-(luna-(focused|build)|root-tests-|postgres-2026)/.test(name)).map(name => `work/${name}`),
  preservation: { earlierReports: audit.priorReportCount, reportsUnchanged: true, configUnchanged: true, schemaChange: false, ledger: { ...audit.ledger, developmentRemainingUsd: 0.34483654, heldoutRemainingUsd: 8.9690346, absolutePath: String.raw`C:\Users\jorda\Documents\Codex\2026-10-11\c\work\relay\.relay-data\gallery-editor-budget.json` }, paidCalls: 0 },
  sourceHashes: Object.fromEntries(scope.files.map(file => [file, createHash('sha256').update(readFileSync(resolve(root, file))).digest('hex')]))
};
writeFileSync(resolve(root, evidencePath), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
const summary = '**PCB-03 accepted as a backend connector, 2026-10-21.** Luna High added separately reviewed and confirmed, creator-owned Previewizer exports. Each receipt pins the selected source version/image, owned template configuration and exact JPEG. The export is a new media asset; originals, selections, exclusions and prior conversation/edit state are preserved. Receipts survive restart and explicit refresh. No table or migration was added.\n\nRoot passed 92 backend checks in eight files; Luna passed 21 focused checks and the backend build. The isolated PostgreSQL run passed all three PCB-02/03 checks and dropped its disposable database. Earlier build and fixture failures are preserved. Cloud storage was injected: live R2, client rendering fidelity, product mounting and front-end/installed-extension checks remain unverified. An object written before a failed DB transaction may remain unreferenced until later cleanup. Publishing stays manual. No paid calls or API restart. PCB-04 is the next candidate and is not dispatched. Older entries below describe earlier states. ';
const docs = ['docs/relay-cheaper-model-handoff.md', 'docs/conversational-planning/README.md', 'docs/conversational-planning/DISPATCH.md', 'docs/conversational-planning/EDITOR-BENCH-PLAN.md', 'docs/conversational-planning/WORK-ITEMS.md'];
for (const file of docs) {
  let text = read(file), at = text.indexOf('\n');
  const link = file.includes('conversational-planning/') ? '../../outputs/editor-bench-durable-preview-export-proof-pcb03.json' : '../outputs/editor-bench-durable-preview-export-proof-pcb03.json';
  let entry = summary + `[Acceptance, API and failure evidence](${link}).\n\n`;
  if (file.endsWith('relay-cheaper-model-handoff.md')) entry += `Branch \`codex/local-build-2026-10-19\`, HEAD \`91a72d2f1ea18a7b1326305e6dd4b1d224fbcbd1\`; changes remain local/uncommitted in the existing repository. Budget remains 919 rows: $0.34483654 development / $8.9690346 heldout. Authoritative ledger: \`${report.preservation.ledger.absolutePath}\`, canonical SHA-256 \`${audit.ledger.sha256}\`. All 87 earlier reports, environment files and original external-report paths below are unchanged.\n\n`;
  text = text.slice(0, at + 1) + '\n' + entry + text.slice(at + 1).replace(/^\r?\n/, '');
  if (file.endsWith('WORK-ITEMS.md')) text = text.replace('PCB-02 is also accepted as a guarded durable-edit backend connector. PCB-03 is the next candidate and is not dispatched; later tickets wait for their dependencies.', 'PCB-02 and PCB-03 are also accepted within their guarded backend limits. PCB-04 is the next candidate and is not dispatched; later tickets wait for their dependencies.').replace('| PCB-03 | Stored, owned Previewizer exports with source/template binding | PCB-02 | Luna High | Waiting |', '| PCB-03 | Stored, owned Previewizer exports with source/template binding | PCB-02 | Luna High | Accepted backend connector |').replace('PCB-01 and PCB-02 implementation is accepted within the recorded backend limits.', 'PCB-01 through PCB-03 implementation is accepted within the recorded backend limits.');
  writeFileSync(resolve(root, file), text);
}
const planFile = 'docs/conversational-planning/PRODUCT-CONVERSATION-CONNECTION-PLAN.md';
let plan = read(planFile);
plan = plan.replace('Status: PCB-01 and PCB-02 backend connectors accepted, 2026-10-20; PCB-03–06 remain planned and are not dispatched.', 'Status: PCB-01 through PCB-03 backend connectors accepted, updated 2026-10-21; PCB-04–06 remain planned and are not dispatched.');
plan = plan.replace('Export, draft, schedule and handoff connections remain planned. PCB-03 is the next candidate and is not dispatched.', 'PCB-03 adds separately confirmed, owned Previewizer exports with pinned source/template/JPEG provenance and durable read-back. Draft, schedule and handoff connections remain planned. PCB-04 is the next candidate and is not dispatched.');
const marker = '### PCB-03 —';
const start = plan.indexOf(marker);
assert(start >= 0);
const end = plan.indexOf('\n', start);
plan = plan.slice(0, end + 1) + '\n' + summary + '[Acceptance and limitations](../../outputs/editor-bench-durable-preview-export-proof-pcb03.json).\n' + plan.slice(end + 1);
writeFileSync(resolve(root, planFile), plan);
console.log(JSON.stringify({ evidencePath, docs: [...docs, planFile], rootPassed: 92, postgresPassed: 3 }));
