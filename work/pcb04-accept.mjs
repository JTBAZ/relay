import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const root = resolve(import.meta.dirname, '..');
const read = file => readFileSync(resolve(root, file), 'utf8');
const json = file => JSON.parse(read(file));
const testPath = 'work/pcb04-root-tests-2026-10-21T08-00-47-025Z.json';
const railPath = 'work/pcb04-rail-tests-2026-10-21T08-05-08-317Z.json';
const pgPrefix = 'work/pcb04-postgres-2026-10-21T08-02-05-282Z';
const scopePath = 'work/pcb04-review-2026-10-21T08-05-15-422Z.json';
const tests = json(testPath), rail = json(railPath), pg = json(`${pgPrefix}.json`), scope = json(scopePath), build = json('work/pcb04-luna-build-result.json');
assert.equal(tests.numPassedTests, 111); assert.equal(tests.numFailedTests, 0);
assert.equal(rail.numPassedTests, 32); assert.equal(rail.numFailedTests, 0);
assert.equal(build.exitCode ?? build.exit_code, 0);
assert.equal(pg.migrations.exitCode, 0); assert.equal(pg.tests.exitCode, 0); assert.equal(pg.cleanup.kind, 'dropped');
assert.equal(scope.whitespace, '');
const baseline = json('work/pcb-final-baseline/baseline.json');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
for (const [file, hash] of Object.entries({ ...baseline.reports, ...baseline.config })) assert.equal(sha(readFileSync(resolve(root, file))), hash, file);
const ledger = json('.relay-data/gallery-editor-budget.json');
assert.equal(sha(JSON.stringify(ledger)), baseline.ledger.sha256);
assert.equal(sha(readFileSync(resolve(root, 'prisma/schema.prisma'))), baseline.source['prisma/schema.prisma']);
const report = {
  ticket: 'PCB-04', date: '2026-10-21', status: 'accepted_backend_connector_with_recorded_verification_limits',
  planner: 'Sol High; work/pcb-final-sol-plan.md', builder: 'gpt-6-luna/high', reviewer: 'root; scoped Ponytail Review',
  branch: baseline.branch, head: baseline.head, committed: false,
  result: 'Separate review and confirmation create or reuse exact X and DeviantArt drafts from one confirmed owned preview. Later literal replacement edits preserve before/after revisions and clear approval. Source originals and durable Conversation context remain intact.',
  persistence: 'Existing PostDistributionPlan/Variant rows and row builders. conversation_draft_v1 in server-owned assistantPlan JSON holds pinned source/export and per-destination revisions. Unique conversationalGroupKey scopes the plan; no schema/migration. History is application-enforced append-only, not database-enforced immutable.',
  api: { base: '/api/v1/editor-bench/real-library-conversation', developmentOnly: true,
    createReview: 'POST /session/:sessionId/draft/review {expectedRevision, sourcePostId, previewReviewId, destination, copy}',
    createConfirm: 'POST /session/:sessionId/draft/confirm {expectedRevision, reviewId}',
    editReview: 'POST /session/:sessionId/draft/edit/review {expectedRevision, expectedVariantRevision, variantId, copy}',
    editConfirm: 'POST /session/:sessionId/draft/edit/confirm {expectedRevision, reviewId}',
    read: 'GET /session/:sessionId/drafts; unique current drafts, per-variant revision history and confirmation receipts, independent of current catalog revision',
    copy: 'X {postText}; DeviantArt {title, bodyText, tags}. Explicit literal text, bounded destination input, no model call or formatter truncation.' },
  safeguards: ['Existing authenticated creator/account/session and mutation gates', 'Server-owned unique selection and confirmed preview receipt', 'Owned active source version and retained ready preview provenance', 'Pending source presentation digest, exact copy and revision checked at confirmation', 'Serializable transaction, identity lock, variant/session compare-and-set and receipt replay', 'Legacy patch/approve/handoff rejected for managed variants', 'Legacy active-plan/Coach lookup excludes only conversation-draft namespace', 'Rail copy seed blocks managed targets, including null-plan fallback, before source mutations', 'Refresh preserves confirmed draft and preview receipts'],
  verification: { rootBackend: { passed: 111, files: 9, report: testPath }, finalRailDelta: { passed: 32, report: railPath },
    postgres: { passed: 4, files: 3, evidence: `${pgPrefix}.json`, cleanup: 'fresh nonce-owned disposable database dropped',
      checked: ['PCB02 durable-edit regression', 'PCB03 exact JPEG export regression', 'imported Patreon source X/DA exact drafts', 'independent destinations and concurrent destination reuse', 'replacement edit history and approval reset', 'stale revision, overlong copy, wrong preview and changed-source rejection', 'restart/history/receipt replay and refresh persistence'] },
    build: { exitCode: 0, evidence: 'work/pcb04-luna-build-result.json' },
    review: { scope: scopePath, files: scope.files, whitespace: 'clean', findingsResolved: ['duplicate replay binding', 'Prisma void advisory-lock return shape', 'preserve published-post error ordering', 'null-plan Rail copy-seeding bypass'], remainingTaskFindings: [] } },
  failuresPreserved: ['work/pcb04-luna-build.log', 'work/pcb04-postgres-2026-10-21T07-56-57-908Z.json', 'work/pcb04-postgres-2026-10-21T07-58-55-686Z.json', 'work/pcb04-root-tests-2026-10-21T07-56-57-836Z.json'],
  limits: ['Synthetic local records and injected authentication only; no actual account or cloud writes.', 'No paid model calls, product UI mount, frontend/extension tests or builds, browser check, installed-extension execution, API restart, production migration or deployment. Publishing remains manual.', 'Historical unrelated distribution-package fixture failures and generic PostgreSQL concurrency error-code failure remain recorded; full backend suite is not claimed green.', 'PCB05/06 are authorized successors; neither was implemented before this acceptance.'],
  preservation: { priorReportsUnchanged: Object.keys(baseline.reports).length, configurationUnchanged: true, ledgerRows: ledger.length, ledgerSha256: baseline.ledger.sha256, developmentRemainingUsd: 0.34483654, heldoutRemainingUsd: 8.9690346, authoritativeLedger: resolve(root, '.relay-data/gallery-editor-budget.json'), paidCalls: 0 },
  sourceHashes: Object.fromEntries(scope.files.map(file => [file, sha(readFileSync(resolve(root, file)))]))
};
writeFileSync(resolve(root, 'outputs/editor-bench-product-drafts-proof-pcb04.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
for (const file of scope.files) { const to = resolve(root, 'work/pcb04-accepted', file); mkdirSync(dirname(to), { recursive: true }); copyFileSync(resolve(root, file), to); }
writeFileSync(resolve(root, 'work/pcb04-accepted/baseline.json'), JSON.stringify({ files: report.sourceHashes }, null, 2) + '\n', { flag: 'wx' });
const summary = '**PCB-04 backend accepted, 2026-10-21.** Confirmed X and DeviantArt drafts now retain the exact approved copy and preview, with separate edit confirmation, durable before/after history, revision guards and replay. Originals and Conversation state are preserved. Root passed 111 backend tests plus 32 checks on the final Rail guard change; the backend build and all four isolated PostgreSQL checks passed. Failed attempts remain recorded. The journal is application-enforced, not database-enforced immutable. Publishing stays manual; product mounting, front-end and installed-extension checks remain deferred. PCB-05 is authorized next; PCB-06 waits for it. ';
for (const file of ['docs/relay-cheaper-model-handoff.md', 'docs/conversational-planning/README.md', 'docs/conversational-planning/DISPATCH.md', 'docs/conversational-planning/EDITOR-BENCH-PLAN.md', 'docs/conversational-planning/WORK-ITEMS.md', 'docs/conversational-planning/PRODUCT-CONVERSATION-CONNECTION-PLAN.md']) {
  let text = read(file), at = text.indexOf('\n');
  const link = file.includes('conversational-planning/') ? '../../outputs/editor-bench-product-drafts-proof-pcb04.json' : '../outputs/editor-bench-product-drafts-proof-pcb04.json';
  text = text.slice(0, at + 1) + '\n' + summary + `[Acceptance and failure evidence](${link}). Earlier status entries below are historical.\n\n` + text.slice(at + 1).replace(/^\r?\n/, '');
  if (file.endsWith('WORK-ITEMS.md')) text = text.replace('| PCB-04 | Durable X/DeviantArt variants, provenance and edit revisions | PCB-03 | Luna High | In progress |', '| PCB-04 | Durable X/DeviantArt variants, provenance and edit revisions | PCB-03 | Luna High | Accepted backend connector |').replace('| PCB-05 | One initial confirmed Rail schedule per destination draft | PCB-04 | Luna High | Waiting |', '| PCB-05 | One initial confirmed Rail schedule per destination draft | PCB-04 | Luna High | In progress |');
  writeFileSync(resolve(root, file), text);
}
console.log(JSON.stringify({ ticket: 'PCB-04', accepted: true, sourceFiles: scope.files.length, rootTests: 111, railTests: 32, postgresTests: 4 }));
