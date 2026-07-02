import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/relay-api", () => ({
  putRelayNativeUpload: vi.fn(),
  relayNativeUploadCommit: vi.fn(),
  relayNativeUploadInit: vi.fn(),
}));

import {
  putRelayNativeUpload,
  relayNativeUploadCommit,
  relayNativeUploadInit,
} from "@/lib/relay-api";
import { uploadFileToRelayStaging } from "@/lib/relay-native-staging-upload";

describe("uploadFileToRelayStaging", () => {
  it("runs init, put, and commit for staging uploads", async () => {
    vi.mocked(relayNativeUploadInit).mockResolvedValue({
      media_id: "media-1",
      upload: { url: "https://upload.example", headers: { "Content-Type": "image/png" } },
    } as Awaited<ReturnType<typeof relayNativeUploadInit>>);
    vi.mocked(putRelayNativeUpload).mockResolvedValue(undefined);
    vi.mocked(relayNativeUploadCommit).mockResolvedValue(undefined);

    const file = new File(["abc"], "wip.png", { type: "image/png" });
    const result = await uploadFileToRelayStaging({ creatorId: "cr1", file });

    expect(result.media_id).toBe("media-1");
    expect(relayNativeUploadInit).toHaveBeenCalledWith({
      creator_id: "cr1",
      content_type: "image/png",
      byte_size: file.size,
    });
    expect(putRelayNativeUpload).toHaveBeenCalled();
    expect(relayNativeUploadCommit).toHaveBeenCalledWith({
      creator_id: "cr1",
      media_id: "media-1",
      content_type: "image/png",
      byte_size: file.size,
    });
  });
});
