/**
 * Fetches generated source files from v0 and writes **v0 Copy Block** in Airtable.
 * Core logic: ./lib/pull-v0-copy-block-core.mjs (also used by ledger-to-v0 when LEDGER_PULL_COPY_BLOCK=1).
 *
 * Usage (from Automation/):
 *   node scripts/ledger-pull-v0-copy-block.mjs <Production_Ledger_record_id> [--dry-run]
 *   node scripts/ledger-pull-v0-copy-block.mjs --chat=<chatId> <record_id>
 *   node scripts/ledger-pull-v0-copy-block.mjs --write-file=./exports/full.md <record_id>
 *
 * Airtable long-text cells reject very large payloads; default COPY_BLOCK_MAX_CHARS is 95k.
 * Use --write-file to dump the **untruncated** export for integration when the blob is larger.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import 'dotenv/config'
import { createClient } from 'v0-sdk'
import {
  chatIdFromWebUrl,
  collectVersionFilesWithPoll,
  composeCopyBlockText,
  copyBlockMaxCharsFromEnv,
  copyBlockPollMaxMsFromEnv,
  copyBlockPollMsFromEnv,
  syncCopyBlockToAirtable,
} from './lib/pull-v0-copy-block-core.mjs'

const AIRTABLE_API = 'https://api.airtable.com/v0'

function requireEnv(name) {
  const v = process.env[name]
  if (!v?.trim()) throw new Error(`Missing required env: ${name}`)
  return v.trim()
}

async function airtableGetRecord(baseId, tableId, recordId) {
  const token = requireEnv('AIRTABLE_API_KEY')
  const url = `${AIRTABLE_API}/${baseId}/${tableId}/${recordId}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Airtable get record failed: ${res.status} ${body}`)
  }
  return res.json()
}

async function main() {
  const argv = process.argv.slice(2)
  const dryRun = argv.includes('--dry-run')
  const chatArg = argv.find((a) => a.startsWith('--chat='))
  const chatFromFlag = chatArg ? chatArg.slice('--chat='.length).trim() : ''
  const writeArg = argv.find((a) => a.startsWith('--write-file='))
  const writeFilePath = writeArg ? writeArg.slice('--write-file='.length).trim() : ''
  const positional = argv.filter((a) => !a.startsWith('--'))

  const maxChars = copyBlockMaxCharsFromEnv()
  const recordId = positional[0]?.trim()
  if (!recordId) {
    console.error(
      'Usage: node scripts/ledger-pull-v0-copy-block.mjs <Production_Ledger_record_id> [--dry-run]\n' +
        '       node scripts/ledger-pull-v0-copy-block.mjs --chat=<chatId> <record_id>\n' +
        '       node scripts/ledger-pull-v0-copy-block.mjs --write-file=./exports/full.md <record_id>',
    )
    process.exit(1)
  }

  const baseId = requireEnv('AIRTABLE_BASE_ID')
  const tableId = requireEnv('AIRTABLE_LEDGER_TABLE_ID')
  const rec = await airtableGetRecord(baseId, tableId, recordId)
  const fields = rec.fields || {}

  let chatId = chatFromFlag
  if (!chatId) chatId = chatIdFromWebUrl(fields['v0 Chat URL'])
  if (!chatId) throw new Error('No chat id: pass --chat=<id> or set v0 Chat URL on this ledger row')

  const v0 = createClient({ apiKey: requireEnv('V0_API_KEY') })
  const pollMs = copyBlockPollMsFromEnv()
  const pollMaxMs = copyBlockPollMaxMsFromEnv()
  if (pollMaxMs > 0) {
    console.log(`Polling for version files (${pollMs}ms interval, max ${pollMaxMs}ms)…`)
  }

  if (writeFilePath && !dryRun) {
    const collected = await collectVersionFilesWithPoll(v0, chatId, pollMs, pollMaxMs)
    const fullText = composeCopyBlockText({
      chatId,
      collected,
      maxChars: Number.MAX_SAFE_INTEGER,
      generatorLabel: 'ledger-pull-v0-copy-block.mjs',
    })
    mkdirSync(dirname(writeFilePath), { recursive: true })
    writeFileSync(writeFilePath, fullText, 'utf8')
    console.log(`Full copy block (${fullText.length} chars) → ${writeFilePath}`)
  }

  const result = await syncCopyBlockToAirtable({
    v0,
    baseId,
    tableId,
    recordId,
    chatId,
    maxChars,
    dryRun,
    pollMs,
    pollMaxMs,
    generatorLabel: 'ledger-pull-v0-copy-block.mjs',
  })

  console.log(`Source: ${result.source} — ${result.fileCount} file(s), ${result.charCount} chars.`)
  if (dryRun && result.preview) {
    console.log('\n--- preview ---\n', result.preview)
    console.log('\n[dry-run] No Airtable write.')
  } else if (result.written) {
    console.log(`Updated Airtable v0 Copy Block for ${recordId}.`)
    if (result.previewUrlWritten && result.previewUrl) {
      console.log('v0 Preview URL:', result.previewUrl)
    } else {
      console.log('v0 Preview URL: (not returned by v0 API yet — re-run after preview deploys)')
    }
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack || e.message : e)
  process.exit(1)
})
