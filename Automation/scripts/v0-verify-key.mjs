/**
 * Ground-truth check: lists chats visible to V0_API_KEY (same as ledger-to-v0).
 * Run from Automation/: npm run v0-verify-key
 * Optional: npm run v0-verify-key -- <chatId>   (id from v0 Chat URL path, not full URL)
 */
import 'dotenv/config'
import { createClient } from 'v0-sdk'

function requireEnv(name) {
  const v = process.env[name]
  if (!v?.trim()) throw new Error(`Missing required env: ${name}`)
  return v.trim()
}

async function main() {
  const chatIdArg = process.argv[2]?.trim()
  const v0 = createClient({ apiKey: requireEnv('V0_API_KEY') })

  if (chatIdArg) {
    const chat = await v0.chats.getById({ chatId: chatIdArg })
    console.log('getById:', JSON.stringify(chat, null, 2).slice(0, 6000))
    return
  }

  const list = await v0.chats.find({ limit: 25 })
  const rows = list.data ?? []
  console.log(`Chats visible to this API key: ${rows.length}`)
  for (const c of rows) {
    console.log('-', c.id, c.webUrl, '| privacy:', c.privacy, '|', c.name ?? c.title ?? '(no name)')
  }
  if (rows.length === 0) {
    console.log(
      '\nIf this is 0 but ledger-to-v0 wrote a URL, the key may not match the v0 UI account, or listing is scoped differently than create.',
    )
  }

  try {
    const me = await v0.user.get()
    console.log('\nuser.get (identity for this key):', JSON.stringify(me, null, 2).slice(0, 2000))
  } catch (e) {
    console.log('\n(user.get failed:', e instanceof Error ? e.message : e, ')')
  }

  try {
    const billing = await v0.user.getBilling({ scope: 'user' })
    console.log('\nuser.getBilling:', JSON.stringify(billing, null, 2).slice(0, 3000))
  } catch (e) {
    console.log('\n(user.getBilling failed:', e instanceof Error ? e.message : e, ')')
  }

  try {
    const limits = await v0.rateLimits.find({ scope: 'user' })
    console.log('\nRate limits (user scope):', JSON.stringify(limits, null, 2).slice(0, 2000))
  } catch (e) {
    console.log('\n(rateLimits.find skipped:', e instanceof Error ? e.message : e, ')')
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack || e.message : e)
  process.exit(1)
})
