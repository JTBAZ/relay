import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const root = resolve(import.meta.dirname, '..');
const read = file => readFileSync(resolve(root, file), 'utf8');
const json = file => JSON.parse(read(file));
const testsPath = 'work/pcb02-root-tests-2026-10-20T20-17-57-824Z.json';
const buildPath = 'work/pcb02-luna-build-04.exit.json';
const pgPrefix = 'work/pcb02-postgres-2026-10-20T20-13-22-672Z';
const tests = json(testsPath), build = json(buildPath), pg = json(`${pgPrefix}.json`);
assert.equal(tests.numPassedTests, 96); assert.equal(tests.numFailedTests, 0); assert.equal(build.exitCode, 0);
assert.equal(pg.migrations.exitCode, 0); assert.equal(pg.cleanup.kind, 'dropped');
assert.match(read(`${pgPrefix}-tests.log`), /✓ tests\/editor-bench\/real-library-conversation-postgres.integration.test.ts \(1 test\)/);
const audit = json('work/pcb02-audit-latest.json');
assert.equal(audit.ledger.unchanged, true); assert.deepEqual(audit.changedPriorReports, []); assert.deepEqual(audit.changedConfiguration, []);
const scopePath = 'work/pcb02-review-2026-10-20T20-18-15-707Z.json';
const scope = json(scopePath); assert.equal(scope.whitespace, '');
const evidencePath = 'outputs/editor-bench-durable-conversation-proof-pcb02.json';
const report = {
  ticket: 'PCB-02', status: 'accepted_backend_connector_with_recorded_verification_limits', date: '2026-10-20',
  planner: 'existing Sol High product connection plan', builder: 'gpt-6-luna/high', reviewer: 'root; scoped Ponytail Review',
  branch: 'codex/local-build-2026-10-19', head: '91a72d2f1ea18a7b1326305e6dd4b1d224fbcbd1', committed: false,
  behavior: [
    'Dedicated owned GalleryEditorSession persists selection, exclusions, initialization state, last request, recent messages, pending edit review and last confirmation reference.',
    'One uniquely selected source can receive a literal quoted rename or grounded post-level tag delta; review stages only, separate confirmation applies through GalleryEditorService.',
    'Library presentation/overrides, immutable GalleryEditorCommit history and next conversation catalog revision commit atomically. Original PostVersion and unrelated/manual staged work remain outside the edit.',
    'Reopening by saved session ID survives router/service reconstruction and idle time; pending edit reviews expire after 15 minutes.',
    'Exact successful review retry reads the original owner/actor/session-bound commit. Replay never rebases or rewinds newer context; changed catalog is reported without context substitution.'
  ],
  api: { base: '/api/v1/editor-bench/real-library-conversation', developmentOnly: true,
    selection: 'POST /session/:sessionId/turn {sessionId, expectedRevision, latestRequest}; selection only',
    review: 'POST /session/:sessionId/review {sessionId, expectedRevision, latestRequest}; one bounded cheap-provider call, no source edit',
    confirm: 'POST /session/:sessionId/confirm {reviewId, expectedRevision}; no model call',
    read: 'GET /session/:sessionId; saved selection/exclusions and pending before/after review',
    refresh: 'POST /session/:sessionId/refresh {expectedRevision}; explicit selection/exclusion reset',
    sourceWriteGuards: ['editor feature flag', 'creator allowlist', 'ready PostgreSQL stores', 'authenticated creator/account match', 'existing tenant mutation policy', 'Studio sync writable guard'],
    modelBoundary: 'One selected title/current tags + latest request, tools empty, no images or source IDs, full interpreter request <=16 KiB. Literal rename grounding retains existing 2,000-character request limit.'
  },
  verification: {
    rootBackend: { passed: 96, failed: 0, files: 9, evidence: testsPath },
    lunaBackend: { passed: 43, failed: 0, evidence: 'work/pcb02-luna-test09.log' },
    backendBuild: { exitCode: 0, evidence: buildPath },
    postgres: { pcb02JourneyPassed: true, fixture: 'fresh nonce-owned local disposable database; canonical migrations; synthetic posts and injected model responses',
      checked: ['review does not edit source', 'durable selection and nonempty exclusions', 'confirmed rename and tag delta', 'new GalleryEditorService/router read-back', 'immutable receipt retry', 'exact canonical catalog hash after each edit', 'source + journal rollback if context callback throws'],
      combinedSuite: { passed: 26, failed: 1, total: 27 }, evidence: `${pgPrefix}.json`, cleanup: 'owned disposable database dropped' },
    review: { scope: scopePath, files: scope.files, whitespace: 'clean', assumedLoad: 'several hundred owned posts, existing 1,024-post/4,096-media snapshot bounds, concurrent browser requests guarded by revision and existing serializable source transactions',
      connectedCode: ['Gallery editor route context parser and callers', 'GalleryEditorService apply/revise/undo and source dependency snapshots', 'effective Library metadata normalization', 'existing editor authentication/mutation guards and source version boundary', 'mock Conversation quote diagnostics'],
      resolved: ['JSONB key ordering broke action digest; reuse canonical fingerprint', 'first clarification must not initialize selection', 'same-ID manual action must not be discarded', 'confirmation context/catalog must commit atomically', 'preserve mock target-separation diagnostic', 'do not double-send mutation denial'],
      remainingTaskFindings: [], verdict: 'Backend slice accepted within the recorded gates' }
  },
  failuresAndLimits: [
    { issue: 'First isolated PCB02 confirm returned 409 because JSONB reordered keys; fixed and regression tested', evidence: 'work/pcb02-postgres-2026-10-20T20-11-32-050Z.json' },
    { issue: 'Existing competing-session PostgreSQL assertion intermittently got P2002 rather than STALE_PREVIEW. Existing suite passed 26/26 in the first run, then 25/26 in the second; one winner and one rejected operation remained. This path does not supply the new callback; no unrelated retry/error handling was changed.', evidence: `${pgPrefix}-tests.log` },
    { issue: 'The full backend suite is not claimed green. Three previously recorded distribution-package fixture failures were outside this task and not rerun.' },
    { issue: 'No paid semantic evaluation, live account read/write, frontend mount/test/build/lint/typecheck/render, installed-extension execution, deployment or API restart. Browser bench remains the accepted separate mock lane.' },
    { issue: 'PCB-03 through PCB-06 are not dispatched. Stored previews, product variants, Rail and handoff connections remain separate tickets; publishing stays manual.' }
  ],
  preservedFailureArtifacts: readdirSync(resolve(root, 'work')).filter(name => /^pcb02-(luna-(test|build)|root-tests-|postgres-2026)/.test(name)).map(name => `work/${name}`),
  preservation: { earlierReports: audit.priorReportCount, reportsUnchanged: true, configUnchanged: true, schemaChange: false, ledger: { ...audit.ledger, developmentRemainingUsd: 0.34483654, heldoutRemainingUsd: 8.9690346, absolutePath: String.raw`C:\Users\jorda\Documents\Codex\2026-10-11\c\work\relay\.relay-data\gallery-editor-budget.json` }, paidCalls: 0 },
  sourceHashes: Object.fromEntries(scope.files.map(file => [file, createHash('sha256').update(readFileSync(resolve(root, file))).digest('hex')]))
};
writeFileSync(resolve(root, evidencePath), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
const summary = '**PCB-02 accepted as a backend connector, 2026-10-20.** Luna High connected confirmed source rename/tag edits and durable Conversation context to the existing Gallery editor session/cart/commit records. Selection, exclusions, pending review and edit history survive service reconstruction; the next turn sees confirmed effective metadata. Review stages one change, and separate confirmation applies it atomically with the next catalog revision. Originals and unrelated manual cart edits are preserved. No new table or migration was needed.\n\nRoot passed 96 backend checks in nine files; the backend build and isolated PostgreSQL Conversation journey passed. The combined PostgreSQL regression run had one intermittent existing concurrency error-code assertion (P2002 instead of STALE_PREVIEW), preserved separately; the full suite is not claimed green. No paid call, actual-account write or API restart. Publishing stays manual. `/turn` remains selection-only; `/review` and `/confirm` provide the edit capability. Product UI mounting and all frontend/installed-extension testing remain deferred. PCB-03 is the next candidate and is not dispatched. Older entries below describe earlier states. ';
const docs = ['docs/relay-cheaper-model-handoff.md', 'docs/conversational-planning/README.md', 'docs/conversational-planning/DISPATCH.md', 'docs/conversational-planning/EDITOR-BENCH-PLAN.md', 'docs/conversational-planning/WORK-ITEMS.md'];
for (const file of docs) {
  let text = read(file), at = text.indexOf('\n');
  const link = file.includes('conversational-planning/') ? '../../outputs/editor-bench-durable-conversation-proof-pcb02.json' : '../outputs/editor-bench-durable-conversation-proof-pcb02.json';
  let entry = summary + `[Acceptance, API and failure evidence](${link}).\n\n`;
  if (file.endsWith('relay-cheaper-model-handoff.md')) entry += `Branch \`codex/local-build-2026-10-19\`, HEAD \`91a72d2f1ea18a7b1326305e6dd4b1d224fbcbd1\`; changes remain local/uncommitted in the existing repository. Budget remains 919 rows: $0.34483654 development / $8.9690346 heldout. Authoritative ledger: \`${report.preservation.ledger.absolutePath}\`, canonical SHA-256 \`${audit.ledger.sha256}\`. All 86 earlier reports, environment files and original external-report paths below are unchanged.\n\n`;
  text = text.slice(0, at + 1) + '\n' + entry + text.slice(at + 1).replace(/^\r?\n/, '');
  if (file.endsWith('WORK-ITEMS.md')) text = text.replace('PCB-02 is the next candidate and is not dispatched; later tickets wait for their dependencies.', 'PCB-02 is also accepted as a guarded durable-edit backend connector. PCB-03 is the next candidate and is not dispatched; later tickets wait for their dependencies.').replace('| PCB-02 | Confirmed durable source edits and conversation context | PCB-01 | Luna High | Waiting |', '| PCB-02 | Confirmed durable source edits and conversation context | PCB-01 | Luna High | Accepted backend connector |').replace('No implementation, paid evaluation, production migration, account write or deployment is dispatched by this plan.', 'PCB-01 and PCB-02 implementation is accepted within the recorded backend limits. No further implementation, paid evaluation, production migration, account write or deployment is dispatched.');
  writeFileSync(resolve(root, file), text);
}
const planFile = 'docs/conversational-planning/PRODUCT-CONVERSATION-CONNECTION-PLAN.md';
let plan = read(planFile);
plan = plan.replace('Status: PCB-01 backend connector accepted, 2026-10-20; PCB-02–06 remain planned and are not dispatched.', 'Status: PCB-01 and PCB-02 backend connectors accepted, 2026-10-20; PCB-03–06 remain planned and are not dispatched.');
plan = plan.replace('PCB-01 is accepted within the read-only backend limits below. PCB-02 is the next candidate for a later implementation dispatch; it is not started. PCB-01 lets a creator select from their owned Library in Conversation and read the result while edit, export, draft, schedule, and handoff controls remain on the accepted mock path or unavailable for a real selection. No real record is changed. Each later write needs its own review and acceptance before the next ticket starts.', 'PCB-01 supplies owned Library selection; PCB-02 adds durable context and separately confirmed source rename/tag edits behind the existing editor and mutation guards. These backend capabilities do not mount a new product page. Export, draft, schedule and handoff connections remain planned. PCB-03 is the next candidate and is not dispatched. Each later write needs its own review and acceptance before the next ticket starts.');
plan = plan.replace('### PCB-02 — confirmed source edits and persistent context\n', '### PCB-02 — confirmed source edits and persistent context\n\n' + summary + '[Acceptance and limitations](../../outputs/editor-bench-durable-conversation-proof-pcb02.json).\n');
writeFileSync(resolve(root, planFile), plan);
console.log(JSON.stringify({ acceptance: evidencePath, docs: [...docs, planFile], backendTests: 96, postgresJourney: 'passed', combinedPostgresSuite: '26 passed / 1 existing intermittent assertion failed', build: 'passed' }));
