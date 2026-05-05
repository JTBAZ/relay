export type DiscordBotEnv = {
  discordBotToken: string;
  discordApplicationId: string;
  /** When set, register guild slash commands (instant in dev). Otherwise global (can take ~1h to propagate). */
  discordGuildId: string | null;
  hmacSecret: string;
  relayApiBase: string;
  /** Reply in-channel when ingest returns 404 (no binding). */
  replyOnBindingMissing: boolean;
};

function truthy(v: string | undefined): boolean {
  const t = v?.trim().toLowerCase();
  return t === "1" || t === "true" || t === "yes";
}

export function loadConfig(): DiscordBotEnv {
  const discordBotToken =
    process.env.DISCORD_BOT_TOKEN?.trim() || process.env.RELAY_DISCORD_BOT_TOKEN?.trim();
  const discordApplicationId =
    process.env.DISCORD_APPLICATION_ID?.trim() || process.env.DISCORD_CLIENT_ID?.trim();
  const hmacSecret = process.env.RELAY_DISCORD_INGEST_HMAC_SECRET?.trim();
  const rawBase = process.env.RELAY_API_URL?.trim() || "http://127.0.0.1:8787";
  const relayApiBase = rawBase.replace(/\/+$/, "");
  const guildRaw = process.env.DISCORD_GUILD_ID?.trim();
  const discordGuildId = guildRaw ? guildRaw : null;

  if (!discordBotToken || !discordApplicationId || !hmacSecret) {
    const missing: string[] = [];
    if (!discordBotToken) missing.push("DISCORD_BOT_TOKEN (or RELAY_DISCORD_BOT_TOKEN)");
    if (!discordApplicationId) missing.push("DISCORD_APPLICATION_ID (or DISCORD_CLIENT_ID — same as Application ID in the portal)");
    if (!hmacSecret) missing.push("RELAY_DISCORD_INGEST_HMAC_SECRET");
    throw new Error(
      `Missing required env: ${missing.join(", ")}. Put these in the **repo root** \`.env\` ` +
        `(recommended), or uncomment them in \`discord-bot/.env\` with non-empty values. ` +
        `If startup still fails after that, delete \`discord-bot/.env\` or remove blank \`VAR=\` lines — ` +
        `empty placeholders can hide values from root when load order breaks. See discord-bot/README.md.`
    );
  }

  return {
    discordBotToken,
    discordApplicationId,
    discordGuildId,
    hmacSecret,
    relayApiBase,
    replyOnBindingMissing: truthy(process.env.RELAY_DISCORD_REPLY_ON_404)
  };
}
