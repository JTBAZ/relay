import { REST, Routes, SlashCommandBuilder } from "discord.js";

export async function registerRelaySlashCommands(args: {
  token: string;
  applicationId: string;
  guildId: string | null;
}): Promise<void> {
  const link = new SlashCommandBuilder()
    .setName("relay-link")
    .setDescription("Link this channel to Relay using a one-time code from your Relay profile.")
    .addStringOption((o) =>
      o
        .setName("code")
        .setDescription("Code from Relay → Designer → Profile → Discord capture")
        .setRequired(true)
    );

  const rest = new REST({ version: "10" }).setToken(args.token);
  const body = [link.toJSON()];

  if (args.guildId) {
    await rest.put(Routes.applicationGuildCommands(args.applicationId, args.guildId), { body });
    // eslint-disable-next-line no-console
    console.info(
      `[relay-discord-bot] Registered guild slash commands for guild ${args.guildId} (updates are immediate).`
    );
  } else {
    await rest.put(Routes.applicationCommands(args.applicationId), { body });
    // eslint-disable-next-line no-console
    console.info(
      "[relay-discord-bot] Registered global slash commands (Discord may take up to ~1 hour to show them)."
    );
  }
}
