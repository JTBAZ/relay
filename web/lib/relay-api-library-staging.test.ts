import { describe, expect, it } from "vitest";
import { discordStagingItemsFromUnifiedLibrary } from "./relay-api";

describe("discordStagingItemsFromUnifiedLibrary", () => {
  it("returns only DISCORD rows in DiscordStagingItem shape", () => {
    const out = discordStagingItemsFromUnifiedLibrary({
      items: [
        {
          media_id: "relay_m_discord",
          mime_type: "image/png",
          ingested_at: "2026-01-01T00:00:00.000Z",
          content_url_path: "/api/v1/export/media/c1/relay_m_discord/content",
          thumb_url_path: "/api/v1/export/media/c1/relay_m_discord/thumb",
          ingest_origin: "DISCORD",
          discord_capture: { message_content: "stage me" }
        },
        {
          media_id: "relay_m_upload",
          mime_type: "image/jpeg",
          ingested_at: "2026-01-02T00:00:00.000Z",
          content_url_path: "/api/v1/export/media/c1/relay_m_upload/content",
          thumb_url_path: "/api/v1/export/media/c1/relay_m_upload/thumb",
          ingest_origin: "RELAY_UPLOAD",
          discord_capture: null
        }
      ]
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      media_id: "relay_m_discord",
      mime_type: "image/png",
      ingested_at: "2026-01-01T00:00:00.000Z",
      content_url_path: "/api/v1/export/media/c1/relay_m_discord/content",
      thumb_url_path: "/api/v1/export/media/c1/relay_m_discord/thumb",
      discord_capture: { message_content: "stage me" }
    });
  });

  it("returns empty when unified list has only RELAY_UPLOAD", () => {
    const out = discordStagingItemsFromUnifiedLibrary({
      items: [
        {
          media_id: "relay_m_upload",
          mime_type: "video/mp4",
          ingested_at: "2026-01-02T00:00:00.000Z",
          ingest_origin: "RELAY_UPLOAD",
          content_url_path: "/api/v1/export/media/c1/relay_m_upload/content",
          thumb_url_path: "",
          discord_capture: null
        }
      ]
    });
    expect(out).toEqual([]);
  });
});
