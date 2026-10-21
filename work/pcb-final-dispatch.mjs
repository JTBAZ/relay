import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const paths = ['docs/conversational-planning/DISPATCH.md', 'docs/conversational-planning/WORK-ITEMS.md', 'docs/conversational-planning/PRODUCT-CONVERSATION-CONNECTION-PLAN.md', 'docs/relay-cheaper-model-handoff.md'];
for (const file of paths) {
  let text = readFileSync(resolve(root, file), 'utf8');
  const at = text.indexOf('\n');
  text = text.slice(0, at + 1) + '\n**Final PCB delivery authorized, 2026-10-21.** The user authorized supervised implementation of PCB-04 through PCB-06 in dependency order. Sol High refines the existing plan; Luna High implements; root reviews each ticket before its successor starts. PCB-04 is in progress. PCB-05 and PCB-06 wait for their dependencies. Existing mock behavior stays unchanged, publishing stays manual, and confirmations remain separate. Product UI mounting, all front-end and installed-extension checks remain deferred. No paid evaluation, production migration, actual-account write, deployment or API restart is included. The status entries below record earlier states.\n\n' + text.slice(at + 1).replace(/^\r?\n/, '');
  if (file.endsWith('WORK-ITEMS.md')) text = text.replace('| PCB-04 | Durable X/DeviantArt variants, provenance and edit revisions | PCB-03 | Luna High | Waiting |', '| PCB-04 | Durable X/DeviantArt variants, provenance and edit revisions | PCB-03 | Luna High | In progress |');
  writeFileSync(resolve(root, file), text);
}
console.log(JSON.stringify({ updated: paths }));
