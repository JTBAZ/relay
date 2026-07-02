/**
 * Bundle existing Relay repo source for v0 editing (inverse of ledger-pull-v0-copy-block).
 *
 * Usage (from Automation/):
 *   node scripts/repo-to-v0.mjs patron-feed [--scope=visual|production] [--dry-run]
 *   node scripts/repo-to-v0.mjs patron-feed --scope=visual --write-file=./exports/patron-feed-visual.md
 *   node scripts/repo-to-v0.mjs patron-feed --scope=production --include-large --write-file=./exports/patron-feed-production.md
 *   node scripts/repo-to-v0.mjs patron-feed --scope=visual --patch-prompt=recXXXXXXXXXXXXXX
 *   node scripts/repo-to-v0.mjs patron-feed --edit-task="Tighten feed card density and sidebar spacing"
 *
 * Scopes:
 *   visual      — patron-home-client + feed UI (default; best for v0)
 *   production  — RelayApp + wiring (omits web/lib/relay-api.ts unless --include-large)
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import 'dotenv/config'
import {
  airtablePatchPromptDraft,
  buildPatronFeedBundle,
} from './lib/repo-to-v0-core.mjs'
import { PATRON_FEED_SCOPES } from './lib/patron-feed-bundle-manifest.mjs'

function parseArgs(argv) {
  const dryRun = argv.includes('--dry-run')
  const includeLarge = argv.includes('--include-large')
  const stdout = argv.includes('--stdout')

  const scopeArg = argv.find((a) => a.startsWith('--scope='))
  const scope = scopeArg ? scopeArg.slice('--scope='.length).trim() : 'visual'

  const writeArg = argv.find((a) => a.startsWith('--write-file='))
  const writeFilePath = writeArg ? writeArg.slice('--write-file='.length).trim() : ''

  const patchArg = argv.find((a) => a.startsWith('--patch-prompt='))
  const patchRecordId = patchArg ? patchArg.slice('--patch-prompt='.length).trim() : ''

  const editArg = argv.find((a) => a.startsWith('--edit-task='))
  const editTask = editArg ? editArg.slice('--edit-task='.length) : ''

  const positional = argv.filter((a) => !a.startsWith('--'))
  const target = positional[0]?.trim() || ''

  return {
    dryRun,
    includeLarge,
    stdout,
    scope,
    writeFilePath,
    patchRecordId,
    editTask,
    target,
  }
}

function printUsage() {
  const scopes = Object.entries(PATRON_FEED_SCOPES)
    .map(([k, v]) => `  ${k.padEnd(12)} ${v.description}`)
    .join('\n')

  console.error(
    'Usage: node scripts/repo-to-v0.mjs <target> [options]\n\n' +
      'Targets:\n' +
      '  patron-feed    Bundle /patron/feed source for v0 editing\n\n' +
      'Options:\n' +
      '  --scope=visual|production   Default: visual\n' +
      '  --include-large             Include omitted large files (e.g. relay-api.ts, gallery-view for visual)\n' +
      '  --edit-task="..."           Specific change request prepended to bundle\n' +
      '  --write-file=./exports/….md Write full bundle to disk\n' +
      '  --patch-prompt=<record_id>  PATCH Airtable Prompt Draft (truncated to COPY_BLOCK_MAX_CHARS)\n' +
      '  --stdout                    Print full bundle to stdout\n' +
      '  --dry-run                   Stats + preview only; no writes\n\n' +
      'Scopes:\n' +
      scopes,
  )
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  if (!args.target) {
    printUsage()
    process.exit(1)
  }

  if (args.target !== 'patron-feed') {
    console.error(`Unknown target "${args.target}". Currently supported: patron-feed`)
    process.exit(1)
  }

  if (!PATRON_FEED_SCOPES[args.scope]) {
    console.error(
      `Unknown scope "${args.scope}". Use: ${Object.keys(PATRON_FEED_SCOPES).join(', ')}`,
    )
    process.exit(1)
  }

  const bundle = buildPatronFeedBundle({
    scope: args.scope,
    includeLarge: args.includeLarge,
    editTask: args.editTask,
  })

  console.log(
    `patron-feed (${args.scope}): ${bundle.files.length} file(s), ${bundle.charCount} chars` +
      (bundle.truncated ? ` → ${bundle.airtableCharCount} chars for Airtable` : ''),
  )

  if (bundle.missing.length) {
    console.warn('Missing paths (skipped):', bundle.missing.join(', '))
  }
  if (bundle.omitted.length) {
    console.warn(
      'Omitted by default (use --include-large):',
      bundle.omitted.join(', '),
    )
  }

  if (args.dryRun) {
    console.log('\n--- preview (first 2500 chars) ---\n')
    console.log(bundle.text.slice(0, 2500) + (bundle.text.length > 2500 ? '\n…' : ''))
    console.log('\n[dry-run] No file or Airtable writes.')
    return
  }

  if (args.writeFilePath) {
    mkdirSync(dirname(args.writeFilePath), { recursive: true })
    writeFileSync(args.writeFilePath, bundle.text, 'utf8')
    console.log(`Full bundle → ${args.writeFilePath}`)
  }

  if (args.stdout) {
    process.stdout.write(bundle.text)
  }

  if (args.patchRecordId) {
    const baseId = process.env.AIRTABLE_BASE_ID?.trim()
    const tableId = process.env.AIRTABLE_LEDGER_TABLE_ID?.trim()
    const apiKey = process.env.AIRTABLE_API_KEY?.trim()
    if (!baseId || !tableId || !apiKey) {
      throw new Error(
        'Missing AIRTABLE_BASE_ID, AIRTABLE_LEDGER_TABLE_ID, or AIRTABLE_API_KEY for --patch-prompt',
      )
    }
    await airtablePatchPromptDraft(
      baseId,
      tableId,
      args.patchRecordId,
      bundle.forAirtable,
    )
    console.log(`Updated Airtable Prompt Draft for ${args.patchRecordId}.`)
    if (bundle.truncated) {
      console.warn(
        'Bundle was truncated for Airtable. Use --write-file for the full export, then paste manually or run ledger-to-v0 with a shorter brief + file attachment in v0.',
      )
    }
  }

  if (!args.writeFilePath && !args.stdout && !args.patchRecordId) {
    printUsage()
    console.error(
      '\nNo output action specified. Add --write-file, --stdout, or --patch-prompt (or --dry-run).',
    )
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack || e.message : e)
  process.exit(1)
})
