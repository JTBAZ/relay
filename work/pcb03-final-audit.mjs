import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const root = resolve(import.meta.dirname, '..');
const read = file => readFileSync(resolve(root, file));
const report = JSON.parse(read('outputs/editor-bench-durable-preview-export-proof-pcb03.json'));
for (const [file, hash] of Object.entries(report.sourceHashes)) assert.equal(createHash('sha256').update(read(file)).digest('hex'), hash, file);
const audit = JSON.parse(read('work/pcb03-audit-latest.json'));
assert.deepEqual(audit.changedPriorReports, []); assert.deepEqual(audit.changedConfiguration, []); assert.equal(audit.ledger.unchanged, true);
const docs = audit.changedBaselineSource.filter(file => file.startsWith('docs/'));
let whitespace = '';
for (const file of docs) {
  const before = resolve(root, 'work/pcb03-baseline', file), after = resolve(root, file);
  const check = spawnSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, '-c', 'core.autocrlf=false', '-c', 'core.whitespace=cr-at-eol', 'diff', '--no-index', '--check', '--', before, after], { cwd: root, encoding: 'utf8', shell: false, windowsHide: true });
  whitespace += check.stdout ?? '';
}
assert.equal(whitespace, '');
const beforeHandoff = read('work/pcb03-baseline/docs/relay-cheaper-model-handoff.md').toString();
const handoff = read('docs/relay-cheaper-model-handoff.md').toString();
for (const line of beforeHandoff.split(/\r?\n/).filter(line => line.includes('c/outputs/') || line.includes('c\\outputs\\'))) assert(handoff.includes(line), 'Existing external report reference changed');
const result = { sourceHashesMatchAcceptedReport: true, scope: Object.keys(report.sourceHashes), documentation: docs, documentationWhitespace: 'clean', originalExternalReportReferencesPreserved: true, priorReportsUnchanged: audit.priorReportCount, configurationAndLedgerUnchanged: true, paidCalls: 0, review: 'Scoped Ponytail Review completed. No remaining task findings. Product UI, live R2 and installed-extension verification deferred.' };
writeFileSync(resolve(root, 'work/pcb03-final-audit.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(result));
