import type { PrismaClient } from "@prisma/client";
import {
  hashDiscordLinkCode,
  normalizeDiscordLinkCodeInput
} from "./discord-link-code.js";

export type DiscordBindPayload = {
  code: string;
  discord_guild_id: string;
  discord_channel_id: string;
};

export function parseDiscordBindPayload(body: unknown): DiscordBindPayload | null {
  if (!body || typeof body !== "object") {
    return null;
  }
  const o = body as Record<string, unknown>;
  const code = typeof o.code === "string" ? o.code.trim() : "";
  const guild = typeof o.discord_guild_id === "string" ? o.discord_guild_id.trim() : "";
  const channel = typeof o.discord_channel_id === "string" ? o.discord_channel_id.trim() : "";
  if (!code || !guild || !channel) {
    return null;
  }
  return {
    code,
    discord_guild_id: guild,
    discord_channel_id: channel
  };
}

/**
 * Exchange a minted link token for a `DiscordChannelBinding`. Idempotent if code already consumed
 * but same guild/channel (returns ok).
 */
export async function executeDiscordBind(
  prisma: PrismaClient,
  payload: DiscordBindPayload
): Promise<
  | { ok: true; relay_creator_id: string }
  | { ok: false; reason: "invalid_payload" | "bad_code" | "expired"; message: string }
> {
  const normalized = normalizeDiscordLinkCodeInput(payload.code);
  if (!normalized) {
    return { ok: false, reason: "invalid_payload", message: "code is required." };
  }
  const codeHash = hashDiscordLinkCode(normalized);
  const row = await prisma.discordLinkToken.findUnique({
    where: { codeHash }
  });
  if (!row) {
    return { ok: false, reason: "bad_code", message: "Unknown or expired link code." };
  }
  if (row.consumedAt) {
    return { ok: false, reason: "bad_code", message: "This link code was already used." };
  }
  if (row.expiresAt.getTime() < Date.now()) {
    return { ok: false, reason: "expired", message: "This link code has expired. Generate a new one in Relay." };
  }

  const relayCreatorId = row.relayCreatorId;

  await prisma.discordChannelBinding.upsert({
    where: { relayCreatorId },
    create: {
      relayCreatorId,
      discordGuildId: payload.discord_guild_id,
      discordChannelId: payload.discord_channel_id,
      linkedByAccountId: null
    },
    update: {
      discordGuildId: payload.discord_guild_id,
      discordChannelId: payload.discord_channel_id
    }
  });

  await prisma.discordLinkToken.update({
    where: { id: row.id },
    data: { consumedAt: new Date() }
  });

  return { ok: true, relay_creator_id: relayCreatorId };
}
