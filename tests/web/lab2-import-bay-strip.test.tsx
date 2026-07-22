/** @vitest-environment happy-dom */

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchRelayLibraryStaging = vi.fn();
const fetchDiscordConnection = vi.fn();

vi.mock("@/lib/relay-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/relay-api")>();
  return {
    ...actual,
    fetchRelayLibraryStaging: (...args: unknown[]) => fetchRelayLibraryStaging(...args),
    fetchDiscordConnection: (...args: unknown[]) => fetchDiscordConnection(...args),
    deleteRelayLibraryStagingMedia: vi.fn(),
    mintDiscordLinkCode: vi.fn()
  };
});

vi.mock("@/lib/relay-native-staging-upload", () => ({
  uploadFilesToRelayStaging: vi.fn().mockResolvedValue({ uploaded: [], errors: [] })
}));

import { LabStagingDock } from "@/app/components/studio/LabStagingDock";

afterEach(() => {
  cleanup();
});

describe("LabStagingDock studio strip (v0 Import Bay)", () => {
  beforeEach(() => {
    fetchRelayLibraryStaging.mockReset();
    fetchDiscordConnection.mockReset();
    fetchDiscordConnection.mockResolvedValue({ linked: false });
  });

  it("renders compact strip chrome without the large upload zone", async () => {
    fetchRelayLibraryStaging.mockResolvedValue({
      items: [
        {
          media_id: "media_char_1",
          mime_type: "image/png",
          thumb_url_path: "/thumb/1",
          content_url_path: "/content/1",
          ingest_origin: "RELAY_UPLOAD",
          ingested_at: "2026-07-14T12:00:00.000Z",
          discord_capture: null,
          manual_import_staging: null
        },
        {
          media_id: "media_vid_2",
          mime_type: "video/mp4",
          thumb_url_path: null,
          content_url_path: "/content/2",
          ingest_origin: "DISCORD",
          ingested_at: "2026-07-14T13:00:00.000Z",
          discord_capture: { message_content: "teaser_loop" },
          manual_import_staging: null
        }
      ]
    });

    render(<LabStagingDock creatorId="creator_1" variant="studio" />);

    const bay = document.querySelector("[data-import-bay]");
    expect(bay?.getAttribute("data-variant")).toBe("studio");
    expect(screen.getByText("Import Bay")).toBeTruthy();
    expect(screen.getByText("drag to schedule →")).toBeTruthy();
    expect(screen.getByLabelText("Add files")).toBeTruthy();
    expect(screen.queryByText("Drop files here or browse")).toBeNull();
    expect(screen.queryByText("Joins the same pool as Discord captures.")).toBeNull();

    await waitFor(() => {
      expect(document.querySelectorAll("[data-lab2-bay-thumb]").length).toBe(2);
    });
    expect(screen.getByText("media_char…")).toBeTruthy();
    expect(screen.getByText("teaser_loop")).toBeTruthy();
  });

  it("keeps default variant as the taller upload dock", async () => {
    fetchRelayLibraryStaging.mockResolvedValue({ items: [] });

    render(<LabStagingDock creatorId="creator_1" variant="default" />);

    expect(document.querySelector("[data-import-bay]")?.getAttribute("data-variant")).toBe(
      "default"
    );
    await waitFor(() => {
      expect(
        screen.getByText(/Nothing staged yet|Loading staged media/i)
      ).toBeTruthy();
    });
    expect(screen.queryByText("drag to schedule →")).toBeNull();
  });
});
