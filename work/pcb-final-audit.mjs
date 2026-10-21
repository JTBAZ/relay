import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
const root = resolve(import.meta.dirname, '..');
const baseline = JSON.parse(readFileSync(resolve(root, 'work/pcb-final-baseline/baseline.json')));
const sha = value => createHash('sha256').update(value).digest('hex');
const changed = group => Object.entries(baseline[group]).filter(([file, hash]) => !existsSync(resolve(root, file)) || sha(readFileSync(resolve(root, file))) !== hash).map(([file]) => file);
const ledger = JSON.parse(readFileSync(resolve(root, '.relay-data/gallery-editor-budget.json')));
const result = {
  changedBaselineSource: changed('source'),
  priorReportCount: Object.keys(baseline.reports).length,
  changedPriorReports: changed('reports'),
  changedConfiguration: changed('config'),
  ledger: { rows: ledger.length, sha256: sha(JSON.stringify(ledger)), unchanged: ledger.length === baseline.ledger.rows && sha(JSON.stringify(ledger)) === baseline.ledger.sha256 }
};
writeFileSync(resolve(root, 'work/pcb-final-audit-latest.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
