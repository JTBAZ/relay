import { describe, expect, it } from "vitest";
import { parseDiscordIngestPayload } from "../src/discord/discord-ingest.js";

describe("parseDiscordIngestPayload", () => {
  it("accepts minimal valid payload", () => {
    const p = parseDiscordIngestPayload({
      discord_guild_id: "g",
      discord_channel_id: "c",
      discord_message_id: "m",
      attachments: [{ id: "a1", url: "https://cdn.discordapp.com/x" }]
    });
    expect(p).not.toBeNull();
    expect(p!.attachments).toHaveLength(1);
    expect(p!.attachments[0]!.id).toBe("a1");
  });

  it("rejects missing fields", () => {
    expect(parseDiscordIngestPayload(null)).toBeNull();
    expect(parseDiscordIngestPayload({})).toBeNull();
    expect(
      parseDiscordIngestPayload({
        discord_guild_id: "g",
        discord_channel_id: "c",
        attachments: []
      })
    ).toBeNull();
  });
});
