import type { Message } from "discord.js";
import {
  ChannelType,
  Client,
  Events,
  GatewayIntentBits,
  InteractionType,
  type Interaction
} from "discord.js";
import type { DiscordBotEnv } from "./config.js";
import { relayBind, relayIngest, type IngestAttachment } from "./relay.js";
import { registerRelaySlashCommands } from "./register-commands.js";

function isTextLikeChannel(t: ChannelType | undefined): boolean {
  return (
    t === ChannelType.GuildText ||
    t === ChannelType.GuildAnnouncement ||
    t === ChannelType.PublicThread ||
    t === ChannelType.PrivateThread
  );
}

async function handleSlash(env: DiscordBotEnv, interaction: Interaction): Promise<void> {
  if (interaction.type !== InteractionType.ApplicationCommand || !interaction.isChatInputCommand()) {
    return;
  }
  if (interaction.commandName !== "relay-link") {
    return;
  }

  const code = interaction.options.getString("code", true).trim();
  if (!interaction.inGuild() || !interaction.guildId) {
    await interaction.reply({
      ephemeral: true,
      content: "Run this command in a server text channel you want to capture — not in a DM."
    });
    return;
  }

  const ch = interaction.channel;
  if (!ch || !isTextLikeChannel(ch.type)) {
    await interaction.reply({
      ephemeral: true,
      content:
        "Use this in a **text** or **announcement** channel, or open a **forum post** and run `/relay-link` inside that **thread** (not the forum’s top level)."
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const out = await relayBind({
    apiBase: env.relayApiBase,
    hmacSecret: env.hmacSecret,
    payload: {
      code,
      discord_guild_id: interaction.guildId,
      discord_channel_id: ch.id
    }
  });

  if (out.ok) {
    await interaction.editReply({
      content:
        "This channel is linked to your Relay studio. Post images, video, or audio here — they’ll appear under **Profile → Discord capture → Staged media** until you publish."
    });
    return;
  }

  let text = out.message;
  if (out.status === 410) {
    text = "That code expired. Mint a new one in Relay (Profile → Discord capture) and try again.";
  }
  await interaction.editReply({ content: text });
}

async function handleMessage(env: DiscordBotEnv, message: Message): Promise<void> {
  if (message.author.bot) {
    return;
  }
  if (!message.guild || message.guildId == null) {
    return;
  }
  if (message.attachments.size === 0) {
    return;
  }

  const attachments: IngestAttachment[] = [];
  for (const a of message.attachments.values()) {
    attachments.push({
      id: a.id,
      url: a.url,
      content_type: a.contentType ?? null,
      byte_size: typeof a.size === "number" ? a.size : null
    });
  }

  const out = await relayIngest({
    apiBase: env.relayApiBase,
    hmacSecret: env.hmacSecret,
    payload: {
      discord_guild_id: message.guildId,
      discord_channel_id: message.channelId,
      discord_message_id: message.id,
      message_content: message.content?.trim() ? message.content : null,
      message_timestamp: message.createdAt.toISOString(),
      attachments
    }
  });

  if (out.ok) {
    return;
  }

  // eslint-disable-next-line no-console
  console.warn(`[relay-discord-bot] ingest HTTP ${out.status}: ${out.message}`);

  if (out.status === 404 && env.replyOnBindingMissing) {
    try {
      await message.reply({
        content:
          "Relay doesn’t have this channel linked yet. In Relay: **Designer → Profile → Discord capture** → mint a code, then run **`/relay-link`** with that code in this channel.",
        allowedMentions: { repliedUser: false }
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[relay-discord-bot] failed to send binding hint reply", e);
    }
  }
}

export async function startBot(env: DiscordBotEnv): Promise<void> {
  await registerRelaySlashCommands({
    token: env.discordBotToken,
    applicationId: env.discordApplicationId,
    guildId: env.discordGuildId
  });

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent
    ]
  });

  client.once(Events.ClientReady, (c) => {
    // eslint-disable-next-line no-console
    console.info(`[relay-discord-bot] Logged in as ${c.user.tag}`);
  });

  client.on(Events.InteractionCreate, (i) => {
    void handleSlash(env, i);
  });

  client.on(Events.MessageCreate, (m) => {
    void handleMessage(env, m);
  });

  await client.login(env.discordBotToken);
}
