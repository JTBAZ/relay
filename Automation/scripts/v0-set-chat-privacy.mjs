/**
 * Patch v0 chat privacy (e.g. private -> unlisted) for chats owned by V0_API_KEY.
 *
 * Usage (from Automation/):
 *   node scripts/v0-set-chat-privacy.mjs <chatId> [chatId ...]
 *   node scripts/v0-set-chat-privacy.mjs --all-private
 *   npm run v0-set-chat-privacy:all-private
 *   (npm may not forward `--args` on some Windows shells; prefer node … or the :all-private script.)
 *
 * Target privacy: V0_FIX_CHAT_PRIVACY or V0_CHAT_PRIVACY, else unlisted.
 * Must be one of: public | private | team | team-edit | unlisted
 */
import 'dotenv/config'
import { createClient } from 'v0-sdk'

function requireEnv(name) {
  const v = process.env[name]
  if (!v?.trim()) throw new Error(`Missing required env: ${name}`)
  return v.trim()
}

const allowed = new Set(['public', 'private', 'team', 'team-edit', 'unlisted'])

function targetPrivacy() {
  const raw = (process.env.V0_FIX_CHAT_PRIVACY || process.env.V0_CHAT_PRIVACY || 'unlisted')
    .trim()
    .toLowerCase()
  if (!allowed.has(raw)) {
    throw new Error(`Invalid privacy "${raw}". Use: ${[...allowed].join(', ')}`)
  }
  if (raw === 'private') {
    console.warn('Warning: target privacy is private; use unlisted or team for shareable links.')
  }
  return /** @type {'public'|'private'|'team'|'team-edit'|'unlisted'} */ (raw)
}

async function main() {
  const v0 = createClient({ apiKey: requireEnv('V0_API_KEY') })
  const privacy = targetPrivacy()
  const args = process.argv.slice(2)

  let chatIds = args.filter((a) => !a.startsWith('--'))

  if (args.includes('--all-private')) {
    const list = await v0.chats.find({ limit: 50 })
    const rows = list.data ?? []
    chatIds = rows.filter((c) => c.privacy === 'private').map((c) => c.id)
    console.log(`Found ${chatIds.length} private chat(s) to update -> ${privacy}`)
  }

  if (!chatIds.length) {
    console.log(`Usage:
  node scripts/v0-set-chat-privacy.mjs <chatId> [chatId ...]
  node scripts/v0-set-chat-privacy.mjs --all-private
  npm run v0-set-chat-privacy:all-private

Privacy: V0_FIX_CHAT_PRIVACY or V0_CHAT_PRIVACY; default unlisted.`)
    process.exit(1)
  }

  for (const chatId of chatIds) {
    const updated = await v0.chats.update({ chatId, privacy })
    console.log('OK', chatId, '->', privacy, '|', updated.webUrl ?? updated.apiUrl ?? '')
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack || e.message : e)
  process.exit(1)
})
