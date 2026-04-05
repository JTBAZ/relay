import 'dotenv/config'
import { createClient } from 'v0-sdk'
import {
  shouldPullCopyBlockAfterLedger,
  chatIdFromWebUrl,
  copyBlockMaxCharsFromEnv,
  copyBlockPollMsFromEnv,
  copyBlockPollMaxMsFromEnv,
  syncCopyBlockToAirtable,
} from './lib/pull-v0-copy-block-core.mjs'

const AIRTABLE_API = 'https://api.airtable.com/v0'

function requireEnv(name) {
  const v = process.env[name]
  if (!v?.trim()) throw new Error(`Missing required env: ${name}`)
  return v.trim()
}

function escapeFormulaString(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

async function airtableList(baseId, tableId, { filterByFormula, sort, maxRecords = 10 } = {}) {
  const token = requireEnv('AIRTABLE_API_KEY')
  const params = new URLSearchParams()
  if (filterByFormula) params.set('filterByFormula', filterByFormula)
  if (sort?.length) {
    sort.forEach((s, i) => {
      params.set(`sort[${i}][field]`, s.field)
      params.set(`sort[${i}][direction]`, s.direction || 'asc')
    })
  }
  params.set('pageSize', String(Math.min(maxRecords, 100)))
  const url = `${AIRTABLE_API}/${baseId}/${tableId}?${params}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Airtable list failed: ${res.status} ${body}`)
  }
  const data = await res.json()
  return data.records ?? []
}

async function airtablePatch(baseId, tableId, records) {
  const token = requireEnv('AIRTABLE_API_KEY')
  const url = `${AIRTABLE_API}/${baseId}/${tableId}`
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ records }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Airtable patch failed: ${res.status} ${body}`)
  }
  return res.json()
}

function statusesFromEnv() {
  const raw = process.env.LEDGER_STATUSES || 'Ready for v0'
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function statusOrFormula(statuses) {
  if (statuses.length === 0) return '{Status} != ""'
  if (statuses.length === 1) {
    return `{Status} = "${escapeFormulaString(statuses[0])}"`
  }
  return `OR(${statuses.map((s) => `{Status} = "${escapeFormulaString(s)}"`).join(',')})`
}

function buildPickupFormula(statuses) {
  const statusPart = statusOrFormula(statuses)
  return `AND(${statusPart}, LEN(TRIM({Prompt Draft})) > 0, {v0 Chat URL} = BLANK())`
}

/** Project tracker default; override with `AIRTABLE_GLOBAL_PARAMS_TABLE_ID`. */
const DEFAULT_GLOBAL_PARAMS_TABLE_ID = 'tblapjC9tNanrUCqG'

function shouldInjectRelayBrand() {
  const raw = process.env.LEDGER_INJECT_RELAY_BRAND
  if (raw === undefined || raw.trim() === '') return true
  const t = raw.trim().toLowerCase()
  return t !== '0' && t !== 'false' && t !== 'no' && t !== 'off'
}

function relayParameterKeysFromEnv() {
  const raw =
    process.env.LEDGER_RELAY_PARAMETER_KEYS ||
    'RELAY_VISUAL_SYSTEM_V1,RELAY_COLOR_TOKEN_REF'
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function globalParamsTableId() {
  const id = process.env.AIRTABLE_GLOBAL_PARAMS_TABLE_ID?.trim()
  return id || DEFAULT_GLOBAL_PARAMS_TABLE_ID
}

function buildParameterKeyFormula(keys) {
  if (keys.length === 0) return '{Parameter Key} != ""'
  if (keys.length === 1) {
    return `{Parameter Key} = "${escapeFormulaString(keys[0])}"`
  }
  return `OR(${keys.map((k) => `{Parameter Key} = "${escapeFormulaString(k)}"`).join(',')})`
}

/**
 * Pulls ordered **Value** text from UI Planning — Global Parameters for Relay brand keys.
 */
async function fetchRelayBrandAppendix(baseId, tableId, keys) {
  if (keys.length === 0) return ''
  const formula = buildParameterKeyFormula(keys)
  const rows = await airtableList(baseId, tableId, {
    filterByFormula: formula,
    maxRecords: Math.min(100, Math.max(20, keys.length * 4)),
  })
  const byKey = new Map(
    rows.map((r) => {
      const k = r.fields['Parameter Key']
      const v = r.fields['Value']
      return [k, typeof v === 'string' ? v.trim() : '']
    }),
  )
  const parts = []
  for (const k of keys) {
    const v = byKey.get(k)
    if (v) parts.push(`### ${k}\n\n${v}`)
  }
  return parts.join('\n\n')
}

function appendRelayBrandSection(message, appendix) {
  const a = appendix.trim()
  if (!a) return message
  return `${message}\n\n---\n\n## Relay brand (automated from Airtable Global Parameters)\n\n${a}`
}

/** Strategy A: keep v0 hosted preview from requiring NEXT_PUBLIC_* (see templates/v0-prompt-starter.md). */
const V0_PREVIEW_STRATEGY_A = `---

## v0 preview (no blocking env modals) — Strategy A

**Preview-friendly:** For the **v0 hosted preview only**, do **not** introduce **required** \`NEXT_PUBLIC_*\` variables (patterns that trigger the “Add Environment Variables” modal). Use **inline mock URLs**, **placeholder media**, or **local stub data** for browser-side API/media calls so the preview builds with zero env setup. Cursor integration will wire **\`NEXT_PUBLIC_RELAY_API_URL\`** and **\`RELAY_API_BASE\`** from the real Relay repo (\`@/lib/relay-api\`). You may keep Relay **types and prop shapes** from the user message for handoff—only the preview runtime must avoid mandatory new public env keys.`

function appendV0PreviewStrategyA(message) {
  return `${message.trimEnd()}\n\n${V0_PREVIEW_STRATEGY_A}`
}

function buildUserMessage(fields) {
  const draft = (fields['Prompt Draft'] || '').trim()
  const extra = (fields['Supplemental Guidance'] || '').trim()
  if (!extra) return draft
  return `${draft}\n\n---\n\nSupplemental Guidance (from Production Ledger):\n\n${extra}`
}

/** v0 may return `webUrl` or deprecated `url`; Airtable needs a real https URL. */
function normalizeChat(obj) {
  if (!obj || typeof obj !== 'object' || obj.object !== 'chat') return null
  const webUrl =
    typeof obj.webUrl === 'string' && obj.webUrl.trim()
      ? obj.webUrl.trim()
      : typeof obj.url === 'string' && obj.url.trim()
        ? obj.url.trim()
        : ''
  if (!webUrl) return null
  return { ...obj, webUrl }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const baseId = requireEnv('AIRTABLE_BASE_ID')
  const tableId = requireEnv('AIRTABLE_LEDGER_TABLE_ID')
  const statuses = statusesFromEnv()
  const formula = buildPickupFormula(statuses)

  const records = await airtableList(baseId, tableId, {
    filterByFormula: formula,
    sort: [{ field: 'Queue Order', direction: 'asc' }],
    maxRecords: 5,
  })

  if (!records.length) {
    console.log(
      `No Production Ledger rows matched (statuses: ${statuses.join(', ')}; non-empty Prompt Draft; empty v0 Chat URL).`,
    )
    process.exit(0)
  }

  const rec = records[0]
  const title = rec.fields['Work Title'] || rec.id
  console.log(`Picked row: ${title} (${rec.id})`)

  let message = buildUserMessage(rec.fields)
  const system = process.env.V0_SYSTEM_PROMPT?.trim() || undefined
  const projectId = process.env.V0_PROJECT_ID?.trim() || undefined

  let relayInjected = false
  if (shouldInjectRelayBrand()) {
    const gpTable = globalParamsTableId()
    const keys = relayParameterKeysFromEnv()
    try {
      const appendix = await fetchRelayBrandAppendix(baseId, gpTable, keys)
      const next = appendRelayBrandSection(message, appendix)
      if (next !== message) {
        message = next
        relayInjected = true
        console.log(
          `Relay brand: injected ${keys.length} key(s) from Global Parameters table ${gpTable} (${appendix.length} chars).`,
        )
      } else {
        console.log(
          `Relay brand: no matching values for keys [${keys.join(', ')}] in ${gpTable} — Prompt Draft unchanged.`,
        )
      }
    } catch (e) {
      console.warn(
        'Relay brand: Airtable fetch failed; continuing with Prompt Draft only.',
        e instanceof Error ? e.message : e,
      )
    }
  }

  message = appendV0PreviewStrategyA(message)

  if (dryRun) {
    console.log('[dry-run] Would call v0.chats.create and PATCH Airtable with webUrl / preview.')
    console.log('[dry-run] Strategy A (v0 preview — no mandatory NEXT_PUBLIC_*) appended to user message.')
    if (relayInjected) console.log('[dry-run] Relay brand appendix included below.')
    console.log('--- message (first 1200 chars) ---\n', message.slice(0, 1200) + (message.length > 1200 ? '…' : ''))
    process.exit(0)
  }

  const v0 = createClient({ apiKey: requireEnv('V0_API_KEY') })
  /** `sync` waits for generation (often minutes) and can look "stuck". Omit or use env for default API behavior. */
  const responseMode = process.env.V0_RESPONSE_MODE?.trim() || undefined

  console.log(
    responseMode
      ? `Calling v0 (responseMode=${responseMode}) — this may take several minutes…`
      : 'Calling v0 — creating chat (default response mode; usually returns quickly with a chat URL)…',
  )
  /** Default `unlisted`: `team` requires a v0 team/enterprise plan (API returns 403 otherwise). Set `V0_CHAT_PRIVACY=team` when your key is on team billing. */
  const privacyRaw = process.env.V0_CHAT_PRIVACY?.trim().toLowerCase()
  const allowedPrivacy = new Set(['public', 'private', 'team', 'team-edit', 'unlisted'])
  const chatPrivacy =
    privacyRaw && allowedPrivacy.has(privacyRaw) ? /** @type {'public'|'private'|'team'|'team-edit'|'unlisted'} */ (privacyRaw) : 'unlisted'

  const t0 = Date.now()
  const created = await v0.chats.create({
    message,
    system,
    projectId,
    ...(responseMode ? { responseMode } : {}),
    chatPrivacy,
  })
  console.log(`v0 responded in ${((Date.now() - t0) / 1000).toFixed(1)}s`)

  const chat = normalizeChat(created)
  if (!chat) {
    console.error('Unexpected v0 response (expected chat with webUrl or url). Summary:', {
      type: typeof created,
      object: created && typeof created === 'object' ? created.object : undefined,
      keys: created && typeof created === 'object' ? Object.keys(created) : [],
    })
    try {
      console.error('Raw (truncated):', JSON.stringify(created, null, 2).slice(0, 4000))
    } catch {
      console.error('Raw: <not JSON-serializable>')
    }
    process.exit(1)
  }

  const preview = chat.latestVersion?.demoUrl?.trim()
  const patchFields = {
    'v0 Chat URL': chat.webUrl,
    Status: 'v0 In Progress',
    'Last Step Actor': 'v0',
  }
  if (preview) patchFields['v0 Preview URL'] = preview

  await airtablePatch(baseId, tableId, [{ id: rec.id, fields: patchFields }])

  console.log('Updated Airtable:', rec.id)
  console.log('v0 Chat URL:', chat.webUrl)
  if (preview) console.log('v0 Preview URL:', preview)

  if (shouldPullCopyBlockAfterLedger()) {
    const chatId =
      (typeof chat.id === 'string' && chat.id.trim()) || chatIdFromWebUrl(chat.webUrl)
    if (!chatId) {
      console.warn('LEDGER_PULL_COPY_BLOCK: could not resolve chat id; skip v0 Copy Block pull.')
    } else {
      const pollMax = copyBlockPollMaxMsFromEnv()
      const pollMs = copyBlockPollMsFromEnv()
      try {
        console.log(
          pollMax > 0
            ? `Pulling v0 Copy Block (poll ${pollMs}ms, max ${pollMax}ms)…`
            : 'Pulling v0 Copy Block (single fetch)…',
        )
        const r = await syncCopyBlockToAirtable({
          v0,
          baseId,
          tableId,
          recordId: rec.id,
          chatId,
          maxChars: copyBlockMaxCharsFromEnv(),
          dryRun: false,
          pollMs,
          pollMaxMs: pollMax,
          generatorLabel: 'ledger-to-v0 (LEDGER_PULL_COPY_BLOCK)',
        })
        console.log(
          `v0 Copy Block: written — ${r.source}, ${r.fileCount} file(s), ${r.charCount} chars.`,
        )
      } catch (e) {
        console.warn(
          'v0 Copy Block: auto-pull failed; run `node scripts/ledger-pull-v0-copy-block.mjs <recordId>` after v0 finishes:',
          e instanceof Error ? e.message : e,
        )
      }
    }
  }

  console.log(
    'Tip: Refine in this same v0 chat (follow-up messages). Re-running this script only after clearing v0 Chat URL creates a new chat and a full new generation.',
  )
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack || err.message : err)
  process.exit(1)
})
