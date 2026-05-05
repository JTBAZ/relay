# Relay Discord bridge bot

Separate process that connects to Discord and calls the Relay API’s internal HMAC routes:

- `POST /api/v1/internal/discord/bind` — **`/relay-link`** slash command (code from Relay Profile → Discord capture).
- `POST /api/v1/internal/discord/ingest` — when someone posts **attachments** in a linked channel.

The Relay **API** must have the same `RELAY_DISCORD_INGEST_HMAC_SECRET`, working Postgres, R2, and **`RELAY_DISCORD_BOT_TOKEN`** so it can download attachment URLs server-side.

## Prerequisites (Discord Developer Portal)

1. Create an application → **Bot** → reset token → inviteURL with scopes **`bot`** and **`applications.commands`**.
2. Enable **Message Content Intent** (and **Server Members** if you need it later; not required for capture).
3. Copy **Application ID** (for slash command registration).

Invite the bot with permission to **Read messages / View channels**, **Send messages** (for optional 404 hints), **Attach files** (not strictly required), and **Use slash commands**.

## Configuration

Env files are loaded in order: **repo root** `.env` first (same as the Relay API), then optional **`discord-bot/.env`** for overrides. Dotenv does not overwrite existing keys, so placeholders with empty values in `discord-bot/.env` won’t wipe secrets from root.

Prefer putting `RELAY_DISCORD_INGEST_HMAC_SECRET`, `RELAY_DISCORD_BOT_TOKEN`, and `DISCORD_APPLICATION_ID` in root `.env`. Only add `discord-bot/.env` if you need local overrides (e.g. `DISCORD_GUILD_ID`).

| Variable | Required | Description |
|----------|----------|-------------|
| `DISCORD_BOT_TOKEN` | yes* | Bot token from the Discord application. *Or set `RELAY_DISCORD_BOT_TOKEN` in the root `.env` (same as the API). |
| `DISCORD_APPLICATION_ID` | yes | Application (client) ID — used to register `/relay-link`. |
| `DISCORD_GUILD_ID` | no | If set, slash commands register **in this guild only** (instant updates). Omit for **global** commands (~1h propagation). |
| `RELAY_DISCORD_INGEST_HMAC_SECRET` | yes | Same value as on the Relay API (`openssl rand -hex 32`). |
| `RELAY_API_URL` | no | Relay HTTP base, default `http://127.0.0.1:8787` (no trailing slash). In production, use your API’s public URL reachable from this host. |
| `RELAY_DISCORD_REPLY_ON_404` | no | Set to `1` or `true` to reply in Discord when ingest returns 404 (channel not linked). |

## Run

```bash
cd discord-bot
npm install
npm run build
npm start
```

Development rebuild loop:

```bash
npm run dev
# second terminal: node dist/index.js  (after first tsc emit)
```

Or use `npx tsx watch src/index.ts` if you add `tsx` locally (optional).

**Forum channels:** open a **post** (thread) and run `/relay-link` inside that thread — not in the forum’s top-level channel.

## Flow

1. Creator opens **Designer → Profile → Discord capture** in Relay, mints a code.
2. In the target Discord channel, run **`/relay-link`** and paste your code into the **`code`** option.
3. Post images/video/audio to that channel; Relay stages them for compose/publish.

From the repo root you can also run:

```bash
npm run discord-bot:build
npm run discord-bot:start
```

(with env set or `discord-bot/.env` present and working directory considerations — prefer `cd discord-bot` for `.env` loading).
