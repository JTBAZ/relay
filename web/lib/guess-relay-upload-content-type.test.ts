import { describe, expect, it } from "vitest";
import { guessRelayUploadContentType } from "./guess-relay-upload-content-type";

describe("guessRelayUploadContentType", () => {
  it("prefers a non-generic File.type", () => {
    expect(guessRelayUploadContentType(new File([], "x.bin", { type: "image/png" }))).toBe("image/png");
  });

  it("infers from extension when type is octet-stream", () => {
    expect(
      guessRelayUploadContentType(new File([], "clip.MP4", { type: "application/octet-stream" }))
    ).toBe("video/mp4");
  });
});
